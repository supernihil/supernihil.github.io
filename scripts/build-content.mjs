// Reads _posts/*.md, _pages/*.md and _data/translations.yml and writes
// src/content.json, which the worker imports. Run before every deploy.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { marked } from "marked";

const md = (s) => (s ? marked.parse(String(s)) : "");
const works = readdirSync("_posts").filter((f) => f.endsWith(".md")).map((file) => {
  const raw = readFileSync(`_posts/${file}`, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`no front matter: ${file}`);
  const fm = parse(m[1]);
  const date = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date).slice(0, 10);
  return {
    slug: file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, ""),
    title: String(fm.title ?? ""),
    title_en: fm.title_en ? String(fm.title_en) : undefined,
    date,
    category: fm.category || "",
    type: fm.type === "live" ? "live" : "static",
    summary: fm.summary || "",
    summary_en: fm.summary_en || "",
    cover: fm.cover || null,
    thumbnail: fm.thumbnail || fm.cover || null,
    ar: Number(fm.aspect_ratio) || 1,
    video_url: fm.video_url || null,
    links: (fm.links || []).filter((l) => l && l.url),
    body: md(m[2].trim()),
    body_en: md(fm.body_en),
    draft: fm.draft === true,
  };
}).filter((w) => !w.draft).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

const pages = {};
for (const f of readdirSync("_pages").filter((f) => f.endsWith(".md"))) {
  const [name, lang] = f.replace(/\.md$/, "").split(".");
  (pages[name] ||= {})[lang] = md(readFileSync(`_pages/${f}`, "utf8"));
}

const t = parse(readFileSync("_data/translations.yml", "utf8"));
// public/static/* is small enough to ship inside the worker bundle
const statics = Object.fromEntries(readdirSync("public/static").map((f) => [f, readFileSync(`public/static/${f}`, "utf8")]));
writeFileSync("src/content.json", JSON.stringify({ works, pages, t, statics, built: new Date().toISOString() }));
console.log(`content.json: ${works.length} works`);
