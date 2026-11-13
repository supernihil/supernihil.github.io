# supernihil.party

Archive of works by supernihil. One Cloudflare Worker serves everything; the content lives in this repo.

- `_posts/*.md` — one work per file (front matter + Danish body, `body_en` for English)
- `_pages/info.{da,en}.md` — the info page
- `_data/translations.yml` — interface strings and category names
- `assets/` — covers and thumbnails, served through the worker from GitHub and cached at Cloudflare's edge
- `src/` — the worker: pages (`render.js`), admin CMS (`admin.js`), page-view stats (`stats.js`, a Durable Object)
- `public/static/` — CSS, admin JS, favicon (bundled into the worker at build time)

## Admin

`https://supernihil.party/admin`. Saving commits to `master`; the Deploy workflow then
resizes new covers (`scripts/process_assets.py`) and redeploys the worker (~1 min).

Worker secrets (`npx wrangler secret put NAME`): `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`, `STATS_SALT`,
`GITHUB_TOKEN` (fine-grained token, this repo only, Contents read/write + Actions read).

Repo secret for the deploy workflow: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers").

## Local

```
npm install
printf 'ADMIN_USER=test\nADMIN_PASS=test\nSESSION_SECRET=dev\n' > .dev.vars
npm run dev
```

`index.html`, `404.html` and `.nojekyll` at the root only exist to redirect the old supernihil.github.io to supernihil.party.
