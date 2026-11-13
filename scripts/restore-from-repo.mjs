// Load this repo (the GitHub backup) into the live site: uploads any media missing
// from R2 and replaces all posts, the info page and translations in the store.
//
//   ADMIN_USER=… ADMIN_PASS=… node scripts/restore-from-repo.mjs [https://supernihil.party] [--no-media]
import { readFileSync, readdirSync, statSync } from "node:fs";

const args = process.argv.slice(2);
const site = args.find((a) => a.startsWith("http")) || "https://supernihil.party";
const skipUpload = args.includes("--no-media");
const { ADMIN_USER, ADMIN_PASS } = process.env;
if (!ADMIN_USER || !ADMIN_PASS) { console.error("set ADMIN_USER and ADMIN_PASS"); process.exit(1); }

const login = await fetch(`${site}/admin/login`, {
  method: "POST", redirect: "manual",
  body: new URLSearchParams({ user: ADMIN_USER, pass: ADMIN_PASS }),
});
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
if (!cookie.includes("=")) { console.error("login failed", login.status); process.exit(1); }
const headers = { cookie, origin: site };

const TYPES = { gif: "image/gif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const media = [];
for (const dir of ["assets/screenshots", "assets/thumbnails"]) {
  for (const f of readdirSync(dir)) {
    const path = `${dir}/${f}`;
    const size = statSync(path).size;
    media.push({ path, size });
    if (skipUpload) continue;
    const head = await fetch(`${site}/${dir}/${encodeURIComponent(f)}`, { method: "HEAD" });
    if (head.ok) continue;
    const r = await fetch(`${site}/admin/api/media?path=${encodeURIComponent(path)}`, {
      method: "PUT", headers: { ...headers, "content-type": TYPES[f.split(".").pop().toLowerCase()] || "application/octet-stream" },
      body: readFileSync(path),
    });
    console.log(r.ok ? "uploaded" : `FAILED ${r.status}`, path);
  }
}

const files = [
  ...readdirSync("_posts").filter((f) => f.endsWith(".md")).map((f) => ({ path: `_posts/${f}`, text: readFileSync(`_posts/${f}`, "utf8") })),
  ...readdirSync("_pages").filter((f) => f.endsWith(".md")).map((f) => ({ path: `_pages/${f}`, text: readFileSync(`_pages/${f}`, "utf8") })),
  { path: "_data/translations.yml", text: readFileSync("_data/translations.yml", "utf8") },
];
const r = await fetch(`${site}/admin/api/import`, {
  method: "POST", headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ files, media, replace: true }),
});
console.log(r.status, await r.text());
