import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  FileText,
  Home,
  Link,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import {
  navigationSchema,
  type NavigationDocument,
  type NavigationItem,
  type NavigationState,
  type NavigationTarget,
} from '@wordpressjs/core';
import { api, contentSignature, message, navigation } from './api';
import { Dialog } from './dialog';
import './navigation.css';

function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div className="error-notice" role="alert">
      {error}
    </div>
  ) : null;
}

function TargetPicker({
  homepage,
  onChoose,
  onClose,
}: {
  homepage: boolean;
  onChoose: (target: NavigationTarget) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{ items: NavigationTarget[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, limit: '20', offset: String(offset) });
      if (homepage) {
        params.set('kind', 'page');
        params.set('published', 'true');
      }
      api<{ items: NavigationTarget[]; total: number }>(`/navigation/targets?${params}`)
        .then((value) => {
          if (active) setResult(value);
        })
        .catch((error) => {
          if (active) setError(message(error));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, offset, homepage, attempt]);
  return (
    <Dialog title={homepage ? 'Choose your homepage' : 'Add a page or post'} onClose={onClose}>
      <div className="navigation-picker">
        <p className="navigation-help">
          {homepage
            ? 'Choose a published page to welcome visitors at your website’s main address.'
            : 'Page and post links follow their published addresses. Publish draft content before publishing its menu link.'}
        </p>
        <label>
          Search pages and posts
          <input
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => {
              setQuery(event.target.value);
              setOffset(0);
            }}
          />
        </label>
        <ErrorNotice error={error} />
        {error && (
          <button className="button" onClick={() => setAttempt((v) => v + 1)}>
            Try again
          </button>
        )}
        {loading ? (
          <p role="status">Finding content…</p>
        ) : (
          !error && (
            <>
              <ul className="navigation-targets">
                {result?.items.map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      onClick={() => onChoose(target)}
                      aria-label={`Choose ${target.title}`}
                    >
                      <FileText size={18} />
                      <span>
                        <strong>{target.title}</strong>
                        <small>
                          {target.kind === 'page' ? 'Page' : 'Post'} ·{' '}
                          {target.published ? target.path : 'Draft — publish before linking'}
                        </small>
                      </span>
                      <Plus size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              {!result?.items.length && (
                <p>No matching {homepage ? 'published pages' : 'pages or posts'}.</p>
              )}
              <div className="navigation-picker-footer">
                <span>
                  {result?.total
                    ? `${offset + 1}–${offset + result.items.length} of ${result.total}`
                    : '0 results'}
                </span>
                <div className="navigation-actions">
                  <button
                    className="button compact"
                    disabled={!offset}
                    onClick={() => setOffset((value) => Math.max(0, value - 20))}
                  >
                    Previous
                  </button>
                  <button
                    className="button compact"
                    disabled={offset + 20 >= (result?.total || 0)}
                    onClick={() => setOffset((value) => value + 20)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </Dialog>
  );
}

function MenuItems({
  name,
  items,
  targets,
  onChange,
  onAddContent,
}: {
  name: string;
  items: NavigationItem[];
  targets: Record<string, NavigationTarget>;
  onChange: (items: NavigationItem[]) => void;
  onAddContent: () => void;
}) {
  const [announcement, setAnnouncement] = useState('');
  function move(index: number, direction: number) {
    if (index + direction < 0 || index + direction >= items.length) return;
    const next = [...items],
      [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item!);
    onChange(next);
    setAnnouncement(
      `${item!.label || 'Link'} moved to position ${index + direction + 1} of ${items.length}.`,
    );
  }
  return (
    <div className="navigation-menu-items">
      <ol className="navigation-items" aria-label={`${name} links`}>
        {items.map((item, index) => {
          const target = item.type === 'content' ? targets[item.contentId] : null;
          return (
            <li key={item.id}>
              <div className="navigation-item-fields">
                <label>
                  {name} link {index + 1} label
                  <input
                    value={item.label}
                    maxLength={80}
                    required
                    onChange={(event) =>
                      onChange(
                        items.map((old) =>
                          old.id === item.id ? { ...old, label: event.target.value } : old,
                        ),
                      )
                    }
                  />
                </label>
                {item.type === 'url' ? (
                  <label>
                    {name} link {index + 1} address
                    <input
                      value={item.url}
                      maxLength={2048}
                      placeholder="/blog or https://example.com"
                      required
                      onChange={(event) =>
                        onChange(
                          items.map((old) =>
                            old.id === item.id ? { ...item, url: event.target.value } : old,
                          ),
                        )
                      }
                    />
                  </label>
                ) : (
                  <p className="navigation-destination">
                    <FileText size={14} />
                    <span>
                      {target?.title || 'Content unavailable'}
                      <small>
                        {target?.published
                          ? target.path
                          : 'Draft — publish this content before its menu'}
                      </small>
                    </span>
                  </p>
                )}
              </div>
              <div className="navigation-item-actions">
                <span>{index + 1}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${name.toLowerCase()} link ${index + 1} up`}
                  aria-disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${name.toLowerCase()} link ${index + 1} down`}
                  aria-disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${name.toLowerCase()} link ${index + 1}`}
                  onClick={() => onChange(items.filter((old) => old.id !== item.id))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {!items.length && (
        <p className="navigation-empty">No links yet. Add the places you want visitors to find.</p>
      )}
      <div className="navigation-actions">
        <button
          type="button"
          className="button compact"
          disabled={items.length >= 20}
          onClick={onAddContent}
        >
          <Plus size={15} />
          Add page or post
        </button>
        <button
          type="button"
          className="button compact"
          disabled={items.length >= 20}
          onClick={() =>
            onChange([...items, { id: crypto.randomUUID(), type: 'url', label: '', url: '' }])
          }
        >
          <Link size={15} />
          Add custom link
        </button>
        <small>{items.length}/20 links</small>
      </div>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}

export default function Navigation({ siteUrl }: { siteUrl: string }) {
  const [state, setState] = useState<NavigationState | null>(null),
    [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    api<NavigationState>('/navigation')
      .then((value) => {
        if (active) setState(value);
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (!state)
    return (
      <>
        <ErrorNotice error={error} />
        {error ? (
          <button className="button" onClick={() => setAttempt((v) => v + 1)}>
            Try again
          </button>
        ) : (
          <p role="status">Opening navigation…</p>
        )}
      </>
    );
  return <NavigationWorkspace initial={state} siteUrl={siteUrl} />;
}

function NavigationWorkspace({ initial, siteUrl }: { initial: NavigationState; siteUrl: string }) {
  const [state, setState] = useState(initial),
    [document, setDocument] = useState(initial.draft);
  const [targets, setTargets] = useState<Record<string, NavigationTarget>>(() =>
    Object.fromEntries(initial.references.map((item) => [item.id, item])),
  );
  const [picker, setPicker] = useState<'homepage' | 'header' | 'footer' | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const lock = useRef(false);
  const dirty = contentSignature(document) !== contentSignature(state.draft);
  const unpublished = contentSignature(document) !== contentSignature(state.published);
  useEffect(() => {
    navigation.confirmLeave = () =>
      !busy && (!dirty || confirm('Leave navigation? Your unsaved changes will be lost.'));
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || busy) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      navigation.confirmLeave = null;
      window.removeEventListener('beforeunload', handler);
    };
  }, [dirty, busy]);
  function receive(next: NavigationState) {
    setState(next);
    setDocument(next.draft);
    setTargets(Object.fromEntries(next.references.map((item) => [item.id, item])));
  }
  function change(next: NavigationDocument) {
    setDocument(next);
    setNotice('');
  }
  async function save(publish: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const parsed = navigationSchema.safeParse(document);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        const [section, , index, field] = issue.path;
        const label = `${section === 'header' ? 'Header' : 'Footer'} link ${Number(index) + 1}`;
        throw new Error(
          field === 'label'
            ? `${label}: Add a label of 1–80 characters.`
            : field === 'url'
              ? `${label}: Enter a valid website address, /page path, #anchor, mailto or tel link.`
              : 'Check your navigation settings. Each menu supports up to 20 links and footer text up to 300 characters.',
        );
      }
      let next = dirty
        ? await api<NavigationState>('/navigation', {
            method: 'PUT',
            body: { document: parsed.data, revision: state.revision },
          })
        : state;
      receive(next);
      if (publish) {
        next = await api<NavigationState>('/navigation/publish', {
          method: 'POST',
          body: { revision: next.revision },
        });
        receive(next);
      }
      setNotice(
        publish
          ? 'Navigation published. Your website is up to date.'
          : 'Navigation draft saved. Your public website is unchanged.',
      );
    } catch (error) {
      setError(message(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (
      lock.current ||
      (dirty && !confirm('Discard your unsaved navigation edits and load the latest saved draft?'))
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      receive(await api<NavigationState>('/navigation'));
    } catch (error) {
      setError(message(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function choose(target: NavigationTarget) {
    setTargets((current) => ({ ...current, [target.id]: target }));
    if (picker === 'homepage') change({ ...document, homepageId: target.id });
    else if (picker)
      change({
        ...document,
        [picker]: {
          ...document[picker],
          items: [
            ...document[picker].items,
            {
              id: crypto.randomUUID(),
              type: 'content',
              contentId: target.id,
              label: target.title.slice(0, 80),
            },
          ],
        },
      });
    setPicker(null);
  }
  const home = document.homepageId ? targets[document.homepageId] : null;
  return (
    <div className="navigation-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">A CLEAR PATH THROUGH YOUR WEBSITE</span>
          <h1>Navigation</h1>
          <p>Welcome visitors home. Help them find what matters.</p>
        </div>
        <a
          className="button compact"
          href={`${siteUrl}/api/navigation/preview`}
          target="_blank"
          rel="noreferrer"
        >
          Preview saved draft
          <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="navigation-publish-bar">
        <span className="navigation-save-state">
          {dirty
            ? 'Unsaved changes'
            : unpublished
              ? 'Draft saved · ready to publish'
              : 'Matches your public website'}
        </span>
        <div className="navigation-actions">
          <button
            type="button"
            className="button"
            disabled={busy || !dirty}
            onClick={() => save(false)}
          >
            <Save size={16} />
            Save draft
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || (!unpublished && !!state.publishedAt)}
            onClick={() => save(true)}
          >
            <Check size={16} />
            {busy ? 'Saving…' : 'Publish navigation'}
          </button>
        </div>
      </div>
      <ErrorNotice error={error} />
      {error && (
        <button
          type="button"
          className="button compact navigation-reload"
          disabled={busy}
          onClick={reload}
        >
          Reload saved navigation
        </button>
      )}
      <p className="navigation-notice" role="status">
        {notice}
      </p>
      <fieldset disabled={busy} className="navigation-panels">
        <legend className="sr-only">Navigation settings</legend>
        <section className="panel navigation-home" aria-labelledby="homepage-heading">
          <div className="navigation-section-title">
            <Home size={19} />
            <div>
              <h2 id="homepage-heading">Homepage</h2>
              <p>The first page visitors see at your main website address.</p>
            </div>
          </div>
          <div className="navigation-home-choice">
            <span className="navigation-home-icon">
              <FileText size={23} />
            </span>
            <div>
              <strong>
                {document.homepageId
                  ? home?.title || 'Selected page unavailable'
                  : 'Use the page named “home”'}
              </strong>
              <small>
                {document.homepageId
                  ? 'This page will appear at / when you publish navigation.'
                  : 'Your original homepage rule. Publish a page with the address “home”.'}
              </small>
            </div>
          </div>
          <div className="navigation-actions">
            <button className="button compact" type="button" onClick={() => setPicker('homepage')}>
              Choose homepage
            </button>
            {document.homepageId && (
              <button
                className="button compact"
                type="button"
                onClick={() => change({ ...document, homepageId: null })}
              >
                Use original homepage
              </button>
            )}
          </div>
        </section>
        <section className="panel navigation-panel" aria-labelledby="header-heading">
          <div className="navigation-section-title">
            <span className="navigation-step">01</span>
            <div>
              <h2 id="header-heading">Header menu</h2>
              <p>Links at the top of every page.</p>
            </div>
          </div>
          <label className="navigation-mode">
            Header menu style
            <select
              value={document.header.mode}
              onChange={(event) =>
                change({
                  ...document,
                  header: { ...document.header, mode: event.target.value as 'auto' | 'custom' },
                })
              }
            >
              <option value="auto">Automatic — published pages and Journal</option>
              <option value="custom">Custom — choose and order links</option>
            </select>
          </label>
          {document.header.mode === 'auto' ? (
            <p className="navigation-help">
              Shows up to six recently published pages and the Journal. Any custom links are kept
              for when you switch back.
            </p>
          ) : (
            <MenuItems
              name="Header"
              items={document.header.items}
              targets={targets}
              onChange={(items) => change({ ...document, header: { ...document.header, items } })}
              onAddContent={() => setPicker('header')}
            />
          )}
        </section>
        <section className="panel navigation-panel" aria-labelledby="footer-heading">
          <div className="navigation-section-title">
            <span className="navigation-step">02</span>
            <div>
              <h2 id="footer-heading">Footer</h2>
              <p>A final word, and useful places to go next.</p>
            </div>
          </div>
          <div className="navigation-footer-field">
            <label htmlFor="navigation-footer-text">Footer text</label>
            <textarea
              id="navigation-footer-text"
              aria-describedby="navigation-footer-help"
              rows={2}
              value={document.footer.text}
              maxLength={300}
              onChange={(event) =>
                change({ ...document, footer: { ...document.footer, text: event.target.value } })
              }
            />
          </div>
          <p id="navigation-footer-help" className="navigation-help">
            {document.footer.text.length}/300 characters. Leave blank to hide the text.
          </p>
          <MenuItems
            name="Footer"
            items={document.footer.items}
            targets={targets}
            onChange={(items) => change({ ...document, footer: { ...document.footer, items } })}
            onAddContent={() => setPicker('footer')}
          />
        </section>
      </fieldset>
      <p className="navigation-help">
        Save a private draft to preview it. Publishing applies your homepage, header and footer
        together. Page links follow address changes; custom links keep the address you enter.
      </p>
      {picker && (
        <TargetPicker
          homepage={picker === 'homepage'}
          onChoose={choose}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
