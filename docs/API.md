# API guide

The pre-alpha HTTP API is internal and may change. All API routes are under `/api`; responses are JSON unless noted. The admin uses the same API. There are no public API keys, GraphQL API, roles or third-party plugin endpoints yet.

## Request rules

Mutations must send `Content-Type: application/json` and the exact configured `ADMIN_ORIGIN` in the `Origin` header. The upload route instead requires `multipart/form-data`. A successful setup/login creates the `wjs_session` HttpOnly cookie. All API routes except health, setup status, setup and login require that cookie. No bearer-token or localStorage authentication is used. Cross-origin CORS access is not enabled.

Errors use `{ "error": "Explanation", "details": ["optional field errors"] }`. Validation fails with 400; missing authentication 401; invalid origin/key 403; missing content 404; stale revision or duplicate slug 409; wrong media type 415; excessive body 413; authentication rate limit 429. Internal errors are logged on the server with a generic client response. API responses are not cacheable.

## Routes

| Method | Route                    | Body / behavior                                                                                                    |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| GET    | `/health`                | `{ status: "ok" }`; process liveness, not a complete readiness probe                                               |
| GET    | `/setup/status`          | `{ needsSetup: boolean }`                                                                                          |
| POST   | `/setup`                 | `{ name, email, password, siteTitle, token }`; creates the owner and a **draft** starter homepage                  |
| POST   | `/auth/login`            | `{ email, password }`; sets session cookie                                                                         |
| GET    | `/auth/me`               | `{ user: { id, name, email } }`                                                                                    |
| POST   | `/auth/logout`           | `{}`; revokes session and clears cookie                                                                            |
| GET    | `/overview`              | Actual content counts, settings, settings revision, configured site URL                                            |
| GET    | `/settings`              | `{ settings, revision }`                                                                                           |
| PUT    | `/settings`              | `{ settings: { title, description, accent, language }, revision }`; affects public site immediately                |
| GET    | `/content`               | `{ items, total }`; query `kind=page\|post`, `status=draft\|published`, `q`, `limit` (1–100, default 20), `offset` |
| POST   | `/content`               | `{ kind, title, slug, template?: "blank"\|"starter" }`; returns created draft with HTTP 201                        |
| GET    | `/content/:id`           | Full working draft and publication snapshot                                                                        |
| PUT    | `/content/:id`           | `{ title, slug, description, document, revision }`; complete draft replacement                                     |
| POST   | `/content/:id/publish`   | `{ revision }`; atomically snapshots the saved draft                                                               |
| POST   | `/content/:id/unpublish` | `{ revision }`; removes public snapshot, retains draft                                                             |
| GET    | `/content/:id/preview`   | Authenticated HTML of the **last saved** draft, with noindex and no-store                                          |

`revision` is the current revision received from the server, not the desired next revision. After a successful write use the returned revision. On a conflict preserve local work and ask the user to reload/merge; do not blindly retry with a fetched revision. A published entry may also have unpublished edits; `status=published` means it has a public snapshot.

Passwords are 12–128 characters. Emails are lowercased. Slugs use lowercase ASCII letters, numbers and single hyphens, up to 100 characters. System names are reserved. Block documents have at most 100 blocks and the request body is capped at 512 KiB. There is no content deletion endpoint yet.

## Content revision API

| Method | Route                                       | Behavior                                                                                     |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| GET    | `/content/:id/revisions`                    | `{ items, total, retainedLimit }`; newest first, `limit` 1–50 (default 20), `offset` >= 0.   |
| GET    | `/content/:id/revisions/:historyId`         | Version metadata and its validated `snapshot` (`Draft`).                                     |
| GET    | `/content/:id/revisions/:historyId/preview` | Private HTML of that saved version using current site settings/navigation; noindex/no-store. |
| POST   | `/content/:id/revisions/:historyId/restore` | `{ revision, slug? }`; restores into the working draft, returning the updated content view.  |

All four endpoints require the owner session; restoration also requires the configured origin. `historyId` is a positive integer identifying an immutable saved snapshot. `revision` in restore requests is the **current content concurrency revision**, not a history ID. A slug override must pass normal slug validation. Unknown body fields are rejected.

Metadata contains `id`, `contentId`, `revision`, `event`, `createdAt`, `title`, `slug`, `description`, `blockCount`, `isCurrentPublication` and `restoredFrom`. Events are `created`, `saved`, `published`, `restored`, `unpublished`, `upgrade-draft`, `upgrade-publication` or `archived-publication`. Upgrade baseline timestamps come from the existing draft/publication; the captured revision counter is the entry's counter at upgrade time, not a reconstructed historical counter.

Keep the latest 30 versions per entry, plus the current publication when older (at most 31). An old publication is copied into recent history before replacement. Unpublishing captures the outgoing public snapshot. Versions include title, slug, description and blocks; they exclude navigation/site settings and unsaved work. Restoring adds a version, preserves the previous saved draft, and leaves publication and redirects unchanged. Only later publication changes the public site.

Wrong entry/version pair or expired history returns 404. Stale content revision, unsupported stored content or a claimed slug returns 409. Schema and managed-media validation still apply. Errors roll back draft, history and reference changes together. See [ADR 0004](decisions/0004-content-revisions.md).

## Navigation API

| Method | Route                 | Behavior                                                                                                          |
| ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/navigation`         | `{ draft, published, revision, publishedAt, references }`; references contain lightweight target metadata.        |
| PUT    | `/navigation`         | `{ document, revision }`; validates and saves the complete private navigation draft.                              |
| POST   | `/navigation/publish` | `{ revision }`; validates destinations and atomically publishes the saved draft.                                  |
| GET    | `/navigation/targets` | `{ items, total }`; query `q`, `kind=page\|post`, `published=true\|false`, `limit` (1–100, default 20), `offset`. |
| GET    | `/navigation/preview` | Authenticated saved navigation preview with published homepage content, noindex and no-store.                     |

The navigation document is `{ homepageId: UUID|null, header: { mode: "auto"|"custom", items: [] }, footer: { text, items: [] } }`. `null` keeps the published page with slug `home` as the homepage. Automatic mode uses up to six published pages plus Journal. Each ordered menu accepts up to 20 links; footer text accepts 300 characters.

A link is `{ id: UUID, label, type: "content", contentId: UUID }` or `{ id: UUID, label, type: "url", url }`. Item IDs are unique across both menus. Labels are 1–80 characters. URLs allow root-relative paths, anchors, HTTP(S), mailto and tel, with the shared URL safety checks. Unknown fields are rejected. Content links follow the current published address; URL links are unmanaged.

Save accepts existing unpublished destinations. Publish requires a published page for an explicit homepage and published content for active menu links; otherwise it returns 409 without changing public navigation. Dormant custom header links do not block automatic mode. Unpublishing a linked entry hides its link until republished. Unpublishing an explicitly selected homepage returns 409 until another homepage choice is published.

Targets include `id`, `kind`, `title`, `published` and `path`; published titles take precedence over working draft titles. Content responses include `publicPath` (null when unpublished) and `homepageId` (the published explicit choice, or null for legacy mode). `/overview` includes the effective homepage ID for its editor shortcut.

## Media API

| Method | Route        | Behavior                                                                                                         |
| ------ | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| POST   | `/media`     | One multipart `file` part, no other fields. Returns a `MediaItem` with HTTP 201.                                 |
| GET    | `/media`     | `{ items, total, usage }`; query `q` (title/alt), `limit` (1–100, default 24), `offset`.                         |
| GET    | `/media/:id` | Current metadata, dimensions, bytes, revision, URL and draft/published/retained-version usage counts.            |
| PUT    | `/media/:id` | `{ title, alt, caption, revision }`; changes library defaults, not existing content.                             |
| DELETE | `/media/:id` | `{ revision }`; returns `{ ok: true }`. Draft, published and retained-version references prevent deletion (409). |

Uploads allow JPEG, PNG and WebP, up to 10 MiB, 24 megapixels and 8192 pixels per side. They are decoded, oriented, resized within 2560 × 2560 and encoded as WebP without metadata. Animation and other formats are rejected. Limits are 12 requests per minute per IP, two in-flight uploads per process, and a 256 MiB / 1000-image library. Incomplete writes/deletions count toward the quota until recovered.

`MediaItem` includes `id`, `title`, `alt`, `caption`, `width`, `height`, `bytes`, `revision`, `createdAt`, `url`, `draftUses`, `publishedUses` and `revisionUses`. Draft/publication usage counts content entries; revision usage counts retained versions, not individual blocks. `usage` contains `bytes`, `items`, `maxBytes`, `maxItems`.

The image URL is **`/media/:id.webp` without `/api`**. It requires the owner cookie until a published snapshot references it. Unpublished/missing images return 404 for anonymous readers. Responses are `private, no-store` and `Vary: Cookie`. Uploaded images must use the `MediaImage` block; local managed URLs are rejected in the legacy `Image` URL block.

```json
{
  "type": "MediaImage",
  "props": {
    "id": "studio-photo",
    "asset": {
      "id": "f17704a7-e60c-4c77-b2c9-d014f06f7636",
      "width": 1200,
      "height": 800,
      "alt": "A potter shaping a bowl",
      "caption": "Inside our studio"
    }
  }
}
```

The selected asset must exist. The server replaces supplied dimensions with the stored dimensions and preserves the block's alt/caption snapshot. `asset: null` is accepted in drafts but prevents publishing. An empty alt string marks an image as decorative. See [ADR 0002](decisions/0002-media-library.md) for access and recovery rules.

## Document format

```json
{
  "schemaVersion": 2,
  "root": { "props": {} },
  "content": [
    {
      "type": "Text",
      "props": {
        "id": "introduction",
        "heading": "Hello, world.",
        "text": "A little space for something good."
      }
    }
  ]
}
```

The authoritative field definitions are in `packages/core/src/index.ts`. IDs must be unique within a document. The API rejects unknown blocks, unknown fields, unsupported schema versions and unsafe URL schemes. Puck's working editor state is converted into this contract; arbitrary Puck configurations cannot be posted to the server.

Content schema 1 still accepts plain Text strings. Schema 2 accepts those strings and the following structured value for `Text.props.text`; other block fields remain plain text. Existing content and retained snapshots are not rewritten on upgrade. A document containing formatted Text must declare schema 2. Rich-text definitions are in `packages/core/src/rich-text.ts`.

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Thoughtful work", "marks": [{ "type": "bold" }] },
        { "type": "text", "text": " — " },
        {
          "type": "text",
          "text": "contact us",
          "marks": [{ "type": "link", "attrs": { "href": "/contact" } }]
        }
      ]
    }
  ]
}
```

Allowed nodes: `paragraph`, `heading` with `attrs.level` 2 or 3, `bulletList`, `orderedList` with integer `attrs.start` 1–100000, `listItem`, `text` and `hardBreak`. Lists contain 1–100 list items; each item begins with a paragraph and contains only paragraphs or nested lists. Paragraphs/headings contain inline text/hard breaks; an empty paragraph may omit `content`. The root contains 1–200 top-level blocks. Marks are `bold`, `italic`, `underline` and `link` with only `attrs.href`; duplicate mark types are rejected. Unknown fields/attributes are rejected at every level.

Each rich-text tree is bounded to 2,000 nodes, three list levels, and 12,000 aggregate UTF-16 text units (each hard break counts as one; structural paragraph boundaries do not count). Link URLs have a 2048-character limit and use the shared protocol allowlist. The complete request remains limited to 512 KiB. Invalid trees return 400 without changing content/history. Restore/preview revalidate stored snapshots, and unsupported retained content returns 409. See [ADR 0005](decisions/0005-constrained-rich-text.md).

## Public URLs

`/` uses the published navigation homepage choice, falling back to the published page with slug `home` in legacy mode. Its normal slug address returns a temporary 302 to `/`. Other pages use `/:slug`; posts use `/blog/:slug`. `/blog` lists published posts. `/sitemap.xml` lists canonical published addresses and `/robots.txt` excludes the admin/API.

Republishing a changed slug records the previous natural path. Historical paths return a 308 directly to the current canonical path; unpublished targets return 404. Active pages take precedence, and publishing at an old address reclaims it. Both kinds of redirects use `no-store` and discard query strings. `/` never becomes a historical redirect. See [ADR 0003](decisions/0003-navigation-and-routing.md).
