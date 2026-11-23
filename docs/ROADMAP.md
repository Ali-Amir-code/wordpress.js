# Roadmap

Milestones describe acceptance criteria, not promised dates. The current implementation status is recorded in [HANDOFF.md](HANDOFF.md). The first useful release is a single-site publisher; the long-term vision is deliberately broader.

## M0 — Foundation

- [x] Product scope and researched architecture decisions.
- [x] MIT license, contribution guide and agent instructions.
- [ ] Reproducible install, CI, strict type checks and test harness.
- [ ] Documented local development and initial implementation handoff.

## M1 — Create, edit, publish

- [ ] Token-protected setup, owner login/logout and durable sessions.
- [ ] Persistent pages/posts, unique slugs and search/filter in the admin.
- [ ] Visual block editor, starter layout and responsive preview.
- [ ] Explicit draft save, publish/unpublish and stale-write protection.
- [ ] Server-rendered pages, blog index, metadata, sitemap and robots file.
- [ ] Site title, description and accent settings.
- [ ] Browser journey and tests proving drafts never leak publicly.

## M2 — Practical websites

- Media library: validated image uploads, size limits, metadata, alt text, transformations, deletion references and storage adapter. Test malicious files and large images.
- Navigation: ordered menus and links, homepage selection, footer editing and redirects on slug changes.
- Content: rich text with constrained output, taxonomy, pagination, scheduled publication and recoverable revision history.
- Forms: accessible fields, server validation, spam protection, consent/retention controls and delivery retries. No email credentials in browser bundles.
- Theme tokens and reusable patterns: schema validation, migration, preview and safe switching.
- Portable export/import: versioned bundle, asset references, validation, dry run and round-trip tests.

## M3 — Trustworthy beta

- Multi-user roles, invitations, account recovery, session management and audit history.
- Independent threat-model review, dependency audit, abuse tests and security reporting channel.
- Accessibility review targeting WCAG 2.2 AA; keyboard/screen-reader testing of core journeys.
- Backups and restore verification, migration upgrade tests, health/operational guidance and release rollback.
- Name/trademark resolution and documented release/support policy.
- Measure a representative content fixture: public payload, response latency, editor responsiveness and content limits. Set budgets from evidence.
- Beta acceptance: install on a fresh machine, create/edit/publish, back up, upgrade and restore without lost content.

## M4 — Extensible platform

- PostgreSQL adapter validated against the same repository contract tests.
- Public content API with stable versioning, API credentials and scope checks.
- Theme/block developer kit, hook contracts, compatibility declarations and sample extensions.
- Define plugin permissions and isolation before offering third-party installation.
- Localization, search, WordPress import tooling and deployment adapters.

## M5 — Ecosystem

Commerce integrations, memberships, agency/multisite tooling, collaboration and opt-in AI assistance. Each requires a separate product/security design. No paid API or hosted dependency is required for the core publishing workflow.

## Good first contributions (after M1)

1. Add a quote block: strict schema, editor fields, accessible rendering, validation tests and documentation.
2. Improve content-list accessibility: keyboard journey and screen-reader labels with regression coverage.
3. Add paginated public blog listings: deterministic ordering, empty states and boundary tests.
4. Draft an export-format ADR with examples and forward-compatibility rules before adding import code.
