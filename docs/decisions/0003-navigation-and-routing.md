# ADR 0003: Published navigation, homepage selection and content redirects

Status: accepted. Date: 2026-11-25.

## Scope and publication

Add a Navigation workspace for flat, ordered header/footer links, footer text, and a homepage choice. Menus use content IDs for pages/posts or explicitly entered safe URLs. Labels are plain text. Use up/down buttons for keyboard-accessible ordering; nested dropdowns, custom templates and a general redirect editor are outside this milestone.

A singleton navigation document has independent draft/published snapshots, a revision and publication time. Saving never changes public navigation. Publish validates the complete saved document and atomically replaces the public snapshot. Referenced content must exist; unpublished content may be selected in a draft but cannot be included when publishing navigation. If a linked page/post is later unpublished, its menu entry is hidden until republished. Labels are explicit navigation content and change only on navigation publication; destinations always follow the referenced content's current published address.

Migration 3 adds navigation and redirect tables. Both initial navigation snapshots use automatic header mode (the original six published pages plus Journal), empty footer links, the existing footer text, and legacy homepage behavior. Existing sites keep that behavior until their owner publishes a different choice. Custom header mode stops automatically adding pages. Each menu allows at most 20 links with unique item IDs; the footer text is limited to 300 characters.

## Homepage and canonical addresses

An optional homepage ID selects a published page; a null selection retains the legacy page with published slug `home`. The selected homepage renders at `/`. Its normal slug address temporarily redirects to `/` with no-store because the selection is reversible. Other pages, including a former homepage named `home`, use their normal slug address. Posts always use `/blog/:slug`. Canonical/Open Graph URLs, navigation, sitemap and admin live links use the same resolver.

The explicitly selected homepage cannot be unpublished until the owner publishes another homepage choice or returns to legacy mode. Legacy mode still allows unpublishing the `home` page, showing the original coming-soon screen. Root `/` is never a historical redirect and always represents the current homepage choice. A saved navigation preview uses the saved navigation draft and published page content; it is authenticated, noindex and no-store.

## Redirects and conflicts

On republishing a changed slug, record the former normal path against the content ID in the same database transaction. A historical request resolves directly to that entry's current canonical path using a 308 redirect with no-store. IDs, rather than redirect-to-redirect URLs, avoid chains and loops. Unpublished targets return 404. No user-supplied external destination becomes a server redirect.

Current published content paths take precedence over history. Publishing at a historical address reclaims it; the old redirect at that path is removed. Existing unique draft/published slug constraints remain authoritative. Returning to a previous slug cannot create a redirect loop. Queries are not copied to redirect destinations; fragments are client-side. Changing homepage selection does not create a redirect from `/` or change the page's slug.

## Verification and limits

Test v2 upgrade preservation, invalid/unsafe links, missing and unpublished targets, stale edits and publication, draft isolation, menu order, footer escaping, selected homepage routing, canonical/sitemap agreement, unpublish guards, page/post slug history, multiple renames, reclaimed paths and restart persistence. A browser journey covers menu editing/reordering, draft preview, publication, homepage changes and redirects; inspect mobile and keyboard behavior.

Navigation is intentionally flat and public rendering needs no JavaScript. Custom URL links are unmanaged and do not follow slug changes. Historical redirects are automatic; bulk editing, analytics and external redirects are future work. Sitemap/public-content pagination and full accessibility/security review remain separate gates.

## Sources

- [WordPress navigation documentation](https://wordpress.org/documentation/article/navigation-block/): automatic page lists and explicit page links as distinct behaviors.
- [W3C WAI menu structure](https://www.w3.org/WAI/tutorials/menus/structure/): semantic lists, labeled navigation, consistent order and `aria-current`.
- [Google Search redirect guidance](https://developers.google.com/search/docs/crawling-indexing/301-redirects): server-side redirects and choosing permanent versus temporary redirects according to the move.
