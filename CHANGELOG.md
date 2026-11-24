# Changelog

## 0.1.0-alpha.1 foundation — 2026-11-24

Initial source milestone; not a published package or production release.

- Added a TypeScript workspace with a React admin, Puck visual editor, Fastify API and SQLite persistence.
- Added installation-key setup, owner login/logout, hashed expiring sessions and same-origin mutation checks.
- Added pages/posts, searchable content lists, seven blocks, starter pages, draft preview and deliberate publishing.
- Added separate public snapshots, revision conflict detection and unique draft/public slugs.
- Added server-rendered pages and journal, site identity settings, palettes, metadata, sitemap and robots.
- Added core/API regression tests, a browser publishing journey, CI, dependency update configuration and contribution templates.
- Added product research, architecture decisions, roadmap, API/operations documentation and contributor handoff.

Local validation: Node 24.20.0, formatting/type/build checks, 16 core/API tests, and one full Playwright journey using the locally installed Chromium 143. The browser journey verifies responsive layout and runs axe against the public fixture; this is not a claim of complete accessibility conformance. GitHub CI uses Playwright's managed Chromium.

Screenshots in `docs/images` contain disposable test content. No credentials, runtime database or personal site content are included.
