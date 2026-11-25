# Contributor handoff

## Current foundation

The first implementation targets one owner, one website and one Node process. The main journey is setup → edit a starter page → save → publish → change a private draft → republish or unpublish. Pages and posts persist in SQLite; public responses read only published snapshots. There is no public deployment or package release yet.

Use Node 24 and `npm ci`. README.md is the quick start; OPERATIONS.md explains the environment, ports and backup limitations. API.md describes contracts and errors. The project owner selected small businesses/blogs and the MIT license.

## Where to work

- Change the content contract in `packages/core/src/index.ts`.
- Add/adjust visual blocks in `packages/blocks/src/config.tsx` and `index.tsx`; shared public CSS lives beside them.
- Keep data and publication rules in `apps/server/src/repository.ts`; route validation/authentication in `app.ts`.
- Public metadata and the document shell live in `apps/server/src/render.tsx`.
- Admin pages live in `apps/admin/src/main.tsx`; the editor is a separately loaded module in `editor.tsx`.
- Tests run against isolated databases. Browser tests create a temporary installation and clean it up on exit. Test credentials are fixtures only.

## Invariants to preserve

1. Saving a draft must not alter the public title, slug, metadata or content.
2. Every content mutation checks the expected revision; publication is atomic.
3. The server validates all block props against a fixed schema; arbitrary HTML/scripts are unsupported.
4. Setup closes after the first owner; authenticated writes also require the configured origin.
5. Runtime databases and installation keys stay out of Git.
6. Puck uses `no-external.css` so the editor does not depend on a font CDN or relaxed style origins.

## Next useful work

**M2 media library is implemented**; [ADR 0002](decisions/0002-media-library.md) covers the design and [MEDIA.md](MEDIA.md) explains the workflow. Server `media.ts` handles uploads/routes, `media-repository.ts` handles usage/quota and publication validation, and `media-storage.ts` provides local storage. Migration 2 preserves v1 sites. Admin `media.tsx` owns the searchable library, image details and picker; `createBlockConfig` accepts the picker without importing the admin into shared blocks. Tests exercise decoding limits (including APNG), privacy, snapshots, referenced deletion, storage failure/recovery, upgrade preservation and real browser use. Each browser project uses its own temporary installation.

In progress: **M2 navigation and homepage selection**. The backend checkpoint implements [ADR 0003](decisions/0003-navigation-and-routing.md): ordered links, independent navigation snapshots, homepage routing, canonical URLs and slug-change redirects. `navigation-repository.ts` owns these rules, `packages/core/src/navigation.ts` owns the contract, and migration 3 preserves v2 sites. Eight new integration tests cover validation, draft privacy, conflicts, routing, history, persistence and upgrades. Next add the Navigation workspace and its vertical browser journey before marking the milestone complete.

Independent small tasks: accessible quote-block improvements, public blog pagination, navigation configuration, and export-format design. Larger changes need an ADR and the acceptance criteria in ROADMAP.md.

## Known limitations and decisions

- Naming clearance or a distinct final name is unresolved. This is not an official WordPress project.
- No rich text, revision-history restoration, scheduled publishing, roles, recovery/MFA, forms, plugins, themes marketplace, custom content types or commerce.
- Media storage is local disk with fixed quotas and no original retention or responsive variants. Publication-aware no-store access favors privacy over CDN caching. Pending deletions recover on restart; persistent storage errors need operator attention.
- No compatibility claim for WordPress plugins, PHP themes or exports.
- A revision counter detects conflicts; it does not preserve historical snapshots.
- The public menu is derived from at most six published pages. Public blog and sitemap queries are not yet paginated.
- Theme settings change the public site immediately; content changes require publication.
- The root admin component should be split into feature modules as features grow. Do not turn this early foundation into a single expanding file.
- Root dependency management is centralized for the initial workspace. Before publishing independent packages, move runtime dependencies into each package and define version/support policies.
- Node SQLite operations are synchronous. No horizontal-scaling or high-traffic performance claim has been validated.
- Security review, wider accessibility review, backup/restore tooling and load testing remain beta gates. Automated browser accessibility checks cover only the tested fixtures.

## Collaboration workflow

Keep work reviewable and publish documented, tested milestones. For contributions from other people, use pull requests and CI. Update README, roadmap and this handoff when supported behavior changes. Do not claim CI, test, deployment or publishing success unless verified.
