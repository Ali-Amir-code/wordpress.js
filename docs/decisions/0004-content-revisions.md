# ADR 0004: Recoverable content versions

Status: accepted. Date: 2026-11-27.

## Scope

Keep immutable snapshots of saved page/post title, slug, description and block documents. Creation, saving, publishing and restoration record versions inside the content transaction. Unpublishing records the removed public snapshot when one exists. These are saved versions, not browser autosaves or a security audit log. Site settings, menus, account details and unsaved editor work are outside this module.

Use a separate `content_revisions` table with a monotonic integer ID for deterministic ordering, content UUID, the content concurrency revision, event, timestamp, snapshot, optional restored-from ID and a current-publication marker. The content revision remains a concurrency token, not a history ID. Historical restore provenance does not use a foreign key because the source may expire.

## Retention and media

Retain the latest 30 versions per entry, plus its current published version if older (at most 31). The public marker is bookkeeping; snapshot contents never change. Before replacing an older pinned publication, copy it into recent history so the just-replaced public content remains recoverable. Unpublishing similarly records the outgoing public content. Retention runs transactionally after successful content mutations. Repeated explicit saves may create versions; no automatic save timer is introduced.

`revision_media` references retained versions and managed images. Deleting a version cascades its reference rows; images use RESTRICT. Retained images remain private unless used by a current published snapshot. Media details report history usage and prevent deletion while any draft, public snapshot or retained version needs the image. History does not duplicate image files. Old reference protection expires through bounded retention; manual history deletion is outside this milestone.

## Restore and inspect

All history endpoints require an owner session. Lists contain metadata and are paginated; detail and preview require both the entry ID and the history ID. Previews are authenticated, noindex/no-store and use current site settings/navigation. They do not recreate historical menus or theme settings. No stored snapshot may bypass the current content schema or media validation.

Restoration checks the expected **current content revision**, validates the selected snapshot, then replaces the working draft and records a new restored version in one transaction. It leaves publication, redirects, navigation and public media access unchanged. The previous saved draft remains in recent history. Restoring can override only the slug, using the normal slug schema, to resolve an address claimed by another draft. A stale revision, missing version, unsupported document, invalid media or conflicting slug must leave all state unchanged.

The editor offers a history dialog with a metadata/block-change summary against the saved draft, a full private preview, and explicit Restore as draft. Unsaved local edits block restoration and must be saved first. Successful restore refreshes editor fields and remounts Puck from the restored document. Publishing remains a separate owner action.

## Upgrade and checks

Migration 4 creates the history/reference tables and captures existing public and working snapshots, marking them as upgrade baselines. It preserves existing content, timestamps, revision counters, navigation, redirects, media, settings and accounts. It cannot reconstruct earlier overwritten content. Back up the stopped data directory before upgrading; rolling back requires its complete pre-upgrade backup.

Cover transaction failure and stale actions, scope/authentication/origin checks, unsafe restored documents, public isolation, media protection/privacy/pruning, slug conflicts and overrides, old publications after heavy editing, restore provenance, restart persistence and upgrade preservation. A browser journey must inspect, preview, restore, edit and publish a recovered version, with keyboard/mobile checks. Existing publishing/media/navigation journeys must continue passing.

## Sources and tradeoffs

- [WordPress revisions](https://wordpress.org/documentation/article/revisions/): saved versions, inspection, restoration and configurable retention informed the workflow. WordPressJS does not implement WordPress's autosave or revision storage format.
- [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html): explicit enforcement and CASCADE/RESTRICT relationships preserve recoverable media.

The 30-version limit is a project choice for predictable per-entry storage, not a universal production sizing recommendation. Full snapshots favor simple recovery over compact deltas. Database-wide quotas, offline recovery, manual history cleanup, text-level diffing and full backup/restore tooling remain separate work.
