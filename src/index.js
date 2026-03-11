const LIGHT_OFF_DELAY_MS = 60_000;
const HUE_AUTH_URL = "https://api.meethue.com/v2/oauth2/authorize";
const HUE_TOKEN_URL = "https://api.meethue.com/v2/oauth2/token";
const HUE_REMOTE_BASE = "https://api.meethue.com/route/clip/v2/resource/light";

async function getTokens(kv) {
  const [accessToken, refreshToken, expiry] = await Promise.all([
    kv.get("access_token"),
    kv.get("refresh_token"),
    kv.get("token_expiry"),
  ]);
  return { accessToken, refreshToken, expiry: expiry ? parseInt(expiry) : null };
}

async function saveTokens(kv, accessToken, refreshToken, expiresIn) {
  const expiry = Date.now() + expiresIn * 1000;
  await Promise.all([
    kv.put("access_token", accessToken),
    kv.put("refresh_token", refreshToken),
    kv.put("token_expiry", String(expiry)),
  ]);
}

async function exchangeToken(grantType, value, clientId, clientSecret) {
  const params = new URLSearchParams({ grant_type: grantType });
  if (grantType === "authorization_code") {
    params.set("code", value);
  } else {
    params.set("refresh_token", value);
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(HUE_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function getValidAccessToken(env) {
  const { accessToken, refreshToken, expiry } = await getTokens(env.HUE_KV);

  if (!accessToken || !refreshToken) {
    throw new Error("Not authorized. Visit /auth to connect your Hue account.");
  }

  // Refresh if token expires within 5 minutes
  if (expiry && Date.now() > expiry - 300_000) {
    const data = await exchangeToken("refresh_token", refreshToken, env.hue_client_id, env.hue_client_secret);
    await saveTokens(env.HUE_KV, data.access_token, data.refresh_token ?? refreshToken, data.expires_in);
    return data.access_token;
  }

  return accessToken;
}

async function callHueApi(accessToken, apiKey, lightId, on) {
  const response = await fetch(`${HUE_REMOTE_BASE}/${lightId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "hue-application-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ "on": { on } }),
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- /auth: redirect user to Hue OAuth authorization page ---
    if (url.pathname === "/auth") {
      const params = new URLSearchParams({
        client_id: env.hue_client_id,
        response_type: "code",
      });
      return Response.redirect(`${HUE_AUTH_URL}?${params}`, 302);
    }

    // --- /callback: exchange authorization code for tokens ---
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing authorization code", { status: 400 });
      }

      try {
        const data = await exchangeToken("authorization_code", code, env.hue_client_id, env.hue_client_secret);
        await saveTokens(env.HUE_KV, data.access_token, data.refresh_token, data.expires_in);
        return new Response("Authorization successful. You can close this tab.", { status: 200 });
      } catch (err) {
        return new Response(err.message, { status: 500 });
      }
    }

    // --- /webhook: trigger light on/off ---
    if (url.pathname === "/webhook") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const apiKey = env.hue_api_key;
      const lightId = env.hue_light_id;

      if (!apiKey || !lightId) {
        return new Response("hue_api_key and hue_light_id must be configured", { status: 500 });
      }

      let accessToken;
      try {
        accessToken = await getValidAccessToken(env);
      } catch (err) {
        return new Response(err.message, { status: 401 });
      }

      const onResult = await callHueApi(accessToken, apiKey, lightId, true);

      ctx.waitUntil(
        new Promise((resolve) => setTimeout(resolve, LIGHT_OFF_DELAY_MS)).then(
          () => getValidAccessToken(env).then((token) => callHueApi(token, apiKey, lightId, false))
        )
      );

      return new Response(
        JSON.stringify({
          message: "Light turned on. It will turn off in 60 seconds.",
          hueResponse: onResult,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
