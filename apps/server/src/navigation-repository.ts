import type { DatabaseSync } from 'node:sqlite';
import {
  contentPath,
  type ContentEntry,
  type ContentKind,
  type Draft,
  type NavigationDocument,
  type NavigationState,
  type NavigationTarget,
  type ResolvedLink,
} from '@wordpressjs/core';
import { AppError } from './repository';

type NavigationRow = {
  draft: string;
  published: string;
  revision: number;
  published_at: string | null;
};
export type PublishedEntry = Draft & { id: string; kind: ContentKind; publishedAt: string };
export class NavigationRepository {
  constructor(
    private db: DatabaseSync,
    private transaction: <T>(fn: () => T) => T,
  ) {}
  private row() {
    return this.db.prepare('SELECT * FROM navigation WHERE id = 1').get() as NavigationRow;
  }
  snapshot(stage: 'draft' | 'published' = 'published'): NavigationDocument {
    return JSON.parse(this.row()[stage]);
  }
  state(): NavigationState {
    const row = this.row();
    const draft: NavigationDocument = JSON.parse(row.draft),
      published: NavigationDocument = JSON.parse(row.published);
    const ids = new Set<string>();
    for (const document of [draft, published]) {
      if (document.homepageId) ids.add(document.homepageId);
      for (const item of [...document.header.items, ...document.footer.items])
        if (item.type === 'content') ids.add(item.contentId);
    }
    return {
      draft,
      published,
      revision: row.revision,
      publishedAt: row.published_at,
      references: [...ids]
        .map((id) => this.target(id))
        .filter((item): item is NavigationTarget => !!item),
    };
  }
  pathFor(content: { id: string; kind: ContentKind; slug: string }, config = this.snapshot()) {
    return contentPath(
      content.kind,
      content.slug,
      config.homepageId === null ? undefined : content.id === config.homepageId,
    );
  }
  present(entry: ContentEntry) {
    const config = this.snapshot();
    return {
      ...entry,
      homepageId: config.homepageId,
      publicPath: entry.published
        ? this.pathFor({ ...entry, slug: entry.published.slug }, config)
        : null,
    };
  }
  publishedEntry(id: string): PublishedEntry | null {
    const row = this.db
      .prepare(
        'SELECT id, kind, published, published_at FROM content WHERE id = ? AND published IS NOT NULL',
      )
      .get(id) as
      { id: string; kind: ContentKind; published: string; published_at: string } | undefined;
    return row
      ? { ...JSON.parse(row.published), id: row.id, kind: row.kind, publishedAt: row.published_at }
      : null;
  }
  homepage(config = this.snapshot()): PublishedEntry | null {
    const id =
      config.homepageId ||
      (
        this.db
          .prepare(
            "SELECT id FROM content WHERE kind = 'page' AND json_extract(published, '$.slug') = 'home'",
          )
          .get() as { id: string } | undefined
      )?.id;
    return id ? this.publishedEntry(id) : null;
  }
  editorHomepageId() {
    return (
      this.snapshot().homepageId ||
      this.homepage()?.id ||
      (
        this.db
          .prepare(
            "SELECT id FROM content WHERE kind = 'page' AND json_extract(draft, '$.slug') = 'home'",
          )
          .get() as { id: string } | undefined
      )?.id ||
      null
    );
  }
  target(id: string): NavigationTarget | null {
    const row = this.db
      .prepare(
        "SELECT id, kind, coalesce(json_extract(published, '$.title'), json_extract(draft, '$.title')) AS title, json_extract(published, '$.slug') AS slug FROM content WHERE id = ?",
      )
      .get(id) as { id: string; kind: ContentKind; title: string; slug: string | null } | undefined;
    return row
      ? {
          id: row.id,
          kind: row.kind,
          title: row.title,
          published: row.slug !== null,
          path: row.slug === null ? null : this.pathFor({ ...row, slug: row.slug }),
        }
      : null;
  }
  targets(
    q: string,
    kind: ContentKind | undefined,
    publishedOnly: boolean,
    limit: number,
    offset: number,
  ) {
    const where =
      "WHERE (instr(lower(json_extract(draft, '$.title')), lower(?)) > 0 OR instr(lower(json_extract(published, '$.title')), lower(?)) > 0)" +
      (kind ? ' AND kind = ?' : '') +
      (publishedOnly ? ' AND published IS NOT NULL' : '');
    const params = kind ? [q, q, kind] : [q, q];
    const total = (
      this.db.prepare(`SELECT count(*) AS total FROM content ${where}`).get(...params) as {
        total: number;
      }
    ).total;
    const ids = this.db
      .prepare(`SELECT id FROM content ${where} ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as { id: string }[];
    return { items: ids.map(({ id }) => this.target(id)!), total };
  }
  private validate(document: NavigationDocument, publishing: boolean) {
    if (document.homepageId) {
      const home = this.target(document.homepageId);
      if (!home || home.kind !== 'page')
        throw new AppError(400, 'Choose an existing page as your homepage.');
      if (publishing && !home.published)
        throw new AppError(409, 'Publish the selected homepage before publishing navigation.');
    }
    const items = [...document.header.items, ...document.footer.items];
    for (const item of items)
      if (item.type === 'content' && !this.target(item.contentId))
        throw new AppError(400, `The page or post for “${item.label}” no longer exists.`);
    if (publishing)
      for (const item of [
        ...(document.header.mode === 'custom' ? document.header.items : []),
        ...document.footer.items,
      ]) {
        if (item.type === 'content' && !this.target(item.contentId)?.published)
          throw new AppError(
            409,
            `Publish the page or post for “${item.label}” first, or remove that menu link.`,
          );
      }
  }
  private checkRevision(revision: number) {
    const row = this.row();
    if (row.revision !== revision)
      throw new AppError(
        409,
        'Navigation changed in another window. Your local edits have not been saved. Reload before trying again.',
      );
    return row;
  }
  save(document: NavigationDocument, revision: number) {
    return this.transaction(() => {
      this.checkRevision(revision);
      this.validate(document, false);
      this.db
        .prepare('UPDATE navigation SET draft = ?, revision = revision + 1 WHERE id = 1')
        .run(JSON.stringify(document));
      return this.state();
    });
  }
  publish(revision: number) {
    return this.transaction(() => {
      const row = this.checkRevision(revision);
      this.validate(JSON.parse(row.draft), true);
      this.db
        .prepare(
          'UPDATE navigation SET published = draft, published_at = ?, revision = revision + 1 WHERE id = 1',
        )
        .run(new Date().toISOString());
      return this.state();
    });
  }
  assertCanUnpublish(id: string) {
    if (this.snapshot().homepageId === id)
      throw new AppError(
        409,
        'This page is your homepage. Publish another homepage choice in Navigation before unpublishing it.',
      );
  }
  resolve(config = this.snapshot()) {
    const resolveItems = (items: NavigationDocument['footer']['items']): ResolvedLink[] =>
      items.flatMap((item) => {
        if (item.type === 'url') return [{ id: item.id, label: item.label, href: item.url }];
        const target = this.publishedEntry(item.contentId);
        return target
          ? [{ id: item.id, label: item.label, href: this.pathFor(target, config) }]
          : [];
      });
    const automatic = () =>
      (
        this.db
          .prepare(
            "SELECT id FROM content WHERE kind = 'page' AND published IS NOT NULL ORDER BY published_at DESC, id LIMIT 6",
          )
          .all() as { id: string }[]
      )
        .map(({ id }) => {
          const item = this.publishedEntry(id)!;
          return { id, label: item.title, href: this.pathFor(item, config) };
        })
        .concat({ id: 'journal', label: 'Journal', href: '/blog' });
    return {
      header: config.header.mode === 'auto' ? automatic() : resolveItems(config.header.items),
      footer: resolveItems(config.footer.items),
      footerText: config.footer.text,
    };
  }
  recordSlugChange(
    id: string,
    kind: ContentKind,
    previousSlug: string | undefined,
    nextSlug: string,
  ) {
    const destination = contentPath(kind, nextSlug, false);
    // An active address wins over history, including when a former slug is reclaimed.
    this.db.prepare('DELETE FROM redirects WHERE source = ?').run(destination);
    if (!previousSlug || previousSlug === nextSlug) return;
    const source = contentPath(kind, previousSlug, false);
    this.db
      .prepare(
        'INSERT INTO redirects (source, content_id, created_at) VALUES (?, ?, ?) ON CONFLICT(source) DO UPDATE SET content_id = excluded.content_id, created_at = excluded.created_at',
      )
      .run(source, id, new Date().toISOString());
  }
  redirect(source: string) {
    const row = this.db.prepare('SELECT content_id FROM redirects WHERE source = ?').get(source) as
      { content_id: string } | undefined;
    const target = row && this.publishedEntry(row.content_id);
    if (!target) return null;
    const destination = this.pathFor(target);
    return destination === source ? null : destination;
  }
}
