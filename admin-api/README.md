# zero-blog-admin

Secure Vercel serverless API for /blog/admin/.

## Vercel project

Import the GitHub repository and set the Vercel **Root Directory** to `admin-api`.

The project deploys `api/index.js`.

urlImport zero-blog-admin into Vercelhttps://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2F1337misterzero%2Fblog&root-directory=admin-api

## Environment variables

Create these as encrypted Vercel environment variables:

- `ADMIN_PASSWORD` — your admin password.
- `ADMIN_SESSION_SECRET` — long random secret used to sign admin sessions.
- `GITHUB_TOKEN` — GitHub fine-grained token with Contents: Read and write on `1337misterzero/blog`.
- `ALLOWED_ORIGIN` — `https://1337misterzero.github.io`.

The GitHub token stays on the Vercel server and is never sent to the browser.

## After deploy

The default Vercel hostname should normally be the project hostname. Put that hostname in `static/admin/index.html` as the `apiBase` value if it differs from `https://zero-blog-admin.vercel.app`.

Vercel documents GitHub-linked projects and encrypted project environment variables. citeturn247924search0turn247924search1
