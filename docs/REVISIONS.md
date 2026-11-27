# Version history

Version history keeps saved versions of each page and post so you can recover earlier work. Open a page or post in the editor and select **Version history**.

## Inspect an earlier version

1. Choose a saved version from the timeline. **Newer versions** and **Older versions** move through longer histories.
2. Compare the title, address and search description with your current saved draft. The block summary reports how many blocks would be added, removed or changed, and whether their order would change.
3. Select **Preview version** to inspect its complete text, images and layout in a new tab. This preview requires your owner session and is excluded from indexing. It uses your site's current appearance and menus.

The comparison uses your saved draft. Unsaved editor changes are not included. You can browse history while editing, but must close history and save your edits before restoring.

## Restore safely

1. Select the version you want to recover.
2. Check **Restore address**. It initially contains the version's saved slug. Choose another address if a different page or post of the same kind now uses it.
3. Select **Restore as draft** and confirm. Your title, address, description and entire block document are replaced together. The editor opens that restored document with a fresh undo history.
4. Review or edit the restored draft. **Publish changes** is a separate action when you are ready to update the public website.

Restoring records a new version and keeps the displaced saved draft in recent history. It does not alter the current publication, navigation or redirects. If another window has saved the entry since you opened it, restoration stops with a conflict; close history and reload the editor before trying again. Refreshing the history list alone does not refresh the editor's draft.

## What is kept

The latest **30 versions per entry** are retained, plus the current publication if it is older (at most 31). Creation, explicit saves, publishing and restoring record versions. Unpublishing records the outgoing publication. If you replace a publication that has aged out of recent history, its snapshot is brought into recent history so it remains recoverable.

Older versions expire as new versions are recorded. Dates are displayed in your browser's local time. Version numbers identify snapshots; gaps are normal because pages and posts share the sequence. Restored versions identify their source, which may eventually expire.

Images used by retained versions cannot be deleted. Image details show how many retained versions need each image. Those images stay private unless a current published page or post uses them. Expiring history releases its image references; the image can be deleted once no draft, publication or retained version needs it. Image files are not duplicated for each version. There is no manual history cleanup control yet.

## Upgrading and limits

On upgrade to database schema 4, existing drafts and publications become **Draft at upgrade** and **Publication at upgrade** entries. Earlier overwritten content cannot be reconstructed. Upgrading preserves existing accounts, content, media, navigation and revision counters. Back up the stopped data directory first; see [operations](OPERATIONS.md).

This is saved-version recovery for pages and posts. It does not automatically save browser edits, restore site settings or menus, provide a text-level diff, or replace a complete backup. A failed or missing database still needs a separate backup. Future content schema changes must continue to validate or migrate retained snapshots before restoring them.

For contributors, see the [API](API.md#content-revision-api) and [design decision](decisions/0004-content-revisions.md).
