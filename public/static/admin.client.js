// Admin UI: edit _posts/*.md in the GitHub repo, upload covers, see stats.
// Images are resized here in the browser (GIFs via gifsicle compiled to wasm),
// then saved together with the post as a single commit. The site updates instantly.
import { parse, stringify } from "https://cdn.jsdelivr.net/npm/yaml@2.9.1/+esm";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const CATS = ["video", "performance", "code", "web", "installation", "talk", "comic", "concept"];
const LINKS = ["website", "video", "repo", "event", "article"];
const COVER_W = 900, THUMB_W = 300;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "vaerk";

async function api(path, opts = {}) {
  const res = await fetch(`/admin/api/${path}`, { ...opts, headers: opts.body ? { "content-type": "application/json" } : {} });
  if (res.status === 401) { location.reload(); throw new Error("logged out"); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function splitPost(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: parse(m[1]) || {}, body: m[2].trim() } : { fm: {}, body: text };
}
function joinPost(fm, body) {
  for (const k of Object.keys(fm)) if (fm[k] === "" || fm[k] == null || fm[k] === false || (Array.isArray(fm[k]) && !fm[k].length)) delete fm[k];
  return `---\n${stringify(fm, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

function showLive(c) {
  statusEl.innerHTML = `live: <code>${esc(c.sha.slice(0, 7))}</code> · loaded ${new Date(c.loaded).toLocaleString("en-GB")} · <button class="linkbtn" id="pull">reload from GitHub</button>`;
  document.getElementById("pull").onclick = async () => {
    statusEl.textContent = "loading…";
    await api("refresh", { method: "POST" });
    route();
  };
}

// ---- media processing ------------------------------------------------------
const toB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(blob); });

async function dims(blob) {
  const bmp = await createImageBitmap(blob);
  const d = { w: bmp.width, h: bmp.height };
  bmp.close();
  return d;
}

async function resizeStill(blob, maxW, quality) {
  const bmp = await createImageBitmap(blob);
  const w = Math.min(maxW, bmp.width), h = Math.round(bmp.height * (w / bmp.width));
  const cv = new OffscreenCanvas(w, h);
  const cx = cv.getContext("2d");
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
  cx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return cv.convertToBlob({ type: "image/jpeg", quality });
}

let gifsicle;
async function resizeGif(file, maxW, lossy = 0) {
  gifsicle ??= (await import("https://cdn.jsdelivr.net/npm/gifsicle-wasm-browser@1.5.19/dist/gifsicle.min.js")).default;
  const [out] = await gifsicle.run({
    input: [{ file, name: "in.gif" }],
    command: [`-O3 ${lossy ? `--lossy=${lossy}` : ""} --resize-fit-width ${maxW} in.gif -o /out/out.gif`],
  });
  return out.size < file.size ? out : file; // never make it bigger
}

// returns { cover, thumbnail, aspect_ratio, files: [{path, data}] }
async function processUpload(file, base, onStep) {
  const isGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
  const ext = isGif ? "gif" : "jpg";
  const id = `${base}-${Date.now().toString(36)}`;
  onStep("reading…");
  const { w, h } = await dims(file);
  onStep(isGif ? "resizing gif (can take a while)…" : "resizing…");
  const cover = isGif ? await resizeGif(file, COVER_W) : await resizeStill(file, 1600, 0.86);
  onStep("making thumbnail…");
  const thumb = isGif ? await resizeGif(cover, THUMB_W, 80) : await resizeStill(file, THUMB_W * 2, 0.8);
  const coverPath = `assets/screenshots/${id}.${ext}`;
  const thumbPath = `assets/thumbnails/${id}.thumb.${ext}`;
  return {
    cover: `/${coverPath}`, thumbnail: `/${thumbPath}`, aspect_ratio: Math.round((w / h) * 1000) / 1000,
    coverSize: cover.size, thumbSize: thumb.size,
    files: [{ path: coverPath, data: await toB64(cover) }, { path: thumbPath, data: await toB64(thumb) }],
    preview: URL.createObjectURL(cover),
  };
}

// ---- views ---------------------------------------------------------------
async function listView() {
  app.innerHTML = `<p class="pad">loading…</p>`;
  const c = await api("posts");
  showLive(c);
  app.innerHTML = `<div class="pad bar"><input id="q" placeholder="search…" autocomplete="off"><a class="btn" href="#/new">+ new work</a></div>
  <ol class="list adm-list">${c.posts.map((p) => `<li data-q="${esc(`${p.title} ${p.file} ${p.category}`.toLowerCase())}"><a href="#/edit/${encodeURIComponent(p.file)}">
    <span class="y">${p.date.slice(0, 4)}</span>
    ${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="" loading="lazy">` : "<span></span>"}
    <b>${esc(p.title)}${p.draft ? ' <em class="tag">draft</em>' : ""}</b>
    <span class="m">${esc(p.category)} · ${p.type}</span>
  </a></li>`).join("")}</ol>`;
  const q = document.getElementById("q");
  q.oninput = () => { for (const li of app.querySelectorAll("li")) li.hidden = !li.dataset.q.includes(q.value.toLowerCase()); };
}

async function editView(name) {
  let fm = { date: new Date().toISOString().slice(0, 10), type: "static", category: "video", links: [] };
  let body = "";
  let media = null; // pending upload
  if (name) {
    app.innerHTML = `<p class="pad">loading…</p>`;
    ({ fm, body } = splitPost((await api(`post?name=${encodeURIComponent(name)}`)).text));
  }
  const v = (k) => esc(fm[k] ?? "");
  const opt = (list, cur) => list.map((x) => `<option${x === cur ? " selected" : ""}>${x}</option>`).join("");
  const linkRow = (l = {}) => `<div class="linkrow"><select name="label">${opt(LINKS, l.label)}</select><input name="url" placeholder="https://…" value="${esc(l.url)}"><button type="button" class="x" title="remove">×</button></div>`;

  app.innerHTML = `<form id="f" class="editor">
  <div class="col">
    <label>title<input name="title" required value="${v("title")}"></label>
    <div class="row3">
      <label>date<input name="date" type="date" required value="${v("date")}"></label>
      <label>category<select name="category">${opt([...new Set([...CATS, fm.category].filter(Boolean))], fm.category)}</select></label>
      <label>type<select name="type">${opt(["static", "live"], fm.type)}</select></label>
    </div>
    <label>summary <small>one line, shown in bold</small><textarea name="summary" rows="2">${v("summary")}</textarea></label>
    <label>text <small>markdown</small><textarea name="body" rows="14">${esc(body)}</textarea></label>
  </div>
  <div class="col">
    <div class="cover">
      <div id="prev">${fm.cover ? `<img src="${esc(fm.cover)}">` : `<span>no image</span>`}</div>
      <label class="btn file">choose image / gif…<input type="file" id="up" accept="image/gif,image/jpeg,image/png,image/webp" hidden></label>
      <small id="upmsg">${fm.cover ? esc(fm.cover) : "gif, jpg, png or webp. Resized in your browser before upload."}</small>
    </div>
    <label>video url <small>youtube / vimeo, optional</small><input name="video_url" value="${v("video_url")}"></label>
    <fieldset><legend>links</legend><div id="links">${(fm.links || []).map(linkRow).join("")}</div><button type="button" id="addlink" class="btn ghost">+ link</button></fieldset>
    <label class="check"><input type="checkbox" name="draft"${fm.draft ? " checked" : ""}> draft (hidden on the site)</label>
    <div class="actions">
      <button class="btn" id="save">${name ? "save" : "create"}</button>
      ${name ? `<a class="btn ghost" target="_blank" href="/works/${encodeURIComponent(name.slice(11, -3))}">view ↗</a><button type="button" class="btn danger" id="del">delete</button>` : ""}
    </div>
    <p id="msg" class="msg"></p>
  </div>
</form>`;

  const f = document.getElementById("f");
  const msg = (t, bad) => { const m = document.getElementById("msg"); m.textContent = t; m.className = `msg${bad ? " bad" : ""}`; };
  const upmsg = (t) => { document.getElementById("upmsg").textContent = t; };
  document.getElementById("addlink").onclick = () => document.getElementById("links").insertAdjacentHTML("beforeend", linkRow());
  document.getElementById("links").onclick = (e) => e.target.classList.contains("x") && e.target.parentElement.remove();

  document.getElementById("up").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const save = document.getElementById("save");
    save.disabled = true;
    try {
      const base = slugify(f.title.value || file.name.replace(/\.[^.]+$/, ""));
      media = await processUpload(file, base, upmsg);
      document.getElementById("prev").innerHTML = `<img src="${media.preview}">`;
      upmsg(`ready: ${(file.size / 1e6).toFixed(1)} MB → cover ${(media.coverSize / 1e6).toFixed(1)} MB + thumbnail ${(media.thumbSize / 1e6).toFixed(1)} MB. Saved together with the work.`);
    } catch (err) { media = null; upmsg(`error: ${err.message}`); }
    save.disabled = false;
  };

  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    const next = { ...fm };
    for (const k of ["title", "date", "category", "type", "summary", "video_url"]) next[k] = (d.get(k) || "").trim();
    if (media) Object.assign(next, { cover: media.cover, thumbnail: media.thumbnail, aspect_ratio: media.aspect_ratio });
    next.links = [...document.querySelectorAll(".linkrow")].map((r) => ({ label: r.querySelector("select").value, url: r.querySelector("input").value.trim() })).filter((l) => l.url);
    next.draft = !!d.get("draft");
    const order = ["title", "date", "category", "type", "summary", "cover", "thumbnail", "aspect_ratio", "video_url", "links", "draft"];
    const out = {};
    for (const k of [...order, ...Object.keys(next)]) if (k in next && !(k in out)) out[k] = next[k];

    const file = name || `${out.date}-${slugify(out.title)}.md`;
    msg(media ? "saving work and images…" : "saving…");
    document.getElementById("save").disabled = true;
    try {
      const r = await api("post", { method: "PUT", body: JSON.stringify({ name: file, text: joinPost(out, d.get("body") || ""), files: media?.files || [] }) });
      fm = out; media = null;
      msg(r.live ? "saved — live now." : "saved — will show shortly.");
      if (!name) location.hash = `#/edit/${encodeURIComponent(file)}`;
    } catch (err) { msg(err.message, true); }
    document.getElementById("save").disabled = false;
  };

  document.getElementById("del")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await api("post", { method: "DELETE", body: JSON.stringify({ name }) });
      location.hash = "#/";
    } catch (err) { msg(err.message, true); }
  });
}

async function statsView(days = 30) {
  app.innerHTML = `<p class="pad">loading…</p>`;
  const s = await api(`stats?days=${days}`);
  const byDay = new Map(s.days.map((d) => [d.day, d]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    series.push(byDay.get(day) || { day, views: 0, visitors: 0 });
  }
  const max = Math.max(1, ...series.map((d) => d.views));
  const W = 100 / series.length;
  const bars = series.map((d, i) => `<g><title>${d.day}: ${d.views} views, ${d.visitors} visitors</title>
    <rect x="${i * W + W * 0.1}%" width="${W * 0.8}%" y="${100 - (d.views / max) * 100}%" height="${(d.views / max) * 100}%" class="v"/>
    <rect x="${i * W + W * 0.1}%" width="${W * 0.8}%" y="${100 - (d.visitors / max) * 100}%" height="${(d.visitors / max) * 100}%" class="u"/></g>`).join("");
  const table = (title, rows) => `<section><h3>${title}</h3><table>${rows.map((r) => `<tr><td>${esc(r.k || "—")}</td><td>${r.n}</td></tr>`).join("") || "<tr><td>no data</td></tr>"}</table></section>`;

  app.innerHTML = `<div class="pad stats">
  <div class="bar"><div class="kpis"><div><b>${s.totals.views}</b><span>views</span></div><div><b>${s.totals.visitors}</b><span>visitors</span></div></div>
  <div class="range">${[7, 30, 90, 365].map((d) => `<a href="#/stats/${d}"${d === days ? ' aria-current="true"' : ""}>${d}d</a>`).join("")}</div></div>
  <svg class="chart" preserveAspectRatio="none" role="img" aria-label="views per day">${bars}</svg>
  <div class="axis"><span>${series[0].day}</span><span>■ views <i>■</i> visitors</span><span>${series.at(-1).day}</span></div>
  <div class="tables">
    ${table("pages", s.paths)}
    ${table("referrers", s.refs)}
    ${table("countries", s.countries)}
    ${table("devices", s.devices)}
  </div>
  <p class="note">No cookies, no tracking script. Visitors = anonymous daily hash of IP + browser; never stored in plain text.</p>
</div>`;
}

async function route() {
  const h = decodeURIComponent(location.hash.slice(1) || "/");
  try {
    if (h === "/new") await editView(null);
    else if (h.startsWith("/edit/")) await editView(h.slice(6));
    else if (h.startsWith("/stats")) await statsView(Number(h.split("/")[2]) || 30);
    else await listView();
  } catch (e) { app.innerHTML = `<p class="pad msg bad">${esc(e.message)}</p>`; }
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);
route();
