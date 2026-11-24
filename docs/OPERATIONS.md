# Running the pre-alpha

## Requirements

Node **24.x** and npm. This version uses Node's built-in SQLite API. Use the same Node major in development and deployment. `nvm install && nvm use` selects the version from `.nvmrc`. No database server or third-party account is required.

## Development

```sh
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:5173/admin/`. The API and public site run at `http://localhost:3000`. Use **localhost**, consistently, rather than substituting 127.0.0.1: the configured admin origin is checked on writes. Vite proxies `/api`; this is not a CORS-enabled API.

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

Migrations run at startup using `PRAGMA user_version`. The initial schema is version 1. A database from a newer schema version is rejected. Never delete a user's database to fix migration failures. Back up before upgrades; future schema changes require explicit migrations and upgrade tests.

## Current limits

One site, one owner, one server process. No password reset, MFA, user invitations, upload service, revision-history restoration, plugin installer, export/import UI, content deletion or automatic backups. Public navigation shows the first six published pages; homepage uses `home`. Blog and sitemap queries are currently unpaginated. External image links load in visitors' browsers; the server does not download or proxy those files. Content is plain text in structured blocks, not arbitrary HTML or rich text.

## Troubleshooting

- **npm missing / wrong Node version:** run `nvm use`; do not use a system Node 12/18 installation.
- **403 on saving or login:** make the browser origin exactly match `ADMIN_ORIGIN`, including port. Restart after changing `.env`.
- **409 while saving:** another save changed the revision, or the slug is already in use. Preserve unsaved text and reload, or choose a unique slug.
- **Blank public homepage:** publish the page with slug `home`.
- **Preview missing recent edits:** preview shows the saved draft; click Save draft first.
- **Editor unavailable after build:** run the root `npm run build` and start from this checkout; both `dist/admin` and `dist/site.css` are required.
- **Playwright browser missing:** run `npx playwright install chromium`; Linux CI may also need `--with-deps`.
