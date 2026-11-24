# API guide

The pre-alpha HTTP API is internal and may change. All API routes are under `/api`; responses are JSON unless noted. The admin uses the same API. There are no public API keys, GraphQL API, roles or third-party plugin endpoints yet.

## Request rules

Mutations must send `Content-Type: application/json` and the exact configured `ADMIN_ORIGIN` in the `Origin` header. A successful setup/login creates the `wjs_session` HttpOnly cookie. All routes except health, setup status, setup and login require that cookie. No bearer-token or localStorage authentication is used. Cross-origin CORS access is not enabled.

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
