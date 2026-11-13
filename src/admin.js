// /admin — password login, signed session cookie, GitHub-backed post editing, stats.
// Secrets (wrangler secret put): ADMIN_USER, ADMIN_PASS, SESSION_SECRET, GITHUB_TOKEN
const REPO = "supernihil/supernihil.github.io";
const BRANCH = "master";
const COOKIE = "sn_admin";
const DAY = 86400;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const page = (body, status = 200, headers = {}) => new Response(body, {
  status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "referrer-policy": "same-origin", ...headers },
});
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)))));
  return crypto.subtle.timingSafeEqual(x, y);
}
async function authed(request, env) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m || !env.SESSION_SECRET) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, exp));
}

async function gh(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN secret is not set on the worker");
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "supernihil-admin",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${data?.message || ""}`);
  return data;
}
const utf8ToB64 = (s) => { const b = new TextEncoder().encode(s); let o = ""; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(o); };
const b64ToUtf8 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
const validPost = (n) => /^\d{4}-\d{2}-\d{2}-[^/\\]+\.md$/.test(n);

export async function handleAdmin(request, env, url, path) {
  const method = request.method;

  if (path === "/admin/login" && method === "POST") {
    const form = await request.formData();
    const ok = env.ADMIN_USER && env.ADMIN_PASS && env.SESSION_SECRET
      && (await safeEqual(form.get("user"), env.ADMIN_USER)) & (await safeEqual(form.get("pass"), env.ADMIN_PASS));
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800));
      return page(loginPage("Forkert brugernavn eller kodeord."), 401);
    }
    const exp = String(Math.floor(Date.now() / 1000) + 30 * DAY);
    return new Response(null, { status: 303, headers: {
      location: "/admin",
      "set-cookie": `${COOKIE}=${exp}.${await hmac(env.SESSION_SECRET, exp)}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${30 * DAY}`,
    } });
  }
  if (path === "/admin/logout") {
    return new Response(null, { status: 303, headers: { location: "/admin", "set-cookie": `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0` } });
  }

  const isApi = path.startsWith("/admin/api/");
  if (!(await authed(request, env))) return isApi ? json({ error: "unauthorized" }, 401) : page(loginPage());
  if (!isApi) return page(appShell());

  if (method !== "GET" && request.headers.get("origin") !== url.origin) return json({ error: "bad origin" }, 403);

  try {
    const route = path.slice("/admin/api/".length);
    if (route === "posts" && method === "GET") {
      const list = await gh(env, `/contents/_posts?ref=${BRANCH}`);
      return json(list.filter((f) => f.name.endsWith(".md")).map((f) => ({ name: f.name, sha: f.sha })).reverse());
    }
    if (route === "post" && method === "GET") {
      const name = url.searchParams.get("name");
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      const f = await gh(env, `/contents/_posts/${encodeURIComponent(name)}?ref=${BRANCH}`);
      return json({ name, sha: f.sha, text: b64ToUtf8(f.content) });
    }
    if (route === "post" && method === "PUT") {
      const { name, text, sha } = await request.json();
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      const r = await gh(env, `/contents/_posts/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: JSON.stringify({ message: `${sha ? "Update" : "Create"} ${name} (admin)`, content: utf8ToB64(text), branch: BRANCH, ...(sha && { sha }) }),
      });
      return json({ sha: r.content.sha });
    }
    if (route === "post" && method === "DELETE") {
      const { name, sha } = await request.json();
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      await gh(env, `/contents/_posts/${encodeURIComponent(name)}`, {
        method: "DELETE", body: JSON.stringify({ message: `Delete ${name} (admin)`, sha, branch: BRANCH }),
      });
      return json({ ok: true });
    }
    if (route === "upload" && method === "POST") {
      const { name, data } = await request.json();
      const clean = String(name).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
      if (!/\.(gif|jpe?g|png|webp)$/.test(clean)) return json({ error: "only gif/jpg/png/webp" }, 400);
      const file = `assets/screenshots/${Date.now().toString(36)}-${clean}`;
      await gh(env, `/contents/${file}`, { method: "PUT", body: JSON.stringify({ message: `Upload ${clean} (admin)`, content: data, branch: BRANCH }) });
      return json({ path: `/${file}` });
    }
    if (route === "status" && method === "GET") {
      const r = await gh(env, `/actions/runs?branch=${BRANCH}&per_page=3`);
      return json(r.workflow_runs.map((x) => ({ name: x.name, status: x.status, conclusion: x.conclusion, title: x.display_title, at: x.created_at, url: x.html_url })));
    }
    if (route === "stats" && method === "GET") {
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
      return json(await env.STATS.get(env.STATS.idFromName("global")).report(days));
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

const head = `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/style.css?v=3"><link rel="stylesheet" href="/static/admin.css?v=3"><title>admin — supernihil</title></head>`;

function loginPage(err = "") {
  return `${head}<body class="adm"><form class="login" method="post" action="/admin/login">
<h1>supernihil / admin</h1>
${err ? `<p class="err">${err}</p>` : ""}
<label>bruger<input name="user" autocomplete="username" required autofocus></label>
<label>kodeord<input name="pass" type="password" autocomplete="current-password" required></label>
<button>log ind</button></form></body></html>`;
}

function appShell() {
  return `${head}<body class="adm"><header class="top"><a class="brand" href="/admin">supernihil / admin</a><nav><a href="#/">værker</a><a href="#/new">+ ny</a><a href="#/stats">statistik</a><a href="/" target="_blank">site ↗</a><form method="post" action="/admin/logout"><button class="linkbtn">log ud</button></form></nav></header>
<div id="status" class="deploy"></div><main id="app"></main>
<script type="module" src="/static/admin.js?v=3"></script></body></html>`;
}
