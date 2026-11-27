import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  REVISION_LIMIT,
  emptyDocument,
  mediaSelection,
  type ContentEntry,
  type Draft,
} from '@wordpressjs/core';
import { Repository } from '../apps/server/src/repository';
import { buildApp } from '../apps/server/src/app';
import { tokenHash } from '../apps/server/src/auth';
import { LocalMediaStorage } from '../apps/server/src/media-storage';

const origin = 'http://localhost:3000',
  session = 'history-tests-only-not-a-real-session';
const draft = (title: string, slug = 'home'): Draft => ({
  title,
  slug,
  description: `Description: ${title}`,
  document: {
    schemaVersion: 1,
    root: { props: {} },
    content: [
      {
        type: 'Hero',
        props: {
          id: 'hero',
          eyebrow: '',
          title,
          text: 'Versioned text',
          buttonLabel: 'Read more',
          buttonHref: '/blog',
          tone: 'light',
        },
      },
    ],
  },
});
async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(resolve(tmpdir(), 'wjs-revisions-'));
  const path = resolve(directory, 'site.sqlite');
  const repo = new Repository(path);
  const home = repo.setup(
    'Owner',
    'owner@example.test',
    'test-only-hash',
    'Versioned site',
    draft('Original homepage'),
  );
  repo.addSession(tokenHash(session), Date.now() + 3_600_000);
  const storage = new LocalMediaStorage(resolve(directory, 'media'));
  const app = await buildApp({
    databasePath: path,
    siteUrl: origin,
    adminOrigin: origin,
    setupToken: 'test-install-key'.repeat(3),
    stylesheetPath: resolve('packages/blocks/src/styles.css'),
    rateLimit: false,
    mediaStorage: storage,
  });
  let closed = false;
  const close = async () => {
    if (!closed) {
      await app.close();
      repo.close();
      closed = true;
    }
  };
  t.after(async () => {
    await close();
    await rm(directory, { recursive: true, force: true });
  });
  const request = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
    auth = true,
    requestOrigin: string | undefined = origin,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(auth ? { cookie: `wjs_session=${session}` } : {}),
        ...(requestOrigin ? { origin: requestOrigin } : {}),
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  const list = (id = home.id) => repo.revisions.list(id, 50, 0);
  const save = (value: Draft, id = home.id) => repo.save(id, value, repo.get(id).revision);
  const publish = (published = true, id = home.id) =>
    repo.publish(id, repo.get(id).revision, published);
  const restore = (
    version: number,
    revision = repo.get(home.id).revision,
    slug?: string,
    id = home.id,
  ) =>
    request('POST', `/api/content/${id}/revisions/${version}/restore`, {
      revision,
      ...(slug === undefined ? {} : { slug }),
    });
  const image = async () => {
    const id = randomUUID();
    repo.media.reserve(
      id,
      { title: 'Version image', alt: 'Original alternative text', caption: 'Original caption' },
      4,
      4,
      4,
    );
    await storage.write(id, Buffer.from('test'));
    return repo.media.activate(id);
  };
  return { repo, home, app, path, close, request, list, save, publish, restore, image };
}

test('history is private, scoped to its entry and previews saved snapshots with noindex/no-store', async (t) => {
  const f = await fixture(t);
  const original = f.list().items[0]!;
  f.publish();
  f.save(draft('PRIVATE later content'));
  const privateVersion = f.list().items[0]!;
  const base = `/api/content/${f.home.id}/revisions`;
  for (const path of [base, `${base}/${privateVersion.id}`, `${base}/${privateVersion.id}/preview`])
    assert.equal((await f.request('GET', path, undefined, false)).statusCode, 401);
  assert.equal(
    (await f.request('POST', `${base}/${original.id}/restore`, { revision: 3 }, false)).statusCode,
    401,
  );
  for (const hostile of ['', 'https://evil.example'])
    assert.equal(
      (await f.request('POST', `${base}/${original.id}/restore`, { revision: 3 }, true, hostile))
        .statusCode,
      403,
    );
  const preview = await f.request('GET', `${base}/${privateVersion.id}/preview`);
  assert.equal(preview.statusCode, 200);
  assert.match(preview.body, /PRIVATE later content/);
  assert.equal(preview.headers['cache-control'], 'no-store');
  assert.equal(preview.headers['x-robots-tag'], 'noindex, nofollow');
  assert.doesNotMatch(preview.body, /rel="canonical"/);
  assert.doesNotMatch((await f.request('GET', '/', undefined, false)).body, /PRIVATE/);
  const other = f.repo.create('page', draft('Other', 'other'));
  for (const suffix of ['', '/preview'])
    assert.equal(
      (await f.request('GET', `/api/content/${other.id}/revisions/${original.id}${suffix}`))
        .statusCode,
      404,
    );
  assert.equal((await f.restore(original.id, other.revision, undefined, other.id)).statusCode, 404);
  const page = (await f.request('GET', `${base}?limit=1&offset=1`)).json();
  assert.equal(page.items.length, 1);
  assert.equal(page.total, 3);
  assert.equal(page.items[0].snapshot, undefined);
  assert.equal((await f.request('GET', `${base}?limit=51`)).statusCode, 400);
  assert.equal((await f.request('GET', `${base}/1.5`)).statusCode, 400);
});

test('restoring page and post snapshots creates private drafts and preserves the displaced saved version', async (t) => {
  const f = await fixture(t);
  for (const kind of ['page', 'post'] as const) {
    const entry = f.repo.create(kind, draft('Earlier content', 'earlier'));
    const original = f.list(entry.id).items[0]!;
    f.save(draft('Current public content', 'current'), entry.id);
    const current = f.publish(true, entry.id);
    const path = kind === 'page' ? '/current' : '/blog/current';
    const before = (await f.request('GET', path, undefined, false)).body;
    const restored = await f.restore(original.id, current.revision, undefined, entry.id);
    assert.equal(restored.statusCode, 200, restored.body);
    const result = restored.json<ContentEntry>();
    assert.equal(result.title, 'Earlier content');
    assert.equal(result.description, 'Description: Earlier content');
    assert.equal(result.document.content[0]!.props.id, 'hero');
    assert.deepEqual(result.published, current.published);
    assert.equal(result.publishedAt, current.publishedAt);
    assert.equal((await f.request('GET', path, undefined, false)).body, before);
    const versions = f.list(entry.id).items;
    assert.equal(versions[0]!.event, 'restored');
    assert.equal(versions[0]!.restoredFrom, original.id);
    assert.ok(versions.some((v) => v.title === current.title));
    assert.equal(
      f.repo.db
        .prepare('SELECT count(*) AS count FROM redirects WHERE content_id = ?')
        .get(entry.id)?.count,
      0,
    );
    f.publish(true, entry.id);
    const moved = await f.request('GET', path);
    assert.equal(moved.statusCode, 308);
    assert.equal(moved.headers.location, kind === 'page' ? '/earlier' : '/blog/earlier');
  }
});

test('stale restores, unsafe stored content and slug conflicts leave history and content unchanged', async (t) => {
  const f = await fixture(t);
  const original = f.list().items[0]!;
  f.save(draft('Moved', 'moved'));
  const state = f.repo.get(f.home.id),
    versions = f.list();
  assert.equal((await f.restore(original.id, 1)).statusCode, 409);
  for (const body of [
    { revision: state.revision, document: {} },
    { revision: state.revision, slug: 'admin' },
    { revision: 0 },
  ])
    assert.equal(
      (await f.request('POST', `/api/content/${f.home.id}/revisions/${original.id}/restore`, body))
        .statusCode,
      400,
    );
  f.repo.create('page', draft('New owner of home'));
  assert.equal((await f.restore(original.id)).statusCode, 409);
  assert.deepEqual(f.repo.get(f.home.id), state);
  assert.deepEqual(f.list(), versions);
  const good = f.repo.revisions.get(f.home.id, original.id).snapshot;
  f.repo.db.prepare('UPDATE content_revisions SET snapshot = ? WHERE id = ?').run(
    JSON.stringify({
      ...good,
      document: {
        ...good.document,
        content: [{ type: 'Script', props: { id: 'bad', src: '/evil.js' } }],
      },
    }),
    original.id,
  );
  assert.equal((await f.restore(original.id)).statusCode, 409);
  assert.equal(
    (await f.request('GET', `/api/content/${f.home.id}/revisions/${original.id}/preview`))
      .statusCode,
    409,
  );
  assert.deepEqual(f.repo.get(f.home.id), state);
  f.repo.db
    .prepare('UPDATE content_revisions SET snapshot = ? WHERE id = ?')
    .run(JSON.stringify(good), original.id);
  const response = await f.restore(original.id, state.revision, 'recovered-home');
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().slug, 'recovered-home');
});

test('retention is bounded, keeps the current publication, and preserves a just-replaced old publication', async (t) => {
  const f = await fixture(t);
  f.publish();
  const pinned = f.list().items[0]!;
  for (let i = 0; i < REVISION_LIMIT + 5; i++) f.save(draft(`Later ${i}`));
  assert.equal(f.list().total, REVISION_LIMIT + 1);
  assert.equal(f.repo.revisions.get(f.home.id, pinned.id).isCurrentPublication, true);
  const first = f.repo.revisions.list(f.home.id, 20, 0),
    second = f.repo.revisions.list(f.home.id, 20, 20);
  assert.equal(
    new Set([...first.items, ...second.items].map((v) => v.id)).size,
    REVISION_LIMIT + 1,
  );
  f.publish();
  assert.equal(f.list().total, REVISION_LIMIT);
  const archived = f.list().items.find((v) => v.event === 'archived-publication')!;
  assert.equal(archived.title, 'Original homepage');
  const current = f.repo.get(f.home.id);
  assert.equal((await f.restore(archived.id)).statusCode, 200);
  assert.deepEqual(f.repo.get(f.home.id).published, current.published);
  for (let i = 0; i < REVISION_LIMIT; i++) f.save(draft(`Unpublished edit ${i}`));
  f.publish(false);
  const removed = f.list().items[0]!;
  assert.equal(removed.event, 'unpublished');
  assert.equal(removed.title, current.published!.title);
  assert.equal(f.list().total, REVISION_LIMIT);
  assert.ok(f.list().items.every((v) => !v.isCurrentPublication));
});

test('historical media remains private, blocks deletion, restores text snapshots and expires with history', async (t) => {
  const f = await fixture(t),
    image = await f.image();
  const withImage: Draft = {
    ...draft('With image'),
    document: {
      ...emptyDocument(),
      content: [{ type: 'MediaImage', props: { id: 'photo', asset: mediaSelection(image) } }],
    },
  };
  f.save(withImage);
  const version = f.list().items[0]!;
  f.save(draft('Removed image'));
  assert.equal(f.repo.media.get(image.id).draftUses, 0);
  assert.equal(f.repo.media.get(image.id).revisionUses, 1);
  assert.equal((await f.request('GET', image.url, undefined, false)).statusCode, 404);
  assert.equal((await f.request('GET', image.url)).statusCode, 200);
  assert.equal(
    (await f.request('DELETE', `/api/media/${image.id}`, { revision: image.revision })).statusCode,
    409,
  );
  f.repo.media.update(
    image.id,
    { title: 'Changed defaults', alt: 'New default', caption: 'New default' },
    image.revision,
  );
  // Restore a version on the edge of retention: source expiry cannot remove the new version's media.
  for (let i = 0; i < REVISION_LIMIT - 2; i++) f.save(draft(`Edit ${i}`));
  assert.equal((await f.restore(version.id)).statusCode, 200);
  const block = f.repo.get(f.home.id).document.content[0]!;
  assert.equal(block.type, 'MediaImage');
  if (block.type === 'MediaImage') assert.equal(block.props.asset!.alt, image.alt);
  assert.equal(f.repo.media.get(image.id).draftUses, 1);
  assert.equal(f.repo.media.get(image.id).revisionUses, 1);
  assert.equal((await f.request('GET', image.url, undefined, false)).statusCode, 404);
  for (let i = 0; i < REVISION_LIMIT; i++) f.save(draft(`Newer ${i}`));
  assert.equal(f.repo.media.get(image.id).revisionUses, 0);
  const currentImage = f.repo.media.get(image.id);
  assert.equal(
    (await f.request('DELETE', `/api/media/${image.id}`, { revision: currentImage.revision }))
      .statusCode,
    200,
  );
  assert.equal((await f.restore(version.id)).statusCode, 404);
});

test('history write failures roll back saves, restores and publication including media references', async (t) => {
  const f = await fixture(t),
    image = await f.image();
  const original = f.list().items[0]!;
  f.save({
    ...draft('Image draft'),
    document: {
      ...emptyDocument(),
      content: [{ type: 'MediaImage', props: { id: 'image', asset: mediaSelection(image) } }],
    },
  });
  const before = f.repo.get(f.home.id),
    history = f.list(),
    media = f.repo.media.get(image.id);
  f.repo.db.exec(
    "CREATE TRIGGER fail_history BEFORE INSERT ON content_revisions BEGIN SELECT RAISE(ABORT, 'simulated history write failure'); END;",
  );
  assert.throws(() => f.save(draft('Lost edit')), /simulated/);
  assert.throws(() => f.publish(), /simulated/);
  assert.throws(() => f.repo.restore(f.home.id, original.id, before.revision), /simulated/);
  assert.deepEqual(f.repo.get(f.home.id), before);
  assert.deepEqual(f.list(), history);
  assert.deepEqual(f.repo.media.get(image.id), media);
  f.repo.db.exec('DROP TRIGGER fail_history');
});

test('migration 4 preserves v3 state, captures both baselines and retains media after reopening', async (t) => {
  const f = await fixture(t),
    image = await f.image();
  f.save({
    ...draft('Old public'),
    document: {
      ...emptyDocument(),
      content: [{ type: 'MediaImage', props: { id: 'image', asset: mediaSelection(image) } }],
    },
  });
  const live = f.publish();
  f.save(draft('Private baseline', 'private-address'));
  const saved = f.repo.get(f.home.id);
  await f.close();
  const old = new DatabaseSync(f.path);
  const tables = [
    'content',
    'content_media',
    'media',
    'users',
    'sessions',
    'settings',
    'navigation',
    'redirects',
  ];
  const before = tables.map((name) => old.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
  old.exec('DROP TABLE revision_media; DROP TABLE content_revisions; PRAGMA user_version = 3;');
  old.close();
  const migrated = new Repository(f.path);
  assert.equal(migrated.db.prepare('PRAGMA user_version').get()!.user_version, 4);
  assert.deepEqual(
    tables.map((name) => migrated.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()),
    before,
  );
  const versions = migrated.revisions.list(f.home.id, 20, 0);
  assert.deepEqual(
    versions.items.map((v) => v.event),
    ['upgrade-draft', 'upgrade-publication'],
  );
  assert.equal(versions.items[0]!.createdAt, saved.updatedAt);
  assert.equal(versions.items[1]!.createdAt, live.publishedAt);
  assert.equal(migrated.media.get(image.id).revisionUses, 1);
  const restored = migrated.restore(f.home.id, versions.items[1]!.id, saved.revision);
  migrated.close();
  const reopened = new Repository(f.path);
  try {
    assert.deepEqual(reopened.get(f.home.id), restored);
    assert.equal(reopened.revisions.list(f.home.id, 20, 0).total, 3);
    assert.equal(reopened.media.get(image.id).revisionUses, 2);
    assert.ok(reopened.session(tokenHash(session)));
    assert.deepEqual(reopened.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    reopened.close();
  }
});
