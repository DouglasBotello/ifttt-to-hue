const LIGHT_OFF_DELAY_MS = 60_000;

async function callHueApi(apiKey, bridgeIp, lightId, on) {
  const url = `https://${bridgeIp}/clip/v2/resource/light/${lightId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "hue-application-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ on: { on } }),
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

export default {
  async fetch(request, env, ctx) {
    // Only accept POST requests to /webhook
    const url = new URL(request.url);

    if (url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const apiKey = env["hue_api_key"];
    const bridgeIp = env["hue_bridge-ip"];
    const lightId = env["hue_light_id"];

    if (!apiKey) {
      return new Response("hue-api-key secret is not configured", {
        status: 500,
      });
    }

    if (!bridgeIp || !lightId) {
      return new Response("hue-bridge-ip and hue-light-id must be configured", {
        status: 500,
      });
    }

    // Turn the light ON
    const onResult = await callHueApi(apiKey, bridgeIp, lightId, true);

    // Schedule the light to turn OFF after 60 seconds
    // waitUntil keeps the worker alive without blocking the response
    ctx.waitUntil(
      new Promise((resolve) => setTimeout(resolve, LIGHT_OFF_DELAY_MS)).then(
        () => callHueApi(apiKey, bridgeIp, lightId, false)
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
  },
};
