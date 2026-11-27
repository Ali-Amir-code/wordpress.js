# ADR 0005: Constrained rich text

Status: accepted. Date: 2026-11-27.

## Scope and format

Text sections gain paragraphs, headings 2/3, bold, italic, underline, hard breaks, links, and bulleted/numbered lists with up to three list levels. Other block fields remain plain text. Persist a project-owned, versioned JSON tree in `Text.props.text`, never HTML. The root is `{ version: 1, type: "doc", content: [...] }`. Nodes/marks use an allowlisted subset of Tiptap's JSON shape; the content contract and public renderer do not depend on Tiptap.

Strict schemas reject unknown nodes, marks, attributes and properties. Links use the existing URL allowlist with a 2048-character limit; there is no stored target, style, class or event attribute. Links open in the same tab. Text sections allow 12,000 text characters, 2,000 nodes, 200 top-level blocks and 100 items per list. Ordered lists start between 1 and 100,000. List items begin with a paragraph and can contain paragraphs and nested lists. An iterative preflight bounds tree size, depth and total text before finite-depth schema validation. Existing document and request limits still apply.

## Editing and rendering

The admin supplies a custom Puck field that lazy-loads a focused text editor dialog. Use the MIT Tiptap packages already installed by Puck, declaring exact direct dependencies for every imported package. Register only supported extensions. Local text undo/redo, formatting, lists and link editing occur inside the dialog; Apply text updates Puck as one edit. Saving a draft and publishing remain explicit, separate steps. Cancel, navigation and reload guard unapplied work.

Intercept clipboard/drop DOM events before ProseMirror parses HTML. Paste consumes only plain text and creates structured paragraph nodes. Images, pasted formatting and drag/drop content are not imported. Typed HTML is literal text. A transaction filter applies the shared contract before accepting document changes, and the API independently validates all submitted data. Invalid or oversized changes leave the prior editor document intact with an explanation.

The shared React renderer maps validated nodes to fixed semantic elements and escapes text. It never uses `dangerouslySetInnerHTML`, dynamic component names or a general HTML sanitizer. List/heading/link semantics are the same in the canvas, saved previews, historical previews and public pages. Public output requires no editor or browser JavaScript.

## Upgrade and recovery

Content document schema **2** permits plain strings and rich text in Text sections; schema **1** continues to permit only plain strings. New entries use schema 2. Existing documents retain their version and strings until an explicit formatting edit needs version 2. Opening or previewing a legacy page must not dirty, save, publish or rewrite it.

Database migration **5** is a capability marker. No rows or historical snapshots are rewritten: drafts, publications, history IDs, timestamps, references, sessions and navigation are preserved exactly. Prior binaries reject schema 5 rather than attempting to render an unsupported rich-text document. Back up the stopped data directory first; rollback requires the pre-upgrade backup.

Legacy text becomes an editable JSON tree only inside the text dialog. It is parsed as literal text, never HTML. Normal blank-line paragraph boundaries are preserved; unusually many legacy blank lines remain text in one paragraph to fit bounded structure without dropping characters. No-op cancellation/application does not convert stored content. Both schema 1 and 2 snapshots can be privately previewed and restored using the existing version-history transaction.

## Validation and tradeoffs

Test allowlisted semantics, URL and attribute attacks, total/depth limits, literal legacy text, API/publication isolation, stale saves, version restoration, restart persistence and migration preservation. Browser checks must cover formatting, lists, links, rejected HTML/oversized paste, undo/redo, cancellation, no-op legacy editing, draft/privacy and history restoration, plus keyboard, narrow layouts and fixture accessibility. Existing four browser journeys remain required.

This deliberately omits arbitrary HTML, inline media, tables, custom colors/fonts, embedded scripts, rich clipboard import and formatting in non-Text fields. A focused dialog trades inline canvas editing for more usable controls on small screens and explicit Apply/Cancel behavior. Complete backups, account recovery and independent accessibility/security reviews remain separate release gates.

## Sources

- [Puck rich-text fields](https://puckeditor.com/docs/editor/api-reference/fields/richtext): existing Tiptap integration informed the editor choice; a custom field keeps the persisted contract under WordPressJS control.
- [Tiptap JSON content](https://tiptap.dev/docs/guides/output-json-html): structured input/output and editor updates.
- [Tiptap Link extension](https://tiptap.dev/docs/editor/extensions/marks/link): disable automatic linking/navigation and enforce the same URL rules as the API.
- [Tiptap React integration](https://tiptap.dev/docs/editor/getting-started/install/react): editor lifecycle and React bindings. The installed source and types are checked alongside current documentation.
