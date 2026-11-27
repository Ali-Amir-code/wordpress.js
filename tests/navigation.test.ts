import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  defaultNavigation,
  type ContentView,
  type NavigationDocument,
  type NavigationState,
} from '@wordpressjs/core';
import { buildApp } from '../apps/server/src/app';
import { Repository } from '../apps/server/src/repository';

const origin = 'http://localhost:3000';
const token = 'navigation-test-installation-key-not-a-real-secret';
const link = (contentId: string, label: string) => ({
  id: randomUUID(),
  type: 'content' as const,
  contentId,
  label,
});
const urlLink = (label: string, url = '/blog') => ({
  id: randomUUID(),
  type: 'url' as const,
  label,
  url,
});
async function fixture(t: test.TestContext, databasePath = ':memory:', cookie = '') {
  const app = await buildApp({
    databasePath,
    setupToken: token,
    siteUrl: origin,
    adminOrigin: origin,
    stylesheetPath: resolve('packages/blocks/src/styles.css'),
    rateLimit: false,
  });
  t.after(() => app.close());
  const request = (method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown, auth = true) =>
    app.inject({
      method,
      url,
      headers: {
        origin,
        ...(auth && cookie ? { cookie } : {}),
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  if (!cookie) {
    const response = await request('POST', '/api/setup', {
      name: 'Navigation owner',
      email: 'navigation@example.test',
      password: 'test-password-only',
      siteTitle: 'Navigation studio',
      token,
    });
    assert.equal(response.statusCode, 201, response.body);
    cookie = response.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  }
  const get = async (id: string) =>
    (await request('GET', `/api/content/${id}`)).json<ContentView>();
  const action = async (id: string, name = 'publish') => {
    const entry = await get(id);
    const response = await request('POST', `/api/content/${id}/${name}`, {
      revision: entry.revision,
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<ContentView>();
  };
  const create = async (slug: string, kind: 'page' | 'post' = 'page', publish = true) => {
    const response = await request('POST', '/api/content', { kind, title: slug, slug });
    assert.equal(response.statusCode, 201, response.body);
    const entry = response.json<ContentView>();
    return publish ? action(entry.id) : entry;
  };
  const edit = async (id: string, changes: Partial<ContentView>) => {
    const { title, slug, description, document, revision } = await get(id);
    const response = await request('PUT', `/api/content/${id}`, {
      title,
      slug,
      description,
      document,
      revision,
      ...changes,
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<ContentView>();
  };
  const state = async () => (await request('GET', '/api/navigation')).json<NavigationState>();
  const save = async (document: NavigationDocument) => {
    const response = await request('PUT', '/api/navigation', {
      document,
      revision: (await state()).revision,
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<NavigationState>();
  };
  const publish = async () => {
    const response = await request('POST', '/api/navigation/publish', {
      revision: (await state()).revision,
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<NavigationState>();
  };
  const home = (await request('GET', '/api/content?q=Home')).json().items[0] as ContentView;
  return { app, request, get, action, create, edit, state, save, publish, home, cookie };
}

test('navigation drafts stay private, previews use published content and ordered links are escaped', async (t) => {
  const f = await fixture(t);
  await f.action(f.home.id);
  const about = await f.create('about');
  const config = defaultNavigation();
  config.header = {
    mode: 'custom',
    items: [link(about.id, 'About the studio'), urlLink('Journal')],
  };
  config.footer = {
    text: '<script>footer()</script>',
    items: [urlLink('Contact <us>', 'mailto:hello@example.test')],
  };
  const saved = await f.save(config);
  assert.deepEqual(saved.published, defaultNavigation());
  assert.doesNotMatch(
    (await f.request('GET', '/', undefined, false)).body,
    /About the studio|footer\(\)/,
  );
  await f.edit(f.home.id, {
    title: 'PRIVATE HOME TITLE',
    document: {
      schemaVersion: 1,
      root: { props: {} },
      content: [
        {
          type: 'Text',
          props: { id: 'private', heading: 'PRIVATE BODY', text: 'Not for readers' },
        },
      ],
    },
  });
  for (const path of ['/api/navigation', '/api/navigation/preview', '/api/navigation/targets'])
    assert.equal((await f.request('GET', path, undefined, false)).statusCode, 401);
  const preview = await f.request('GET', '/api/navigation/preview');
  assert.equal(preview.headers['cache-control'], 'no-store');
  assert.match(String(preview.headers['x-robots-tag']), /noindex/);
  assert.match(preview.body, /About the studio/);
  assert.doesNotMatch(preview.body, /PRIVATE|rel="canonical"/);
  await f.publish();
  const html = (await f.request('GET', '/about', undefined, false)).body;
  assert.match(
    html,
    /aria-label="Main navigation"><ul><li><a href="\/about" aria-current="page">About the studio/,
  );
  assert.ok(html.indexOf('About the studio') < html.indexOf('>Journal</a>'));
  assert.match(html, /aria-label="Footer navigation"/);
  assert.match(html, /&lt;script&gt;footer\(\)&lt;\/script&gt;/);
  assert.match(html, /Contact &lt;us&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('navigation validates schemas, content references, publication and concurrent writes', async (t) => {
  const f = await fixture(t);
  const initial = await f.state();
  const invalid: unknown[] = [
    { ...initial.draft, extra: true },
    { ...initial.draft, homepageId: 'not-an-id' },
    ...[
      'javascript:alert(1)',
      '//host.test',
      '/\\host.test',
      ' https://host.test',
      'data:text/html,x',
    ].map((url) => ({
      ...initial.draft,
      header: { mode: 'custom', items: [urlLink('Bad', url)] },
    })),
    {
      ...initial.draft,
      header: { mode: 'custom', items: Array.from({ length: 21 }, () => urlLink('Too many')) },
    },
    { ...initial.draft, footer: { text: 'x'.repeat(301), items: [] } },
  ];
  const duplicate = urlLink('Same ID');
  invalid.push({
    ...initial.draft,
    header: { mode: 'custom', items: [duplicate] },
    footer: { text: '', items: [duplicate] },
  });
  for (const document of invalid)
    assert.equal(
      (await f.request('PUT', '/api/navigation', { document, revision: initial.revision }))
        .statusCode,
      400,
    );
  const missing = {
    ...initial.draft,
    header: { mode: 'custom', items: [link(randomUUID(), 'Missing')] },
  };
  assert.equal(
    (await f.request('PUT', '/api/navigation', { document: missing, revision: initial.revision }))
      .statusCode,
    400,
  );
  const post = await f.create('story', 'post');
  assert.equal(
    (
      await f.request('PUT', '/api/navigation', {
        document: { ...initial.draft, homepageId: post.id },
        revision: initial.revision,
      })
    ).statusCode,
    400,
  );
  const draft = await f.create('future', 'page', false);
  let saved = await f.save({
    ...initial.draft,
    header: { mode: 'custom', items: [link(draft.id, 'Future')] },
  });
  assert.equal(
    (await f.request('POST', '/api/navigation/publish', { revision: saved.revision })).statusCode,
    409,
  );
  assert.deepEqual((await f.state()).published, initial.published);
  for (const [method, path, body] of [
    ['PUT', '/api/navigation', { document: initial.draft, revision: initial.revision }],
    ['POST', '/api/navigation/publish', { revision: initial.revision }],
  ] as const)
    assert.equal((await f.request(method, path, body)).statusCode, 409);
  assert.deepEqual((await f.state()).draft, saved.draft);
  // Inactive custom links can stay in the draft while automatic mode is published.
  saved = await f.save({ ...saved.draft, header: { ...saved.draft.header, mode: 'auto' } });
  await f.publish();
  saved = await f.save({ ...saved.draft, homepageId: draft.id });
  assert.equal(
    (await f.request('POST', '/api/navigation/publish', { revision: saved.revision })).statusCode,
    409,
  );
});

test('homepage changes agree across root, aliases, canonical metadata, sitemap and admin links', async (t) => {
  const f = await fixture(t);
  await f.action(f.home.id);
  const about = await f.create('about');
  const legacyAlias = await f.request('GET', '/home');
  assert.equal(legacyAlias.statusCode, 302);
  assert.equal(legacyAlias.headers.location, '/');
  await f.save({ ...defaultNavigation(), homepageId: about.id });
  assert.match((await f.request('GET', '/')).body, /Good things start/);
  await f.publish();
  const root = await f.request('GET', '/');
  assert.match(root.body, /<title>about ·/);
  assert.match(root.body, /rel="canonical" href="http:\/\/localhost:3000\/"/);
  assert.match(root.body, /property="og:url" content="http:\/\/localhost:3000\/"/);
  const alias = await f.request('GET', '/about?source=old');
  assert.equal(alias.statusCode, 302);
  assert.equal(alias.headers.location, '/');
  assert.equal(alias.headers['cache-control'], 'no-store');
  assert.equal((await f.request('GET', '/home')).statusCode, 200);
  assert.equal((await f.get(f.home.id)).publicPath, '/home');
  assert.equal((await f.get(about.id)).publicPath, '/');
  assert.equal((await f.request('GET', '/api/overview')).json().homepageId, about.id);
  const sitemap = (await f.request('GET', '/sitemap.xml')).body;
  assert.equal(sitemap.match(/<loc>http:\/\/localhost:3000\/<\/loc>/g)?.length, 1);
  assert.match(sitemap, /\/home<\/loc>/);
  assert.doesNotMatch(sitemap, /\/about<\/loc>/);
  const blocked = await f.request('POST', `/api/content/${about.id}/unpublish`, {
    revision: about.revision,
  });
  assert.equal(blocked.statusCode, 409);
  await f.save(defaultNavigation());
  await f.publish();
  assert.equal((await f.request('GET', '/about')).statusCode, 200);
  assert.match((await f.request('GET', '/')).body, /Good things start/);
  await f.action(about.id, 'unpublish');
  await f.action(f.home.id, 'unpublish');
  assert.match((await f.request('GET', '/')).body, /Something good is on its way/);
});

test('page and post renames redirect directly, retain draft privacy and permit slug reclamation', async (t) => {
  const f = await fixture(t);
  for (const kind of ['page', 'post'] as const) {
    const prefix = kind === 'page' ? '' : '/blog';
    const entry = await f.create('first', kind);
    await f.save({
      ...defaultNavigation(),
      header: { mode: 'custom', items: [link(entry.id, 'Follow this entry')] },
    });
    await f.publish();
    await f.edit(entry.id, { slug: 'second' });
    assert.equal((await f.request('GET', `${prefix}/first`)).statusCode, 200);
    assert.equal((await f.request('GET', `${prefix}/second`)).statusCode, 404);
    await f.action(entry.id);
    await f.edit(entry.id, { slug: 'third' });
    await f.action(entry.id);
    for (const slug of ['first', 'second']) {
      const response = await f.request('GET', `${prefix}/${slug}?next=https://evil.test`);
      assert.equal(response.statusCode, 308);
      assert.equal(response.headers.location, `${prefix}/third`);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
    assert.match(
      (await f.request('GET', `${prefix}/third`)).body,
      new RegExp(`href="${prefix}/third" aria-current="page">Follow this entry`),
    );
    await f.edit(entry.id, { slug: 'first' });
    await f.action(entry.id);
    assert.equal((await f.request('GET', `${prefix}/first`)).statusCode, 200);
    assert.equal((await f.request('GET', `${prefix}/third`)).headers.location, `${prefix}/first`);
    await f.create('second', kind);
    assert.equal((await f.request('GET', `${prefix}/second`)).statusCode, 200);
    await f.action(entry.id, 'unpublish');
    assert.equal((await f.request('GET', `${prefix}/third`)).statusCode, 404);
    assert.doesNotMatch((await f.request('GET', '/')).body, /Follow this entry/);
    await f.action(entry.id);
    assert.match((await f.request('GET', `${prefix}/first`)).body, /Follow this entry/);
  }
});

test('a renamed selected homepage redirects history to root and updates when the selection changes', async (t) => {
  const f = await fixture(t);
  await f.action(f.home.id);
  const about = await f.create('about');
  await f.save({ ...defaultNavigation(), homepageId: about.id });
  await f.publish();
  await f.edit(about.id, { slug: 'studio' });
  await f.action(about.id);
  assert.equal((await f.request('GET', '/about')).headers.location, '/');
  assert.equal((await f.request('GET', '/studio')).headers.location, '/');
  await f.save(defaultNavigation());
  await f.publish();
  assert.equal((await f.request('GET', '/about')).headers.location, '/studio');
  assert.equal((await f.request('GET', '/studio')).statusCode, 200);
  assert.match((await f.request('GET', '/')).body, /Good things start/);
});

test('target search is paginated, filterable and uses public titles for published entries', async (t) => {
  const f = await fixture(t);
  const page = await f.create('public-title');
  await f.edit(page.id, { title: 'Private working title' });
  await f.create('private-page', 'page', false);
  await f.create('private-story', 'post', false);
  let response = (
    await f.request('GET', '/api/navigation/targets?q=private&kind=page&limit=1')
  ).json();
  assert.equal(response.total, 2);
  assert.equal(response.items.length, 1);
  response = (
    await f.request('GET', '/api/navigation/targets?q=private&kind=page&published=true')
  ).json();
  assert.equal(response.total, 1);
  assert.equal(response.items[0].title, 'public-title');
  assert.equal(response.items[0].path, '/public-title');
  assert.equal(response.items[0].document, undefined);
  assert.equal(
    (await f.request('GET', '/api/navigation/targets?q=private&offset=100')).json().items.length,
    0,
  );
  assert.equal((await f.request('GET', '/api/navigation/targets?limit=101')).statusCode, 400);
});

test('navigation drafts, publication, sessions and redirect history persist across restarts', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'wjs-navigation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'site.sqlite');
  const f = await fixture(t, path);
  const page = await f.create('before');
  await f.save({
    ...defaultNavigation(),
    header: { mode: 'custom', items: [link(page.id, 'Published label')] },
  });
  await f.publish();
  await f.save({ ...defaultNavigation(), footer: { text: 'Private footer', items: [] } });
  await f.edit(page.id, { slug: 'after' });
  await f.action(page.id);
  const saved = await f.state();
  await f.app.close();
  const second = await fixture(t, path, f.cookie);
  assert.deepEqual(await second.state(), saved);
  assert.equal((await second.request('GET', '/before')).headers.location, '/after');
  const html = (await second.request('GET', '/after', undefined, false)).body;
  assert.match(html, /Published label/);
  assert.doesNotMatch(html, /Private footer/);
});

test('migration 3 preserves all v2 content, media references, settings, accounts and sessions', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'wjs-navigation-upgrade-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'site.sqlite');
  const f = await fixture(t, path);
  await f.action(f.home.id);
  await f.edit(f.home.id, { title: 'Private v2 title' });
  await f.app.close();
  const db = new DatabaseSync(path);
  const mediaId = randomUUID();
  db.prepare(
    "INSERT INTO media (id,title,alt,caption,width,height,bytes,created_at,state) VALUES (?, 'Preserved image', '', '', 4, 4, 100, ?, 'active')",
  ).run(mediaId, new Date().toISOString());
  for (const stage of ['draft', 'published'])
    db.prepare('INSERT INTO content_media (content_id, media_id, stage) VALUES (?, ?, ?)').run(
      f.home.id,
      mediaId,
      stage,
    );
  const tables = ['users', 'sessions', 'settings', 'content', 'media', 'content_media'];
  const before = tables.map((name) => db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
  // A test-owned v2 fixture has exactly the previous schema and no navigation tables.
  db.exec(
    'DROP TABLE revision_media; DROP TABLE content_revisions; DROP TABLE redirects; DROP TABLE navigation; PRAGMA user_version = 2;',
  );
  db.close();
  const repo = new Repository(path);
  try {
    assert.equal(
      (repo.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
      5,
    );
    assert.deepEqual(
      tables.map((name) => repo.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()),
      before,
    );
    assert.deepEqual(repo.navigation.state().published, defaultNavigation());
    assert.equal(repo.navigation.homepage()?.id, f.home.id);
    assert.equal(repo.navigation.homepage()?.title, f.home.published?.title || f.home.title);
  } finally {
    repo.close();
  }
});
