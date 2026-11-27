import type { DatabaseSync } from 'node:sqlite';
import {
  draftSchema,
  REVISION_LIMIT,
  type ContentRevision,
  type Draft,
  type RevisionEvent,
  type RevisionList,
  type RevisionSummary,
} from '@wordpressjs/core';
import { AppError } from './repository';

type Row = {
  id: number;
  content_id: string;
  content_revision: number;
  event: RevisionEvent;
  created_at: string;
  snapshot: string;
  current_publication: number;
  restored_from: number | null;
};

export class RevisionRepository {
  constructor(private db: DatabaseSync) {}
  private assertContent(id: string) {
    if (!this.db.prepare('SELECT 1 FROM content WHERE id = ?').get(id))
      throw new AppError(404, 'Content not found.');
  }
  private summary(row: Row): RevisionSummary {
    const draft = JSON.parse(row.snapshot) as Draft;
    return {
      id: row.id,
      contentId: row.content_id,
      revision: row.content_revision,
      event: row.event,
      createdAt: row.created_at,
      title: draft.title,
      slug: draft.slug,
      description: draft.description,
      blockCount: draft.document.content.length,
      isCurrentPublication: !!row.current_publication,
      restoredFrom: row.restored_from,
    };
  }
  list(contentId: string, limit: number, offset: number): RevisionList {
    this.assertContent(contentId);
    const rows = this.db
      .prepare(
        'SELECT * FROM content_revisions WHERE content_id = ? ORDER BY id DESC LIMIT ? OFFSET ?',
      )
      .all(contentId, limit, offset) as Row[];
    const { total } = this.db
      .prepare('SELECT count(*) AS total FROM content_revisions WHERE content_id = ?')
      .get(contentId) as { total: number };
    return { items: rows.map((row) => this.summary(row)), total, retainedLimit: REVISION_LIMIT };
  }
  get(contentId: string, id: number): ContentRevision {
    const row = this.db
      .prepare('SELECT * FROM content_revisions WHERE content_id = ? AND id = ?')
      .get(contentId, id) as Row | undefined;
    if (!row)
      throw new AppError(404, 'This version is no longer available. Refresh the history list.');
    const parsed = draftSchema.safeParse(JSON.parse(row.snapshot));
    if (!parsed.success)
      throw new AppError(
        409,
        'This version contains unsupported content and cannot be previewed or restored.',
      );
    return { ...this.summary(row), snapshot: parsed.data };
  }
  // Called only inside the encompassing content/migration transaction.
  record(
    contentId: string,
    revision: number,
    snapshot: Draft,
    event: RevisionEvent,
    options: { published?: boolean; restoredFrom?: number; createdAt?: string } = {},
  ) {
    const { title, slug, description, document } = snapshot;
    if (options.published)
      this.db
        .prepare(
          'UPDATE content_revisions SET current_publication = 0 WHERE content_id = ? AND current_publication = 1',
        )
        .run(contentId);
    const result = this.db
      .prepare(
        'INSERT INTO content_revisions (content_id, content_revision, event, created_at, snapshot, current_publication, restored_from) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        contentId,
        revision,
        event,
        options.createdAt || new Date().toISOString(),
        JSON.stringify({ title, slug, description, document }),
        options.published ? 1 : 0,
        options.restoredFrom ?? null,
      );
    const id = Number(result.lastInsertRowid);
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO revision_media (revision_id, media_id) VALUES (?, ?)',
    );
    for (const block of document.content)
      if (block.type === 'MediaImage' && block.props.asset) insert.run(id, block.props.asset.id);
    return id;
  }
  releasePublication(contentId: string, revision: number) {
    const row = this.db
      .prepare('SELECT * FROM content_revisions WHERE content_id = ? AND current_publication = 1')
      .get(contentId) as Row | undefined;
    if (!row) return;
    // Preserve a just-replaced publication even after enough edits to age it out of recent history.
    const { newer } = this.db
      .prepare('SELECT count(*) AS newer FROM content_revisions WHERE content_id = ? AND id > ?')
      .get(contentId, row.id) as { newer: number };
    if (newer >= REVISION_LIMIT - 1)
      this.record(contentId, revision, JSON.parse(row.snapshot), 'archived-publication');
    this.db
      .prepare('UPDATE content_revisions SET current_publication = 0 WHERE id = ?')
      .run(row.id);
  }
  prune(contentId: string) {
    this.db
      .prepare(
        'DELETE FROM content_revisions WHERE content_id = ? AND current_publication = 0 AND id NOT IN (SELECT id FROM content_revisions WHERE content_id = ? ORDER BY id DESC LIMIT ?)',
      )
      .run(contentId, contentId, REVISION_LIMIT);
  }
}
