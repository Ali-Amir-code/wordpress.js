# Research and initial decisions

Reviewed 2026-11-24. These are primary-source references and our design judgments, not a benchmark or exhaustive market survey. Dependency versions are resolved and locked during implementation; upstream docs can change.

| Reference | Observation | Implication for WordPressJS |
| --- | --- | --- |
| [WordPress Site Editor](https://wordpress.org/documentation/article/site-editor/) and [patterns](https://wordpress.org/documentation/article/site-editor-patterns/) | WordPress separates page content, templates and reusable patterns. | Preserve familiar publishing concepts while keeping content separate from appearance. |
| [Payload](https://payloadcms.com/docs/getting-started/what-is-payload) | Provides a configurable full-stack CMS with authentication, APIs and database support. | A strong build-on alternative. For this foundation, choose a smaller independent service to control the installer and visual publishing workflow; acknowledge that auth and persistence now become our maintenance responsibility. |
| [Strapi](https://docs.strapi.io/cms/intro) | Extensible headless content management with roles and APIs. | Useful reference for CMS workflows; a standalone headless backend still requires a website-building frontend. |
| [Puck](https://puckeditor.com/docs/editor/overview) | MIT React visual editor with component fields, drag-and-drop, viewport previews and data migrations. | Reuse the editor; maintain our own validated document contract and public renderer. Do not build a drag-and-drop engine in the first milestone. |
| [Vite](https://vite.dev/guide/) | React-compatible development and production build tooling. | Keep the admin a separate static bundle served under `/admin`. |
| [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) | Request schemas are application code; user-supplied schemas are unsafe. | Treat block definitions as trusted source, validate content with fixed schemas, and authenticate separately. |
| [Node SQLite API](https://nodejs.org/api/sqlite.html) | Native SQLite support removes a separate database service from local setup. | Use the Node 24 `DatabaseSync` API behind a repository. Synchronous queries and a single writer bound the initial scale; PostgreSQL is a later adapter, not an existing feature. |
| [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) | Session identifiers require protected transport, safe cookies and server-side expiry. | Use random opaque cookies, hashed tokens at rest, explicit expiry, origin checks and logout revocation. |
| [WordPress trademark policy](https://wordpressfoundation.org/trademark-policy/) | Use of WordPress in project/product names requires permission. | Working title only; naming clearance or a distinct name is required before a branded public release. |

## Alternatives and tradeoffs

- **Next.js + Payload:** quickest route to many CMS primitives, but couples this product's lifecycle to a broader full-stack CMS and framework. Revisit if the team cannot sustainably maintain the smaller backend.
- **React + Fastify + SQLite (selected):** one local command, small deployment footprint, understandable service boundaries. Costs: we must maintain authentication, migrations, content workflows and operational tooling.
- **PostgreSQL first:** better for concurrent writers and larger deployments, but raises local setup cost. Define a persistence seam now; implement and test a second database only when needed.
- **Custom editor:** maximum control but substantial accessibility, drag-and-drop and history work. Reuse Puck and constrain the initial block vocabulary instead.
- **Gutenberg reuse:** close to WordPress concepts but carries integration and licensing questions. No Gutenberg or WordPress code is copied into the MIT codebase.
- **Microservices / Kubernetes / distributed event bus:** premature for a single-site builder. Start with a modular monolith and extract only measured bottlenecks.

## Research backlog

Before respective milestones: evaluate media pipelines and object storage, managed authentication libraries and passkeys, PostgreSQL migrations, plugin permissions and isolation, accessibility through assistive-technology testing, WordPress export/import formats, and hosting cost/performance under real workloads. Technology choices are revisable through an ADR.
