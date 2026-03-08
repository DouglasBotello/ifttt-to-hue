# Ring → Hue Motion Light Worker

A Cloudflare Worker that turns on a Philips Hue light when triggered by a webhook (e.g. from IFTTT when Ring detects motion), then automatically turns it off after 60 seconds.

## How it works

1. Ring doorbell detects motion
2. IFTTT fires a POST request to `https://your-worker.your-subdomain.workers.dev/webhook`
3. The Worker turns the Hue light **on** via the Hue Bridge local API
4. After 60 seconds, the Worker turns the light **off**

## Setup

### 1. Connect to Cloudflare

- Log into the [Cloudflare Dashboard](https://dash.cloudflare.com)
- Go to **Workers & Pages** → **Create** → **Connect to Git**
- Select your GitHub repo
- Set the build command to `npm install` and the deploy command to `npx wrangler deploy`

### 2. Set your secret

In the Cloudflare Dashboard:

- Go to **Workers & Pages** → select **ring-hue-worker** → **Settings**
- Under **Variables and Secrets**, click **Add**
- Type: **Secret**
- Variable name: `hue-api-key`
- Value: your Hue Bridge application key

Or via CLI:

```bash
npx wrangler secret put hue-api-key
```

### 3. Configure IFTTT

- Create a new applet
- **If**: Ring — Motion Detected
- **Then**: Webhooks — Make a web request
  - URL: `https://ring-hue-worker.YOUR_SUBDOMAIN.workers.dev/webhook`
  - Method: `POST`
  - Content Type: `application/json`
