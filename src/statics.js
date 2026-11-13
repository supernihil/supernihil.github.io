// Small static files, bundled into the worker as text (see "rules" in wrangler.jsonc).
import style from "../public/static/style.css";
import adminCss from "../public/static/admin.css";
import adminJs from "../public/static/admin.client.js";
import favicon from "../public/static/favicon.svg";

const files = {
  "style.css": [style, "text/css; charset=utf-8"],
  "admin.css": [adminCss, "text/css; charset=utf-8"],
  "admin.js": [adminJs, "text/javascript; charset=utf-8"],
  "favicon.svg": [favicon, "image/svg+xml"],
};

// cache-busting version: hash of all static files
let h = 2166136261;
for (const [s] of Object.values(files)) for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
export const V = (h >>> 0).toString(36);

export function serveStatic(name) {
  const f = files[name];
  if (!f) return new Response("not found", { status: 404 });
  return new Response(f[0], { headers: { "content-type": f[1], "cache-control": "public, max-age=31536000, immutable" } });
}
