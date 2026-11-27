# Running the pre-alpha

## Requirements

Node **24.x** and npm. This version uses Node's built-in SQLite API. Use the same Node major in development and deployment. `nvm install && nvm use` selects the version from `.nvmrc`. No database server or third-party account is required.

## Development

```sh
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:5173/admin/`. The API and public site run at `http://localhost:3000`. Use **localhost**, consistently, rather than substituting 127.0.0.1: the configured admin origin is checked on writes. Vite proxies `/api` and `/media/`; this is not a CORS-enabled API.

The first start creates `data/wordpressjs.sqlite` and a random `data/setup-token.txt`. Copy the key from that file into the setup form, or configure a random `SETUP_TOKEN` of at least 32 characters before starting. Create your own owner name, email, password and site name. No default credentials exist. Setup creates an unpublished starter homepage; edit and publish it to make it visible.

The setup key is no longer useful after an owner exists. Do not expose unconfigured installations or share the data directory. The key and database are ignored by Git. File permissions depend on the host filesystem; on shared hosts enforce access controls outside the app as well.

## Built application

```sh
npm run build
npm start
```

For a local build preview, omit `ADMIN_ORIGIN` from `.env` or set it to `http://localhost:3000`, then use `http://localhost:3000/admin/`. The production build serves the admin, API and public pages from one process. The Puck editor is lazy-loaded; visitors receive static HTML and CSS without the editor bundle.

For a future internet deployment, set `NODE_ENV=production`, `SITE_URL=https://your-domain.example`, and `ADMIN_ORIGIN=https://your-domain.example`. HTTPS origins are required in production. Terminate TLS in a reverse proxy and keep the Node process on the loopback interface unless container networking requires otherwise. Set `HOST` and `PORT` explicitly as needed. The application does not trust forwarded client-IP headers, so rate limiting behind a proxy is conservative and shared by that proxy's IP. Configure/test a known proxy trust policy before widening access; do not trust arbitrary forwarded headers.

**This is not a production-readiness claim.** Security review, account recovery, backup tooling, operational load tests and other beta gates are still outstanding.

## Configuration

| Variable       | Default                                                             | Purpose                                                         |
| -------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `SITE_URL`     | `http://localhost:3000`                                             | Canonical public origin, no trailing slash/path                 |
| `ADMIN_ORIGIN` | `http://localhost:5173` in source development, otherwise `SITE_URL` | Exact allowed mutation origin                                   |
| `HOST`         | `127.0.0.1`                                                         | Listening interface                                             |
| `PORT`         | `3000`                                                              | Listening port                                                  |
| `DATA_DIR`     | repository-root `data/`                                             | SQLite and setup-key directory; an absolute path is recommended |
| `SETUP_TOKEN`  | generated file                                                      | First-owner installation key, minimum 32 characters             |
| `NODE_ENV`     | unset                                                               | Set to `production` only with HTTPS origins                     |

The server loads `.env` using Node's built-in environment-file support. Environment variables already set in the process take precedence. Never prefix server secrets with `VITE_`.

## Persistence and backup

Run one server process per SQLite database on persistent local disk. The database uses WAL, so copying only the main `.sqlite` file while the app is running is **not** a safe backup. For the initial manual workflow: stop the process gracefully, copy the entire data directory to a protected location, restart, and verify a restore into a separate test instance. Backups include password hashes and session records; protect them as secrets. Automated online backups and session invalidation on restore are still planned.

Migrations run at startup using `PRAGMA user_version`. The current schema is version 4. Migration 2 adds media tables; migration 3 adds navigation snapshots and redirect history; migration 4 adds retained content versions and their media references, capturing current drafts and publications as upgrade baselines. Existing owners, sessions, settings, content and media references are preserved. Navigation starts in automatic mode with the original `home` homepage rule. A database from a newer schema version is rejected. Never delete a user's database to fix migration failures. Back up before upgrades. Rolling back to an older schema's binary requires restoring the complete pre-upgrade backup; do not downgrade `user_version` by hand.

## Media storage

Uploaded images live in `DATA_DIR/media` beside the database. Back up and restore **the entire data directory together while stopped**; restoring only the database or only the images produces an inconsistent site. Keep this directory on local persistent disk, outside any proxy/static web root, and restrict it to the server account. Do not point a web server or CDN directly at it: the application enforces publication-aware access.

The local adapter writes generated UUID filenames exclusively and flushes image bytes before activation. Pending uploads and deletion tombstones are durable; startup removes their files and records before accepting traffic. If cleanup fails, startup fails so an operator can correct disk permissions/availability and restart. Active files are never removed by recovery. This assumes one process; do not share a database/storage directory among multiple servers. It does not provide power-loss durability guarantees for the underlying filesystem.

Each upload accepts one still JPEG, PNG or WebP up to 10 MiB and 24 megapixels (8192 pixels per side maximum). Output is WebP, at most 2560 × 2560, with metadata stripped; originals are discarded. The fixed library quota is 256 MiB / 1000 images including incomplete operations. Limits are defined in `packages/core/src/media.ts`. Allow a little multipart overhead in a reverse proxy's upload size limit (the application caps it at 10 MiB + 64 KiB). Two uploads can be processed concurrently; further requests receive 429. No object storage or CDN adapter exists yet.

Only images referenced by published content can be fetched anonymously. Images used by saved drafts, published snapshots or retained content versions cannot be deleted. History keeps the latest 30 versions per entry plus its current publication when older; pruning expired versions releases their media references. Library metadata updates only defaults for future selections; existing blocks retain their alt text/caption. Unpublishing removes anonymous access unless another published entry uses the image. Previously downloaded copies cannot be recalled.

## Current limits

One site, one owner, one server process. No password reset, MFA, user invitations, revision-history restoration, plugin installer, export/import UI, content deletion or automatic backups. Navigation supports flat header/footer menus (20 links each), an explicit homepage choice and automatic slug-change redirects. Automatic mode retains six published pages plus Journal. Blog and sitemap queries are currently unpaginated. External image links load in visitors' browsers; the server does not download or proxy those files. Content is plain text in structured blocks, not arbitrary HTML or rich text.

## Troubleshooting

- **npm missing / wrong Node version:** run `nvm use`; do not use a system Node 12/18 installation.
- **403 on saving or login:** make the browser origin exactly match `ADMIN_ORIGIN`, including port. Restart after changing `.env`.
- **409 while saving:** another save changed the revision, or the slug is already in use. Preserve unsaved text and reload, or choose a unique slug.
- **Blank public homepage:** publish the page with slug `home`, or choose a published page in Navigation and publish navigation.
- **Cannot unpublish a homepage:** first publish a different homepage choice in Navigation, or return to the original `home` rule.
- **Navigation will not publish:** active menu destinations must be published; remove the link or publish its page/post first. A saved menu draft does not change the public site.
- **Preview missing recent edits:** preview shows the saved draft; click Save draft first.
- **Editor unavailable after build:** run the root `npm run build` and start from this checkout; both `dist/admin` and `dist/site.css` are required.
- **Playwright browser missing:** run `npx playwright install chromium`; Linux CI may also need `--with-deps`.
