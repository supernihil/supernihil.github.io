// /admin — password login, signed session cookie, GitHub-backed post editing, stats.
// Secrets (wrangler secret put): ADMIN_USER, ADMIN_PASS, SESSION_SECRET, GITHUB_TOKEN
import { V } from "./statics.js";
import { OWNER, NAME, BRANCH, getContent, forgetContent } from "./content.js";
const REPO = `${OWNER}/${NAME}`;
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
      return page(loginPage("Wrong username or password."), 401);
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
      const c = await getContent(env);
      return json({ sha: c.sha, loaded: c.loaded, posts: c.all.map((w) => ({ file: w.file, title: w.title, date: w.date, category: w.category, type: w.type, draft: w.draft, thumbnail: w.thumbnail })) });
    }
    if (route === "post" && method === "GET") {
      const name = url.searchParams.get("name");
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      const f = await gh(env, `/contents/_posts/${encodeURIComponent(name)}?ref=${BRANCH}`);
      return json({ name, text: b64ToUtf8(f.content) });
    }
    // Save a post (and any new media) as one commit. files: [{ path, data(base64) }]
    if (route === "post" && method === "PUT") {
      const { name, text, files = [] } = await request.json();
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      for (const f of files) if (!validMedia(f.path)) return json({ error: `bad media path ${f.path}` }, 400);
      const sha = await commit(env, `${files.length ? "Update" : "Save"} ${name} (admin)`, [
        { path: `_posts/${name}`, content: text },
        ...files.map((f) => ({ path: f.path, base64: f.data })),
      ]);
      return json({ sha, live: await refreshStore(env, sha) });
    }
    if (route === "post" && method === "DELETE") {
      const { name } = await request.json();
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      const sha = await commit(env, `Delete ${name} (admin)`, [{ path: `_posts/${name}`, remove: true }]);
      return json({ sha, live: await refreshStore(env, sha) });
    }
    if (route === "refresh" && method === "POST") {
      return json({ live: await refreshStore(env) });
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

const validMedia = (p) => /^assets\/(screenshots|thumbnails)\/[a-z0-9][a-z0-9._-]*\.(gif|jpe?g|png|webp)$/.test(p);

async function refreshStore(env, expect) {
  const c = await env.STORE.get(env.STORE.idFromName("content")).refresh(expect);
  forgetContent(c);
  return c.sha === expect || !expect;
}

// One commit on master via the Git Data API. changes: [{ path, content | base64 | remove }]
async function commit(env, message, changes) {
  for (let attempt = 0; ; attempt++) {
    const ref = await gh(env, `/git/ref/heads/${BRANCH}`);
    const parent = await gh(env, `/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const ch of changes) {
      if (ch.remove) { tree.push({ path: ch.path, mode: "100644", type: "blob", sha: null }); continue; }
      const blob = await gh(env, "/git/blobs", { method: "POST", body: JSON.stringify(ch.base64 != null ? { content: ch.base64, encoding: "base64" } : { content: ch.content, encoding: "utf-8" }) });
      tree.push({ path: ch.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const t = await gh(env, "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
    const c = await gh(env, "/git/commits", { method: "POST", body: JSON.stringify({ message, tree: t.sha, parents: [parent.sha] }) });
    try {
      await gh(env, `/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
      return c.sha;
    } catch (e) {
      if (attempt >= 2) throw e; // master moved underneath us; rebuild on the new head
    }
  }
}

const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap"><link rel="stylesheet" href="/static/style.css?v=${V}"><link rel="stylesheet" href="/static/admin.css?v=${V}"><title>admin — supernihil</title></head>`;

function loginPage(err = "") {
  return `${head}<body class="adm"><form class="login" method="post" action="/admin/login">
<h1 class="site-title">Supernihil</h1>
${err ? `<p class="err">${err}</p>` : ""}
<label>user<input name="user" autocomplete="username" required autofocus></label>
<label>password<input name="pass" type="password" autocomplete="current-password" required></label>
<button>log in</button></form></body></html>`;
}

function appShell() {
  return `${head}<body class="adm"><header><div class="header-content"><h1 class="site-title"><a href="/admin">Supernihil</a></h1><nav class="adm-nav"><a href="#/">works</a><a href="#/new">+ new</a><a href="#/stats">stats</a><a href="/" target="_blank">site ↗</a><form method="post" action="/admin/logout"><button class="linkbtn">log out</button></form></nav></div></header>
<div id="status" class="deploy"></div><main id="app"></main>
<script type="module" src="/static/admin.js?v=${V}"></script></body></html>`;
}
