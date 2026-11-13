// Content comes straight from the GitHub repo at runtime: one GraphQL request
// fetches every post, page and the translations. The Store Durable Object keeps
// the parsed result and re-fetches when master moves (checked at most once a minute).
import { DurableObject } from "cloudflare:workers";
import { parse } from "yaml";
import { marked } from "marked";

export const OWNER = "supernihil";
export const NAME = "supernihil.github.io";
export const BRANCH = "master";
const CHECK_EVERY = 60_000;

const QUERY = `query($o:String!,$n:String!,$posts:String!,$pages:String!,$t:String!,$ref:String!){
  repository(owner:$o,name:$n){
    ref(qualifiedName:$ref){ target{ oid } }
    posts: object(expression:$posts){ ... on Tree { entries { name object { ... on Blob { text } } } } }
    pages: object(expression:$pages){ ... on Tree { entries { name object { ... on Blob { text } } } } }
    t: object(expression:$t){ ... on Blob { text } }
  }
}`;

const gh = (env) => ({
  authorization: `Bearer ${env.GITHUB_TOKEN}`,
  "user-agent": "supernihil-worker",
});

export async function headSha(env) {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${NAME}/commits/${BRANCH}`, {
    headers: { ...gh(env), accept: "application/vnd.github.sha" },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return (await r.text()).trim();
}

// Local development without a token: list via REST, read files from raw.githubusercontent.com.
async function fetchContentNoToken(env) {
  const ua = { "user-agent": "supernihil-worker" };
  const raw = (p) => fetch(`https://raw.githubusercontent.com/${OWNER}/${NAME}/${BRANCH}/${p}`).then((r) => r.text());
  const list = async (dir) => {
    const local = env.DEV_FILES && JSON.parse(env.DEV_FILES)[dir];
    if (local) return Promise.all(local.map(async (name) => ({ name, text: await raw(`${dir}/${encodeURIComponent(name)}`) })));
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${NAME}/contents/${dir}?ref=${BRANCH}`, { headers: ua });
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const files = (await r.json()).filter((f) => f.name.endsWith(".md"));
    return Promise.all(files.map(async (f) => ({ name: f.name, text: await raw(`${dir}/${encodeURIComponent(f.name)}`) })));
  };
  const [posts, pages, translations] = await Promise.all([list("_posts"), list("_pages"), raw("_data/translations.yml")]);
  return buildContent({ sha: "local", posts, pages, translations });
}

async function fetchContent(env) {
  if (!env.GITHUB_TOKEN) {
    if (env.DEV_NO_TOKEN) return fetchContentNoToken(env);
    throw new Error("GITHUB_TOKEN secret is not set on the worker");
  }
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...gh(env), "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: {
      o: OWNER, n: NAME, ref: `refs/heads/${BRANCH}`,
      posts: `${BRANCH}:_posts`, pages: `${BRANCH}:_pages`, t: `${BRANCH}:_data/translations.yml`,
    } }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GitHub GraphQL: ${JSON.stringify(j.errors || j.message)}`);
  const repo = j.data.repository;
  return buildContent({
    sha: repo.ref.target.oid,
    posts: repo.posts.entries.map((e) => ({ name: e.name, text: e.object?.text || "" })),
    pages: (repo.pages?.entries || []).map((e) => ({ name: e.name, text: e.object?.text || "" })),
    translations: repo.t?.text || "",
  });
}

const md = (s) => (s ? marked.parse(String(s)) : "");

export function buildContent({ sha, posts, pages, translations }) {
  const all = [];
  for (const { name, text } of posts) {
    if (!name.endsWith(".md")) continue;
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
      ar: Number(fm.aspect_ratio) || 1,
      video_url: fm.video_url || null,
      links: (fm.links || []).filter((l) => l && l.url),
      body: md(m[2].trim()),
      draft: fm.draft === true,
    });
  }
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  const pagesOut = {};
  for (const { name, text } of pages) {
    pagesOut[name.replace(/\.md$/, "")] = md(text);
  }
  return {
    sha,
    loaded: new Date().toISOString(),
    all,
    works: all.filter((w) => !w.draft),
    pages: pagesOut,
    t: parse(translations) || {},
  };
}

export class Store extends DurableObject {
  async get() {
    this.c ??= await this.ctx.storage.get("c");
    if (!this.c) return this.refresh();
    if (Date.now() - (this.checked || 0) > CHECK_EVERY) {
      this.checked = Date.now();
      this.ctx.waitUntil(this.check().catch(() => {}));
    }
    return this.c;
  }

  async check() {
    if (!this.env.GITHUB_TOKEN) return;
    if ((await headSha(this.env)) !== this.c?.sha) await this.refresh();
  }

  // `expect`: commit sha the admin just wrote; retry briefly until GitHub serves it.
  async refresh(expect) {
    let c;
    for (let i = 0; i < 4; i++) {
      c = await fetchContent(this.env);
      if (!expect || c.sha === expect) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    this.c = c;
    this.checked = Date.now();
    await this.ctx.storage.put("c", c);
    return c;
  }
}

// Per-isolate memo so most requests skip the Durable Object round trip.
let memo = null;
export async function getContent(env) {
  if (memo && Date.now() - memo.at < 20_000) return memo.c;
  const c = await env.STORE.get(env.STORE.idFromName("content")).get();
  memo = { c, at: Date.now() };
  return c;
}
export function forgetContent(c) { memo = c ? { c, at: Date.now() } : null; }
