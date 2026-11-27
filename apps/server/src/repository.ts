import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { MediaRepository } from './media-repository';
import { NavigationRepository } from './navigation-repository';
import { RevisionRepository } from './revision-repository';
import {
  defaultSettings,
  defaultNavigation,
  type ContentEntry,
  type ContentKind,
  type Draft,
  type SiteSettings,
  type RevisionEvent,
} from '@wordpressjs/core';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
type Row = {
  id: string;
  kind: ContentKind;
  draft: string;
  published: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};
function entry(row: Row): ContentEntry {
  return {
    ...JSON.parse(row.draft),
    id: row.id,
    kind: row.kind,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    published: row.published ? JSON.parse(row.published) : null,
  };
}

export class Repository {
  readonly db: DatabaseSync;
  readonly media: MediaRepository;
  readonly navigation: NavigationRepository;
  readonly revisions: RevisionRepository;
  constructor(path: string, siteUrl = 'http://localhost:3000') {
    this.db = new DatabaseSync(path);
    this.db.exec(
      'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
    );
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version;
    if (version > 4) {
      this.db.close();
      throw new Error(
        'Database is newer than this application. Upgrade the application before opening it.',
      );
    }
    if (version === 0)
      this.transaction(() => {
        this.db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
        CREATE INDEX sessions_expiry ON sessions(expires_at);
        CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE content (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('page', 'post')), draft TEXT NOT NULL, published TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT);
        CREATE UNIQUE INDEX draft_slugs ON content(kind, json_extract(draft, '$.slug'));
        CREATE UNIQUE INDEX published_slugs ON content(kind, json_extract(published, '$.slug')) WHERE published IS NOT NULL;
        CREATE INDEX content_updated ON content(updated_at DESC);
        PRAGMA user_version = 1;
      `);
        this.db
          .prepare('INSERT INTO settings (id, value) VALUES (1, ?)')
          .run(JSON.stringify(defaultSettings));
      });
    if (version < 2)
      this.transaction(() => {
        this.db.exec(`
        CREATE TABLE media (id TEXT PRIMARY KEY, title TEXT NOT NULL, alt TEXT NOT NULL, caption TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('pending', 'active', 'deleting')));
        CREATE INDEX media_created ON media(created_at DESC);
        CREATE TABLE content_media (content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE, media_id TEXT NOT NULL REFERENCES media(id) ON DELETE RESTRICT, stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')), PRIMARY KEY (content_id, media_id, stage));
        CREATE INDEX media_usage ON content_media(media_id, stage);
        PRAGMA user_version = 2;
      `);
      });
    this.media = new MediaRepository(this.db, (fn) => this.transaction(fn), siteUrl);
    if (version < 3)
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE navigation (id INTEGER PRIMARY KEY CHECK (id = 1), draft TEXT NOT NULL, published TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, published_at TEXT);
          CREATE TABLE redirects (source TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE, created_at TEXT NOT NULL);
          CREATE INDEX redirects_target ON redirects(content_id);
          PRAGMA user_version = 3;
        `);
        const initial = JSON.stringify(defaultNavigation());
        this.db
          .prepare('INSERT INTO navigation (id, draft, published) VALUES (1, ?, ?)')
          .run(initial, initial);
      });
    this.navigation = new NavigationRepository(this.db, (fn) => this.transaction(fn));
    this.revisions = new RevisionRepository(this.db);
    if (version < 4)
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE content_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE, content_revision INTEGER NOT NULL, event TEXT NOT NULL CHECK (event IN ('created','saved','published','restored','unpublished','upgrade-draft','upgrade-publication','archived-publication')), created_at TEXT NOT NULL, snapshot TEXT NOT NULL, current_publication INTEGER NOT NULL DEFAULT 0 CHECK (current_publication IN (0,1)), restored_from INTEGER);
          CREATE INDEX revisions_content ON content_revisions(content_id, id DESC);
          CREATE UNIQUE INDEX revisions_publication ON content_revisions(content_id) WHERE current_publication = 1;
          CREATE TABLE revision_media (revision_id INTEGER NOT NULL REFERENCES content_revisions(id) ON DELETE CASCADE, media_id TEXT NOT NULL REFERENCES media(id) ON DELETE RESTRICT, PRIMARY KEY (revision_id, media_id));
          CREATE INDEX revision_media_asset ON revision_media(media_id);
        `);
        for (const row of this.db
          .prepare('SELECT * FROM content ORDER BY id')
          .iterate() as Iterable<Row>) {
          if (row.published)
            this.revisions.record(
              row.id,
              row.revision,
              JSON.parse(row.published),
              'upgrade-publication',
              { published: true, createdAt: row.published_at! },
            );
          this.revisions.record(row.id, row.revision, JSON.parse(row.draft), 'upgrade-draft', {
            createdAt: row.updated_at,
          });
        }
        this.db.exec('PRAGMA user_version = 4;');
      });
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  owner() {
    return this.db
      .prepare('SELECT id, name, email, password_hash FROM users WHERE id = 1')
      .get() as { id: number; name: string; email: string; password_hash: string } | undefined;
  }
  setup(name: string, email: string, hash: string, title: string, draft: Draft) {
    return this.transaction(() => {
      if (this.owner())
        throw new AppError(409, 'This site has already been set up. Sign in instead.');
      this.db
        .prepare('INSERT INTO users (id, name, email, password_hash) VALUES (1, ?, ?, ?)')
        .run(name, email, hash);
      this.db
        .prepare('UPDATE settings SET value = ? WHERE id = 1')
        .run(JSON.stringify({ ...defaultSettings, title }));
      return this.insertContent('page', draft);
    });
  }
  addSession(hash: string, expires: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, 1, ?)')
      .run(hash, expires);
  }
  session(hash: string) {
    return this.db
      .prepare(
        'SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?',
      )
      .get(hash, Date.now()) as { id: number; name: string; email: string } | undefined;
  }
  deleteSession(hash: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
  }
  settings(): { settings: SiteSettings; revision: number } {
    const row = this.db.prepare('SELECT value, revision FROM settings WHERE id = 1').get() as {
      value: string;
      revision: number;
    };
    return { settings: JSON.parse(row.value), revision: row.revision };
  }
  updateSettings(settings: SiteSettings, revision: number) {
    const result = this.db
      .prepare(
        'UPDATE settings SET value = ?, revision = revision + 1 WHERE id = 1 AND revision = ?',
      )
      .run(JSON.stringify(settings), revision);
    if (!result.changes)
      throw new AppError(409, 'Site settings changed elsewhere. Reload before saving.');
    return this.settings();
  }
  get(id: string): ContentEntry {
    const row = this.db.prepare('SELECT * FROM content WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new AppError(404, 'Content not found.');
    return entry(row);
  }
  create(kind: ContentKind, draft: Draft): ContentEntry {
    return this.transaction(() => this.insertContent(kind, draft));
  }
  private insertContent(kind: ContentKind, draft: Draft): ContentEntry {
    draft = this.media.validateDraft(draft);
    const id = randomUUID(),
      now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO content (id, kind, draft, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, kind, JSON.stringify(draft), now, now);
    this.media.syncReferences(id, 'draft', draft);
    this.revisions.record(id, 1, draft, 'created', { createdAt: now });
    return this.get(id);
  }
  save(id: string, draft: Draft, revision: number) {
    return this.transaction(() => this.writeDraft(id, draft, revision, 'saved'));
  }
  private writeDraft(
    id: string,
    draft: Draft,
    revision: number,
    event: RevisionEvent,
    restoredFrom?: number,
  ) {
    const current = this.get(id);
    if (current.revision !== revision)
      throw new AppError(
        409,
        'This content changed in another window. Your edits have not been saved. Reload before trying again.',
      );
    draft = this.media.validateDraft(draft);
    const result = this.db
      .prepare(
        'UPDATE content SET draft = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?',
      )
      .run(JSON.stringify(draft), new Date().toISOString(), id, revision);
    if (!result.changes)
      throw new AppError(
        409,
        'This content changed in another window. Reload before saving. Your local changes have not been saved.',
      );
    this.media.syncReferences(id, 'draft', draft);
    this.revisions.record(id, revision + 1, draft, event, { restoredFrom });
    this.revisions.prune(id);
    return this.get(id);
  }
  restore(id: string, historyId: number, revision: number, slug?: string) {
    return this.transaction(() => {
      if (this.get(id).revision !== revision)
        throw new AppError(
          409,
          'This content changed in another window. Close history and reload the editor before restoring.',
        );
      const { snapshot } = this.revisions.get(id, historyId);
      return this.writeDraft(
        id,
        { ...snapshot, ...(slug === undefined ? {} : { slug }) },
        revision,
        'restored',
        historyId,
      );
    });
  }
  publish(id: string, revision: number, published: boolean) {
    return this.transaction(() => {
      const current = this.get(id);
      if (current.revision !== revision)
        throw new AppError(
          409,
          'This content changed elsewhere. Reload before changing publication.',
        );
      if (published) this.media.validateDraft(current, true);
      else this.navigation.assertCanUnpublish(id);
      const now = new Date().toISOString();
      const result = published
        ? this.db
            .prepare(
              'UPDATE content SET published = draft, published_at = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?',
            )
            .run(now, now, id, revision)
        : this.db
            .prepare(
              'UPDATE content SET published = NULL, published_at = NULL, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?',
            )
            .run(now, id, revision);
      if (!result.changes)
        throw new AppError(
          409,
          'This content changed elsewhere. Reload before changing publication.',
        );
      this.media.syncReferences(id, 'published', published ? current : null);
      if (published) {
        this.revisions.releasePublication(id, revision + 1);
        this.revisions.record(id, revision + 1, current, 'published', {
          published: true,
          createdAt: now,
        });
      } else if (current.published) {
        this.revisions.record(id, revision + 1, current.published, 'unpublished', {
          createdAt: now,
        });
        this.db
          .prepare(
            'UPDATE content_revisions SET current_publication = 0 WHERE content_id = ? AND current_publication = 1',
          )
          .run(id);
      }
      this.revisions.prune(id);
      if (published)
        this.navigation.recordSlugChange(id, current.kind, current.published?.slug, current.slug);
      return this.get(id);
    });
  }
  list(options: {
    kind?: ContentKind;
    q: string;
    status?: 'draft' | 'published';
    limit: number;
    offset: number;
  }) {
    const clauses: string[] = [],
      values: (string | number)[] = [];
    if (options.kind) {
      clauses.push('kind = ?');
      values.push(options.kind);
    }
    if (options.q) {
      clauses.push(
        "(instr(lower(json_extract(draft, '$.title')), lower(?)) > 0 OR instr(json_extract(draft, '$.slug'), lower(?)) > 0)",
      );
      values.push(options.q, options.q);
    }
    if (options.status)
      clauses.push(options.status === 'published' ? 'published IS NOT NULL' : 'published IS NULL');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (
      this.db.prepare(`SELECT count(*) AS count FROM content ${where}`).get(...values) as {
        count: number;
      }
    ).count;
    const rows = this.db
      .prepare(`SELECT * FROM content ${where} ORDER BY updated_at DESC, id LIMIT ? OFFSET ?`)
      .all(...values, options.limit, options.offset) as Row[];
    return { items: rows.map(entry), total };
  }
  stats() {
    return this.db
      .prepare(
        "SELECT count(*) AS total, count(CASE WHEN kind = 'page' THEN 1 END) AS pages, count(CASE WHEN kind = 'post' THEN 1 END) AS posts, count(published) AS published, count(*) - count(published) AS drafts FROM content",
      )
      .get() as { total: number; pages: number; posts: number; published: number; drafts: number };
  }
  publicContent(kind?: ContentKind) {
    const rows = (
      kind
        ? this.db
            .prepare(
              'SELECT * FROM content WHERE published IS NOT NULL AND kind = ? ORDER BY published_at DESC, id',
            )
            .all(kind)
        : this.db
            .prepare(
              'SELECT * FROM content WHERE published IS NOT NULL ORDER BY published_at DESC, id',
            )
            .all()
    ) as Row[];
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      publishedAt: row.published_at!,
      ...(JSON.parse(row.published!) as Draft),
    }));
  }
  findPublished(kind: ContentKind, slug: string) {
    const row = this.db
      .prepare(
        "SELECT * FROM content WHERE kind = ? AND published IS NOT NULL AND json_extract(published, '$.slug') = ?",
      )
      .get(kind, slug) as Row | undefined;
    return row
      ? {
          ...(JSON.parse(row.published!) as Draft),
          id: row.id,
          kind: row.kind,
          publishedAt: row.published_at!,
        }
      : undefined;
  }
}
