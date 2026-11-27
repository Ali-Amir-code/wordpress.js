import type { DatabaseSync } from 'node:sqlite';
import {
  MEDIA_LIMITS,
  mediaPath,
  type Draft,
  type MediaItem,
  type MediaMetadata,
} from '@wordpressjs/core';
import { AppError } from './repository';

type MediaRow = {
  id: string;
  title: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  bytes: number;
  revision: number;
  created_at: string;
  state: 'pending' | 'active' | 'deleting';
};
export class MediaRepository {
  constructor(
    private db: DatabaseSync,
    private transaction: <T>(fn: () => T) => T,
    private siteUrl: string,
  ) {}
  reserve(id: string, metadata: MediaMetadata, width: number, height: number, bytes: number) {
    this.transaction(() => {
      const usage = this.usage();
      if (
        usage.items >= MEDIA_LIMITS.libraryItems ||
        usage.bytes + bytes > MEDIA_LIMITS.libraryBytes
      )
        throw new AppError(
          409,
          'Your media library is full. Remove unused images before uploading more.',
        );
      this.db
        .prepare(
          "INSERT INTO media (id, title, alt, caption, width, height, bytes, created_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
        )
        .run(
          id,
          metadata.title,
          metadata.alt,
          metadata.caption,
          width,
          height,
          bytes,
          new Date().toISOString(),
        );
    });
  }
  activate(id: string) {
    this.db.prepare("UPDATE media SET state = 'active' WHERE id = ? AND state = 'pending'").run(id);
    return this.get(id);
  }
  get(id: string): MediaItem {
    const row = this.db.prepare("SELECT * FROM media WHERE id = ? AND state = 'active'").get(id) as
      MediaRow | undefined;
    if (!row) throw new AppError(404, 'Image not found.');
    return this.item(row);
  }
  private item(row: MediaRow): MediaItem {
    const uses = this.db
      .prepare(
        "SELECT count(CASE WHEN stage = 'draft' THEN 1 END) AS draftUses, count(CASE WHEN stage = 'published' THEN 1 END) AS publishedUses FROM content_media WHERE media_id = ?",
      )
      .get(row.id) as { draftUses: number; publishedUses: number };
    return {
      id: row.id,
      title: row.title,
      alt: row.alt,
      caption: row.caption,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      revision: row.revision,
      createdAt: row.created_at,
      url: mediaPath(row.id),
      ...uses,
      revisionUses: (
        this.db
          .prepare('SELECT count(*) AS count FROM revision_media WHERE media_id = ?')
          .get(row.id) as { count: number }
      ).count,
    };
  }
  usage() {
    const usage = this.db
      .prepare('SELECT count(*) AS items, coalesce(sum(bytes), 0) AS bytes FROM media')
      .get() as { items: number; bytes: number };
    return { ...usage, maxItems: MEDIA_LIMITS.libraryItems, maxBytes: MEDIA_LIMITS.libraryBytes };
  }
  list(q: string, limit: number, offset: number) {
    const where =
      "state = 'active' AND (instr(lower(title), lower(?)) > 0 OR instr(lower(alt), lower(?)) > 0)";
    const total = (
      this.db.prepare(`SELECT count(*) AS total FROM media WHERE ${where}`).get(q, q) as {
        total: number;
      }
    ).total;
    const rows = this.db
      .prepare(`SELECT * FROM media WHERE ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
      .all(q, q, limit, offset) as MediaRow[];
    return { items: rows.map((row) => this.item(row)), total, usage: this.usage() };
  }
  update(id: string, metadata: MediaMetadata, revision: number) {
    this.get(id);
    const result = this.db
      .prepare(
        "UPDATE media SET title = ?, alt = ?, caption = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND state = 'active'",
      )
      .run(metadata.title, metadata.alt, metadata.caption, id, revision);
    if (!result.changes)
      throw new AppError(409, 'This image changed elsewhere. Reload its details before saving.');
    return this.get(id);
  }
  beginDeletion(id: string, revision: number) {
    this.transaction(() => {
      const item = this.get(id);
      if (item.revision !== revision)
        throw new AppError(409, 'This image changed elsewhere. Reload before deleting.');
      if (item.draftUses || item.publishedUses || item.revisionUses)
        throw new AppError(
          409,
          'This image is used by a saved draft, published page or retained version. It cannot be deleted while those references exist.',
        );
      this.db.prepare("UPDATE media SET state = 'deleting' WHERE id = ?").run(id);
    });
  }
  incomplete() {
    return this.db.prepare("SELECT id FROM media WHERE state != 'active'").all() as {
      id: string;
    }[];
  }
  finishRemoval(id: string) {
    this.db.prepare("DELETE FROM media WHERE id = ? AND state != 'active'").run(id);
  }
  isPublished(id: string) {
    return !!this.db
      .prepare("SELECT 1 FROM content_media WHERE media_id = ? AND stage = 'published' LIMIT 1")
      .get(id);
  }
  validateDraft(draft: Draft, publishing = false): Draft {
    return {
      ...draft,
      document: {
        ...draft.document,
        content: draft.document.content.map((block) => {
          if (block.type === 'Image') {
            const url = new URL(block.props.src, this.siteUrl);
            let pathname: string;
            try {
              pathname = decodeURIComponent(url.pathname);
            } catch {
              throw new AppError(400, 'The image URL contains invalid encoding.');
            }
            if (url.origin === new URL(this.siteUrl).origin && pathname.startsWith('/media/'))
              throw new AppError(
                400,
                'Use a Library image block for uploaded images so usage and publication can be tracked.',
              );
          }
          if (block.type !== 'MediaImage') return block;
          if (!block.props.asset) {
            if (publishing)
              throw new AppError(
                400,
                'Choose an image for each Library image block before publishing.',
              );
            return block;
          }
          const image = this.get(block.props.asset.id);
          return {
            ...block,
            props: {
              ...block.props,
              asset: { ...block.props.asset, width: image.width, height: image.height },
            },
          };
        }),
      },
    };
  }
  syncReferences(contentId: string, stage: 'draft' | 'published', draft: Draft | null) {
    this.db
      .prepare('DELETE FROM content_media WHERE content_id = ? AND stage = ?')
      .run(contentId, stage);
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO content_media (content_id, media_id, stage) VALUES (?, ?, ?)',
    );
    for (const block of draft?.document.content || [])
      if (block.type === 'MediaImage' && block.props.asset)
        insert.run(contentId, block.props.asset.id, stage);
  }
}
