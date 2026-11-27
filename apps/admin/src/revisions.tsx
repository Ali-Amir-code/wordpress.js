import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Clock3, RotateCcw } from 'lucide-react';
import type {
  ContentRevision,
  ContentView,
  Draft,
  RevisionEvent,
  RevisionList,
} from '@wordpressjs/core';
import { api, contentSignature, message } from './api';
import { Dialog } from './dialog';
import './revisions.css';

const labels: Record<RevisionEvent, string> = {
  created: 'Created',
  saved: 'Draft saved',
  published: 'Published',
  restored: 'Restored as draft',
  unpublished: 'Removed from website',
  'upgrade-draft': 'Draft at upgrade',
  'upgrade-publication': 'Publication at upgrade',
  'archived-publication': 'Previous publication',
};
const formatDate = (date: string) =>
  new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Comparison({ current, selected }: { current: Draft; selected: Draft }) {
  const currentBlocks = new Map(current.document.content.map((block) => [block.props.id, block]));
  const selectedBlocks = new Map(selected.document.content.map((block) => [block.props.id, block]));
  const added = selected.document.content.filter((block) => !currentBlocks.has(block.props.id));
  const removed = current.document.content.filter((block) => !selectedBlocks.has(block.props.id));
  const changed = selected.document.content.filter(
    (block) =>
      currentBlocks.has(block.props.id) &&
      contentSignature(block) !== contentSignature(currentBlocks.get(block.props.id)),
  );
  const currentOrder = current.document.content
    .filter((block) => selectedBlocks.has(block.props.id))
    .map((block) => block.props.id);
  const selectedOrder = selected.document.content
    .filter((block) => currentBlocks.has(block.props.id))
    .map((block) => block.props.id);
  const moved = contentSignature(currentOrder) !== contentSignature(selectedOrder);
  return (
    <section aria-labelledby="revision-comparison-heading" className="revision-comparison">
      <h3 id="revision-comparison-heading">Compared with your saved draft</h3>
      <p className="revision-help">Restoring this version would make these changes.</p>
      <div className="revision-table-wrap">
        <table>
          <caption className="sr-only">Saved draft and selected version details</caption>
          <thead>
            <tr>
              <th scope="col">Detail</th>
              <th scope="col">Saved draft</th>
              <th scope="col">Selected version</th>
            </tr>
          </thead>
          <tbody>
            {(['title', 'slug', 'description'] as const).map((field) => (
              <tr key={field}>
                <th scope="row">
                  {field === 'slug'
                    ? 'Address'
                    : field === 'description'
                      ? 'Search description'
                      : 'Title'}
                </th>
                <td>{current[field] || '—'}</td>
                <td>
                  {selected[field] || '—'}
                  {current[field] !== selected[field] && (
                    <span className="revision-changed">Changed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="revision-block-summary">
        {added.length} blocks added · {removed.length} removed · {changed.length} changed
        {moved ? ' · Order changed' : ''}
      </p>
      <p className="revision-help">
        Open the private preview to inspect the full page, including text and images. Site
        appearance and menus use your current settings.
      </p>
    </section>
  );
}

export default function RevisionHistory({
  entry,
  dirty,
  siteUrl,
  onClose,
  onRestore,
}: {
  entry: ContentView;
  dirty: boolean;
  siteUrl: string;
  onClose: () => void;
  onRestore: (id: number, slug: string) => Promise<void>;
}) {
  const [list, setList] = useState<RevisionList | null>(null),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null),
    [version, setVersion] = useState<ContentRevision | null>(null);
  const [loading, setLoading] = useState(true),
    [loadingVersion, setLoadingVersion] = useState(false);
  const [error, setError] = useState(''),
    [restoreSlug, setRestoreSlug] = useState(''),
    [restoring, setRestoring] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setList(null);
    setVersion(null);
    setSelectedId(null);
    api<RevisionList>(`/content/${entry.id}/revisions?limit=10&offset=${offset}`)
      .then((data) => {
        if (!active) return;
        if (offset && offset >= data.total) {
          setOffset(Math.max(0, offset - 10));
          return;
        }
        setList(data);
        setSelectedId(data.items[0]?.id ?? null);
      })
      .catch((error) => {
        if (active) setError(message(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entry.id, offset, refresh]);
  useEffect(() => {
    if (selectedId === null) {
      setLoadingVersion(false);
      return;
    }
    let active = true;
    setLoadingVersion(true);
    setVersion(null);
    setError('');
    api<ContentRevision>(`/content/${entry.id}/revisions/${selectedId}`)
      .then((data) => {
        if (active) {
          setVersion(data);
          setRestoreSlug(data.snapshot.slug);
        }
      })
      .catch((error) => {
        if (active) setError(message(error));
      })
      .finally(() => {
        if (active) setLoadingVersion(false);
      });
    return () => {
      active = false;
    };
  }, [entry.id, selectedId]);
  async function restore() {
    if (!version || dirty || lock.current) return;
    if (
      !confirm(
        'Replace your saved draft with this version? Your current saved draft will remain in history. Publish separately when you want visitors to see it.',
      )
    )
      return;
    lock.current = true;
    setRestoring(true);
    setError('');
    try {
      await onRestore(version.id, restoreSlug);
    } catch (error) {
      setError(message(error));
    } finally {
      lock.current = false;
      setRestoring(false);
    }
  }
  const current: Draft = {
    title: entry.title,
    slug: entry.slug,
    description: entry.description,
    document: entry.document,
  };
  return (
    <Dialog
      title="Version history"
      onClose={() => {
        if (!lock.current) onClose();
      }}
    >
      <div className="revision-history">
        <div className="revision-intro">
          <Clock3 size={19} />
          <div>
            <strong>A way back to your words.</strong>
            <p>
              Keep your latest {list?.retainedLimit || 30} versions, plus your current publication
              if older. Restoring creates a private draft.
            </p>
          </div>
        </div>
        {dirty && (
          <p className="revision-warning" role="status">
            You have unsaved edits. Close history and save them before restoring a version.
          </p>
        )}
        {error && (
          <div className="error-notice" role="alert">
            {error}
          </div>
        )}
        <div className="revision-toolbar">
          <span>{list?.total ?? '…'} saved versions</span>
          <button
            className="button compact"
            disabled={restoring || loading || loadingVersion}
            onClick={() => setRefresh((v) => v + 1)}
          >
            Refresh history
          </button>
        </div>
        <fieldset disabled={restoring} className="revision-layout">
          <legend className="sr-only">Saved versions and restoration</legend>
          <aside className="revision-timeline" aria-label="Saved versions">
            {loading ? (
              <p role="status">Loading history…</p>
            ) : (
              <>
                <ol>
                  {list?.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-label={`View version ${item.id}: ${item.title}`}
                        aria-pressed={selectedId === item.id}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="revision-event">{labels[item.event]}</span>
                        <strong>{item.title}</strong>
                        <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                        <small>
                          Version {item.id}
                          {item.isCurrentPublication ? ' · On your website' : ''}
                        </small>
                      </button>
                    </li>
                  ))}
                </ol>
                {!list?.items.length && <p>No retained versions.</p>}
                <nav className="revision-pagination" aria-label="History pages">
                  <button
                    className="icon-button"
                    aria-label="Newer versions"
                    disabled={!offset}
                    onClick={() => setOffset((v) => Math.max(0, v - 10))}
                  >
                    <ChevronLeft size={19} />
                  </button>
                  <span>
                    {list?.total
                      ? `${offset + 1}–${offset + list.items.length} of ${list.total}`
                      : '0 versions'}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Older versions"
                    disabled={offset + 10 >= (list?.total || 0)}
                    onClick={() => setOffset((v) => v + 10)}
                  >
                    <ChevronRight size={19} />
                  </button>
                </nav>
              </>
            )}
          </aside>
          <div className="revision-detail" aria-busy={loadingVersion}>
            {loadingVersion ? (
              <p role="status">Opening saved version…</p>
            ) : (
              version && (
                <>
                  <div className="revision-detail-heading">
                    <div>
                      <span className="eyebrow">VERSION {version.id}</span>
                      <h3>{labels[version.event]}</h3>
                      <p>{formatDate(version.createdAt)}</p>
                    </div>
                    <a
                      className="button compact"
                      href={`${siteUrl}/api/content/${entry.id}/revisions/${version.id}/preview`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview version
                      <ArrowUpRight size={14} />
                    </a>
                  </div>
                  {version.restoredFrom !== null && (
                    <p className="revision-help">
                      Restored from version {version.restoredFrom}. Older source versions may have
                      expired.
                    </p>
                  )}
                  <Comparison current={current} selected={version.snapshot} />
                  <form
                    className="revision-restore"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void restore();
                    }}
                  >
                    <label htmlFor="revision-restore-address">Restore address</label>
                    <input
                      id="revision-restore-address"
                      value={restoreSlug}
                      maxLength={100}
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      aria-describedby="revision-address-help"
                      onChange={(event) => setRestoreSlug(event.target.value)}
                    />
                    <p id="revision-address-help" className="revision-help">
                      Use a different address if another page or post of the same kind has claimed
                      this one.
                    </p>
                    <button type="submit" className="button primary" disabled={dirty || restoring}>
                      <RotateCcw size={16} />
                      {restoring ? 'Restoring…' : 'Restore as draft'}
                    </button>
                    <p className="revision-help">
                      Your public website changes only after you publish.
                    </p>
                  </form>
                </>
              )
            )}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
