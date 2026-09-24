# zero-blog-admin

Secure Vercel serverless API for /blog/admin/.

## Authentication

The admin no longer uses a password.

Access is restricted to the GitHub account **1337misterzero**. The flow is:

1. /blog/admin/ sends the browser to GitHub OAuth.
2. GitHub returns to the Vercel callback.
3. The backend checks the authenticated GitHub login.
4. Only `1337misterzero` receives the admin session cookie.
5. The GitHub OAuth token is used only to identify the user and is not exposed to the browser.
6. The repository-editing credential remains the separate server-side `GITHUB_TOKEN`.

GitHub requires an OAuth app with an authorization callback URL for this web flow. citeturn764722search0turn764722search4

## Vercel project

Import the GitHub repository and set the Vercel **Root Directory** to `admin-api`.

The project deploys `api/index.js`.

urlImport zero-blog-admin into Vercelhttps://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F1337misterzero%2Fblog&root-directory=admin-api

## Environment variables

Create these encrypted Vercel environment variables:

- `ADMIN_SESSION_SECRET` — long random secret used to sign sessions and OAuth state.
- `GITHUB_TOKEN` — GitHub fine-grained token with Contents: Read and write on `1337misterzero/blog`.
- `GITHUB_CLIENT_ID` — OAuth app client ID.
- `GITHUB_CLIENT_SECRET` — OAuth app client secret.
- `GITHUB_OAUTH_REDIRECT_URI` — exact callback URL registered in the GitHub OAuth app.
- `ALLOWED_ORIGIN` — `https://1337misterzero.github.io`.

The repository-editing GitHub token and OAuth client secret stay server-side.

## GitHub OAuth app

Create a GitHub OAuth App in your GitHub Developer settings. GitHub documents the OAuth app registration flow and the Authorization callback URL field. citeturn764722search0

Use:

**Homepage URL**
`https://1337misterzero.github.io/blog/`

**Authorization callback URL**
`https://zero-blog-admin.vercel.app/api?route=/auth/github/callback`

The callback URL must match the URL registered in GitHub when wildcard matching is disabled. citeturn764722search3turn764722search4

After creating the OAuth app, put its client ID and client secret into the Vercel environment variables above.

## After deploy

The default Vercel hostname should normally be the project hostname. Put that hostname in `static/admin/index.html` as `apiBase` if it differs from `https://zero-blog-admin.vercel.app`.
