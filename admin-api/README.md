# zero-blog-admin

Secure server-side API for /blog/admin/.

## Secrets

Set these Worker secrets:

- ADMIN_PASSWORD
- ADMIN_SESSION_SECRET
- GITHUB_TOKEN
- ALLOWED_ORIGIN = https://1337misterzero.github.io

GITHUB_TOKEN stays on the server. It is never sent to the browser.

## Deploy

```bash
cd admin-api
npm init -y
npm install -D wrangler
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ALLOWED_ORIGIN
npx wrangler deploy
```

Then replace YOUR-WORKER-URL in static/admin/index.html with the deployed Worker URL.
