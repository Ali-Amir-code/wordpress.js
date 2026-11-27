# Formatting text

Text sections support paragraphs, headings, bold, italic, underline, links and lists. The other block fields, such as hero introductions and image captions, remain plain text.

## Write and format

1. Select a **Text section** on the visual canvas, or add one from Content.
2. Select **Edit text** in its fields. Write in the text area or paste text from another document.
3. Select words and use **Bold**, **Italic** or **Underline**. Use **Paragraph style** for a paragraph, Heading 2 or Heading 3. A page's main title belongs in its Hero block.
4. Use **Bulleted list** or **Numbered list**, then **Indent list item** and **Outdent list item** for nested items. Up to three list levels are supported. Headings inside list items are unavailable; leave the list before adding a heading.
5. Select **Apply text** to put the result on the canvas, then **Save draft**. Review **Preview saved** and **Publish changes** when ready.

Applying text does not save or publish the page. The editor's normal unsaved-change indicator shows that a draft save is still needed. **Undo text edit** and **Redo text edit** work inside the dialog; after applying, Puck's undo/redo treats that application as one edit. Ctrl/Cmd+B, I and U format text; Ctrl/Cmd+Z undoes, and Ctrl/Cmd+Shift+Z redoes. Enter creates a paragraph or next list item; Shift+Enter adds a line break.

Cancel or Escape closes the text dialog. If you have unapplied edits, it asks before discarding them. Merely opening and closing text does not alter the page.

## Add, change or remove a link

1. Select the words to link, then **Edit link**. To change an existing link, place the cursor within it or select its text.
2. Enter an address such as `/contact`, `#our-story`, `https://example.com`, `mailto:hello@example.com` or `tel:+15555550100`.
3. Select **Apply link**, then **Apply text** when your text is ready. Links open in the same tab. **Remove link** keeps the words and removes their link; **Cancel link** abandons the link edit.

Unsupported addresses are rejected without changing the document. URLs are not automatically turned into links while typing or pasting.

## Paste and content limits

Pasting imports plain text and line breaks. Formatting, HTML, embedded images and scripts from the clipboard are not imported. Literal text such as `<b>example</b>` remains visible text. Drag/drop into the text editor is not supported; use a **Library image** block for images.

A Text section supports up to 12,000 text characters, 200 top-level paragraphs/headings/lists, 100 items in each list, three list levels and 2,000 text elements. Very heavily formatted content can reach the element limit before the character limit. A rejected edit or oversized paste leaves your previous text intact; split larger content into multiple Text sections. The existing page and request limits still apply.

## Existing pages and history

The upgrade preserves existing pages, publications and saved versions exactly. Old plain text appears in the new editor as literal text. Its stored format changes only when you apply an actual edit and save the page. Unusual legacy whitespace is kept as text when splitting it into paragraphs would lose characters or exceed the new structure limits.

Version history can preview and restore both old plain text and new formatted text. Restoring remains a private draft operation; publication is always separate. See [version history](REVISIONS.md), [operations and backups](OPERATIONS.md), [the API format](API.md#document-format) and [ADR 0005](decisions/0005-constrained-rich-text.md).

Tables, inline images, custom colors/fonts, arbitrary HTML and rich clipboard import are future work. This feature does not change the project's pre-alpha status.
