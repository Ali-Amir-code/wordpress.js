import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { DocumentView } from '@wordpressjs/blocks';
import { contentPath, type ContentKind, type Draft, type SiteSettings } from '@wordpressjs/core';
import type { Repository } from './repository';

const accents = {
  forest: ['#244d3c', '#edf1e9'],
  ocean: ['#21536a', '#eaf2f5'],
  violet: ['#594472', '#f1edf6'],
} as const;
export function renderSite(
  repo: Repository,
  siteUrl: string,
  options: {
    title: string;
    description?: string;
    path: string;
    children: ReactNode;
    preview?: boolean;
    noindex?: boolean;
    type?: 'article' | 'website';
  },
) {
  const { settings } = repo.settings();
  const [accent, tint] = accents[settings.accent];
  const pages = repo.publicContent('page').slice(0, 6);
  return (
    '<!doctype html>' +
    renderToStaticMarkup(
      <html lang={settings.language}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{`${options.title} · ${settings.title}`}</title>
          <meta name="description" content={options.description || settings.description} />
          <meta property="og:title" content={options.title} />
          <meta property="og:description" content={options.description || settings.description} />
          <meta property="og:type" content={options.type || 'website'} />
          <meta property="og:site_name" content={settings.title} />
          {!options.preview && !options.noindex && (
            <>
              <link rel="canonical" href={`${siteUrl}${options.path}`} />
              <meta property="og:url" content={`${siteUrl}${options.path}`} />
            </>
          )}
          {(options.preview || options.noindex) && (
            <meta name="robots" content="noindex, nofollow" />
          )}
          <link rel="stylesheet" href="/site.css" />
        </head>
        <body
          className="site"
          style={{ '--site-accent': accent, '--site-tint': tint } as React.CSSProperties}
        >
          <a className="site-skip" href="#main-content">
            Skip to content
          </a>
          {options.preview && (
            <div className="site-preview-banner">
              Private draft preview · Only visible while you are signed in
            </div>
          )}
          <header className="site-header site-wrap">
            <a className="site-brand" href="/">
              {settings.title}
              <span aria-hidden="true">.</span>
            </a>
            <nav aria-label="Main navigation">
              {pages.map((page) => (
                <a key={page.id} href={contentPath('page', page.slug)}>
                  {page.title}
                </a>
              ))}
              <a href="/blog">Journal</a>
            </nav>
          </header>
          <main id="main-content">{options.children}</main>
          <footer className="site-footer site-wrap">
            <span>
              © {new Date().getUTCFullYear()} {settings.title}
            </span>
            <span>Made with WordPressJS</span>
          </footer>
        </body>
      </html>,
    )
  );
}
export function renderDocument(
  repo: Repository,
  siteUrl: string,
  draft: Draft,
  kind: ContentKind,
  preview = false,
) {
  return renderSite(repo, siteUrl, {
    title: draft.title,
    description: draft.description,
    path: contentPath(kind, draft.slug),
    preview,
    type: kind === 'post' ? 'article' : 'website',
    children: (
      <>
        {kind === 'post' && (
          <div className="site-wrap site-blog-heading">
            <p className="site-eyebrow">THE JOURNAL</p>
            <h1>{draft.title}</h1>
          </div>
        )}
        <DocumentView document={draft.document} />
      </>
    ),
  });
}
export function renderBlog(repo: Repository, siteUrl: string) {
  const posts = repo.publicContent('post');
  return renderSite(repo, siteUrl, {
    title: 'Journal',
    path: '/blog',
    children: (
      <div className="site-wrap">
        <div className="site-section">
          <p className="site-eyebrow">NOTES, IDEAS & UPDATES</p>
          <h1>Our journal.</h1>
          <p>A space for the things we want to share.</p>
        </div>
        <div className="site-post-list">
          {posts.length ? (
            posts.map((post) => (
              <a className="site-post-card" key={post.id} href={contentPath('post', post.slug)}>
                <time className="site-date" dateTime={post.publishedAt}>
                  {new Date(post.publishedAt).toLocaleDateString('en', {
                    timeZone: 'UTC',
                    dateStyle: 'medium',
                  })}
                </time>
                <h2>{post.title}</h2>
                <p>{post.description}</p>
                <span>
                  Read story <span aria-hidden="true">↗</span>
                </span>
              </a>
            ))
          ) : (
            <p>No stories yet. Check back soon.</p>
          )}
        </div>
      </div>
    ),
  });
}
export function renderNotice(repo: Repository, siteUrl: string, title: string, message: string) {
  return renderSite(repo, siteUrl, {
    title,
    path: '/',
    noindex: true,
    children: (
      <div className="site-notice site-wrap">
        <p className="site-eyebrow">WORDPRESSJS</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <a href="/">Return home</a>
      </div>
    ),
  });
}
export function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
}
