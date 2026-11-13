// supernihil.party — one worker: public pages, media from R2, stats, admin, GitHub backup.
import { getContent, store } from "./content.js";
import { serveStatic } from "./statics.js";
import { renderIndex, renderWork, renderInfo, renderWalk, renderNotFound, renderFeed, renderSitemap } from "./render.js";
import { handleAdmin } from "./admin.js";
export { Stats } from "./stats.js";
export { Store } from "./content.js";

const ORIGIN = "https://supernihil.party";
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|curl|wget|python|httpclient|headless|lighthouse|monitor/i;
const TYPES = { gif: "image/gif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4" };

const html = (body, status = 200) => new Response(body, {
  status,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
});
const redirect = (to, status = 301) => new Response(null, { status, headers: { location: to } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);

    if (url.hostname.startsWith("www.")) return redirect(`${ORIGIN}${url.pathname}${url.search}`);
    if (path === "/admin" || path.startsWith("/admin/")) return handleAdmin(request, env, url, path);
    if (path.startsWith("/assets/")) return serveMedia(request, env, path.slice(1), ctx);
    if (path.startsWith("/static/")) return serveStatic(path.slice(8));

    // old URLs: Jekyll posts, the separate works pages, the timeline, /en/
    const old = path.match(/^\/(?:[^/]+\/)*\d{4}\/\d{2}\/\d{2}\/([^/]+)\.html$/);
    if (old) return redirect(`/works/${encodeURIComponent(old[1])}`);
    if (/^\/(statiske-vaerker|levende-vaerker|timeline)\/?$/.test(path)) return redirect("/");
    if (path === "/machine") return redirect("/walk");
    if (path === "/en" || path.startsWith("/en/")) return redirect(url.pathname.slice(3) || "/");
    if (path.length > 1 && path.endsWith("/")) return redirect(url.pathname.slice(0, -1));
    if (url.search && path === "/") return redirect("/");

    let content;
    try { content = await getContent(env); }
    catch (e) { return new Response(`content unavailable: ${e.message}`, { status: 503, headers: { "retry-after": "30" } }); }

    if (path === "/feed.xml") return new Response(renderFeed(content), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
    if (path === "/sitemap.xml") return new Response(renderSitemap(content), { headers: { "content-type": "application/xml; charset=utf-8" } });
    if (path === "/robots.txt") return new Response(`User-agent: *\nDisallow: /admin\nSitemap: ${ORIGIN}/sitemap.xml\n`);

    let res;
    if (path === "/") res = html(renderIndex(content));
    else if (path === "/info") res = html(renderInfo(content));
    else if (path === "/walk") res = html(renderWalk(content));
    else if (path.startsWith("/works/")) {
      const i = content.works.findIndex((w) => w.slug === path.slice(7));
      res = i < 0 ? html(renderNotFound(), 404) : html(renderWork(content, i));
    } else res = html(renderNotFound(), 404);

    if (request.method === "GET" && res.status === 200) ctx.waitUntil(track(request, env, url));
    return res;
  },

  // hourly: copy changed posts/pages and new media to the GitHub repo
  async scheduled(event, env, ctx) {
    ctx.waitUntil(store(env).backup());
  },
};

// Media lives in R2. Range requests and conditional GETs are passed through.
async function serveMedia(request, env, key, ctx) {
  const cache = caches.default;
  const cacheable = request.method === "GET" && !request.headers.has("range");
  const cacheKey = new Request(new URL(request.url).origin + "/" + encodeURI(key));
  if (cacheable) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const obj = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const ext = key.split(".").pop().toLowerCase();
  if (!headers.get("content-type")) headers.set("content-type", TYPES[ext] || "application/octet-stream");
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=604800");
  headers.set("accept-ranges", "bytes");
  if (!("body" in obj)) return new Response(null, { status: 304, headers });
  if (obj.range && request.headers.has("range")) {
    const start = obj.range.offset ?? 0;
    const end = start + (obj.range.length ?? obj.size - start) - 1;
    headers.set("content-range", `bytes ${start}-${end}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers });
  }
  const res = new Response(obj.body, { headers });
  if (cacheable && obj.size < 100e6) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

async function track(request, env, url) {
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua) || request.headers.get("purpose") === "prefetch") return;
  let ref = "";
  try {
    const r = new URL(request.headers.get("referer") || "");
    if (r.hostname !== url.hostname) ref = r.hostname.replace(/^www\./, "");
  } catch {}
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get("cf-connecting-ip") || "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}|${ip}|${ua}|${env.STATS_SALT || "sn"}`));
  const visitor = [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const stub = env.STATS.get(env.STATS.idFromName("global"));
  await stub.hit({
    day,
    path: decodeURIComponent(url.pathname),
    ref,
    country: request.cf?.country || "",
    device: /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop",
    lang: "en",
    visitor,
  });
}
