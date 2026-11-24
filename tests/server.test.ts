import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { ContentEntry } from '@wordpressjs/core';
import { buildApp, type AppOptions } from '../apps/server/src/app';
import { Repository } from '../apps/server/src/repository';
import { tokenHash } from '../apps/server/src/auth';

const origin = 'http://localhost:3000';
const token = 'integration-installation-token-only-not-a-real-secret';
const account = {
  name: 'Test Owner',
  email: 'owner@example.test',
  password: 'integration-password-only',
  siteTitle: 'The test studio',
  token,
};
const baseOptions: AppOptions = {
  databasePath: ':memory:',
  setupToken: token,
  siteUrl: origin,
  adminOrigin: origin,
  stylesheetPath: resolve('packages/blocks/src/styles.css'),
  rateLimit: false,
};
async function fixture(t: test.TestContext, setup = true, options: Partial<AppOptions> = {}) {
  const app = await buildApp({ ...baseOptions, ...options });
  t.after(() => app.close());
  let cookie = '';
  const request = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: unknown,
    authenticated = true,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        origin,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(authenticated && cookie ? { cookie } : {}),
      },
      ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}),
    });
  if (setup) {
    const response = await request('POST', '/api/setup', account);
    assert.equal(response.statusCode, 201, response.body);
    cookie = response.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  }
  const home = async () => (await request('GET', '/api/content')).json().items[0] as ContentEntry;
  const draft = (entry: ContentEntry) => ({
    title: entry.title,
    slug: entry.slug,
    description: entry.description,
    document: entry.document,
    revision: entry.revision,
  });
  return { app, request, home, draft, getCookie: () => cookie };
}

test('setup requires the installation key, is one-time, and authenticates the owner', async (t) => {
  const { request } = await fixture(t, false);
  assert.equal((await request('GET', '/api/setup/status')).json().needsSetup, true);
  assert.equal(
    (await request('POST', '/api/setup', { ...account, token: 'x'.repeat(40) })).statusCode,
    403,
  );
  const response = await request('POST', '/api/setup', account);
  assert.equal(response.statusCode, 201);
  assert.match(String(response.headers['set-cookie']), /HttpOnly/);
  assert.match(String(response.headers['set-cookie']), /SameSite=Strict/);
  assert.equal((await request('POST', '/api/setup', account)).statusCode, 409);
  assert.equal((await request('GET', '/api/setup/status')).json().needsSetup, false);
  assert.equal((await request('GET', '/api/content')).statusCode, 401);
});

test('authenticated APIs reject missing and hostile origins for mutations', async (t) => {
  const { app, getCookie } = await fixture(t);
  for (const badOrigin of [undefined, 'https://evil.example', 'null']) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        cookie: getCookie(),
        'content-type': 'application/json',
        ...(badOrigin ? { origin: badOrigin } : {}),
      },
      payload: '{}',
    });
    assert.equal(response.statusCode, 403);
  }
  const unsupported = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers: { origin, cookie: getCookie(), 'content-type': 'text/plain' },
    payload: '{}',
  });
  assert.equal(unsupported.statusCode, 415);
});

test('published snapshots isolate draft content, metadata and slug until republished', async (t) => {
  const { request, home, draft } = await fixture(t);
  let entry = await home();
  assert.doesNotMatch((await request('GET', '/', undefined, false)).body, /Good things start/);
  assert.equal(
    (await request('GET', `/api/content/${entry.id}/preview`, undefined, false)).statusCode,
    401,
  );
  const preview = await request('GET', `/api/content/${entry.id}/preview`);
  assert.match(preview.body, /Good things start/);
  assert.equal(preview.headers['cache-control'], 'no-store');
  assert.match(preview.body, /noindex, nofollow/);
  entry = (
    await request('POST', `/api/content/${entry.id}/publish`, { revision: entry.revision })
  ).json();
  assert.match((await request('GET', '/', undefined, false)).body, /Good things start/);
  const changes = draft(entry);
  changes.title = 'PRIVATE TITLE';
  changes.slug = 'new-address';
  changes.description = 'PRIVATE DESCRIPTION';
  changes.document.content = [
    {
      type: 'Text',
      props: { id: 'private-block', heading: 'PRIVATE HEADING', text: 'PRIVATE BODY' },
    },
  ];
  entry = (await request('PUT', `/api/content/${entry.id}`, changes)).json();
  const publicHtml = (await request('GET', '/', undefined, false)).body;
  assert.doesNotMatch(publicHtml, /PRIVATE/);
  assert.match(publicHtml, /Good things start/);
  assert.equal((await request('GET', '/new-address', undefined, false)).statusCode, 404);
  assert.doesNotMatch((await request('GET', '/sitemap.xml', undefined, false)).body, /new-address/);
  entry = (
    await request('POST', `/api/content/${entry.id}/publish`, { revision: entry.revision })
  ).json();
  assert.match((await request('GET', '/new-address', undefined, false)).body, /PRIVATE BODY/);
  assert.doesNotMatch((await request('GET', '/', undefined, false)).body, /Good things start/);
  assert.match((await request('GET', '/sitemap.xml', undefined, false)).body, /new-address/);
  entry = (
    await request('POST', `/api/content/${entry.id}/unpublish`, { revision: entry.revision })
  ).json();
  assert.equal((await request('GET', '/new-address', undefined, false)).statusCode, 404);
  assert.equal(entry.document.content[0]?.type, 'Text');
});

test('stale writes and publication actions fail without changing the newest draft', async (t) => {
  const { request, home, draft } = await fixture(t);
  const initial = await home();
  assert.equal(
    (await request('PUT', `/api/content/${initial.id}`, { ...draft(initial), title: 'Newest' }))
      .statusCode,
    200,
  );
  assert.equal(
    (await request('PUT', `/api/content/${initial.id}`, { ...draft(initial), title: 'Stale' }))
      .statusCode,
    409,
  );
  for (const action of ['publish', 'unpublish'])
    assert.equal(
      (
        await request('POST', `/api/content/${initial.id}/${action}`, {
          revision: initial.revision,
        })
      ).statusCode,
      409,
    );
  const current = await home();
  assert.equal(current.title, 'Newest');
  assert.equal(current.published, null);
});

test('duplicate draft and published slugs cannot overwrite other content', async (t) => {
  const { request, home, draft } = await fixture(t);
  let initial = await home();
  assert.equal(
    (await request('POST', '/api/content', { title: 'Duplicate', slug: 'home', kind: 'page' }))
      .statusCode,
    409,
  );
  initial = (
    await request('POST', `/api/content/${initial.id}/publish`, { revision: initial.revision })
  ).json();
  await request('PUT', `/api/content/${initial.id}`, { ...draft(initial), slug: 'moved' });
  const second = (
    await request('POST', '/api/content', { title: 'New home', slug: 'home', kind: 'page' })
  ).json() as ContentEntry;
  assert.equal(
    (await request('POST', `/api/content/${second.id}/publish`, { revision: second.revision }))
      .statusCode,
    409,
  );
  assert.match((await request('GET', '/')).body, /Good things start/);
});

test('the server rejects unsupported blocks and unsafe URLs, and escapes text', async (t) => {
  const { request, home, draft } = await fixture(t);
  const initial = await home();
  const badDocument = {
    schemaVersion: 1,
    root: { props: {} },
    content: [
      {
        type: 'Hero',
        props: { ...initial.document.content[0]!.props, buttonHref: 'javascript:alert(1)' },
      },
    ],
  };
  assert.equal(
    (
      await request('PUT', `/api/content/${initial.id}`, {
        ...draft(initial),
        document: badDocument,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await request('POST', '/api/content', { title: 'Bad', slug: 'admin', kind: 'page' }))
      .statusCode,
    400,
  );
  const saved = (
    await request('PUT', `/api/content/${initial.id}`, {
      ...draft(initial),
      title: '<script>alert(1)</script>',
      document: {
        schemaVersion: 1,
        root: { props: {} },
        content: [
          {
            type: 'Text',
            props: { id: 'xss-test', heading: 'Safe heading', text: '<script>alert(1)</script>' },
          },
        ],
      },
    })
  ).json() as ContentEntry;
  await request('POST', `/api/content/${saved.id}/publish`, { revision: saved.revision });
  const response = await request('GET', '/');
  assert.doesNotMatch(response.body, /<script>/);
  assert.match(response.body, /&lt;script&gt;/);
  assert.match(String(response.headers['content-security-policy']), /script-src 'self'/);
});

test('blog and sitemap include only published posts with canonical metadata', async (t) => {
  const { request } = await fixture(t);
  const post = (
    await request('POST', '/api/content', {
      title: 'A journal entry',
      slug: 'first-story',
      kind: 'post',
    })
  ).json() as ContentEntry;
  assert.doesNotMatch((await request('GET', '/blog')).body, /A journal entry/);
  assert.equal((await request('GET', '/blog/first-story')).statusCode, 404);
  await request('POST', `/api/content/${post.id}/publish`, { revision: post.revision });
  assert.match((await request('GET', '/blog')).body, /A journal entry/);
  const html = (await request('GET', '/blog/first-story')).body;
  assert.match(html, /rel="canonical" href="http:\/\/localhost:3000\/blog\/first-story"/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match((await request('GET', '/sitemap.xml')).body, /blog\/first-story/);
});

test('logout revokes sessions and login uses the original credentials', async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request('GET', '/api/auth/me')).statusCode, 200);
  await request('POST', '/api/auth/logout', {});
  assert.equal((await request('GET', '/api/auth/me')).statusCode, 401);
  assert.equal(
    (
      await request('POST', '/api/auth/login', {
        email: account.email,
        password: 'incorrect-password',
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await request('POST', '/api/auth/login', { email: account.email, password: account.password }))
      .statusCode,
    200,
  );
});

test('site settings use revision checks and reject arbitrary theme values', async (t) => {
  const { request } = await fixture(t);
  const state = (await request('GET', '/api/settings')).json();
  assert.equal(
    (
      await request('PUT', '/api/settings', {
        ...state,
        settings: { ...state.settings, accent: 'url(javascript:test)' },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request('PUT', '/api/settings', {
        ...state,
        settings: { ...state.settings, title: 'Our new studio' },
      })
    ).statusCode,
    200,
  );
  assert.equal((await request('PUT', '/api/settings', state)).statusCode, 409);
  assert.match((await request('GET', '/')).body, /Our new studio/);
});

test('content lists support search, kind/status filters and pagination', async (t) => {
  const { request } = await fixture(t);
  for (let i = 0; i < 3; i++)
    await request('POST', '/api/content', {
      title: `Story ${i}`,
      slug: `story-${i}`,
      kind: 'post',
    });
  const response = (
    await request('GET', '/api/content?kind=post&q=story&limit=2&offset=2&status=draft')
  ).json();
  assert.equal(response.total, 3);
  assert.equal(response.items.length, 1);
  assert.equal((await request('GET', '/api/content?limit=100000')).statusCode, 400);
});

test('database persists across restarts, sessions are hashed and expired tokens fail', async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'wjs-test-'));
  const path = resolve(directory, 'test.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await fixture(t, true, { databasePath: path });
  const initial = await first.home();
  await first.request('POST', `/api/content/${initial.id}/publish`, { revision: initial.revision });
  await first.app.close();
  const repo = new Repository(path);
  const session = repo.db.prepare('SELECT token_hash FROM sessions').get() as {
    token_hash: string;
  };
  const raw = first.getCookie().split('=')[1]!;
  assert.notEqual(session.token_hash, raw);
  assert.equal(session.token_hash, tokenHash(raw));
  repo.db.prepare('UPDATE sessions SET expires_at = 0').run();
  assert.equal(repo.session(tokenHash(raw)), undefined);
  repo.close();
  const second = await fixture(t, false, { databasePath: path });
  assert.equal((await second.request('GET', '/api/setup/status')).json().needsSetup, false);
  assert.match((await second.request('GET', '/')).body, /Good things start/);
});

test('login endpoints rate limit repeated attempts', async (t) => {
  const { request } = await fixture(t, false, { rateLimit: true });
  for (let i = 0; i < 8; i++) await request('POST', '/api/auth/login', { email: 'invalid' });
  assert.equal((await request('POST', '/api/auth/login', { email: 'invalid' })).statusCode, 429);
});
