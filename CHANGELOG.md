# Changelog

## Navigation backend checkpoint — 2026-11-25

- Added separate draft/published navigation, ordered content/URL links, footer text and selected homepages.
- Added content-ID-based slug history, canonical-path resolution, safe homepage aliases and protected homepage unpublishing.
- Added migration 3 with preservation tests for v2 accounts, sessions, content and media references.
- Documented the API, upgrade behavior and ADR 0003. The Navigation workspace follows in the next checkpoint.

Validation: 40 core/API tests pass on Node 24.20.0. Navigation browser coverage follows with its editing screen.

## Media library and editor workflow — 2026-11-25

- Added a searchable, paginated media library with image details, alt text, captions, usage counts and guarded deletion.
- Added a Library image block and an editor picker with uploads, page-specific text, keyboard selection and focus restoration.
- Added mobile navigation wrapping and corrected muted-text contrast found by accessibility checks.
- Fixed false unsaved-change warnings after inserting blocks: editor comparisons now ignore object key order while preserving block order.
- Added explicit APNG rejection, concurrent-upload and request-limit checks, shared publication tests and regression coverage for reference preservation.
- Added the media user guide and updated the architecture, roadmap and contributor handoff. Navigation and homepage selection are next; the project remains pre-alpha.

Validation: `npm run check` passes with 32 core/API tests; both Playwright journeys pass on Node 24.20.0 and local Chromium 143. The media journey covers uploads, keyboard picker use/focus restoration, save-state accuracy, publication privacy, metadata snapshots, deletion guards, mobile layout, and axe checks on the library/details fixtures. This does not establish full accessibility conformance or production readiness.

## Media backend checkpoint — 2026-11-24

- Added authenticated image upload, search, metadata editing and deletion APIs with a local storage adapter.
- Added decoded JPEG/PNG/WebP validation, size/pixel/concurrency/quota limits, WebP conversion and metadata stripping.
- Added publication-aware image access, transactional draft/published references, metadata snapshots and deletion conflict checks.
- Added database migration 2 and durable cleanup for interrupted writes/deletions.
- Documented storage, backups, API contracts and ADR 0002. Admin library/picker follows in the next checkpoint.

Validation: 28 core/API tests, formatting/types/production build, and the existing Playwright publishing journey pass on Node 24.20.0. The new upload-to-picker browser journey is pending the UI checkpoint.

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
