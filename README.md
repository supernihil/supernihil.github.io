# supernihil.party

Archive of works by supernihil. One Cloudflare Worker serves everything from Cloudflare storage;
this GitHub repo is the backup.

- **Works, info page, labels** are stored in a Durable Object (SQLite) inside the worker.
- **Images and GIFs** are stored in R2 (bucket `supernihil-media`).
- **Admin** at `https://supernihil.party/admin`: create, edit and delete works, edit the info page,
  see stats. Images are resized in the browser (GIFs with gifsicle compiled to wasm) before upload.
  Changes are live immediately.
- **Backup**: every hour the worker commits changed works/pages and new images to this repo
  (`_posts/`, `_pages/`, `_data/`, `assets/`), with the same layout as here. There's also a
  "back up now" button in admin. Images over 25 MB stay in R2 only.

Edits made directly in this repo are **not** picked up by the site. To load the repo into the site
(e.g. restore after a disaster), run:

```
npm install
ADMIN_USER=… ADMIN_PASS=… node scripts/restore-from-repo.mjs
```

## Code

- `src/worker.js` — routing, media from R2, page-view tracking, hourly backup trigger
- `src/content.js` — the Store Durable Object (content + GitHub backup)
- `src/render.js` — HTML templates
- `src/admin.js`, `public/static/admin.client.js` — admin
- `src/stats.js` — cookieless page-view counter (Durable Object)
- `public/static/` — CSS, admin JS, favicon (bundled into the worker)

Deploy code changes with `npm run deploy`. Local: put `ADMIN_USER=test`, `ADMIN_PASS=test`,
`SESSION_SECRET=dev` in `.dev.vars`, run `npm run dev`, then
`ADMIN_USER=test ADMIN_PASS=test node scripts/restore-from-repo.mjs http://localhost:8787 --no-media`.

Worker secrets: `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`, `STATS_SALT`, and for the backup
`GITHUB_TOKEN` (fine-grained token, this repository only, Contents: read and write).

`index.html`, `404.html` and `.nojekyll` at the root only redirect the old supernihil.github.io to supernihil.party.
