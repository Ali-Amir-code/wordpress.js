import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import {
  MEDIA_LIMITS,
  defaultSettings,
  emptyDocument,
  mediaSelection,
  type ContentEntry,
  type MediaItem,
} from '@wordpressjs/core';
import { buildApp } from '../apps/server/src/app';
import { Repository } from '../apps/server/src/repository';
import { recoverMedia } from '../apps/server/src/media';
import { LocalMediaStorage, type MediaStorage } from '../apps/server/src/media-storage';
import { tokenHash } from '../apps/server/src/auth';

const origin = 'http://localhost:3000';
const session = 'media-test-session-not-a-real-credential';
const boundary = 'wordpressjs-test-boundary';
const png = () =>
  sharp({ create: { width: 64, height: 32, channels: 4, background: '#244d3c' } })
    .png()
    .toBuffer();
function multipart(bytes: Buffer, filename = 'studio.png', type = 'image/png', extra = '') {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n${extra}--${boundary}--\r\n`),
  ]);
}
async function fixture(
  t: test.TestContext,
  customStorage?: (base: LocalMediaStorage) => MediaStorage,
) {
  const directory = await mkdtemp(resolve(tmpdir(), 'wjs-media-'));
  const path = resolve(directory, 'site.sqlite');
  const repo = new Repository(path);
  repo.setup('Media owner', 'media@example.test', 'test-only-hash', 'Media studio', {
    title: 'Home',
    slug: 'home',
    description: '',
    document: emptyDocument(),
  });
  repo.addSession(tokenHash(session), Date.now() + 60_000);
  const base = new LocalMediaStorage(resolve(directory, 'media'));
  const storage = customStorage?.(base) || base;
  const options = {
    databasePath: path,
    setupToken: 'test-only-setup-key'.repeat(3),
    siteUrl: origin,
    adminOrigin: origin,
    stylesheetPath: resolve('packages/blocks/src/styles.css'),
    mediaStorage: storage,
    rateLimit: false,
  };
  const app = await buildApp(options);
  t.after(async () => {
    await app.close();
    repo.close();
    await rm(directory, { recursive: true, force: true });
  });
  const request = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) =>
    app.inject({
      method,
      url,
      headers: { origin, cookie: `wjs_session=${session}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
  const upload = (bytes: Buffer, filename?: string, type?: string, extra?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/media',
      headers: {
        origin,
        cookie: `wjs_session=${session}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipart(bytes, filename, type, extra),
    });
  const image = async () => {
    const response = await upload(await png());
    assert.equal(response.statusCode, 201, response.body);
    return response.json() as MediaItem;
  };
  const home = () => repo.list({ limit: 1, offset: 0, q: '' }).items[0]!;
  const attach = async (item: MediaItem, entry = home()) => {
    const response = await request('PUT', `/api/content/${entry.id}`, {
      title: entry.title,
      slug: entry.slug,
      description: '',
      revision: entry.revision,
      document: {
        schemaVersion: 1,
        root: { props: {} },
        content: [
          { type: 'MediaImage', props: { id: 'studio-image', asset: mediaSelection(item) } },
        ],
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json() as ContentEntry;
  };
  return { app, repo, directory, path, base, options, request, upload, image, home, attach };
}

test('uploads are decoded, oriented, bounded, transcoded and stripped of EXIF', async (t) => {
  const { upload, base, repo } = await fixture(t);
  const bytes = await sharp({
    create: { width: 3000, height: 1000, channels: 3, background: 'red' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const response = await upload(bytes, 'portrait.jpg', 'image/jpeg');
  assert.equal(response.statusCode, 201, response.body);
  const item = response.json() as MediaItem;
  assert.equal(item.height, 2560);
  assert.equal(item.width, 853);
  const data = await base.read(item.id),
    metadata = await sharp(data).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  assert.equal(data.length, item.bytes);
  assert.equal(item.draftUses, 0);
  assert.equal(repo.media.usage().items, 1);
});

test('uploads reject spoofed, executable, truncated, animated and oversized input without catalog entries', async (t) => {
  const { upload, repo } = await fixture(t);
  assert.equal((await upload(Buffer.from('<svg onload="alert(1)"/>'))).statusCode, 415);
  assert.equal((await upload(await png(), 'photo.php', 'image/png')).statusCode, 415);
  assert.equal((await upload(await png(), 'photo.jpg', 'image/jpeg')).statusCode, 415);
  assert.equal((await upload((await png()).subarray(0, 35))).statusCode, 400);
  assert.equal((await upload(Buffer.alloc(MEDIA_LIMITS.uploadBytes + 1))).statusCode, 413);
  const bomb = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  assert.equal((await upload(bomb)).statusCode, 400);
  const wide = await sharp({ create: { width: 8200, height: 1, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  assert.equal((await upload(wide)).statusCode, 400);
  const animated = await sharp(
    [
      await png(),
      await sharp(await png())
        .negate()
        .png()
        .toBuffer(),
    ],
    { join: { animated: true } },
  )
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  assert.equal((await upload(animated, 'animation.webp', 'image/webp')).statusCode, 400);
  assert.equal(repo.media.usage().items, 0);
});

test('multipart authentication, origin checks and one-file policy are enforced', async (t) => {
  const { app, upload, repo } = await fixture(t);
  const payload = multipart(await png());
  const headers = { origin, 'content-type': `multipart/form-data; boundary=${boundary}` };
  assert.equal(
    (await app.inject({ method: 'POST', url: '/api/media', headers, payload })).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/media',
        headers: { ...headers, origin: 'https://evil.example', cookie: `wjs_session=${session}` },
        payload,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/media',
        headers: { ...headers, cookie: `wjs_session=${session}` },
        payload: `--${boundary}--\r\n`,
      })
    ).statusCode,
    400,
  );
  const extra = `--${boundary}\r\nContent-Disposition: form-data; name="unexpected"\r\n\r\nx\r\n`;
  assert.equal((await upload(await png(), 'test.png', 'image/png', extra)).statusCode, 413);
  assert.equal(repo.media.usage().items, 0);
});

test('draft images stay private, publication enables access, and both reference stages prevent deletion', async (t) => {
  const { app, request, image, attach, repo } = await fixture(t);
  const item = await image();
  assert.equal((await app.inject(item.url)).statusCode, 404);
  assert.equal((await request('GET', item.url)).statusCode, 200);
  let page = await attach(item);
  assert.equal((await app.inject(item.url)).statusCode, 404);
  assert.equal((await request('DELETE', `/api/media/${item.id}`, { revision: 1 })).statusCode, 409);
  page = (
    await request('POST', `/api/content/${page.id}/publish`, { revision: page.revision })
  ).json();
  const publicFile = await app.inject(item.url);
  assert.equal(publicFile.statusCode, 200);
  assert.match(String(publicFile.headers['content-type']), /image\/webp/);
  assert.equal(publicFile.headers['cache-control'], 'private, no-store');
  assert.equal(publicFile.headers.vary, 'Cookie');
  assert.match((await app.inject('/')).body, new RegExp(item.id));
  page = (
    await request('PUT', `/api/content/${page.id}`, {
      title: page.title,
      slug: page.slug,
      description: '',
      document: emptyDocument(),
      revision: page.revision,
    })
  ).json();
  assert.equal(repo.media.get(item.id).draftUses, 0);
  assert.equal(repo.media.get(item.id).publishedUses, 1);
  assert.equal((await request('DELETE', `/api/media/${item.id}`, { revision: 1 })).statusCode, 409);
  assert.equal((await app.inject(item.url)).statusCode, 200);
  await request('POST', `/api/content/${page.id}/unpublish`, { revision: page.revision });
  assert.equal((await app.inject(item.url)).statusCode, 404);
  assert.equal((await request('DELETE', `/api/media/${item.id}`, { revision: 1 })).statusCode, 200);
  assert.equal((await request('GET', item.url)).statusCode, 404);
});

test('saved image metadata is a snapshot and stale media edits/deletes are rejected', async (t) => {
  const { image, request, attach, app } = await fixture(t);
  let item = await image();
  item = (
    await request('PUT', `/api/media/${item.id}`, {
      title: 'Studio',
      alt: 'Original description',
      caption: 'Original caption',
      revision: 1,
    })
  ).json();
  const page = await attach(item);
  await request('POST', `/api/content/${page.id}/publish`, { revision: page.revision });
  assert.equal(
    (
      await request('PUT', `/api/media/${item.id}`, {
        title: 'Studio',
        alt: 'PRIVATE NEW ALT',
        caption: 'PRIVATE NEW CAPTION',
        revision: item.revision,
      })
    ).statusCode,
    200,
  );
  const html = (await app.inject('/')).body;
  assert.match(html, /Original description/);
  assert.match(html, /Original caption/);
  assert.doesNotMatch(html, /PRIVATE NEW/);
  assert.equal(
    (
      await request('PUT', `/api/media/${item.id}`, {
        title: 'Stale',
        alt: '',
        caption: '',
        revision: 1,
      })
    ).statusCode,
    409,
  );
  assert.equal((await request('DELETE', `/api/media/${item.id}`, { revision: 1 })).statusCode, 409);
});

test('missing image IDs, unmanaged internal URLs and empty published image blocks are rejected', async (t) => {
  const { home, request, repo, image } = await fixture(t);
  const page = home();
  const body = {
    title: page.title,
    slug: page.slug,
    description: '',
    revision: page.revision,
    document: {
      schemaVersion: 1,
      root: { props: {} },
      content: [
        {
          type: 'MediaImage',
          props: {
            id: 'image',
            asset: { id: String(randomUUID()), width: 1, height: 1, alt: '', caption: '' },
          },
        },
      ],
    },
  };
  assert.equal((await request('PUT', `/api/content/${page.id}`, body)).statusCode, 404);
  for (const src of ['/media/test.webp', origin + '/media/test.webp']) {
    assert.equal(
      (
        await request('PUT', `/api/content/${page.id}`, {
          ...body,
          document: {
            ...body.document,
            content: [{ type: 'Image', props: { id: 'unmanaged', src, alt: '', caption: '' } }],
          },
        })
      ).statusCode,
      400,
    );
  }
  const item = await image();
  body.document.content[0]!.props.asset = { ...mediaSelection(item), width: 1, height: 1 };
  const saved = (await request('PUT', `/api/content/${page.id}`, body)).json() as ContentEntry;
  const block = saved.document.content[0]!;
  assert.equal(block.type === 'MediaImage' && block.props.asset?.width, 64);
  const empty = (
    await request('PUT', `/api/content/${page.id}`, {
      ...body,
      revision: saved.revision,
      document: {
        ...body.document,
        content: [{ type: 'MediaImage', props: { id: 'empty', asset: null } }],
      },
    })
  ).json() as ContentEntry;
  assert.equal(
    (await request('POST', `/api/content/${page.id}/publish`, { revision: empty.revision }))
      .statusCode,
    400,
  );
  assert.equal(repo.media.get(item.id).draftUses, 0);
});

test('media search and pagination report usage and disk-backed files survive restart', async (t) => {
  const { image, request, app, options } = await fixture(t);
  const item = await image();
  await image();
  await request('PUT', `/api/media/${item.id}`, {
    title: 'Unique studio',
    alt: 'green plant',
    caption: '',
    revision: 1,
  });
  const list = (await request('GET', '/api/media?q=green&limit=1')).json();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, item.id);
  assert.equal(list.usage.items, 2);
  assert.equal((await request('GET', '/api/media?offset=1&limit=1')).json().items.length, 1);
  await app.close();
  const restarted = await buildApp(options);
  try {
    const response = await restarted.inject({
      url: item.url,
      headers: { cookie: `wjs_session=${session}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal((await sharp(response.rawPayload).metadata()).width, 64);
  } finally {
    await restarted.close();
  }
});

test('quota accounting reserves pending bytes, and storage failures leave no visible broken assets', async (t) => {
  const { repo, upload } = await fixture(t, (base) => ({
    read: (id) => base.read(id),
    remove: (id) => base.remove(id),
    write: async (id, bytes) => {
      await base.write(id, bytes);
      throw new Error('simulated disk failure');
    },
  }));
  assert.equal((await upload(await png())).statusCode, 500);
  assert.equal(repo.media.usage().items, 0);
  repo.media.reserve(
    randomUUID(),
    { title: 'Reserved quota', alt: '', caption: '' },
    1,
    1,
    MEDIA_LIMITS.libraryBytes,
  );
  assert.equal((await upload(await png())).statusCode, 409);
  assert.equal(repo.media.list('', 20, 0).total, 0);
});

test('deletion tombstones reject new references and recovery cleans only incomplete files', async (t) => {
  const { image, repo, base, home } = await fixture(t);
  const item = await image();
  repo.media.beginDeletion(item.id, item.revision);
  assert.throws(
    () =>
      repo.save(
        home().id,
        {
          ...home(),
          document: {
            schemaVersion: 1,
            root: { props: {} },
            content: [
              { type: 'MediaImage', props: { id: 'deleted', asset: mediaSelection(item) } },
            ],
          },
        },
        home().revision,
      ),
    /Image not found/,
  );
  const pending = randomUUID();
  repo.media.reserve(pending, { title: 'Interrupted', alt: '', caption: '' }, 1, 1, 4);
  await base.write(pending, Buffer.from('partial'));
  const kept = await image();
  await recoverMedia(repo, base);
  assert.equal(repo.media.incomplete().length, 0);
  assert.equal(repo.media.usage().items, 1);
  await assert.rejects(base.read(item.id), { code: 'ENOENT' });
  await assert.rejects(base.read(pending), { code: 'ENOENT' });
  assert.ok((await base.read(kept.id)).length);
});

test('failed deletion remains durable and is retried when the service restarts', async (t) => {
  const { image, request, repo, base, app, options } = await fixture(t, (base) => ({
    read: (id) => base.read(id),
    write: (id, data) => base.write(id, data),
    remove: async () => {
      throw new Error('disk temporarily unavailable');
    },
  }));
  const item = await image();
  assert.equal((await request('DELETE', `/api/media/${item.id}`, { revision: 1 })).statusCode, 500);
  assert.equal(repo.media.incomplete()[0]?.id, item.id);
  assert.equal((await app.inject(item.url)).statusCode, 404);
  await app.close();
  const recovered = await buildApp({ ...options, mediaStorage: base });
  try {
    assert.equal(repo.media.incomplete().length, 0);
    await assert.rejects(base.read(item.id), { code: 'ENOENT' });
  } finally {
    await recovered.close();
  }
});

test('storage never accepts user-controlled paths or overwrites an existing object', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'wjs-storage-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new LocalMediaStorage(directory),
    id = randomUUID();
  await store.write(id, Buffer.from('first'));
  await assert.rejects(store.write(id, Buffer.from('second')), { code: 'EEXIST' });
  await assert.rejects(store.write('../outside', Buffer.from('bad')));
  assert.equal((await store.read(id)).toString(), 'first');
  assert.deepEqual(await readdir(directory), [`${id}.webp`]);
});

test('v1 upgrade preserves owner, sessions, settings, draft and published snapshots', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'wjs-upgrade-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'v1.sqlite'),
    old = new DatabaseSync(path),
    id = randomUUID();
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, password_hash TEXT);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires_at INTEGER);
    CREATE TABLE settings (id INTEGER PRIMARY KEY, value TEXT, revision INTEGER);
    CREATE TABLE content (id TEXT PRIMARY KEY, kind TEXT, draft TEXT, published TEXT, revision INTEGER, created_at TEXT, updated_at TEXT, published_at TEXT);
    PRAGMA user_version=1;`);
  const draft = JSON.stringify({
    title: 'Existing site',
    slug: 'home',
    description: 'Keep my content',
    document: emptyDocument(),
  });
  old
    .prepare('INSERT INTO users VALUES (1, ?, ?, ?)')
    .run('Existing owner', 'owner@example.test', 'existing-hash');
  old.prepare('INSERT INTO sessions VALUES (?, 1, ?)').run(tokenHash(session), Date.now() + 60_000);
  old.prepare('INSERT INTO settings VALUES (1, ?, 9)').run(JSON.stringify(defaultSettings));
  old
    .prepare(
      "INSERT INTO content VALUES (?, 'page', ?, ?, 7, '2026-11-24', '2026-11-24', '2026-11-24')",
    )
    .run(id, draft, draft);
  old.close();
  const migrated = new Repository(path);
  assert.equal(migrated.owner()?.name, 'Existing owner');
  assert.equal(migrated.settings().revision, 9);
  assert.equal(migrated.get(id).revision, 7);
  assert.equal(migrated.get(id).published?.description, 'Keep my content');
  assert.ok(migrated.session(tokenHash(session)));
  assert.equal(migrated.db.prepare('PRAGMA user_version').get()?.user_version, 2);
  migrated.close();
  const reopened = new Repository(path);
  assert.equal(reopened.get(id).title, 'Existing site');
  reopened.close();
});
