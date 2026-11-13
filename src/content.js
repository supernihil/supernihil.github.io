// All content lives in Cloudflare: text files in the Store Durable Object (SQLite),
// media in R2. Paths mirror the repo layout (_posts/…, _pages/info.md,
// _data/translations.yml, assets/…) so the GitHub backup is a 1:1 copy.
import { DurableObject } from "cloudflare:workers";
import { parse } from "yaml";
import { marked } from "marked";

export const OWNER = "supernihil";
export const NAME = "supernihil.github.io";
export const BRANCH = "master";
const MAX_BACKUP_MEDIA = 30;          // per run, keeps us under the subrequest limit
const MAX_BACKUP_MEDIA_BYTES = 25e6;  // bigger files stay in R2 only

const md = (s) => (s ? marked.parse(String(s)) : "");
const isText = (p) => /^(_posts\/[^/]+\.md|_pages\/[^/]+\.md|_data\/translations\.yml)$/.test(p);
export const validMedia = (p) => /^assets\/(screenshots|thumbnails|og|poster|anim|full)\/[^/\\]+\.(gif|jpe?g|png|webp)$/i.test(p);

async function sha1(s) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// media: Set of stored media paths; picks the lightest variant that exists for each work.
export function buildContent(files, version, media = new Set()) {
  const has = (p) => media.has(p);
  const all = [];
  let info = "", translations = "";
  for (const { path, text } of files) {
    if (path === "_pages/info.md") { info = text; continue; }
    if (path === "_data/translations.yml") { translations = text; continue; }
    if (!path.startsWith("_posts/")) continue;
    const name = path.slice(7);
    const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) continue;
    let fm;
    try { fm = parse(m[1]) || {}; } catch { continue; }
    const date = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date || name.slice(0, 10)).slice(0, 10);
    all.push({
      file: name,
      slug: name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""),
      title: String(fm.title ?? ""),
      date,
      category: fm.category || "",
      type: fm.type === "live" ? "live" : "static",
      summary: fm.summary || "",
      cover: fm.cover || null,
      thumbnail: fm.thumbnail || fm.cover || null,
      ...variants(name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""), fm, has),
      ar: Number(fm.aspect_ratio) || 1,
      video_url: fm.video_url || null,
      links: (fm.links || []).filter((l) => l && l.url),
      body: md(m[2].trim()),
      draft: fm.draft === true,
    });
  }
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  let t = {};
  try { t = parse(translations) || {}; } catch {}
  return { version, all, works: all.filter((w) => !w.draft), pages: { info: md(info) }, t };
}

const isGif = (u) => /\.gif$/i.test(u || "");
function variants(slug, fm, has) {
  const cover = fm.cover || null, thumb = fm.thumbnail || cover;
  const p = (dir, ext) => `assets/${dir}/${slug}.${ext}`;
  return {
    poster: has(p("poster", "webp")) ? `/${p("poster", "webp")}` : has(p("poster", "jpg")) ? `/${p("poster", "jpg")}` : cover ? `/${p("poster", "jpg")}` : thumb,
    anim: has(p("anim", "webp")) ? `/${p("anim", "webp")}` : isGif(thumb) ? thumb : null,
    full: has(p("full", "webp")) ? `/${p("full", "webp")}` : cover,
  };
}

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, text TEXT, hash TEXT, backed TEXT, updated INTEGER);
      CREATE TABLE IF NOT EXISTS media (path TEXT PRIMARY KEY, size INTEGER, updated INTEGER, backed INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    `);
  }

  meta(k, v) {
    if (v === undefined) return this.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0]?.v ?? null;
    this.sql.exec("INSERT OR REPLACE INTO meta VALUES (?, ?)", k, String(v));
  }
  bump() { this.meta("version", Number(this.meta("version") || 0) + 1); this.c = null; }

  // ---- reads ---------------------------------------------------------------
  content() {
    if (!this.c) {
      const files = this.sql.exec("SELECT path, text FROM files WHERE text IS NOT NULL").toArray();
      const media = new Set(this.sql.exec("SELECT path FROM media").toArray().map((r) => r.path));
      this.c = buildContent(files, Number(this.meta("version") || 0), media);
    }
    return this.c;
  }
  version() { return Number(this.meta("version") || 0); }
  read(path) { return this.sql.exec("SELECT text FROM files WHERE path = ? AND text IS NOT NULL", path).toArray()[0]?.text ?? null; }

  // ---- writes --------------------------------------------------------------
  async write(path, text) {
    if (!isText(path)) throw new Error(`bad path ${path}`);
    this.sql.exec("INSERT INTO files (path, text, hash, updated) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET text = excluded.text, hash = excluded.hash, updated = excluded.updated",
      path, text, await sha1(text), Date.now());
    this.bump();
  }
  remove(path) {
    // tombstone: kept until the deletion has been backed up to GitHub
    this.sql.exec("UPDATE files SET text = NULL, hash = NULL, updated = ? WHERE path = ?", Date.now(), path);
    this.bump();
  }
  addMedia(path, size, backed = 0) {
    this.sql.exec("INSERT OR REPLACE INTO media VALUES (?, ?, ?, ?)", path, size, Date.now(), backed);
    this.bump();
  }
  forgetMedia(paths) {
    for (const p of paths) this.sql.exec("DELETE FROM media WHERE path = ?", p);
    this.bump();
  }
  // Bulk load (first import / restore). Files given are considered already backed up.
  async importFiles(files, media = [], replace = false) {
    if (replace) this.sql.exec("DELETE FROM files");
    for (const f of files) {
      if (!isText(f.path)) continue;
      const h = await sha1(f.text);
      this.sql.exec("INSERT OR REPLACE INTO files VALUES (?, ?, ?, ?, ?)", f.path, f.text, h, h, Date.now());
    }
    for (const m of media) if (validMedia(m.path)) this.addMedia(m.path, m.size || 0, 1);
    this.bump();
    return { files: files.length, media: media.length };
  }

  // ---- backup to GitHub ----------------------------------------------------
  pending() {
    const files = this.sql.exec("SELECT path, text FROM files WHERE (text IS NOT NULL AND hash IS NOT backed) OR (text IS NULL AND backed IS NOT NULL)").toArray();
    const media = this.sql.exec("SELECT path, size FROM media WHERE backed = 0 ORDER BY updated").toArray();
    return { files, media };
  }
  backupStatus() {
    const p = this.pending();
    return {
      pendingFiles: p.files.length,
      pendingMedia: p.media.length,
      lastBackup: this.meta("lastBackup"),
      lastCommit: this.meta("lastCommit"),
      lastError: this.meta("lastError"),
    };
  }

  async backup() {
    const env = this.env;
    if (!env.GITHUB_TOKEN) return { skipped: "GITHUB_TOKEN not set" };
    // deletions of files that never reached GitHub need no commit
    this.sql.exec("DELETE FROM files WHERE text IS NULL AND backed IS NULL");
    const { files, media } = this.pending();
    if (!files.length && !media.length) return { nothing: true };

    const gh = async (path, init = {}) => {
      const r = await fetch(`https://api.github.com/repos/${OWNER}/${NAME}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "supernihil-backup", ...(init.body ? { "content-type": "application/json" } : {}) },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(`GitHub ${r.status} ${path}: ${j.message}`);
      return j;
    };

    try {
      const tree = files.map((f) => f.text == null
        ? { path: f.path, mode: "100644", type: "blob", sha: null }
        : { path: f.path, mode: "100644", type: "blob", content: f.text });
      const mediaDone = [], mediaSkipped = [];
      for (const m of media.slice(0, MAX_BACKUP_MEDIA)) {
        const obj = await env.MEDIA.get(m.path);
        if (!obj || obj.size > MAX_BACKUP_MEDIA_BYTES) { mediaSkipped.push(m.path); continue; }
        const bytes = new Uint8Array(await obj.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const blob = await gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: btoa(bin), encoding: "base64" }) });
        tree.push({ path: m.path, mode: "100644", type: "blob", sha: blob.sha });
        mediaDone.push(m.path);
      }

      if (tree.length) {
        const ref = await gh(`/git/ref/heads/${BRANCH}`);
        const parent = await gh(`/git/commits/${ref.object.sha}`);
        const t = await gh("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree }) });
        const c = await gh("/git/commits", { method: "POST", body: JSON.stringify({ message: `Backup from supernihil.party (${files.length} files, ${mediaDone.length} media)`, tree: t.sha, parents: [parent.sha] }) });
        await gh(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
        this.meta("lastCommit", c.sha);
      }

      for (const f of files) {
        if (f.text == null) this.sql.exec("DELETE FROM files WHERE path = ? AND text IS NULL", f.path);
        else this.sql.exec("UPDATE files SET backed = ? WHERE path = ? AND text = ?", await sha1(f.text), f.path, f.text);
      }
      for (const p of mediaDone) this.sql.exec("UPDATE media SET backed = 1 WHERE path = ?", p);
      for (const p of mediaSkipped) this.sql.exec("UPDATE media SET backed = -1 WHERE path = ?", p);
      this.meta("lastBackup", new Date().toISOString());
      this.meta("lastError", "");
      return { commit: this.meta("lastCommit"), files: files.length, media: mediaDone.length, skipped: mediaSkipped.length };
    } catch (e) {
      this.meta("lastError", e.message);
      throw e;
    }
  }
}

export const store = (env) => env.STORE.get(env.STORE.idFromName("content"));

// Per-isolate memo; asks the store for its version at most every few seconds.
let memo = null;
export async function getContent(env) {
  if (memo && Date.now() - memo.at < 5000) return memo.c;
  const s = store(env);
  if (memo && (await s.version()) === memo.c.version) { memo.at = Date.now(); return memo.c; }
  const c = await s.content();
  memo = { c, at: Date.now() };
  return c;
}
export function forgetContent() { memo = null; }
