# Ring → Hue Motion Light Worker

A Cloudflare Worker that turns on a Philips Hue light when triggered by a webhook (e.g. from IFTTT when Ring detects motion), then automatically turns it off after 29 seconds.

## How it works

1. Ring doorbell detects motion
2. IFTTT fires a POST request to `https://your-worker.your-subdomain.workers.dev/webhook`
3. The Worker turns the Hue light **on** via the Hue Bridge local API
4. After 29 seconds (cloudflare workers have a 30 second limit on ctx.waitUntil), the Worker turns the light **off**

## Setup

### 1. Connect to Cloudflare

- Log into the [Cloudflare Dashboard](https://dash.cloudflare.com)
- Go to **Workers & Pages** → **Create** → **Connect to Git**
- Select your GitHub repo
- Set the build command to `npm install` and the deploy command to `npx wrangler deploy`

### 2. Create a Hue Remote API app

- Go to the [Hue Developer Portal](https://developers.meethue.com) and sign in or create an account
- Navigate to **My Apps** → **Add new app**
- Fill in the app name, description, and set the callback URL to your worker's `/callback` endpoint (e.g. `https://ring-hue-worker.YOUR_SUBDOMAIN.workers.dev/callback`)
- Submit and copy the **Client ID** and **Client Secret** — you'll need these in the next step

### 3. Set your secrets

In the Cloudflare Dashboard, go to **Workers & Pages** → select **ring-hue-worker** → **Settings** → **Variables and Secrets** and add each of the following as a **Secret**:

| Variable name | Value |
|---|---|
| `hue_api_key` | Your Hue Bridge application key |
| `hue_client_id` | Your Hue Remote API OAuth client ID |
| `hue_client_secret` | Your Hue Remote API OAuth client secret |
| `hue_light_id` | The ID of the Hue light to control |

Or via CLI:

```bash
npx wrangler secret put hue_api_key
npx wrangler secret put hue_client_id
npx wrangler secret put hue_client_secret
npx wrangler secret put hue_light_id
```

### 4. Set up the KV store

The worker uses a Cloudflare KV namespace to store OAuth tokens.

- Go to **Workers & Pages** → **KV** → **Create a namespace**
- Name it `HUE_KV` (or anything you like)
- Copy the **Namespace ID**
- Open `wrangler.toml` and replace the `id` value under `[[kv_namespaces]]` with your Namespace ID:

```toml
[[kv_namespaces]]
binding = "HUE_KV"
id = "your-namespace-id-here"
```

### 5. Configure IFTTT

- Create a new applet
- **If**: Ring — Motion Detected
- **Then**: Webhooks — Make a web request
  - URL: `https://ring-hue-worker.YOUR_SUBDOMAIN.workers.dev/webhook`
  - Method: `POST`
  - Content Type: `application/json`
