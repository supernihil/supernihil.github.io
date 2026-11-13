# supernihil.party

Archive of works by supernihil. One Cloudflare Worker serves everything; the content lives in this repo
and is read from GitHub at runtime, so there is no build step and no CI.

- `_posts/*.md` — one work per file (front matter + markdown text)
- `_pages/info.md` — the info page
- `_data/translations.yml` — display names for categories, types and link labels
- `assets/` — covers and thumbnails, served through the worker from GitHub and cached at Cloudflare's edge
- `src/` — the worker: pages (`render.js`), content loading (`content.js`), admin (`admin.js`), stats (`stats.js`)
- `public/static/` — CSS, admin JS, favicon (bundled into the worker)

## How content updates

The worker fetches all posts with one GitHub GraphQL request and caches the result in a Durable Object.
It checks the `master` head at most once a minute, so anything committed to `master` (from admin, git or
github.com) shows up within about a minute. Admin saves show up immediately.

## Admin

`https://supernihil.party/admin`. Create, edit and delete works. Images are resized in the browser
(GIFs with gifsicle compiled to wasm) and committed together with the post as one commit. Stats live at `/admin#/stats`.

Worker secrets (`npx wrangler secret put NAME`, or Cloudflare dashboard → Workers → supernihil-github-io → Settings → Variables and Secrets):
`ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`, `STATS_SALT`, and `GITHUB_TOKEN`
(fine-grained token, this repository only, permission **Contents: read and write**).

## Code changes

Only needed when `src/` or `public/static/` change: `npm install && npm run deploy`.

`index.html`, `404.html` and `.nojekyll` at the root only exist to redirect the old supernihil.github.io to supernihil.party.
