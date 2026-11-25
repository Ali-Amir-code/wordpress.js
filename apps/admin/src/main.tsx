import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileText,
  Globe,
  Images,
  LayoutDashboard,
  Leaf,
  LogOut,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type { ContentEntry, ContentKind, SiteSettings } from '@wordpressjs/core';
import { api, message, navigation } from './api';
import './styles.css';

const Editor = lazy(() => import('./editor'));
const MediaLibrary = lazy(() => import('./media'));
type User = { id: number; name: string; email: string };
type Overview = {
  settings: SiteSettings;
  revision: number;
  siteUrl: string;
  stats: { total: number; pages: number; posts: number; published: number; drafts: number };
};
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || 'overview');
  useEffect(() => {
    let previousHash = location.hash;
    const update = () => {
      if (navigation.confirmLeave && !navigation.confirmLeave()) {
        history.replaceState(null, '', previousHash || '#overview');
        return;
      }
      previousHash = location.hash;
      setRoute(location.hash.slice(1) || 'overview');
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div className="error-notice" role="alert">
      {error}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <Leaf size={22} />
      <span>Opening your workspace…</span>
    </div>
  );
}
function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        w<span>.</span>
      </span>
      <span>
        WordPress<span className="brand-js">JS</span>
      </span>
    </div>
  );
}
function Auth({ setup, onAuth }: { setup: boolean; onAuth: (user: User) => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api<{ user: User }>(setup ? '/setup' : '/auth/login', {
        method: 'POST',
        body: values,
      });
      onAuth(result.user);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">A LITTLE IDEA. A WORLD OF POSSIBILITY.</span>
          <h1>
            Your space.
            <br />
            Your story.
            <br />
            <em>Your website.</em>
          </h1>
          <p>A home for what you do. An open canvas for what comes next. Let’s bring it to life.</p>
          <div className="auth-art" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
        </div>
        <span className="auth-note">Open source. Made to be yours.</span>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <span className="pill">
            <Leaf size={14} />
            {setup ? 'A fresh beginning' : 'Your creative space'}
          </span>
          <h2>{setup ? 'Make yourself at home.' : 'Welcome back.'}</h2>
          <p>
            {setup
              ? 'A few details, and your next chapter is ready to begin.'
              : 'Sign in to pick up where you left off.'}
          </p>
          <ErrorNotice error={error} />
          {setup && (
            <>
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  placeholder="Alex Morgan"
                />
              </label>
              <label>
                Website name
                <input name="siteTitle" required maxLength={100} placeholder="The little studio" />
              </label>
            </>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={setup ? 'new-password' : 'current-password'}
              required
              minLength={12}
              maxLength={128}
              placeholder={setup ? 'At least 12 characters' : 'Your password'}
            />
          </label>
          {setup && (
            <label>
              Installation key
              <input
                name="token"
                type="password"
                autoComplete="off"
                required
                minLength={32}
                maxLength={256}
              />
              <small>
                Find this in <code>data/setup-token.txt</code> on your server, or use your
                configured SETUP_TOKEN.
              </small>
            </label>
          )}
          <button className="button primary auth-submit" disabled={busy}>
            {busy ? 'One moment…' : setup ? 'Create my website' : 'Sign in'}
            <ArrowRight size={17} />
          </button>
          <p className="auth-bottom">WordPressJS · Pre-alpha · Self-hosted</p>
        </form>
      </section>
    </main>
  );
}
function App() {
  const route = useRoute();
  const [user, setUser] = useState<User | null>(null),
    [setup, setSetup] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await api<{ needsSetup: boolean }>('/setup/status');
        if (!active) return;
        setSetup(status.needsSetup);
        if (!status.needsSetup) {
          const response = await fetch('/api/auth/me');
          if (response.ok) {
            const data = await response.json();
            if (active) setUser(data.user);
          } else if (response.status !== 401)
            throw new Error('The server is unavailable. Reload to try again.');
        }
      } catch (error) {
        if (active) setError(message(error));
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    api<Overview>('/overview')
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [user, route]);
  if (!ready) return <Loading />;
  if (!user)
    return (
      <>
        <ErrorNotice error={error} />
        <Auth
          setup={setup}
          onAuth={(next) => {
            setUser(next);
            setSetup(false);
            location.hash = 'overview';
          }}
        />
      </>
    );
  if (route.startsWith('edit/'))
    return (
      <Suspense fallback={<Loading />}>
        <Editor id={route.slice(5)} siteUrl={overview?.siteUrl || location.origin} />
      </Suspense>
    );
  const active = ['pages', 'posts', 'media', 'settings'].includes(route) ? route : 'overview';
  const nav = [
    { route: 'overview', label: 'Overview', icon: LayoutDashboard },
    { route: 'pages', label: 'Pages', icon: FileText },
    { route: 'posts', label: 'Posts', icon: BookOpen },
    { route: 'media', label: 'Media', icon: Images },
    { route: 'settings', label: 'Site settings', icon: Settings2 },
  ];
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
      setUser(null);
      setOverview(null);
    } catch (error) {
      setError(message(error));
    }
  }
  return (
    <div className="app-shell">
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <Logo />
        <a className="site-switch" href="#overview">
          <span className="site-avatar">
            <Leaf size={19} />
          </span>
          <span>
            <strong>{overview?.settings.title || 'Your website'}</strong>
            <small>Your workspace</small>
          </span>
          <span className="online-dot" />
        </a>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Workspace">
          {nav.map((item) => (
            <a
              key={item.route}
              href={`#${item.route}`}
              className={active === item.route ? 'active' : ''}
              aria-current={active === item.route ? 'page' : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.route === 'pages' && <small>{overview?.stats.pages ?? '–'}</small>}
              {item.route === 'posts' && <small>{overview?.stats.posts ?? '–'}</small>}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="community-card">
            <span className="community-icon">
              <Sparkles size={18} />
            </span>
            <strong>Built together.</strong>
            <p>A little contribution can make a big difference.</p>
            <a
              href="https://github.com/Ali-Amir-code/wordpress.js"
              target="_blank"
              rel="noreferrer"
            >
              Explore the project <ArrowUpRight size={15} />
            </a>
          </div>
          <a
            className="help-link"
            href="https://github.com/Ali-Amir-code/wordpress.js#readme"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={17} />
            Documentation
            <ArrowUpRight size={14} />
          </a>
          <div className="user-row">
            <span className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{user.name}</strong>
              <small>Site owner</small>
            </span>
            <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="crumb-divider">/</span>
            <span>{nav.find((item) => item.route === active)?.label}</span>
          </div>
          <div className="topbar-actions">
            <span className="version-badge">PRE-ALPHA</span>
            <a
              className="button compact"
              href={overview?.siteUrl || '/'}
              target="_blank"
              rel="noreferrer"
            >
              <Globe size={15} />
              View website
              <ArrowUpRight size={14} />
            </a>
            <button className="icon-button mobile-signout" aria-label="Sign out" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="main-content">
          <ErrorNotice error={error} />
          {active === 'overview' ? (
            <Dashboard user={user} overview={overview} />
          ) : active === 'media' ? (
            <Suspense fallback={<Loading />}>
              <MediaLibrary />
            </Suspense>
          ) : active === 'settings' ? (
            <Settings
              onSaved={(settings) => setOverview((prev) => (prev ? { ...prev, settings } : prev))}
            />
          ) : (
            <ContentList key={active} kind={active === 'posts' ? 'post' : 'page'} />
          )}
        </main>
        <footer className="workspace-footer">
          <span>A home for your ideas.</span>
          <span>
            WordPressJS <span className="footer-dot">•</span> Open source, always.
          </span>
        </footer>
      </div>
    </div>
  );
}
function Dashboard({ user, overview }: { user: User; overview: Overview | null }) {
  const [entries, setEntries] = useState<ContentEntry[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    api<{ items: ContentEntry[] }>('/content?limit=5')
      .then((data) => setEntries(data.items))
      .catch((error) => setError(message(error)));
  }, []);
  const home = entries.find((item) => item.kind === 'page' && item.slug === 'home');
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR WEBSITE, AT A GLANCE</span>
          <h1>
            Hello, {user.name.split(' ')[0]}
            <span className="greeting-dot">.</span>
          </h1>
          <p>Here’s a little space to make something great.</p>
        </div>
        <a className="button primary" href="#pages">
          <Plus size={17} />
          Create a page
        </a>
      </div>
      <ErrorNotice error={error} />
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="pill">
            <span className="online-dot" />
            YOURS TO CREATE
          </span>
          <h2>
            Big ideas.
            <br />
            Beautiful beginnings.
          </h2>
          <p>
            Your next chapter starts with a page.
            <br />
            Make it something that feels like you.
          </p>
          <a className="button primary" href={home ? `#edit/${home.id}` : '#pages'}>
            Open the editor
            <ArrowRight size={16} />
          </a>
        </div>
        <div className="canvas-art" aria-hidden="true">
          <div className="art-note">a little room to grow ↗</div>
          <div className="mini-browser">
            <div className="mini-bar">
              <i />
              <i />
              <i />
              <span>your next chapter</span>
            </div>
            <div className="mini-content">
              <span className="mini-brand">the little studio.</span>
              <span className="mini-menu">About &nbsp; Journal &nbsp; Contact</span>
              <div className="mini-hero">
                <div>
                  <small>THOUGHTFULLY MADE</small>
                  <b>
                    Good things
                    <br />
                    start here.
                  </b>
                  <span className="mini-button">Explore our story ↗</span>
                </div>
                <div className="art-plant">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="mini-bottom">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">✳</span>
        </div>
      </section>
      <div className="stat-grid">
        {[
          {
            label: 'Total pages',
            value: overview?.stats.pages,
            icon: FileText,
            note: 'Space for your story',
          },
          {
            label: 'Blog posts',
            value: overview?.stats.posts,
            icon: BookOpen,
            note: 'Ideas worth sharing',
          },
          {
            label: 'Published',
            value: overview?.stats.published,
            icon: Globe,
            note: 'Out in the world',
          },
          {
            label: 'Drafts',
            value: overview?.stats.drafts,
            icon: Leaf,
            note: 'Good things in progress',
          },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div>
              <span>{stat.label}</span>
              <stat.icon size={17} />
            </div>
            <strong>{stat.value ?? '–'}</strong>
            <small>{stat.note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>Pick up where you left off</h2>
              <p>Your most recently updated content.</p>
            </div>
            <a className="text-link" href="#pages">
              All pages
              <ArrowRight size={14} />
            </a>
          </div>
          {entries.length ? (
            <div className="recent-list">
              {entries.map((item) => (
                <a href={`#edit/${item.id}`} className="recent-item" key={item.id}>
                  <span className="content-icon">
                    {item.kind === 'post' ? <BookOpen size={19} /> : <FileText size={19} />}
                  </span>
                  <span className="recent-name">
                    <strong>{item.title}</strong>
                    <small>
                      {item.kind === 'post' ? 'Blog post' : 'Page'} · {formatDate(item.updatedAt)}
                    </small>
                  </span>
                  <Status entry={item} />
                  <ChevronRight size={16} />
                </a>
              ))}
            </div>
          ) : (
            <p className="empty-small">Your first page is waiting to be created.</p>
          )}
        </section>
        <section className="panel checklist-panel">
          <span className="eyebrow">SMALL STEPS, GREAT START</span>
          <h2>Make it your own.</h2>
          <p>Three steps to your first hello.</p>
          {[
            {
              title: 'Set up your space',
              done: true,
              href: '#settings',
              text: 'Your website has a name.',
            },
            {
              title: 'Shape your first page',
              done: (home?.revision || 1) > 1,
              href: home ? `#edit/${home.id}` : '#pages',
              text: 'A few words. A little personality.',
            },
            {
              title: 'Share it with the world',
              done: (overview?.stats.published || 0) > 0,
              href: home ? `#edit/${home.id}` : '#pages',
              text: 'Publish when it feels right.',
            },
          ].map((item, i) => (
            <a href={item.href} className="checklist-item" key={item.title}>
              <span className={item.done ? 'step done' : 'step'}>
                {item.done ? <Check size={14} /> : i + 1}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
            </a>
          ))}
        </section>
      </div>
    </>
  );
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function Status({ entry }: { entry: ContentEntry }) {
  return (
    <span className={`status ${entry.published ? 'published' : 'draft'}`}>
      <span />
      {entry.published ? 'Published' : 'Draft'}
    </span>
  );
}
function ContentList({ kind }: { kind: ContentKind }) {
  const [items, setItems] = useState<ContentEntry[]>([]),
    [total, setTotal] = useState(0),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [offset, setOffset] = useState(0),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api<{ items: ContentEntry[]; total: number }>(
        `/content?kind=${kind}&q=${encodeURIComponent(query)}${status ? `&status=${status}` : ''}&offset=${offset}`,
      )
        .then((data) => {
          if (active) {
            setItems(data.items);
            setTotal(data.total);
            setError('');
          }
        })
        .catch((error) => {
          if (active) setError(message(error));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, query, status, offset]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {kind === 'page' ? 'MAKE YOURSELF AT HOME' : 'IDEAS WORTH SHARING'}
          </span>
          <h1>{kind === 'page' ? 'Your pages.' : 'Your journal.'}</h1>
          <p>
            {kind === 'page'
              ? 'The building blocks of your little corner of the internet.'
              : 'Stories, updates, and a little of what makes you, you.'}
          </p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={17} />
          New {kind}
        </button>
      </div>
      <ErrorNotice error={error} />
      <section className="panel">
        <div className="list-toolbar">
          <div className="filter-tabs" role="group" aria-label="Publication filter">
            {[
              { value: '', label: 'All content' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Drafts' },
            ].map((tab) => (
              <button
                key={tab.value}
                className={status === tab.value ? 'selected' : ''}
                aria-pressed={status === tab.value}
                onClick={() => {
                  setStatus(tab.value);
                  setOffset(0);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search content"
              placeholder={`Search ${kind}s…`}
              value={query}
              maxLength={100}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
            />
          </label>
        </div>
        {loading ? (
          <Loading />
        ) : items.length ? (
          <div className="table-scroll">
            <table className="content-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th>
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <a href={`#edit/${item.id}`} className="table-title">
                        <span className="content-icon">
                          <FileText size={19} />
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            /{kind === 'post' ? 'blog/' : ''}
                            {item.slug === 'home' && kind === 'page' ? '' : item.slug}
                          </small>
                        </span>
                      </a>
                    </td>
                    <td>
                      <Status entry={item} />
                    </td>
                    <td className="muted">{formatDate(item.updatedAt)}</td>
                    <td>
                      <a
                        href={`#edit/${item.id}`}
                        className="text-link"
                        aria-label={`Edit ${item.title}`}
                      >
                        Edit
                        <ArrowUpRight size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Leaf size={32} />
            <h2>
              {query || status ? 'Nothing here just yet.' : `Your first ${kind} starts here.`}
            </h2>
            <p>
              {query || status
                ? 'Try a different search or publication filter.'
                : 'Give your ideas a place to grow.'}
            </p>
            {!query && !status && (
              <button className="button primary" onClick={() => setCreating(true)}>
                <Plus size={16} />
                Create a {kind}
              </button>
            )}
          </div>
        )}
        <div className="list-footer">
          <span>
            {total ? `${offset + 1}–${Math.min(offset + 20, total)} of ${total}` : '0'} {kind}
            {total === 1 ? '' : 's'}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={!offset || loading}
              onClick={() => setOffset(offset - 20)}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={offset + 20 >= total || loading}
              onClick={() => setOffset(offset + 20)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
      {creating && <CreateContent kind={kind} onClose={() => setCreating(false)} />}
    </>
  );
}
function CreateContent({ kind, onClose }: { kind: ContentKind; onClose: () => void }) {
  const [title, setTitle] = useState(''),
    [slug, setSlug] = useState(''),
    [slugEdited, setSlugEdited] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<ContentEntry>('/content', {
        method: 'POST',
        body: {
          kind,
          title,
          slug,
          template: new FormData(event.currentTarget).get('template') || 'blank',
        },
      });
      location.hash = `edit/${data.id}`;
    } catch (error) {
      setError(message(error));
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
      className="create-dialog"
      aria-labelledby="create-title"
    >
      <form onSubmit={submit}>
        <span className="pill">
          <Plus size={14} />A new beginning
        </span>
        <h2 id="create-title">Create a {kind}.</h2>
        <p>A name, a place, and a little possibility.</p>
        <ErrorNotice error={error} />
        <label>
          Title
          <input
            required
            autoFocus
            maxLength={160}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (!slugEdited)
                setSlug(
                  event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 100),
                );
            }}
            placeholder={kind === 'page' ? 'About us' : 'Our first chapter'}
          />
        </label>
        <label>
          URL slug
          <input
            required
            maxLength={100}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
          />
          <small>
            /{kind === 'post' ? 'blog/' : ''}
            {slug || 'your-address'}
          </small>
        </label>
        {kind === 'page' && (
          <label>
            Starting point
            <select name="template">
              <option value="blank">Blank canvas</option>
              <option value="starter">Small business starter</option>
            </select>
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Creating…' : `Create ${kind}`}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
function Settings({ onSaved }: { onSaved: (settings: SiteSettings) => void }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    api<{ settings: SiteSettings; revision: number }>('/settings')
      .then((data) => {
        setSettings(data.settings);
        setRevision(data.revision);
      })
      .catch((error) => setError(message(error)));
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const data = await api<{ settings: SiteSettings; revision: number }>('/settings', {
        method: 'PUT',
        body: { settings, revision },
      });
      setRevision(data.revision);
      onSaved(data.settings);
      setSaved(true);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  const change = (key: keyof SiteSettings, value: string) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE LITTLE DETAILS</span>
          <h1>Make it yours.</h1>
          <p>A name, a personality, and a place in the world.</p>
        </div>
      </div>
      <ErrorNotice error={error} />
      {settings && (
        <form onSubmit={submit} className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Site identity</h2>
              <p>These details appear across your public website as soon as you save.</p>
            </div>
          </div>
          <div className="settings-fields">
            <label>
              Website name
              <input
                required
                maxLength={100}
                value={settings.title}
                onChange={(event) => change('title', event.target.value)}
              />
            </label>
            <label>
              Site description
              <textarea
                rows={3}
                maxLength={320}
                value={settings.description}
                onChange={(event) => change('description', event.target.value)}
              />
              <small>A short introduction for visitors and search engines.</small>
            </label>
            <label>
              Language code
              <input
                required
                pattern="[a-z]{2,3}(-[A-Za-z]{2,4})?"
                value={settings.language}
                onChange={(event) => change('language', event.target.value)}
              />
              <small>
                For example, en, en-US, or ur. Sets the public page language; this does not
                translate content.
              </small>
            </label>
            <fieldset>
              <legend>Accent palette</legend>
              <div className="palette-options">
                {[
                  { id: 'forest', label: 'Forest', color: '#244d3c' },
                  { id: 'ocean', label: 'Ocean', color: '#21536a' },
                  { id: 'violet', label: 'Violet', color: '#594472' },
                ].map((item) => (
                  <label
                    key={item.id}
                    className={settings.accent === item.id ? 'palette selected' : 'palette'}
                  >
                    <input
                      type="radio"
                      name="accent"
                      value={item.id}
                      checked={settings.accent === item.id}
                      onChange={() => change('accent', item.id)}
                    />
                    <span style={{ background: item.color }} />
                    {item.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="settings-actions">
              <button className="button primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save settings'}
                <Check size={16} />
              </button>
              {saved && (
                <span role="status" className="success-message">
                  Settings saved.
                </span>
              )}
            </div>
          </div>
        </form>
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
