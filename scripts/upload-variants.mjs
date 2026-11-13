// Upload .variants/assets/** (made by scripts/make-variants.sh) to the live site's R2 and register
// them, so the site serves them instead of the original GIFs. They are derived files, so they are
// marked as already backed up (the GitHub backup keeps the originals).
//   ADMIN_USER=… ADMIN_PASS=… node scripts/upload-variants.mjs [https://supernihil.party]
import { readFileSync, readdirSync, statSync } from "node:fs";

const site = process.argv[2] || "https://supernihil.party";
const { ADMIN_USER, ADMIN_PASS } = process.env;
if (!ADMIN_USER || !ADMIN_PASS) { console.error("set ADMIN_USER and ADMIN_PASS"); process.exit(1); }
const login = await fetch(`${site}/admin/login`, { method: "POST", redirect: "manual", body: new URLSearchParams({ user: ADMIN_USER, pass: ADMIN_PASS }) });
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
if (!cookie.includes("=")) { console.error("login failed", login.status); process.exit(1); }
const headers = { cookie, origin: site };

const media = [];
for (const dir of ["poster", "anim", "full"]) {
  let names = [];
  try { names = readdirSync(`.variants/assets/${dir}`).filter((f) => f.endsWith(".webp")); } catch {}
  for (const f of names) {
    const path = `assets/${dir}/${f}`, file = `.variants/${path}`;
    const r = await fetch(`${site}/admin/api/media?path=${encodeURIComponent(path)}`, {
      method: "PUT", headers: { ...headers, "content-type": "image/webp" }, body: readFileSync(file),
    });
    if (!r.ok) { console.log("FAILED", r.status, path); continue; }
    media.push({ path, size: statSync(file).size });
  }
  console.log(dir, names.length);
}
const r = await fetch(`${site}/admin/api/import`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ files: [], media }) });
console.log("registered", r.status, await r.text());
