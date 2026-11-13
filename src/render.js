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

const DEFAULT_OG = "/assets/og/supernihil.jpg";
const PERSON = { "@type": "Person", name: "supernihil", url: ORIGIN, sameAs: ["https://github.com/sloev"] };
const SUBTITLES = [
  "an archive of audiovisual experiments",
  "noise, code and live visuals from Svendborg",
  "data turned into sound turned into image",
  "glitches, machines and digital ghosts",
  "videos, websites, installations, live sets",
  "the aesthetics of failure, archived",
];

// Every work gets a still JPG for link previews (GIFs are too big or not shown by most platforms).
export const ogImage = (w) => (w?.cover ? `/assets/og/${w.slug}.jpg` : DEFAULT_OG);
// Small still (≈480px JPG) shown first everywhere; the animated GIF only plays while on screen.
const poster = (w) => w?.poster || w?.thumbnail;
const isGif = (u) => /\.gif$/i.test(u || "");
function stillImg(w, { cls = "", alt = "", eager = false, ar = true } = {}) {
  const src = poster(w);
  if (!src) return "";
  const anim = w.anim ? ` data-anim="${esc(w.anim)}"` : "";
  return `<img src="${esc(src)}"${anim} alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${ar ? ` width="480" height="${Math.round(480 / (w.ar || 1))}" style="aspect-ratio:${w.ar}"` : ""}${cls ? ` class="${cls}"` : ""}>`;
}

function layout({ title, desc, image, imageAlt, path, body, nav, bodyClass = "", type = "website", jsonld = null, subtitle = false, ghost = false }) {
  const item = (key, text, href) => `<li><a href="${href}"${nav === key ? ' class="active"' : ""}>${text}</a></li>`;
  const fullTitle = title ? `${title} | Supernihil` : "Supernihil — archive of audiovisual works, code and live performances";
  const d = desc || DESC;
  const url = `${ORIGIN}${path}`;
  const img = `${ORIGIN}${image || DEFAULT_OG}`;
  const ld = [{ "@context": "https://schema.org", "@type": "WebSite", name: "Supernihil", url: ORIGIN, description: DESC, author: PERSON }, ...(jsonld ? [jsonld] : [])];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(d)}">
<meta name="author" content="supernihil">
<meta name="theme-color" content="#ff0000">
<link rel="canonical" href="${esc(url)}">
<link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Supernihil">
<meta property="og:site_name" content="Supernihil">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title || "Supernihil")}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:alt" content="${esc(imageAlt || title || "Supernihil")}">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title || "Supernihil")}">
<meta name="twitter:description" content="${esc(d)}">
<meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${JSON.stringify(ld.length === 1 ? ld[0] : ld).replace(/</g, "\\u003c")}</script>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap"></noscript>
<link rel="stylesheet" href="/static/style.css?v=${V}">
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
<header>
  <div class="header-content">
    ${subtitle ? `<h1 class="site-title"><a href="/">Supernihil</a></h1>` : `<p class="site-title"><a href="/">Supernihil</a></p>`}
    <p class="site-sub" data-ghost-goals="${esc(JSON.stringify(SUBTITLES))}">${esc(SUBTITLES[0])}</p>
    <nav>
      <ul class="nav-links">
        ${item("works", "works", "/")}
        ${item("walk", "walk", "/walk")}
        ${item("info", "info", "/info")}
      </ul>
    </nav>
  </div>
</header>
<main>
${body}
</main>
<script type="module" src="/static/site.js?v=${V}"></script>
<script type="module" src="/static/ghost.js?v=${V}"></script>
</body>
</html>`;
}

// small, stable tilt per card (-1.2..1.2deg), derived from the slug
function tilt(slug) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((((h % 25) + 25) % 25) - 12) / 10;
}

export function renderIndex(c) {
  const cards = c.works.map((w, i) => `
  <div class="work-item" style="--tilt:${tilt(w.slug)}deg">${w.type === "live" ? '<span class="sticker">LIVE</span>' : ""}
    <a href="/works/${enc(w.slug)}">
      ${stillImg(w, { cls: "grid-thumb", alt: w.title, eager: i < 4 })}
      <div class="work-info">
        <span class="work-title">${esc(w.title)}</span>
        <span class="work-date">${year(w)}</span>
      </div>
    </a>
  </div>`).join("");
  return layout({
    path: "/",
    nav: "works",
    subtitle: true,
    imageAlt: "Supernihil: archive of audiovisual works",
    jsonld: {
      "@context": "https://schema.org", "@type": "CollectionPage", name: "Supernihil — works", url: ORIGIN + "/",
      mainEntity: { "@type": "ItemList", numberOfItems: c.works.length, itemListElement: c.works.slice(0, 30).map((w, i) => ({ "@type": "ListItem", position: i + 1, url: `${ORIGIN}/works/${enc(w.slug)}`, name: w.title })) },
    },
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
    ? `<div class="work-video${shorts ? " portrait" : ""}"><iframe src="${esc(embed)}" title="${esc(w.title)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`
    : w.cover ? (isGif(w.cover)
      ? `<img src="${esc(ogImage(w))}" data-full="${esc(w.full || w.cover)}" alt="${esc(w.title)}" fetchpriority="high" style="aspect-ratio:${w.ar}">`
      : `<img src="${esc(w.cover)}" alt="${esc(w.title)}" fetchpriority="high" style="aspect-ratio:${w.ar}">`) : "";
  const step = (x, dir) => x ? `<a class="work-step ${dir}" href="/works/${enc(x.slug)}">
      ${poster(x) ? stillImg(x, { ar: false }) : "<span class=\"noimg\"></span>"}
      <span class="work-step-label">${dir === "newer" ? "← newer" : "older →"}</span>
      <span class="work-step-title">${esc(x.title)}</span>
    </a>` : "<span></span>";

  return layout({
    title: `${w.title} (${year(w)})`,
    desc: w.summary || `${w.title}: ${label(c, w.category)}, ${year(w)}.`,
    image: ogImage(w),
    imageAlt: w.title,
    type: "article",
    path: `/works/${enc(w.slug)}`,
    nav: "works",
    jsonld: {
      "@context": "https://schema.org",
      "@type": w.type === "live" ? "Event" : w.category === "video" ? "VideoObject" : w.category === "code" ? "SoftwareSourceCode" : "CreativeWork",
      name: w.title, url: `${ORIGIN}/works/${enc(w.slug)}`, description: w.summary,
      ...(w.type === "live" ? { startDate: w.date, eventStatus: "https://schema.org/EventScheduled", performer: PERSON } : { dateCreated: w.date, creator: PERSON }),
      ...(w.category === "video" && w.type !== "live" ? { uploadDate: w.date, thumbnailUrl: `${ORIGIN}${ogImage(w)}`, ...(w.video_url ? { contentUrl: w.video_url } : {}) } : {}),
      image: `${ORIGIN}${ogImage(w)}`, genre: label(c, w.category),
      ...(w.links.length ? { sameAs: w.links.map((l) => l.url) } : {}),
    },
    body: `<article class="work${embed ? " has-video" : ""}">
  <div class="work-stage">
    <figure class="work-media">${media}</figure>
    <div class="work-side">
      <div class="work-head">
        <span class="work-year" aria-hidden="true">${year(w)}</span>
        <h1 class="work-name"><span>${esc(w.title)}</span></h1>
      </div>
      <p class="work-tags"><time datetime="${w.date}">${esc(new Date(w.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}</time><span class="chip">${esc(label(c, w.category))}</span><span class="chip">${esc(label(c, w.type))}</span></p>
      ${w.summary ? `<p class="work-summary">${esc(w.summary)}</p>` : ""}
      <div class="work-body">${w.body}</div>
      ${w.links.length ? `<ul class="prominent-links">${w.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener" class="prominent-link">${esc(label(c, l.label))} →</a></li>`).join("")}</ul>` : ""}
    </div>
  </div>
  <nav class="work-steps">${step(newer, "newer")}${step(older, "older")}</nav>
</article>`,
  });
}

export function renderInfo(c) {
  const works = c.works;
  const years = works.map((w) => Number(year(w)));
  const min = Math.min(...years), max = Math.max(...years);
  const byYear = new Map();
  for (const w of [...works].reverse()) (byYear.get(Number(year(w))) || byYear.set(Number(year(w)), []).get(Number(year(w)))).push(w);
  const cols = [];
  for (let y = min; y <= max; y++) {
    const list = byYear.get(y) || [];
    cols.push(`<div class="punch-col"><div class="punch-stack">${list.map((w) => `<a class="punch ${w.type}" href="/works/${enc(w.slug)}" title="${esc(w.title)} (${y})"></a>`).join("")}</div><span class="punch-year">${String(y).slice(2)}</span></div>`);
  }
  const live = works.filter((w) => w.type === "live").length;
  const cats = [...works.reduce((m, w) => m.set(w.category, (m.get(w.category) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);

  return layout({
    title: "Info",
    desc: "About Supernihil: an archive of audiovisual experiments, interactive installations and digital fragments from Svendborg, Denmark. Contact and archive overview.",
    path: "/info",
    nav: "info",
    ghost: true,
    jsonld: { "@context": "https://schema.org", "@type": "AboutPage", name: "About Supernihil", url: ORIGIN + "/info", about: PERSON },
    body: `<div class="info">
  <div class="info-text" data-ghost>${(c.pages.info || "").replace(/<h2>([\s\S]*?)<\/h2>/g, "<h2><span>$1</span></h2>")}</div>
  <aside class="archive">
    <h2><span>The archive</span></h2>
    <div class="archive-numbers">
      <div><b>${works.length}</b><span>works</span></div>
      <div><b>${min}–${String(max).slice(2)}</b><span>years</span></div>
      <div><b class="red">${live}</b><span>live</span></div>
      <div><b>${works.length - live}</b><span>static</span></div>
    </div>
    <div class="punchcard" role="img" aria-label="Works per year, ${min} to ${max}">${cols.join("")}</div>
    <p class="punch-legend"><i class="punch live"></i> live <i class="punch static"></i> static · one square per work</p>
    <p class="archive-cats">${cats.map(([k, n]) => `<span class="chip">${esc(label(c, k))} ${n}</span>`).join(" ")}</p>
  </aside>
</div>`,
  });
}

export function renderWalk(c) {
  const data = c.works.map((w) => ({ slug: w.slug, title: w.title, date: w.date, type: w.type, thumb: poster(w), anim: w.anim, ar: w.ar }));
  return layout({
    title: "Walk",
    desc: "Walk through the Supernihil archive together with the other visitors, peer to peer.",
    path: "/walk",
    nav: "walk",
    bodyClass: "walk-page",
    body: `<div class="walk" id="walk">
  <div class="w-far" aria-hidden="true"><span>SUPERNIHIL</span><span>SUPERNIHIL</span><span>SUPERNIHIL</span><span>SUPERNIHIL</span><span>SUPERNIHIL</span><span>SUPERNIHIL</span></div>
  <div class="w-world"><div class="w-ground"></div></div>
  <div class="w-map" aria-hidden="true"></div>
  <button type="button" class="w-edge l" hidden><span class="w-edge-a">◀</span><span class="w-edge-n"></span><span class="w-edge-t"></span></button>
  <button type="button" class="w-edge r" hidden><span class="w-edge-t"></span><span class="w-edge-n"></span><span class="w-edge-a">▶</span></button>
  <div class="w-hud">
    <span class="chip w-count">1 here</span>
    <span class="w-state">…</span>
  </div>
  <button class="w-prompt" type="button" hidden><span class="w-key">↑</span> open <b></b></button>
  <form class="w-talk" autocomplete="off">
    <input name="input" maxlength="140" placeholder="press enter to talk" aria-label="Say something">
  </form>
  <div class="w-pad" aria-hidden="true">
    <button type="button" class="w-left" tabindex="-1">◀</button>
    <button type="button" class="w-right" tabindex="-1">▶</button>
    <button type="button" class="w-jump" tabindex="-1">▲</button>
  </div>
  <p class="w-note"><span class="w-keys">← → walk · space jump · ↑ open · enter talk. </span>Visitors connect peer to peer over <a href="/works/corvax">CORVAX</a> and can see each other's IP.</p>
</div>
<script type="application/json" id="walk-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script type="module" src="/static/walk.js?v=${V}"></script>`,
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
  const newest = c.works[0]?.date;
  const urls = [["/", newest], ["/info", newest], ["/walk", newest], ...c.works.map((w) => [`/works/${enc(w.slug)}`, w.date])];
  return `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, d]) => `<url><loc>${ORIGIN}${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`).join("")}</urlset>`;
}
