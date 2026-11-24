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

## Media API

| Method | Route        | Behavior                                                                                            |
| ------ | ------------ | --------------------------------------------------------------------------------------------------- |
| POST   | `/media`     | One multipart `file` part, no other fields. Returns a `MediaItem` with HTTP 201.                    |
| GET    | `/media`     | `{ items, total, usage }`; query `q` (title/alt), `limit` (1–100, default 24), `offset`.            |
| GET    | `/media/:id` | Current metadata, dimensions, bytes, revision, URL and draft/published usage counts.                |
| PUT    | `/media/:id` | `{ title, alt, caption, revision }`; changes library defaults, not existing content.                |
| DELETE | `/media/:id` | `{ revision }`; returns `{ ok: true }`. Both draft and published references prevent deletion (409). |

Uploads allow JPEG, PNG and WebP, up to 10 MiB, 24 megapixels and 8192 pixels per side. They are decoded, oriented, resized within 2560 × 2560 and encoded as WebP without metadata. Animation and other formats are rejected. Limits are 12 requests per minute per IP, two in-flight uploads per process, and a 256 MiB / 1000-image library. Incomplete writes/deletions count toward the quota until recovered.

`MediaItem` includes `id`, `title`, `alt`, `caption`, `width`, `height`, `bytes`, `revision`, `createdAt`, `url`, `draftUses` and `publishedUses`. Usage counts count content entries, not individual blocks. `usage` contains `bytes`, `items`, `maxBytes`, `maxItems`.

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
  "schemaVersion": 1,
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

## Public URLs

`/` uses a published page with slug `home`. Other pages use `/:slug`; posts use `/blog/:slug`. `/blog` lists published posts. `/sitemap.xml` lists published addresses and `/robots.txt` excludes the admin/API. Slug changes take effect only on republish. Automatic redirects and custom navigation are roadmap work.
