// Admin UI: edit _posts/*.md in the GitHub repo, upload covers, see stats.
import { parse, stringify } from "https://cdn.jsdelivr.net/npm/yaml@2.9.1/+esm";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const CATS = ["video", "performance", "kode", "web", "installation", "talk", "tegneserie", "koncept"];
const LINKS = ["website", "video", "repo", "event", "article"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function api(path, opts = {}) {
  const res = await fetch(`/admin/api/${path}`, {
    ...opts, headers: opts.body ? { "content-type": "application/json" } : {},
  });
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
  for (const k of Object.keys(fm)) if (fm[k] === "" || fm[k] == null || (Array.isArray(fm[k]) && !fm[k].length)) delete fm[k];
  return `---\n${stringify(fm, { lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

// ---- deploy status -------------------------------------------------------
let pollUntil = 0;
async function refreshStatus() {
  try {
    const runs = await api("status");
    const r = runs[0];
    if (!r) { statusEl.textContent = ""; return; }
    const state = r.status === "completed" ? (r.conclusion === "success" ? "live" : r.conclusion) : "deploying…";
    statusEl.className = `deploy ${r.status === "completed" ? r.conclusion : "running"}`;
    statusEl.innerHTML = `<a href="${esc(r.url)}" target="_blank">${esc(state)}</a> · ${esc(r.title)} · ${new Date(r.at).toLocaleString("da-DK")}`;
    if (r.status !== "completed" || Date.now() < pollUntil) setTimeout(refreshStatus, 8000);
  } catch (e) { statusEl.textContent = e.message; }
}

// ---- views ---------------------------------------------------------------
async function listView() {
  app.innerHTML = `<p class="pad">henter…</p>`;
  const posts = await api("posts");
  app.innerHTML = `<div class="pad bar"><input id="q" placeholder="søg…" autocomplete="off"><a class="btn" href="#/new">+ nyt værk</a></div>
  <ol class="list adm-list">${posts.map((p) => `<li data-n="${esc(p.name)}"><a href="#/edit/${encodeURIComponent(p.name)}"><span class="y">${p.name.slice(0, 10)}</span><b>${esc(p.name.slice(11, -3))}</b></a></li>`).join("")}</ol>`;
  document.getElementById("q").oninput = (e) => {
    const q = e.target.value.toLowerCase();
    for (const li of app.querySelectorAll("li")) li.hidden = !li.dataset.n.toLowerCase().includes(q);
  };
}

async function editView(name) {
  let fm = { date: new Date().toISOString().slice(0, 10), type: "static", category: "video", links: [] };
  let body = "", sha = null;
  if (name) {
    app.innerHTML = `<p class="pad">henter…</p>`;
    const p = await api(`post?name=${encodeURIComponent(name)}`);
    ({ fm, body } = splitPost(p.text));
    sha = p.sha;
  }
  const v = (k) => esc(fm[k] ?? "");
  const opt = (list, cur) => list.map((x) => `<option${x === cur ? " selected" : ""}>${x}</option>`).join("");
  const linkRow = (l = {}) => `<div class="linkrow"><select name="label">${opt(LINKS, l.label)}</select><input name="url" placeholder="https://…" value="${esc(l.url)}"><button type="button" class="x" title="fjern">×</button></div>`;

  app.innerHTML = `<form id="f" class="editor">
  <div class="col">
    <label>titel<input name="title" required value="${v("title")}"></label>
    <label>titel (en) <small>valgfri</small><input name="title_en" value="${v("title_en")}"></label>
    <div class="row3">
      <label>dato<input name="date" type="date" required value="${v("date")}"></label>
      <label>kategori<select name="category">${opt([...new Set([...CATS, fm.category].filter(Boolean))], fm.category)}</select></label>
      <label>type<select name="type">${opt(["static", "live"], fm.type)}</select></label>
    </div>
    <label>kort tekst (da)<textarea name="summary" rows="2">${v("summary")}</textarea></label>
    <label>kort tekst (en)<textarea name="summary_en" rows="2">${v("summary_en")}</textarea></label>
    <label>tekst (da) <small>markdown</small><textarea name="body" rows="9">${esc(body)}</textarea></label>
    <label>tekst (en) <small>markdown</small><textarea name="body_en" rows="9">${v("body_en")}</textarea></label>
  </div>
  <div class="col">
    <div class="cover">
      <div id="prev">${fm.cover ? `<img src="${esc(fm.cover)}">` : `<span>intet billede</span>`}</div>
      <label>billede / gif<input name="cover" value="${v("cover")}" placeholder="/assets/screenshots/…"></label>
      <label class="btn file">upload…<input type="file" id="up" accept="image/gif,image/jpeg,image/png,image/webp" hidden></label>
      <small id="upmsg">gif/jpg/png. Skaleres automatisk til 900px + thumbnail ved deploy.</small>
    </div>
    <label>video-url <small>youtube / vimeo, valgfri</small><input name="video_url" value="${v("video_url")}"></label>
    <fieldset><legend>links</legend><div id="links">${(fm.links || []).map(linkRow).join("")}</div><button type="button" id="addlink" class="btn ghost">+ link</button></fieldset>
    <label class="check"><input type="checkbox" name="draft"${fm.draft ? " checked" : ""}> kladde (skjult på sitet)</label>
    <div class="actions">
      <button class="btn" id="save">${name ? "gem" : "opret"}</button>
      ${name ? `<a class="btn ghost" target="_blank" href="/works/${encodeURIComponent(name.slice(11, -3))}">vis ↗</a><button type="button" class="btn danger" id="del">slet</button>` : ""}
    </div>
    <p id="msg" class="msg"></p>
  </div>
</form>`;

  const f = document.getElementById("f");
  const msg = (t, bad) => { const m = document.getElementById("msg"); m.textContent = t; m.className = `msg${bad ? " bad" : ""}`; };
  document.getElementById("addlink").onclick = () => document.getElementById("links").insertAdjacentHTML("beforeend", linkRow());
  document.getElementById("links").onclick = (e) => e.target.classList.contains("x") && e.target.parentElement.remove();
  f.cover.oninput = () => { document.getElementById("prev").innerHTML = f.cover.value ? `<img src="${esc(f.cover.value)}">` : ""; };

  document.getElementById("up").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const um = document.getElementById("upmsg");
    if (file.size > 90e6) { um.textContent = "filen er for stor (max 90 MB)"; return; }
    um.textContent = `uploader ${(file.size / 1e6).toFixed(1)} MB…`;
    document.getElementById("prev").innerHTML = `<img src="${URL.createObjectURL(file)}">`;
    const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(file); });
    try {
      const { path } = await api("upload", { method: "POST", body: JSON.stringify({ name: file.name, data }) });
      f.cover.value = path;
      delete fm.thumbnail; delete fm.aspect_ratio;
      um.textContent = "uploadet. Husk at gemme.";
    } catch (err) { um.textContent = err.message; }
  };

  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    const next = { ...fm };
    for (const k of ["title", "title_en", "date", "category", "type", "summary", "summary_en", "cover", "video_url", "body_en"]) next[k] = (d.get(k) || "").trim();
    if (next.cover !== fm.cover) { delete next.thumbnail; delete next.aspect_ratio; }
    next.links = [...document.querySelectorAll(".linkrow")].map((r) => ({ label: r.querySelector("select").value, url: r.querySelector("input").value.trim() })).filter((l) => l.url);
    next.draft = d.get("draft") ? true : "";
    // stable key order
    const order = ["title", "title_en", "date", "category", "type", "summary", "summary_en", "cover", "thumbnail", "aspect_ratio", "video_url", "links", "body_en", "draft"];
    const out = {};
    for (const k of [...order, ...Object.keys(next)]) if (k in next && !(k in out)) out[k] = next[k];

    const file = name || `${out.date}-${slugify(out.title)}.md`;
    msg("gemmer…");
    try {
      const r = await api("post", { method: "PUT", body: JSON.stringify({ name: file, text: joinPost(out, d.get("body") || ""), sha }) });
      sha = r.sha;
      msg("gemt — sitet opdateres om ca. 1 minut.");
      pollUntil = Date.now() + 120000; setTimeout(refreshStatus, 4000);
      if (!name) location.hash = `#/edit/${encodeURIComponent(file)}`;
    } catch (err) { msg(err.message, true); }
  };

  document.getElementById("del")?.addEventListener("click", async () => {
    if (!confirm(`Slet ${name}?`)) return;
    try {
      await api("post", { method: "DELETE", body: JSON.stringify({ name, sha }) });
      pollUntil = Date.now() + 120000; setTimeout(refreshStatus, 4000);
      location.hash = "#/";
    } catch (err) { msg(err.message, true); }
  });
}

async function statsView(days = 30) {
  app.innerHTML = `<p class="pad">henter…</p>`;
  const s = await api(`stats?days=${days}`);
  const byDay = new Map(s.days.map((d) => [d.day, d]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    series.push(byDay.get(day) || { day, views: 0, visitors: 0 });
  }
  const max = Math.max(1, ...series.map((d) => d.views));
  const W = 100 / series.length;
  const bars = series.map((d, i) => `<g><title>${d.day}: ${d.views} visninger, ${d.visitors} besøgende</title>
    <rect x="${i * W + W * 0.1}%" width="${W * 0.8}%" y="${100 - (d.views / max) * 100}%" height="${(d.views / max) * 100}%" class="v"/>
    <rect x="${i * W + W * 0.1}%" width="${W * 0.8}%" y="${100 - (d.visitors / max) * 100}%" height="${(d.visitors / max) * 100}%" class="u"/></g>`).join("");
  const table = (title, rows, fmt = (k) => k) => `<section><h3>${title}</h3><table>${rows.map((r) => `<tr><td>${esc(fmt(r.k) || "—")}</td><td>${r.n}</td></tr>`).join("") || "<tr><td>ingen data</td></tr>"}</table></section>`;

  app.innerHTML = `<div class="pad stats">
  <div class="bar"><div class="kpis"><div><b>${s.totals.views}</b><span>visninger</span></div><div><b>${s.totals.visitors}</b><span>besøgende</span></div></div>
  <div class="range">${[7, 30, 90, 365].map((d) => `<a href="#/stats/${d}"${d === days ? ' aria-current="true"' : ""}>${d}d</a>`).join("")}</div></div>
  <svg class="chart" preserveAspectRatio="none" role="img" aria-label="visninger pr. dag">${bars}</svg>
  <div class="axis"><span>${series[0].day}</span><span>■ visninger <i>■</i> besøgende</span><span>${series.at(-1).day}</span></div>
  <div class="tables">
    ${table("sider", s.paths)}
    ${table("henvisninger", s.refs)}
    ${table("lande", s.countries)}
    ${table("enheder", s.devices)}
    ${table("sprog", s.langs)}
  </div>
  <p class="note">Ingen cookies, ingen tracking-script. Besøgende = anonym daglig hash af IP + browser; gemmes ikke i klartekst.</p>
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
refreshStatus();
