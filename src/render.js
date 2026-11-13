// HTML templates (markup and class names follow the original Jekyll design).
import { V } from "./statics.js";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = (slug) => encodeURIComponent(slug);
const label = (c, k) => c.t?.[k] ?? k;
const year = (w) => w.date.slice(0, 4);
const ORIGIN = "https://supernihil.party";
const DESC = "Supernihil is an archive of experimental audiovisual works, interactive installations and digital artifacts. Based in Svendborg, Denmark.";

function youtubeId(u) {
  const m = String(u || "").match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function layout({ title, desc, image, path, body, nav }) {
  const item = (key, text, href) => `<li><a href="${href}"${nav === key ? ' class="active"' : ""}>${text}</a></li>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} | Supernihil` : "Supernihil")}</title>
<meta name="description" content="${esc(desc || DESC)}">
<link rel="canonical" href="${ORIGIN}${esc(path)}">
<link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Supernihil">
<meta property="og:title" content="${esc(title || "Supernihil")}">
<meta property="og:description" content="${esc(desc || DESC)}">
${image ? `<meta property="og:image" content="${ORIGIN}${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap">
<link rel="stylesheet" href="/static/style.css?v=${V}">
</head>
<body>
<header>
  <div class="header-content">
    <h1 class="site-title"><a href="/">Supernihil</a></h1>
    <nav>
      <ul class="nav-links">
        ${item("works", "works", "/")}
        ${item("info", "info", "/info")}
      </ul>
    </nav>
  </div>
</header>
<main>
${body}
</main>
<footer><div class="footer-content"><p>An archive of works by supernihil. · <a href="/feed.xml">rss</a></p></div></footer>
</body>
</html>`;
}

export function renderIndex(c) {
  const cards = c.works.map((w, i) => `
  <div class="work-item">
    <a href="/works/${enc(w.slug)}">
      ${w.thumbnail ? `<img src="${esc(w.thumbnail)}" alt="${esc(w.title)}" ${i < 6 ? "" : 'loading="lazy" '}decoding="async" style="aspect-ratio:${w.ar}" class="grid-thumb">` : ""}
      <div class="work-info">
        <span class="work-title">${esc(w.title)}</span>
        <span class="work-date">${year(w)}</span>
      </div>
    </a>
  </div>`).join("");
  return layout({
    path: "/",
    nav: "works",
    image: c.works.find((w) => w.cover)?.cover,
    body: `<div class="works-grid">${cards || "<p>No works yet.</p>"}\n</div>`,
  });
}

export function renderWork(c, i) {
  const w = c.works[i];
  const newer = c.works[i - 1];
  const older = c.works[i + 1];
  const yt = youtubeId(w.video_url);
  const vimeo = !yt && String(w.video_url || "").match(/vimeo\.com\/(\d+)/)?.[1];
  const embed = yt ? `https://www.youtube-nocookie.com/embed/${yt}` : vimeo ? `https://player.vimeo.com/video/${vimeo}` : "";
  const shorts = /shorts\//.test(w.video_url || "");

  const media = embed
    ? `<div class="video-container${shorts ? " portrait" : ""}"><iframe src="${esc(embed)}" title="${esc(w.title)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`
    : w.cover ? `<img src="${esc(w.cover)}" alt="${esc(w.title)}" style="aspect-ratio:${w.ar}">` : "";
  const step = (x, k) => (x ? `<a href="/works/${enc(x.slug)}"><small>${k}</small>${esc(x.title)}</a>` : "<span></span>");

  return layout({
    title: w.title,
    desc: w.summary,
    image: w.cover,
    path: `/works/${enc(w.slug)}`,
    nav: "works",
    body: `<article class="post">
  <header class="post-header">
    <h1 class="post-title">${esc(w.title)}</h1>
    <p class="post-meta"><time datetime="${w.date}">${esc(new Date(w.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}</time> • ${esc(label(c, w.category))} • ${esc(label(c, w.type))}</p>
  </header>
  <div class="post-layout">
    <div class="post-media">${media}</div>
    <div class="post-info-column">
      <div class="post-content">
        ${w.summary ? `<p class="post-summary">${esc(w.summary)}</p>` : ""}
        ${w.body}
      </div>
      ${w.links.length ? `<div class="post-links"><ul class="prominent-links">${w.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener" class="prominent-link">${esc(label(c, l.label))} →</a></li>`).join("")}</ul></div>` : ""}
      <nav class="post-nav">${step(newer, "newer")}${step(older, "older")}</nav>
    </div>
  </div>
</article>`,
  });
}

export function renderInfo(c) {
  return layout({
    title: "Info",
    desc: "About Supernihil.",
    path: "/info",
    nav: "info",
    body: `<div class="info-content"><div class="about-section">${c.pages.info || ""}</div></div>`,
  });
}

export function renderNotFound() {
  return layout({ title: "404", path: "/", body: `<div class="info-content"><div class="about-section"><h2>404</h2><p>Page not found. <a href="/">→ works</a></p></div></div>` });
}

export function renderFeed(c) {
  const items = c.works.slice(0, 30).map((w) => `<item><title>${esc(w.title)}</title><link>${ORIGIN}/works/${enc(w.slug)}</link><guid>${ORIGIN}/works/${enc(w.slug)}</guid><pubDate>${new Date(w.date).toUTCString()}</pubDate><description>${esc(w.summary)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Supernihil</title><link>${ORIGIN}/</link><description>An archive of works by supernihil.</description>${items}</channel></rss>`;
}

export function renderSitemap(c) {
  const urls = ["/", "/info", ...c.works.map((w) => `/works/${enc(w.slug)}`)];
  return `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${ORIGIN}${u}</loc></url>`).join("")}</urlset>`;
}
