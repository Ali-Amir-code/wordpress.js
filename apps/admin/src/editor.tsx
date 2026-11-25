import { useEffect, useMemo, useRef, useState } from 'react';
import { Puck, type Data } from '@puckeditor/core';
import { createBlockConfig } from '@wordpressjs/blocks/config';
import {
  contentPath,
  type BlockProps,
  type ContentDocument,
  type ContentView as ContentEntry,
} from '@wordpressjs/core';
import { ArrowLeft, ArrowUpRight, Check, Eye, Save, Settings2 } from 'lucide-react';
import { api, message, navigation, contentSignature } from './api';
import { MediaField } from './media';
import '@puckeditor/core/no-external.css';
import '@wordpressjs/blocks/styles.css';

const blockConfig = createBlockConfig({ type: 'custom', label: 'Image', render: MediaField });

export default function Editor({ id, siteUrl }: { id: string; siteUrl: string }) {
  const [entry, setEntry] = useState<ContentEntry | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<ContentEntry>(`/content/${id}`)
      .then((data) => {
        if (active) setEntry(data);
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (!entry)
    return (
      <main className="editor-loading">
        <a href="#pages" className="text-link">
          <ArrowLeft size={16} />
          Back to pages
        </a>
        <p role={error ? 'alert' : 'status'}>{error || 'Opening the editor…'}</p>
      </main>
    );
  return <EditorWorkspace key={entry.id} initial={entry} siteUrl={siteUrl} />;
}
function EditorWorkspace({ initial, siteUrl }: { initial: ContentEntry; siteUrl: string }) {
  const [entry, setEntry] = useState(initial),
    [title, setTitle] = useState(initial.title),
    [slug, setSlug] = useState(initial.slug),
    [description, setDescription] = useState(initial.description),
    [document, setDocument] = useState<ContentDocument>(initial.document),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [showDetails, setShowDetails] = useState(false);
  const initialData = useMemo(
    () => ({ content: initial.document.content, root: initial.document.root }),
    [initial],
  );
  const draft = { title, slug, description, document };
  const draftPath = contentPath(
    entry.kind,
    slug,
    entry.homepageId === null ? undefined : entry.homepageId === entry.id,
  );
  const dirty =
    contentSignature(draft) !==
    contentSignature({
      title: entry.title,
      slug: entry.slug,
      description: entry.description,
      document: entry.document,
    });
  const busyRef = useRef(false);
  useEffect(() => {
    navigation.confirmLeave = () =>
      !busy && (!dirty || confirm('Leave the editor? Your unsaved changes will be lost.'));
    return () => {
      navigation.confirmLeave = null;
    };
  }, [dirty, busy]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || busy) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, busy]);
  async function save(publish = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let saved = dirty
        ? await api<ContentEntry>(`/content/${entry.id}`, {
            method: 'PUT',
            body: { ...draft, revision: entry.revision },
          })
        : entry;
      setEntry(saved);
      if (publish) {
        saved = await api<ContentEntry>(`/content/${entry.id}/publish`, {
          method: 'POST',
          body: { revision: saved.revision },
        });
        setEntry(saved);
      }
      setNotice(publish ? 'Published. Your website is up to date.' : 'Draft saved.');
    } catch (error) {
      setError(message(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function unpublish() {
    if (
      !confirm(
        'Take this item off the public website? Your saved draft will stay in your workspace.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      setEntry(
        await api<ContentEntry>(`/content/${entry.id}/unpublish`, {
          method: 'POST',
          body: { revision: entry.revision },
        }),
      );
      setNotice('Unpublished. Your draft is still here.');
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  function back() {
    location.hash = initial.kind === 'post' ? 'posts' : 'pages';
  }
  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <div className="editor-title">
          <button
            className="icon-button"
            onClick={back}
            disabled={busy}
            aria-label="Back to content"
          >
            <ArrowLeft size={20} />
          </button>
          <span>
            <strong>{title}</strong>
            <small>
              {dirty
                ? 'Unsaved changes'
                : entry.published
                  ? contentSignature(draft) === contentSignature(entry.published)
                    ? 'Published'
                    : 'Unpublished changes'
                  : 'Draft saved'}
            </small>
          </span>
        </div>
        <div className="editor-actions">
          <button
            className="button compact"
            aria-expanded={showDetails}
            onClick={() => setShowDetails(!showDetails)}
          >
            <Settings2 size={16} />
            Page details
          </button>
          <a
            className="button compact"
            href={`${siteUrl}/api/content/${entry.id}/preview`}
            target="_blank"
            rel="noreferrer"
            title="Preview the last saved draft"
          >
            <Eye size={16} />
            Preview saved
          </a>
          <button className="button compact" disabled={busy} onClick={() => save()}>
            <Save size={16} />
            {busy ? 'Saving…' : 'Save draft'}
          </button>
          <button className="button primary compact" disabled={busy} onClick={() => save(true)}>
            <ArrowUpRight size={16} />
            {entry.published ? 'Publish changes' : 'Publish'}
          </button>
        </div>
      </header>
      {error && (
        <div role="alert" className="error-notice editor-notice">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" aria-label="Save status" className="editor-notice success-message">
          <Check size={15} />
          {notice}
          {entry.published && (
            <a href={siteUrl + entry.publicPath} target="_blank" rel="noreferrer">
              View live
              <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      )}
      {showDetails && (
        <section className="editor-details" aria-label="Page details">
          <label>
            Title
            <input
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            URL slug
            <input value={slug} maxLength={100} onChange={(event) => setSlug(event.target.value)} />
            <small>{draftPath}</small>
          </label>
          <label>
            Search description
            <textarea
              value={description}
              maxLength={320}
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {entry.published && (
            <button className="button danger compact" disabled={busy} onClick={unpublish}>
              Unpublish
            </button>
          )}
        </section>
      )}
      <div className="editor-canvas" aria-busy={busy} inert={busy}>
        <Puck
          config={blockConfig}
          data={initialData}
          onChange={(data: Data<BlockProps>) =>
            setDocument({ schemaVersion: 1, content: data.content, root: { props: {} } })
          }
          headerTitle="Your canvas"
          headerPath={draftPath}
          overrides={{
            headerActions: () => (
              <span className="canvas-hint">Select a block to make it yours</span>
            ),
          }}
        />
      </div>
    </div>
  );
}
