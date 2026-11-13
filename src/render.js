// HTML templates. Plain strings, no framework.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = (slug) => encodeURIComponent(slug);
const pre = (lang) => (lang === "en" ? "/en" : "");
const tr = (c, lang, k) => c.t[lang]?.[k] ?? k;
const title = (w, lang) => (lang === "en" && w.title_en) || w.title;
const year = (w) => w.date.slice(0, 4);

function youtubeId(u) {
  const m = String(u || "").match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function layout(c, lang, { title: t, desc, image, path, body, alt }) {
  const other = lang === "en" ? "da" : "en";
  const altHref = (other === "en" ? "/en" : "") + (alt ?? path);
  const canonical = `https://supernihil.party${pre(lang)}${path === "/" && lang === "en" ? "" : path}`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t ? `${t} — supernihil` : "supernihil")}</title>
<meta name="description" content="${esc(desc || "")}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" hreflang="da" href="https://supernihil.party${esc(path)}">
<link rel="alternate" hreflang="en" href="https://supernihil.party/en${esc(path === "/" ? "" : path)}">
<link rel="alternate" type="application/rss+xml" href="/feed.xml" title="supernihil">
<meta property="og:title" content="${esc(t || "supernihil")}">
<meta property="og:description" content="${esc(desc || "")}">
${image ? `<meta property="og:image" content="https://supernihil.party${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap">
<link rel="stylesheet" href="/static/style.css?v=${c.built}">
</head>
<body>
<header class="top">
  <a class="brand" href="${pre(lang) || "/"}">supernihil</a>
  <nav>
    <a href="${pre(lang) || "/"}">${tr(c, lang, "works")}</a>
    <a href="${pre(lang)}/info">${tr(c, lang, "info")}</a>
    <a class="lang" href="${esc(altHref)}" hreflang="${other}" lang="${other}">${other}</a>
  </nav>
</header>
<main>${body}</main>
<footer class="foot">${esc(tr(c, lang, "footer_text"))} · <a href="/feed.xml">rss</a></footer>
</body>
</html>`;
}

export function renderIndex(c, lang, q) {
  const type = ["live", "static"].includes(q.get("type")) ? q.get("type") : "";
  const cat = q.get("cat") || "";
  const view = q.get("view") === "list" ? "list" : "grid";
  const works = c.works.filter((w) => (!type || w.type === type) && (!cat || w.category === cat));
  const cats = [...new Set(c.works.map((w) => w.category))].sort();

  const link = (params) => {
    const p = new URLSearchParams({ ...(type && { type }), ...(cat && { cat }), ...(view === "list" && { view }), ...params });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return `${pre(lang) || "/"}${s ? "?" + s : ""}`;
  };
  const chip = (label, params, on) => `<a href="${esc(link(params))}"${on ? ' aria-current="true"' : ""}>${esc(label)}</a>`;

  const filters = `<div class="filters">
  <div class="chips">
    ${chip(tr(c, lang, "all"), { type: "", cat: "" }, !type && !cat)}
    ${chip(tr(c, lang, "live"), { type: "live" }, type === "live")}
    ${chip(tr(c, lang, "static"), { type: "static" }, type === "static")}
    <span class="sep"></span>
    ${cats.map((k) => chip(tr(c, lang, k), { cat: cat === k ? "" : k }, cat === k)).join("\n    ")}
  </div>
  <div class="views">
    ${chip(tr(c, lang, "grid"), { view: "" }, view === "grid")}
    ${chip(tr(c, lang, "list"), { view: "list" }, view === "list")}
  </div>
</div>`;

  const href = (w) => `${pre(lang)}/works/${enc(w.slug)}`;
  const grid = `<div class="grid">${works.map((w, i) => `
  <a class="tile" href="${href(w)}" style="--ar:${w.ar}">
    ${w.thumbnail ? `<img src="${esc(w.thumbnail)}" alt="" width="300" height="${Math.round(300 / w.ar)}" ${i < 8 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">` : `<span class="noimg"></span>`}
    <span class="cap"><b>${esc(title(w, lang))}</b> <i>${year(w)}</i></span>
  </a>`).join("")}
</div>`;

  const list = `<ol class="list">${works.map((w) => `
  <li><a href="${href(w)}">
    <span class="y">${year(w)}</span>
    ${w.thumbnail ? `<img src="${esc(w.thumbnail)}" alt="" loading="lazy" decoding="async">` : "<span></span>"}
    <b>${esc(title(w, lang))}</b>
    <span class="m">${esc(tr(c, lang, w.category))}</span>
    <span class="m">${esc(tr(c, lang, w.type))}</span>
  </a></li>`).join("")}
</ol>`;

  const first = works.find((w) => w.thumbnail);
  return layout(c, lang, {
    title: "",
    desc: lang === "en" ? "Archive of audiovisual works, performances and code by supernihil, Svendborg." : "Arkiv over audiovisuelle værker, performances og kode af supernihil, Svendborg.",
    image: first?.cover,
    path: "/",
    alt: link({}).replace(/^\/en/, "") || "/",
    body: filters + (view === "list" ? list : grid),
  });
}

export function renderWork(c, lang, i) {
  const w = c.works[i];
  const newer = c.works[i - 1];
  const older = c.works[i + 1];
  const yt = youtubeId(w.video_url);
  const vimeo = !yt && String(w.video_url || "").match(/vimeo\.com\/(\d+)/)?.[1];
  const embed = yt ? `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0` : vimeo ? `https://player.vimeo.com/video/${vimeo}?autoplay=1` : "";

  const img = w.cover ? `<img src="${esc(w.cover)}" alt="${esc(title(w, lang))}" style="aspect-ratio:${w.ar}" fetchpriority="high">` : "";
  const media = embed
    ? `<button class="play" data-embed="${esc(embed)}" data-ar="${/shorts\//.test(w.video_url) ? "9/16" : "16/9"}" style="--ar:${w.ar}" aria-label="${esc(tr(c, lang, "play"))}">${img}<span class="tri" aria-hidden="true"></span></button>`
    : img;

  const summary = lang === "en" ? w.summary_en || w.summary : w.summary;
  const body = lang === "en" ? w.body_en || w.body : w.body;
  const nav = (x, k) => (x ? `<a href="${pre(lang)}/works/${enc(x.slug)}"><small>${tr(c, lang, k)}</small>${esc(title(x, lang))}</a>` : "<span></span>");

  return layout(c, lang, {
    title: title(w, lang),
    desc: summary,
    image: w.cover,
    path: `/works/${enc(w.slug)}`,
    body: `<article class="work">
  <figure class="media">${media}</figure>
  <div class="text">
    <h1>${esc(title(w, lang))}</h1>
    <p class="meta"><time datetime="${w.date}">${year(w)}</time> · <a href="${pre(lang) || "/"}?cat=${encodeURIComponent(w.category)}">${esc(tr(c, lang, w.category))}</a> · <a href="${pre(lang) || "/"}?type=${w.type}">${esc(tr(c, lang, w.type))}</a></p>
    ${summary ? `<p class="lede">${esc(summary)}</p>` : ""}
    <div class="body">${body}</div>
    ${w.links.length ? `<ul class="links">${w.links.map((l) => `<li><a href="${esc(l.url)}" rel="noopener" target="_blank">${esc(tr(c, lang, l.label))} ↗</a></li>`).join("")}</ul>` : ""}
    <nav class="prevnext">${nav(newer, "newer")}${nav(older, "older")}</nav>
  </div>
</article>
${embed ? `<script>document.querySelector(".play").addEventListener("click",e=>{const b=e.currentTarget,f=document.createElement("iframe");f.src=b.dataset.embed;f.allow="autoplay; fullscreen; picture-in-picture";f.allowFullscreen=true;f.style.aspectRatio=b.dataset.ar;b.replaceWith(f)})</script>` : ""}`,
  });
}

export function renderInfo(c, lang) {
  return layout(c, lang, {
    title: "info",
    desc: lang === "en" ? "About supernihil." : "Om supernihil.",
    path: "/info",
    body: `<article class="page">${c.pages.info?.[lang] || ""}</article>`,
  });
}

export function renderNotFound(c, lang) {
  return layout(c, lang, { title: "404", path: "/", body: `<article class="page"><h2>404</h2><p>${esc(tr(c, lang, "not_found"))} <a href="${pre(lang) || "/"}">→ ${tr(c, lang, "works")}</a></p></article>` });
}

export function renderFeed(c, origin) {
  const items = c.works.slice(0, 30).map((w) => `<item><title>${esc(w.title)}</title><link>${origin}/works/${enc(w.slug)}</link><guid>${origin}/works/${enc(w.slug)}</guid><pubDate>${new Date(w.date).toUTCString()}</pubDate><description>${esc(w.summary)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>supernihil</title><link>${origin}/</link><description>Arkiv over værker af supernihil.</description>${items}</channel></rss>`;
}

export function renderSitemap(c, origin) {
  const urls = ["/", "/info", ...c.works.map((w) => `/works/${enc(w.slug)}`)];
  return `<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.flatMap((u) => [u, "/en" + (u === "/" ? "" : u)]).map((u) => `<url><loc>${origin}${u}</loc></url>`).join("")}</urlset>`;
}
