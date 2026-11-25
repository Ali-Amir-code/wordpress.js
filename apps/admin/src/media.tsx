import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Images,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  MEDIA_LIMITS,
  mediaPath,
  mediaSelection,
  type MediaItem,
  type MediaList,
  type MediaSelection,
} from '@wordpressjs/core';
import { api, message, navigation } from './api';
import './media.css';

function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div className="error-notice" role="alert">
      {error}
    </div>
  ) : null;
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const invoker = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      // React removes the dialog before effect cleanup; explicitly return keyboard focus.
      if (invoker instanceof HTMLElement && invoker.isConnected)
        invoker.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="media-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="media-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

function MediaBrowser({
  onChoose,
  onUploaded,
  refresh = 0,
  onBusy,
}: {
  onChoose: (item: MediaItem) => void;
  onUploaded?: (item: MediaItem) => void;
  refresh?: number;
  onBusy?: (value: boolean) => void;
}) {
  const [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0),
    [version, setVersion] = useState(0);
  const [result, setResult] = useState<MediaList | null>(null),
    [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null),
    uploadLock = useRef(false),
    inputId = useId();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    const timer = setTimeout(() => {
      api<MediaList>(
        `/media?${new URLSearchParams({ q: query, limit: '24', offset: String(offset) })}`,
      )
        .then((data) => {
          if (!active) return;
          if (offset && offset >= data.total) setOffset(Math.max(0, offset - 24));
          else setResult(data);
        })
        .catch((error) => {
          if (active) setLoadError(message(error));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, offset, version, refresh]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (uploading) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [uploading]);
  async function upload(file?: File) {
    if (!file || uploadLock.current) return;
    setError('');
    setNotice('');
    if (!file.size || file.size > MEDIA_LIMITS.uploadBytes) {
      setError('Choose a nonempty image no larger than 10 MiB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    uploadLock.current = true;
    setUploading(true);
    onBusy?.(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const item = await api<MediaItem>('/media', { method: 'POST', body });
      setQuery('');
      setOffset(0);
      setVersion((v) => v + 1);
      setNotice(`“${item.title}” uploaded. Add alternative text if the image conveys information.`);
      onUploaded?.(item);
    } catch (error) {
      setError(message(error));
    } finally {
      uploadLock.current = false;
      setUploading(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="media-browser">
      <div className="media-toolbar">
        <label className="search-box">
          <Search size={17} />
          <span className="sr-only">Search images</span>
          <input
            type="search"
            placeholder="Search images…"
            maxLength={100}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
            }}
          />
        </label>
        <input
          id={inputId}
          ref={input}
          className="sr-only"
          tabIndex={-1}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload image file"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void upload(file);
          }}
        />
        <button
          type="button"
          className="button primary"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          {uploading ? 'Processing image…' : 'Upload image'}
        </button>
      </div>
      <p className="media-help">
        JPEG, PNG or WebP · Up to 10 MiB and 24 megapixels. Images stay private until used on a
        published page or post.
      </p>
      <ErrorNotice error={error || loadError} />
      {loadError && (
        <button type="button" className="button compact" onClick={() => setVersion((v) => v + 1)}>
          Try again
        </button>
      )}
      <div className="media-live" role="status">
        {uploading ? 'Uploading and preparing your image…' : notice}
      </div>
      <div aria-busy={loading}>
        {loading && (
          <p role="status" className="media-help">
            Loading images…
          </p>
        )}
        {!loading && !loadError && result?.total === 0 && (
          <div className="media-empty">
            <Images size={32} aria-hidden="true" />
            <h3>{query ? 'No matching images' : 'A home for your images'}</h3>
            <p>
              {query
                ? 'Try a different title or description.'
                : 'Upload your first image, then bring it into any page with a Library image block.'}
            </p>
          </div>
        )}
        {!loadError && (
          <div className="media-grid">
            {result?.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="media-card"
                disabled={loading || uploading}
                aria-label={`Choose ${item.title}`}
                onClick={() => onChoose(item)}
              >
                <div className="media-thumbnail">
                  <img
                    src={item.url}
                    alt=""
                    width={item.width}
                    height={item.height}
                    loading="lazy"
                  />
                </div>
                <span className="media-card-info">
                  <strong>{item.title}</strong>
                  <span>
                    {item.width} × {item.height} · {size(item.bytes)}
                  </span>
                  <small>
                    {item.publishedUses
                      ? 'On your website'
                      : item.draftUses
                        ? 'In saved drafts'
                        : 'Private · Not used yet'}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {result && (
        <footer className="media-footer">
          <span>
            {result.total} {result.total === 1 ? 'image' : 'images'} · {size(result.usage.bytes)} of{' '}
            {size(result.usage.maxBytes)} used · {result.usage.items}/{result.usage.maxItems} files
          </span>
          {(result.total > 24 || offset > 0) && (
            <nav aria-label="Image pages">
              <button
                type="button"
                className="icon-button"
                aria-label="Previous images"
                disabled={!offset || loading}
                onClick={() => setOffset((n) => Math.max(0, n - 24))}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {Math.floor(offset / 24) + 1} / {Math.max(1, Math.ceil(result.total / 24))}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Next images"
                disabled={offset + 24 >= result.total || loading}
                onClick={() => setOffset((n) => n + 24)}
              >
                <ChevronRight size={18} />
              </button>
            </nav>
          )}
        </footer>
      )}
    </div>
  );
}

function MediaDetails({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [item, setItem] = useState<MediaItem | null>(null),
    [title, setTitle] = useState(''),
    [alt, setAlt] = useState(''),
    [caption, setCaption] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const busyRef = useRef(false);
  const dirty = !!item && (title !== item.title || alt !== item.alt || caption !== item.caption);
  useEffect(() => {
    let active = true;
    setItem(null);
    setError('');
    setNotice('');
    api<MediaItem>(`/media/${id}`)
      .then((next) => {
        if (active) {
          setItem(next);
          setTitle(next.title);
          setAlt(next.alt);
          setCaption(next.caption);
        }
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [id, reload]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || busy) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, busy]);
  function close() {
    if (!busyRef.current && (!dirty || confirm('Discard unsaved image details?'))) onClose();
  }
  async function save() {
    if (!item || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await api<MediaItem>(`/media/${id}`, {
        method: 'PUT',
        body: { title, alt, caption, revision: item.revision },
      });
      setItem(next);
      setTitle(next.title);
      setAlt(next.alt);
      setCaption(next.caption);
      setNotice('Image details saved. Existing pages keep their own text.');
      onChanged();
    } catch (error) {
      setError(message(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !item ||
      busyRef.current ||
      !confirm(`Permanently delete “${item.title}”? This cannot be undone.`)
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/media/${id}`, { method: 'DELETE', body: { revision: item.revision } });
      onChanged();
      onClose();
    } catch (error) {
      setError(message(error));
      onChanged();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog title="Image details" onClose={close}>
      <div className="media-dialog-body">
        <ErrorNotice error={error} />
        {error && (
          <button
            type="button"
            className="button compact"
            disabled={busy}
            onClick={() => {
              if (!dirty || confirm('Discard local changes and reload image details?'))
                setReload((v) => v + 1);
            }}
          >
            Reload details
          </button>
        )}
        {!item && !error && <p role="status">Loading image details…</p>}
        {item && (
          <div className="media-detail-grid">
            <div className="media-detail-preview">
              <img src={item.url} width={item.width} height={item.height} alt={alt} />
              <p>
                {item.width} × {item.height} · WebP · {size(item.bytes)}
              </p>
              <p>
                {item.publishedUses
                  ? 'Publicly visible on your website.'
                  : 'Private to your workspace.'}
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={busy} className="media-form-fields">
                <label>
                  Image title
                  <input
                    value={title}
                    required
                    maxLength={160}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <small>A name to find this image in your library.</small>
                </label>
                <label>
                  Alternative text
                  <textarea
                    value={alt}
                    maxLength={500}
                    rows={3}
                    onChange={(event) => setAlt(event.target.value)}
                  />
                  <small>
                    Describe what matters in the image. Leave empty only for a decorative image.
                  </small>
                </label>
                <label>
                  Caption
                  <textarea
                    value={caption}
                    maxLength={500}
                    rows={2}
                    onChange={(event) => setCaption(event.target.value)}
                  />
                  <small>Default text shown beneath the image when you add it to a page.</small>
                </label>
                <p className="media-usage">
                  Used in {item.draftUses} saved {item.draftUses === 1 ? 'draft' : 'drafts'} and{' '}
                  {item.publishedUses} published {item.publishedUses === 1 ? 'entry' : 'entries'}.{' '}
                  {item.draftUses || item.publishedUses
                    ? 'Remove it from these drafts and published pages before deleting.'
                    : 'This image can be deleted.'}
                </p>
                <div role="status" className="media-live">
                  {notice}
                </div>
                <div className="media-actions">
                  <button type="submit" className="button primary" disabled={!dirty || busy}>
                    {busy ? 'Working…' : 'Save image details'}
                  </button>
                  <button
                    type="button"
                    className="button danger"
                    disabled={busy || !!(item.draftUses || item.publishedUses)}
                    onClick={remove}
                  >
                    <Trash2 size={15} />
                    Delete image
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default function MediaLibrary() {
  const [selected, setSelected] = useState<string | null>(null),
    [refresh, setRefresh] = useState(0),
    [uploading, setUploading] = useState(false);
  useEffect(() => {
    navigation.confirmLeave = () => !uploading;
    return () => {
      navigation.confirmLeave = null;
    };
  }, [uploading]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE PICTURES THAT TELL YOUR STORY</span>
          <h1>
            Media library<span className="heading-dot">.</span>
          </h1>
          <p>Keep your images together. Make every page your own.</p>
        </div>
      </div>
      <section className="panel" aria-label="Image library">
        <MediaBrowser
          refresh={refresh}
          onBusy={setUploading}
          onChoose={(item) => setSelected(item.id)}
          onUploaded={(item) => setSelected(item.id)}
        />
      </section>
      {selected && (
        <MediaDetails
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={() => setRefresh((v) => v + 1)}
        />
      )}
    </>
  );
}

export function MediaField({
  value,
  onChange,
  readOnly,
}: {
  value: MediaSelection | null;
  onChange: (value: MediaSelection | null) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const busyRef = useRef(false);
  async function choose(item: MediaItem) {
    if (busyRef.current || readOnly) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const current = await api<MediaItem>(`/media/${item.id}`);
      onChange(mediaSelection(current));
      setOpen(false);
    } catch (error) {
      setError(message(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="media-field">
      {value && (
        <img
          className="media-field-preview"
          src={mediaPath(value.id)}
          alt={value.alt}
          width={value.width}
          height={value.height}
        />
      )}
      <button
        type="button"
        className="button"
        disabled={readOnly}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        <ImagePlus size={16} />
        {value ? 'Replace image' : 'Choose image'}
      </button>
      {value && (
        <>
          <label>
            Alternative text
            <textarea
              value={value.alt}
              rows={3}
              maxLength={500}
              disabled={readOnly}
              onChange={(event) => onChange({ ...value, alt: event.target.value })}
            />
            <small>Describe this image for this page. Empty text marks it as decorative.</small>
          </label>
          <label>
            Caption
            <textarea
              value={value.caption}
              rows={2}
              maxLength={500}
              disabled={readOnly}
              onChange={(event) => onChange({ ...value, caption: event.target.value })}
            />
          </label>
          <p className="media-help">
            These details belong to this page. Library edits won’t change them.
          </p>
          <button
            type="button"
            className="button compact"
            disabled={readOnly}
            onClick={() => onChange(null)}
          >
            Remove image
          </button>
        </>
      )}
      {open && (
        <Dialog
          title="Choose an image"
          onClose={() => {
            if (!busyRef.current) setOpen(false);
          }}
        >
          <ErrorNotice error={error} />
          <div aria-busy={busy}>
            <MediaBrowser
              onChoose={choose}
              onBusy={(next) => {
                busyRef.current = next;
                setBusy(next);
              }}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
