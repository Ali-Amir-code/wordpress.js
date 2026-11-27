import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import HardBreak from '@tiptap/extension-hard-break';
import Link from '@tiptap/extension-link';
import { BulletList, OrderedList, ListItem } from '@tiptap/extension-list';
import { Plugin } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import { history, undo, redo } from '@tiptap/pm/history';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Undo2,
  Redo2,
} from 'lucide-react';
import {
  richTextFromPlainText,
  richTextSchema,
  richTextLinkSchema,
  richTextCharacterCount,
  isSafeUrl,
  RICH_TEXT_LIMITS,
  type RichText,
} from '@wordpressjs/core';
import { Dialog } from './dialog';
import { contentSignature, navigation } from './api';
import './rich-text.css';

const SafeLink = Link.extend({
  addAttributes: () => ({ href: { default: null } }),
}).configure({
  autolink: false,
  linkOnPaste: false,
  openOnClick: false,
  markdownLinks: false,
  HTMLAttributes: { target: null, rel: null, class: null },
  isAllowedUri: (url) => richTextLinkSchema.safeParse(url).success,
});
const NumberedList = OrderedList.extend({ addAttributes: () => ({ start: { default: 1 } }) });
const LocalHistory = Extension.create({
  name: 'localTextHistory',
  addProseMirrorPlugins: () => [history()],
  addKeyboardShortcuts() {
    return {
      'Mod-z': () => undo(this.editor.state, this.editor.view.dispatch),
      'Mod-Shift-z': () => redo(this.editor.state, this.editor.view.dispatch),
      'Mod-y': () => redo(this.editor.state, this.editor.view.dispatch),
    };
  },
});

export default function TextEditor({
  value,
  onApply,
  onClose,
}: {
  value: string | RichText;
  onApply: (value: RichText) => void;
  onClose: () => void;
}) {
  const [initial] = useState(() =>
    typeof value === 'string' ? richTextFromPlainText(value) : value,
  );
  const [document, setDocument] = useState(initial),
    [baseline, setBaseline] = useState('');
  const [error, setError] = useState(''),
    [linkOpen, setLinkOpen] = useState(false),
    [url, setUrl] = useState(''),
    [initialUrl, setInitialUrl] = useState('');
  const range = useRef({ from: 0, to: 0 });
  const dirtyRef = useRef(false);
  const [bounds] = useState(() =>
    Extension.create({
      name: 'validatedText',
      addProseMirrorPlugins: () => [
        new Plugin({
          filterTransaction(transaction) {
            if (!transaction.docChanged) return true;
            const valid = richTextSchema.safeParse({
              version: 1,
              ...transaction.doc.toJSON(),
            }).success;
            if (!valid)
              setError(
                'That change exceeds the text limits or uses unsupported formatting. Use at most 12,000 characters, 200 paragraphs/headings/lists and three levels of lists.',
              );
            return valid;
          },
        }),
      ],
    }),
  );
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [2, 3] }),
      Bold,
      Italic,
      Underline,
      HardBreak,
      SafeLink,
      BulletList,
      NumberedList,
      ListItem,
      LocalHistory,
      bounds,
    ],
    content: { type: initial.type, content: initial.content },
    injectCSS: false,
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Text content',
        'aria-multiline': 'true',
        'aria-describedby': 'text-editor-help',
        class: 'rich-text-canvas',
        spellcheck: 'true',
      },
      handleDOMEvents: {
        paste(view, event) {
          event.preventDefault();
          const text = event.clipboardData?.getData('text/plain') || '';
          if (event.clipboardData?.files.length || !text) {
            setError('Paste text here. Add images using a Library image block.');
            return true;
          }
          if (text.length > RICH_TEXT_LIMITS.characters) {
            setError(
              'The pasted text is too long. A text section can contain at most 12,000 characters.',
            );
            return true;
          }
          const nodes = text
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map((line) =>
              view.state.schema.nodes.paragraph!.create(
                null,
                line ? view.state.schema.text(line) : undefined,
              ),
            );
          view.dispatch(
            view.state.tr
              .replaceSelection(new Slice(Fragment.fromArray(nodes), 1, 1))
              .scrollIntoView(),
          );
          return true;
        },
        drop(_view, event) {
          // Intercept DOM events before ProseMirror parses clipboard/drop HTML.
          event.preventDefault();
          setError('Paste text to add it here. Add images using a Library image block.');
          return true;
        },
      },
    },
    onCreate: ({ editor }) => {
      const initial = richTextSchema.parse({ version: 1, ...editor.getJSON() });
      setDocument(initial);
      setBaseline(contentSignature(initial));
    },
    onUpdate: ({ editor }) => {
      setDocument(richTextSchema.parse({ version: 1, ...editor.getJSON() }));
      setError('');
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold'),
      italic: editor?.isActive('italic'),
      underline: editor?.isActive('underline'),
      bullet: editor?.isActive('bulletList'),
      numbered: editor?.isActive('orderedList'),
      link: editor?.isActive('link'),
      paragraph: editor?.isActive('heading', { level: 2 })
        ? '2'
        : editor?.isActive('heading', { level: 3 })
          ? '3'
          : 'paragraph',
      inList: editor?.isActive('listItem'),
      indent: editor?.can().sinkListItem('listItem'),
      outdent: editor?.can().liftListItem('listItem'),
      undo: editor ? undo(editor.state) : false,
      redo: editor ? redo(editor.state) : false,
    }),
  });
  const dirty = !!baseline && contentSignature(document) !== baseline;
  dirtyRef.current = dirty || (linkOpen && url !== initialUrl);
  useEffect(() => {
    const previous = navigation.confirmLeave;
    const guard = () =>
      (!dirtyRef.current || confirm('Discard your unapplied text edits?')) &&
      (!previous || previous());
    navigation.confirmLeave = guard;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      if (navigation.confirmLeave === guard) navigation.confirmLeave = previous;
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  function close() {
    if (!dirtyRef.current || confirm('Discard your unapplied text edits?')) onClose();
  }
  function openLink() {
    if (!editor) return;
    editor.commands.extendMarkRange('link');
    if (editor.state.selection.empty) {
      setError('Select the words you want to link first.');
      return;
    }
    range.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    const href = editor.getAttributes('link').href || '';
    setUrl(href);
    setInitialUrl(href);
    setLinkOpen(true);
    setError('');
  }
  function applyLink() {
    if (!editor) return;
    const parsed = richTextLinkSchema.safeParse(url);
    if (!parsed.success || !isSafeUrl(url)) {
      setError('Enter a /relative, #anchor, https, http, mailto or tel link.');
      return;
    }
    editor.chain().focus().setTextSelection(range.current).setLink({ href: parsed.data }).run();
    setLinkOpen(false);
    setError('');
  }
  return (
    <Dialog title="Edit text" onClose={close}>
      <div
        className="text-editor"
        onKeyDown={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <p id="text-editor-help" className="text-editor-help">
          Write your story, then select words to format or link them. Pasted content keeps its text;
          add formatting here.
        </p>
        {error && (
          <p className="error-notice" role="alert">
            {error}
          </p>
        )}
        <fieldset className="text-editor-controls" disabled={!editor || linkOpen}>
          <legend className="sr-only">Text formatting</legend>
          <label className="sr-only" htmlFor="text-paragraph-style">
            Paragraph style
          </label>
          <select
            id="text-paragraph-style"
            value={state?.paragraph || 'paragraph'}
            disabled={state?.inList}
            onChange={(event) => {
              if (event.target.value === 'paragraph') editor?.chain().focus().setParagraph().run();
              else
                editor
                  ?.chain()
                  .focus()
                  .setHeading({ level: Number(event.target.value) as 2 | 3 })
                  .run();
            }}
          >
            <option value="paragraph">Paragraph</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
          </select>
          {[
            {
              label: 'Bold',
              icon: BoldIcon,
              active: state?.bold,
              action: () => editor?.chain().focus().toggleBold().run(),
            },
            {
              label: 'Italic',
              icon: ItalicIcon,
              active: state?.italic,
              action: () => editor?.chain().focus().toggleItalic().run(),
            },
            {
              label: 'Underline',
              icon: UnderlineIcon,
              active: state?.underline,
              action: () => editor?.chain().focus().toggleUnderline().run(),
            },
            {
              label: 'Bulleted list',
              icon: List,
              active: state?.bullet,
              action: () => editor?.chain().focus().toggleBulletList().run(),
            },
            {
              label: 'Numbered list',
              icon: ListOrdered,
              active: state?.numbered,
              action: () => editor?.chain().focus().toggleOrderedList().run(),
            },
            { label: 'Edit link', icon: LinkIcon, active: state?.link, action: openLink },
            {
              label: 'Indent list item',
              icon: IndentIncrease,
              disabled: !state?.indent,
              action: () => editor?.chain().focus().sinkListItem('listItem').run(),
            },
            {
              label: 'Outdent list item',
              icon: IndentDecrease,
              disabled: !state?.outdent,
              action: () => editor?.chain().focus().liftListItem('listItem').run(),
            },
            {
              label: 'Undo text edit',
              icon: Undo2,
              disabled: !state?.undo,
              action: () => {
                if (editor) {
                  undo(editor.state, editor.view.dispatch);
                  editor.commands.focus();
                }
              },
            },
            {
              label: 'Redo text edit',
              icon: Redo2,
              disabled: !state?.redo,
              action: () => {
                if (editor) {
                  redo(editor.state, editor.view.dispatch);
                  editor.commands.focus();
                }
              },
            },
          ].map(({ label, icon: Icon, active, disabled, action }) => (
            <button
              key={label}
              type="button"
              className="icon-button"
              aria-label={label}
              title={label}
              aria-pressed={active}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={action}
            >
              <Icon size={18} />
            </button>
          ))}
        </fieldset>
        {linkOpen && (
          <form
            className="text-link-form"
            onSubmit={(event) => {
              event.preventDefault();
              applyLink();
            }}
          >
            <label htmlFor="text-link-address">Link address</label>
            <input
              id="text-link-address"
              autoFocus
              value={url}
              maxLength={2048}
              onChange={(event) => setUrl(event.target.value)}
              aria-describedby="text-link-help"
            />
            <p id="text-link-help" className="text-editor-help">
              Links open in the same tab. Finish or cancel this link before applying text.
            </p>
            <div className="text-link-actions">
              <button type="submit" className="button primary compact">
                Apply link
              </button>
              {initialUrl && (
                <button
                  type="button"
                  className="button compact"
                  onClick={() => {
                    editor?.chain().focus().setTextSelection(range.current).unsetLink().run();
                    setLinkOpen(false);
                    setError('');
                  }}
                >
                  Remove link
                </button>
              )}
              <button
                type="button"
                className="button compact"
                onClick={() => {
                  setLinkOpen(false);
                  setError('');
                  editor?.commands.focus();
                }}
              >
                Cancel link
              </button>
            </div>
          </form>
        )}
        <div className="text-editor-surface" inert={linkOpen}>
          <EditorContent editor={editor} />
        </div>
        <div className="text-editor-footer">
          <p className="text-editor-help">
            {richTextCharacterCount(document).toLocaleString()} characters · Save the page draft
            after applying.
          </p>
          <div className="text-link-actions">
            <button type="button" className="button" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!editor || !dirty || linkOpen}
              onClick={() => onApply(richTextSchema.parse({ version: 1, ...editor!.getJSON() }))}
            >
              Apply text
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
