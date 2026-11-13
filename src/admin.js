// /admin — password login, signed session cookie, editing works stored in Cloudflare, stats, backup.
// Secrets (wrangler secret put): ADMIN_USER, ADMIN_PASS, SESSION_SECRET; GITHUB_TOKEN only for the backup.
import { V } from "./statics.js";
import { store, validMedia, forgetContent } from "./content.js";
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
    const st = store(env);
    if (route === "posts" && method === "GET") {
      const c = await st.content();
      return json({ version: c.version, backup: await st.backupStatus(), posts: c.all.map((w) => ({ file: w.file, title: w.title, date: w.date, category: w.category, type: w.type, draft: w.draft, thumbnail: w.thumbnail })) });
    }
    if (route === "post" && method === "GET") {
      const name = url.searchParams.get("name");
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      const text = await st.read(`_posts/${name}`);
      return text == null ? json({ error: "not found" }, 404) : json({ name, text });
    }
    if (route === "post" && method === "PUT") {
      const { name, text } = await request.json();
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      await st.write(`_posts/${name}`, text);
      forgetContent();
      return json({ ok: true });
    }
    if (route === "post" && method === "DELETE") {
      const { name } = await request.json();
      if (!validPost(name)) return json({ error: "bad name" }, 400);
      await st.remove(`_posts/${name}`);
      forgetContent();
      return json({ ok: true });
    }
    if (route === "page" && method === "GET") {
      return json({ text: (await st.read("_pages/info.md")) || "" });
    }
    if (route === "page" && method === "PUT") {
      const { text } = await request.json();
      await st.write("_pages/info.md", String(text));
      forgetContent();
      return json({ ok: true });
    }
    // raw upload body -> R2; ?path=assets/screenshots/x.gif
    if (route === "media" && method === "PUT") {
      const key = url.searchParams.get("path") || "";
      if (!validMedia(key)) return json({ error: "bad media path" }, 400);
      const obj = await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: request.headers.get("content-type") || undefined } });
      await st.addMedia(key, obj.size);
      // a new still means a new cover: older generated variants for this work no longer apply
      const m = key.match(/^assets\/poster\/(.+)\.(webp|jpg)$/);
      if (m) await st.forgetMedia([`assets/anim/${m[1]}.webp`, `assets/full/${m[1]}.webp`, `assets/poster/${m[1]}.${m[2] === "webp" ? "jpg" : "webp"}`]);
      await caches.default.delete(new Request(`${url.origin}/${encodeURI(key)}`)).catch(() => {});
      return json({ path: `/${key}`, size: obj.size });
    }
    if (route === "backup" && method === "POST") {
      return json({ result: await st.backup(), status: await st.backupStatus() });
    }
    // one-off bulk load / restore: { files: [{path, text}], media: [{path, size}], replace }
    if (route === "import" && method === "POST") {
      const { files = [], media = [], replace = false } = await request.json();
      const r = await st.importFiles(files, media, replace);
      forgetContent();
      return json(r);
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
  return `${head}<body class="adm"><header><div class="header-content"><h1 class="site-title"><a href="/admin">Supernihil</a></h1><nav class="adm-nav"><a href="#/">works</a><a href="#/new">+ new</a><a href="#/info">info page</a><a href="#/stats">stats</a><a href="/" target="_blank">site ↗</a><form method="post" action="/admin/logout"><button class="linkbtn">log out</button></form></nav></div></header>
<div id="status" class="deploy"></div><main id="app"></main>
<script type="module" src="/static/admin.js?v=${V}"></script></body></html>`;
}
