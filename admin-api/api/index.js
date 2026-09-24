const crypto = require("crypto");

const REPO = "1337misterzero/blog";
const BRANCH = "main";
const ADMIN_GITHUB_LOGIN = "1337misterzero";
const SESSION_TTL = 8 * 60 * 60;
const STATE_TTL = 10 * 60;

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin"
  };
}

function send(res, status, data, publicOrigin) {
  res.status(status);
  for (const [k, v] of Object.entries({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...cors(publicOrigin || "")
  })) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

function redirect(res, location, publicOrigin, cookies = []) {
  res.status(302);
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", publicOrigin || "");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.end();
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function sign(body) {
  return crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(body).digest("base64url");
}

function makeSignedToken(payload) {
  const body = b64url(JSON.stringify(payload));
  return body + "." + sign(body);
}

function verifySignedToken(raw) {
  if (!raw) return null;
  const parts = String(raw).split(".");
  if (parts.length !== 2) return null;

  const [body, sig] = parts;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function tokenFor(login, exp) {
  return makeSignedToken({
    sub: "zero-admin",
    login,
    exp
  });
}

function stateFor(nonce, exp) {
  return makeSignedToken({
    sub: "zero-oauth-state",
    nonce,
    exp
  });
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function cookie(name, value, options = {}) {
  const parts = [name + "=" + encodeURIComponent(value)];
  parts.push("Path=" + (options.path || "/"));
  if (options.maxAge !== undefined) parts.push("Max-Age=" + options.maxAge);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push("Secure");
  parts.push("SameSite=" + (options.sameSite || "None"));
  return parts.join("; ");
}

function sessionFromRequest(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const payload = verifySignedToken(auth.slice(7));
    if (payload?.sub === "zero-admin" && payload.login === ADMIN_GITHUB_LOGIN) return payload;
  }

  const cookies = parseCookies(req);
  const payload = verifySignedToken(cookies.zero_admin_session);
  if (payload?.sub === "zero-admin" && payload.login === ADMIN_GITHUB_LOGIN) return payload;

  return null;
}

function allowed(path) {
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  return path === "hugo.toml" ||
    /^(content|layouts)\\//.test(path) ||
    /^static\\/(css|js|admin)\\//.test(path);
}

function ghHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + process.env.GITHUB_TOKEN,
    "X-GitHub-Api-Version": "2026-03-10"
  };
}

async function gh(path, init = {}) {
  const r = await fetch("https://api.github.com" + path, {
    ...init,
    headers: { ...ghHeaders(), ...(init.headers || {}) }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || ("GitHub API " + r.status));
  return data;
}

async function githubOAuthToken(code) {
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_OAUTH_REDIRECT_URI
    })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub OAuth token exchange failed.");
  }
  return data.access_token;
}

async function githubIdentity(accessToken) {
  const r = await fetch("https://api.github.com/user", {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + accessToken,
      "X-GitHub-Api-Version": "2026-03-10"
    }
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.login) throw new Error("Could not read GitHub identity.");
  return data;
}

async function handle(req, res) {
  const publicOrigin = process.env.ALLOWED_ORIGIN || "";
  const origin = req.headers.origin || "";

  if (origin && origin !== publicOrigin) {
    return send(res, 403, { error: "Origin not allowed." }, publicOrigin);
  }

  if (req.method === "OPTIONS") {
    res.status(204);
    for (const [k, v] of Object.entries(cors(origin))) res.setHeader(k, v);
    return res.end();
  }

  const url = new URL(req.url, "https://admin.invalid");
  const route = url.searchParams.get("route") || url.pathname;

  if (route === "/auth/github" && req.method === "GET") {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET || !process.env.GITHUB_OAUTH_REDIRECT_URI) {
      return send(res, 500, { error: "GitHub OAuth is not configured on the server." }, publicOrigin);
    }

    const nonce = crypto.randomBytes(32).toString("hex");
    const state = stateFor(nonce, Math.floor(Date.now() / 1000) + STATE_TTL);

    const auth = new URL("https://github.com/login/oauth/authorize");
    auth.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
    auth.searchParams.set("redirect_uri", process.env.GITHUB_OAUTH_REDIRECT_URI);
    auth.searchParams.set("scope", "read:user");
    auth.searchParams.set("state", state);

    return redirect(
      res,
      auth.toString(),
      publicOrigin,
      [cookie("zero_oauth_state", nonce, { maxAge: STATE_TTL, sameSite: "Lax" })]
    );
  }

  if (route === "/auth/github/callback" && req.method === "GET") {
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const cookies = parseCookies(req);
    const statePayload = verifySignedToken(state);

    if (
      !code ||
      !statePayload ||
      statePayload.sub !== "zero-oauth-state" ||
      statePayload.nonce !== cookies.zero_oauth_state
    ) {
      return redirect(
        res,
        publicOrigin + "/blog/admin/?error=invalid_oauth_state",
        publicOrigin,
        [cookie("zero_oauth_state", "", { maxAge: 0, sameSite: "Lax" })]
      );
    }

    try {
      const accessToken = await githubOAuthToken(code);
      const user = await githubIdentity(accessToken);

      if (String(user.login).toLowerCase() !== ADMIN_GITHUB_LOGIN.toLowerCase()) {
        return redirect(
          res,
          publicOrigin + "/blog/admin/?error=not_authorized",
          publicOrigin,
          [cookie("zero_oauth_state", "", { maxAge: 0, sameSite: "Lax" })]
        );
      }

      const session = tokenFor(ADMIN_GITHUB_LOGIN, Math.floor(Date.now() / 1000) + SESSION_TTL);

      return redirect(
        res,
        publicOrigin + "/blog/admin/?auth=ok",
        publicOrigin,
        [
          cookie("zero_admin_session", session, { maxAge: SESSION_TTL, sameSite: "None" }),
          cookie("zero_oauth_state", "", { maxAge: 0, sameSite: "Lax" })
        ]
      );
    } catch (e) {
      return redirect(
        res,
        publicOrigin + "/blog/admin/?error=oauth_failed",
        publicOrigin,
        [cookie("zero_oauth_state", "", { maxAge: 0, sameSite: "Lax" })]
      );
    }
  }

  if (route === "/session" && req.method === "GET") {
    const session = sessionFromRequest(req);
    if (!session) return send(res, 401, { authenticated: false }, publicOrigin);
    return send(res, 200, {
      authenticated: true,
      user: { login: ADMIN_GITHUB_LOGIN }
    }, publicOrigin);
  }

  if (route === "/logout" && req.method === "POST") {
    res.setHeader("Set-Cookie", cookie("zero_admin_session", "", { maxAge: 0, sameSite: "None" }));
    return send(res, 200, { ok: true }, publicOrigin);
  }

  if (!sessionFromRequest(req)) {
    return send(res, 401, { error: "Unauthorized." }, publicOrigin);
  }

  if (route === "/api/posts" && req.method === "GET") {
    const items = await gh("/repos/" + REPO + "/contents/content/posts?ref=" + BRANCH);
    const posts = [];
    for (const item of items.filter(x => x.type === "file" && x.name.endsWith(".md"))) {
      const file = await gh("/repos/" + REPO + "/contents/" + item.path + "?ref=" + BRANCH);
      const raw = decodeGitHubContent(file.content);
      const fm = raw.match(/^---\n([\s\S]*?)\n---/);
      const block = fm?.[1] || "";
      const title = (block.match(/^title:\s*["']?(.*?)["']?$/m) || [])[1] || item.name.replace(/\.md$/, "");
      const date = (block.match(/^date:\s*(.+)$/m) || [])[1] || "";
      posts.push({ path: item.path, title, date, sha: file.sha });
    }
    posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return send(res, 200, { posts }, publicOrigin);
  }

  if (route === "/api/files" && req.method === "GET") {
    const files = ["hugo.toml"];
    const walk = async path => {
      const items = await gh("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH);
      for (const item of items) {
        if (item.type === "dir") await walk(item.path);
        else if (allowed(item.path) && !/\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|svg)$/i.test(item.path)) files.push(item.path);
      }
    };
    for (const root of ["content", "layouts", "static/css", "static/js", "static/admin"]) await walk(root);
    return send(res, 200, { files: [...new Set(files)].sort() }, publicOrigin);
  }

  if (route === "/api/file" && req.method === "GET") {
    const path = url.searchParams.get("path") || "";
    if (!allowed(path)) return send(res, 400, { error: "Path not allowed." }, publicOrigin);
    const file = await gh("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH);
    return send(res, 200, {
      path: file.path,
      sha: file.sha,
      content: decodeGitHubContent(file.content)
    }, publicOrigin);
  }

  if (route === "/api/file" && req.method === "PUT") {
    const body = req.body || {};
    const path = String(body.path || "");
    const content = String(body.content ?? "");
    if (!allowed(path)) return send(res, 400, { error: "Path not allowed." }, publicOrigin);
    if (Buffer.byteLength(content, "utf8") > 1024 * 1024) {
      return send(res, 413, { error: "File too large." }, publicOrigin);
    }

    let current = null;
    try {
      current = await gh("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH);
    } catch {}

    if (current && body.sha && current.sha !== body.sha) {
      return send(res, 409, { error: "File changed on GitHub. Reload before saving." }, publicOrigin);
    }

    const result = await gh("/repos/" + REPO + "/contents/" + path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: String(body.message || "update " + path),
        content: encodeGitHubContent(content),
        sha: current?.sha,
        branch: BRANCH
      })
    });

    return send(res, 200, {
      ok: true,
      commit: result.commit.sha,
      sha: result.content.sha,
      path
    }, publicOrigin);
  }

  if (route === "/api/file" && req.method === "DELETE") {
    const body = req.body || {};
    const path = String(body.path || "");
    if (!allowed(path) || !body.sha) {
      return send(res, 400, { error: "Invalid path or SHA." }, publicOrigin);
    }

    const result = await gh("/repos/" + REPO + "/contents/" + path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: String(body.message || "delete " + path),
        sha: String(body.sha),
        branch: BRANCH
      })
    });

    return send(res, 200, { ok: true, commit: result.commit.sha }, publicOrigin);
  }

  return send(res, 404, { error: "Not found." }, publicOrigin);
}

function decodeGitHubContent(content) {
  return Buffer.from(String(content).replace(/\n/g, ""), "base64").toString("utf8");
}

function encodeGitHubContent(content) {
  return Buffer.from(content, "utf8").toString("base64");
}

module.exports = async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    const publicOrigin = process.env.ALLOWED_ORIGIN || "";
    return send(res, 500, { error: e.message || "Internal error." }, publicOrigin);
  }
};
