# Contributing with a coding assistant

Read README.md, docs/ARCHITECTURE.md and docs/ROADMAP.md before changing behavior.

## Boundaries

- `packages/core`: versioned content contracts and validation; no browser/server imports.
- `packages/blocks`: shared React block rendering and visual-editor configuration.
- `apps/server`: HTTP, authentication, SQLite repository, public rendering.
- `apps/admin`: React administration interface.
- `tests`: integration and browser journeys.

## Rules

1. Keep changes small enough to review; document user-visible behavior.
2. Never accept arbitrary HTML, scripts, SQL, component names or executable plugins from content.
3. Public responses must use published snapshots, never working drafts. Test this invariant.
4. Validate at the API boundary, enforce authentication on the server, and preserve optimistic concurrency.
5. Every database/content format change needs a migration strategy. Never silently reset user data.
6. Do not check in credentials, runtime databases, generated builds, personal content or screenshots with credentials.
7. Run `npm run check` and `npm run test:e2e` for changes affecting the publishing journey. Explain any unrun checks.
8. Update the roadmap and contributor handoff when a milestone changes. Distinguish implemented behavior from proposals.
9. No force pushes, unrelated refactors, fabricated analytics or UI controls that imply unimplemented features.
10. The current plugin boundary is trusted source code only. Do not claim plugin isolation or PHP compatibility.

Use Node 24 and the checked-in npm lockfile. The project is pre-alpha; public package/API compatibility is not yet guaranteed.
