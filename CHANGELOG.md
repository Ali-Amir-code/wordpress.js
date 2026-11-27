# Changelog

## Constrained rich-text editing — 2026-11-27

- Added a focused Text-section editor with headings, bold/italic/underline, validated links, nested lists and local undo/redo.
- Added plain-text clipboard import, unapplied-edit guards, keyboard controls and Apply text followed by explicit draft save/publication.
- Added a bounded, strict JSON contract and shared semantic React rendering without stored HTML or public editor JavaScript.
- Added content schema 2 and database migration 5 while preserving legacy content and all retained versions. Both old and formatted snapshots remain restorable.
- Declared exact direct Tiptap dependencies already installed through Puck; added the text guide, API/architecture documentation and contributor handoff.

Validation: 55 core/API tests and five browser journeys cover the existing modules and rich text. New checks exercise hostile links/attributes, size/depth limits, literal legacy text, complete upgrade preservation, clipboard privacy, formatting, cancellation, undo/redo, publication isolation, old/new restoration, keyboard behavior and narrow layouts. Accessibility checks cover the tested dialog/public fixtures; wider reviews and backup/restore tooling remain release gates.

## Version history workspace — 2026-11-27

- Added a lazy-loaded history dialog with saved-version browsing, metadata/block comparisons and complete private previews.
- Added explicit restore-as-draft confirmation, an address override for conflicts, unsaved-edit protection and stale-window errors.
- Restored content resets both page details and the visual editor's internal document/undo history; publication remains a separate action.
- Added the version history guide and updated architecture, roadmap, API, media/operations guides and contributor handoff.

Validation: 47 core/API tests and four browser journeys cover publishing, media, navigation and version history. History checks include keyboard focus, narrow layouts, dialog accessibility, private previews, address conflicts, unsaved/stale edits, restored canvas editing, explicit publication and pagination. These checks cover the tested fixtures; wider accessibility, security, backup/restore and load reviews remain release gates.

## Content revision backend — 2026-11-27

- Added private, paginated history and saved-version preview/restore APIs for pages and posts.
- Retain 30 recent versions plus an older current publication; restoration creates a draft and preserves publication isolation.
- Added transactional media protection for retained versions, usage reporting, safe pruning and restoration with an optional validated slug override.
- Added migration 4 with separate public/draft upgrade baselines and preservation coverage. The editor history screen follows in the next checkpoint.

Validation: 47 core/API tests cover authentication, conflicts, private previews, restores, retention, reference lifetimes, rollback failures and upgrade/restart preservation. Existing publishing, media and navigation browser journeys cover the changed media-deletion behavior.

## Navigation workspace — 2026-11-26

- Added homepage selection, automatic/custom header menus, ordered page/post and URL links, and editable footer links/text.
- Added private saves, saved navigation previews, explicit publication, unsaved-work guards and conflict recovery that preserves local input.
- Added a searchable, paginated content picker and a shared native dialog with focus restoration for navigation and media.
- Added semantic public menus, current-page indicators, mobile wrapping and keyboard menu ordering.
- Added the navigation guide, API and routing documentation, updated the roadmap and prepared the contributor handoff for recoverable revision history.

Validation: 40 core/API tests and three browser journeys cover publishing, media and navigation. The navigation journey checks private previews, homepage routing, order, safe links, conflicts, redirects, keyboard focus, narrow layouts and axe checks on the tested admin/public fixtures. Migration tests preserve v2 content and media references. The project remains pre-alpha; these checks do not establish full accessibility conformance or production readiness.

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
