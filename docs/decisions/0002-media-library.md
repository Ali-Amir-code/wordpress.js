# ADR 0002: Managed images with publication-aware access

Status: accepted. Date: 2026-11-24.

## Decision

Add a media module with an authenticated upload/list/edit/delete API, local storage adapter, and a library picker in the editor. Keep existing external-URL Image blocks valid. Add a distinct `MediaImage` block with a media ID and a snapshot of alt text, caption and intrinsic dimensions. Schema version 1 gains an additive block; older binaries cannot read that block and must not be used after upgrading the database to version 2.

Uploads accept one JPEG, PNG or WebP file, up to 10 MiB, 24 megapixels and 8192 pixels per axis. Validate both declared type and file signature, fully decode with sharp, reject animation, auto-orient, resize within 2560 × 2560 without enlargement, and encode WebP without original metadata. Original bytes and filenames never become executable/public files. Output paths use generated UUIDs. Keep two uploads in flight per process and apply per-IP request limits. Catalog reservations enforce a default 256 MiB / 1000-item quota including incomplete uploads and deletions.

Files live beneath `DATA_DIR/media`, outside static web roots. The storage interface owns write/read/remove; it receives validated generated IDs rather than user paths. This implementation is local disk only. Object storage must preserve the same private/public access rules; no S3 support is claimed.

## Publication and deletion

Uploads are private. The owner may view them through an authenticated route. Anonymous reads require a reference from a published snapshot. Responses are no-store and vary on Cookie, so newly unpublished files are not intentionally retained in shared caches. Once published, visitors can of course retain downloaded copies.

Database migration 2 adds a media catalog and foreign-key references for draft and published usage. Content changes update references in the same transaction as the content. A MediaImage with no selected image may be saved as a draft but cannot be published. The server checks referenced IDs and derives dimensions from the stored media. Metadata copied into content does not change when library metadata changes. External URL blocks are unmanaged; internal managed-image URLs must be used through MediaImage blocks.

Deletion requires a current media revision and zero draft/published references. A transaction marks the image as deleting before filesystem removal; new references then fail. Uploads first reserve a pending catalog row, then write and flush encoded bytes, then activate the row. Failure or process interruption leaves a durable pending/deleting record. Startup retries removal of those files before clearing their records. Files without active catalog entries are never served. This avoids making orphan cleanup depend on guessing filenames or scanning user directories.

## Operational tradeoffs and gates

This is a single-process design; recovery must not run concurrently with another server sharing the database. Back up the SQLite database and media directory together while stopped. Do not restore one without the other. No original-file retention, antivirus integration, remote fetching, video/PDF/SVG support, image replacement, cropping UI, CDN caching or object-storage backend in this milestone. Independent security review and load testing remain release gates.

Required checks: v1→v2 data preservation, invalid/disguised/truncated/oversized images, decompression limits, metadata stripping, quota enforcement, authenticated access and CSRF, private/public transitions, missing IDs, referenced deletion, stale edits, disk failure/restart recovery, and the browser upload → select → publish journey.

## Sources

- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): allowlisting, authorization, size limits, generated names and isolated storage.
- [Fastify multipart](https://github.com/fastify/fastify-multipart): streaming, part limits and truncation handling.
- [sharp input options](https://sharp.pixelplumbing.com/api-constructor/) and [output options](https://sharp.pixelplumbing.com/api-output/): input pixel limits, encoding and metadata behavior.
