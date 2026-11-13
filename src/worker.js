// supernihil.party — one worker: public pages, media proxy, stats, admin CMS.
import { getContent } from "./content.js";
import { serveStatic } from "./statics.js";
import { renderIndex, renderWork, renderInfo, renderNotFound, renderFeed, renderSitemap } from "./render.js";
import { handleAdmin } from "./admin.js";
export { Stats } from "./stats.js";
export { Store } from "./content.js";

const REPO = "supernihil/supernihil.github.io";
const BRANCH = "master";
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
    if (path.startsWith("/assets/")) return proxyMedia(request, url, ctx);
    if (path.startsWith("/static/")) return serveStatic(path.slice(8));

    // old URLs: Jekyll posts, the separate works pages, the timeline, /en/
    const old = path.match(/^\/(?:[^/]+\/)*\d{4}\/\d{2}\/\d{2}\/([^/]+)\.html$/);
    if (old) return redirect(`/works/${encodeURIComponent(old[1])}`);
    if (/^\/(statiske-vaerker|levende-vaerker|timeline)\/?$/.test(path)) return redirect("/");
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
    else if (path.startsWith("/works/")) {
      const i = content.works.findIndex((w) => w.slug === path.slice(7));
      res = i < 0 ? html(renderNotFound(), 404) : html(renderWork(content, i));
    } else res = html(renderNotFound(), 404);

    if (request.method === "GET" && res.status === 200) ctx.waitUntil(track(request, env, url));
    return res;
  },
};

// Media lives in the GitHub repo; Cloudflare caches it at the edge.
async function proxyMedia(request, url, ctx) {
  const cache = caches.default;
  const key = new Request(url.origin + url.pathname);
  let res = await cache.match(key);
  if (res) return res;
  const upstream = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}${url.pathname}`, {
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });
  if (!upstream.ok) return new Response("not found", { status: 404 });
  const ext = url.pathname.split(".").pop().toLowerCase();
  res = new Response(upstream.body, {
    headers: {
      "content-type": TYPES[ext] || "application/octet-stream",
      "cache-control": "public, max-age=604800",
      "access-control-allow-origin": "*",
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
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
