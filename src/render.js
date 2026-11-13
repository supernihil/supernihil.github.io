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
        ${item("machine", "machine", "/machine")}
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
    ? `<div class="work-video${shorts ? " portrait" : ""}"><iframe src="${esc(embed)}" title="${esc(w.title)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`
    : w.cover ? `<img src="${esc(w.cover)}" alt="${esc(w.title)}" style="aspect-ratio:${w.ar}">` : "";
  const step = (x, dir) => x ? `<a class="work-step ${dir}" href="/works/${enc(x.slug)}">
      ${x.thumbnail ? `<img src="${esc(x.thumbnail)}" alt="" loading="lazy">` : "<span class=\"noimg\"></span>"}
      <span class="work-step-label">${dir === "newer" ? "← newer" : "older →"}</span>
      <span class="work-step-title">${esc(x.title)}</span>
    </a>` : "<span></span>";

  return layout({
    title: w.title,
    desc: w.summary,
    image: w.cover,
    path: `/works/${enc(w.slug)}`,
    nav: "works",
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
    desc: "About Supernihil.",
    path: "/info",
    nav: "info",
    body: `<div class="info">
  <div class="info-text">${(c.pages.info || "").replace(/<h2>([\s\S]*?)<\/h2>/g, "<h2><span>$1</span></h2>")}</div>
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

export function renderMachine() {
  return layout({
    title: "The Machine",
    desc: "A shared noise sequencer. Everyone on the page plays the same pattern, peer to peer over CORVAX.",
    path: "/machine",
    nav: "machine",
    body: `<div class="machine">
  <div class="m-head">
    <h1 class="work-name"><span>The Machine</span></h1>
    <p class="m-intro">One pattern, shared by everyone on this page. Flip squares, shout, listen.
      No server keeps it: it lives in the browsers that are here, connected peer to peer over <a href="/works/corvax">CORVAX</a>.</p>
  </div>
  <div class="m-stage">
    <div class="m-board">
      <div class="m-grid" id="grid" style="--steps:16"></div>
      <div class="m-transport">
        <button class="prominent-link" id="play" type="button">▶ play</button>
        <button class="m-clear" id="clear" type="button">clear</button>
        <span class="m-budget"><span class="m-k">signals</span><span class="m-meter" id="meter"></span></span>
      </div>
    </div>
    <aside class="m-side">
      <div class="m-here"><b id="here">?</b><span>here now</span></div>
      <button class="prominent-link m-enter" id="enter" type="button">enter the room →</button>
      <p class="m-note">Joining connects you directly to the others in the room, so they can see your IP address. You get 10 signals a minute: each batch of edits or each shout costs one.</p>
      <p class="m-status" id="status" role="status"></p>
      <ul class="m-people" id="people"></ul>
      <form class="m-shout" id="shout" autocomplete="off">
        <input name="t" maxlength="120" placeholder="shout into the machine…" aria-label="Shout">
        <button type="submit">send</button>
      </form>
      <ol class="m-log" id="log" aria-live="polite"></ol>
    </aside>
  </div>
</div>
<script type="module" src="/static/machine.js?v=${V}"></script>`,
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
  const urls = ["/", "/info", "/machine", ...c.works.map((w) => `/works/${enc(w.slug)}`)];
  return `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${ORIGIN}${u}</loc></url>`).join("")}</urlset>`;
}
