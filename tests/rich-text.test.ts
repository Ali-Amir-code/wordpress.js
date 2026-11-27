import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentView } from '@wordpressjs/blocks';
import {
  documentSchema,
  richTextSchema,
  richTextFromPlainText,
  richTextToPlainText,
  mediaSelection,
  type RichText,
  type RichTextList,
  type RichTextParagraph,
  type Draft,
  type ContentEntry,
} from '@wordpressjs/core';
import { Repository } from '../apps/server/src/repository';
import { buildApp } from '../apps/server/src/app';
import { tokenHash } from '../apps/server/src/auth';

const paragraph = (text: string): RichTextParagraph => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const body = (): RichText => ({
  version: 1,
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Our story' }] },
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'The details' }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Meaningful work',
          marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }],
        },
        { type: 'hardBreak' },
        {
          type: 'text',
          text: 'Contact us',
          marks: [{ type: 'link', attrs: { href: 'mailto:hello@example.test' } }],
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            paragraph('Care'),
            {
              type: 'orderedList',
              attrs: { start: 3 },
              content: [{ type: 'listItem', content: [paragraph('Craft')] }],
            },
          ],
        },
      ],
    },
  ],
});
const legacy = (): Draft => ({
  title: 'Our story',
  slug: 'home',
  description: 'A small studio.',
  document: {
    schemaVersion: 1,
    root: { props: {} },
    content: [
      {
        type: 'Text',
        props: {
          id: 'story',
          heading: 'Welcome',
          text: 'Original words.\n\nOur second paragraph.',
        },
      },
    ],
  },
});
const rich = (text = body()): Draft => ({
  ...legacy(),
  document: {
    schemaVersion: 2,
    root: { props: {} },
    content: [{ type: 'Text', props: { id: 'story', heading: 'Welcome', text } }],
  },
});
const render = (draft: Draft) =>
  renderToStaticMarkup(createElement(DocumentView, { document: draft.document }));

test('rich text accepts only supported semantic nodes and document versions', () => {
  assert.deepEqual(richTextSchema.parse(body()), body());
  assert.equal(documentSchema.safeParse(rich().document).success, true);
  assert.equal(documentSchema.safeParse(legacy().document).success, true);
  assert.equal(documentSchema.safeParse({ ...legacy().document, schemaVersion: 2 }).success, true);
  assert.equal(documentSchema.safeParse({ ...rich().document, schemaVersion: 1 }).success, false);
  assert.equal(richTextSchema.safeParse({ ...body(), version: 2 }).success, false);
});

test('rich text rejects executable links, unknown attributes, unsupported nodes and duplicate marks', () => {
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,hi',
    '//host.test',
    '/\\host.test',
    'java\nscript:alert(1)',
    ' https://host.test',
    'ftp://host.test',
    'x'.repeat(2049),
  ]) {
    const value = richTextFromPlainText('Click');
    value.content = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Click', marks: [{ type: 'link', attrs: { href } }] }],
      },
    ];
    assert.equal(richTextSchema.safeParse(value).success, false, href);
  }
  for (const node of [
    { type: 'image', attrs: { src: '/bad.png' } },
    { type: 'paragraph', attrs: { style: 'color:red' } },
    { type: 'heading', attrs: { level: 1 }, content: [] },
    { type: 'paragraph', content: [{ type: 'text', text: 'bad', html: '<script/>' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'bad', marks: [{ type: 'bold', attrs: { onclick: 'run()' } }] },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'bad',
          marks: [{ type: 'link', attrs: { href: '/ok', target: '_blank' } }],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'bad', marks: [{ type: 'bold' }, { type: 'bold' }] }],
    },
    { type: 'bulletList', content: [{ type: 'listItem', content: [] }] },
    {
      type: 'orderedList',
      attrs: { start: 0 },
      content: [{ type: 'listItem', content: [paragraph('Bad')] }],
    },
  ])
    assert.equal(
      richTextSchema.safeParse({ version: 1, type: 'doc', content: [node] }).success,
      false,
      JSON.stringify(node),
    );
  assert.equal(richTextSchema.safeParse({ ...body(), html: '<script/>' }).success, false);
});

test('rich text bounds aggregate characters, node count, blocks and nested lists before recursion', () => {
  assert.equal(richTextSchema.safeParse(richTextFromPlainText('x'.repeat(12000))).success, true);
  assert.equal(
    richTextSchema.safeParse({
      version: 1,
      type: 'doc',
      content: [paragraph('x'.repeat(6000)), paragraph('y'.repeat(6001))],
    }).success,
    false,
  );
  assert.equal(
    richTextSchema.safeParse({
      version: 1,
      type: 'doc',
      content: Array.from({ length: 201 }, () => paragraph('x')),
    }).success,
    false,
  );
  const nested = (depth: number): RichTextList => ({
    type: 'bulletList',
    content: [
      { type: 'listItem', content: [paragraph('Item'), ...(depth > 1 ? [nested(depth - 1)] : [])] },
    ],
  });
  assert.equal(
    richTextSchema.safeParse({ version: 1, type: 'doc', content: [nested(3)] }).success,
    true,
  );
  assert.equal(
    richTextSchema.safeParse({ version: 1, type: 'doc', content: [nested(4)] }).success,
    false,
  );
  let deeplyNested: unknown = paragraph('Deep');
  for (let i = 0; i < 10000; i++) deeplyNested = { type: 'bulletList', content: [deeplyNested] };
  assert.equal(
    richTextSchema.safeParse({ version: 1, type: 'doc', content: [deeplyNested] }).success,
    false,
  );
  const tooManyNodes = {
    version: 1,
    type: 'doc',
    content: [
      { type: 'paragraph', content: Array.from({ length: 2001 }, () => ({ type: 'hardBreak' })) },
    ],
  };
  assert.equal(richTextSchema.safeParse(tooManyNodes).success, false);
});

test('shared rendering emits semantic markup and treats HTML-looking text literally', () => {
  const html = render(rich());
  for (const markup of [
    '<h2>Our story</h2>',
    '<h3>The details</h3>',
    '<u><em><strong>Meaningful work</strong></em></u>',
    '<br/>',
    '<a href="mailto:hello@example.test">Contact us</a>',
    '<ul>',
    '<ol start="3">',
    '<li>',
  ])
    assert.ok(html.includes(markup), markup);
  const literal = render(
    rich(richTextFromPlainText('<img src=x onerror=alert(1)><script>bad()</script>')),
  );
  assert.match(literal, /&lt;img/);
  assert.doesNotMatch(literal, /<script|<img|onerror="/);
  const bypassed = body();
  bypassed.content = [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Literal link',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        },
      ],
    },
  ];
  assert.doesNotMatch(render(rich(bypassed)), /href=|javascript:/);
});

test('legacy text remains literal and editable without rewriting its stored document', () => {
  for (const text of [
    '',
    '<b>Not HTML</b> & words\nSecond line.',
    'First\n\nSecond',
    '\n'.repeat(12000),
  ]) {
    const result = richTextFromPlainText(text);
    assert.equal(richTextSchema.safeParse(result).success, true);
    assert.equal(richTextToPlainText(result), text);
  }
  assert.equal(
    render(legacy()),
    render({ ...legacy(), document: { ...legacy().document, schemaVersion: 2 } }),
  );
  const original = JSON.stringify(legacy());
  const value = legacy().document.content[0]!;
  if (value.type === 'Text' && typeof value.props.text === 'string')
    richTextFromPlainText(value.props.text);
  assert.equal(JSON.stringify(legacy()), original);
});

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(resolve(tmpdir(), 'wjs-rich-text-'));
  const path = resolve(directory, 'site.sqlite');
  const repo = new Repository(path);
  const home = repo.setup('Owner', 'owner@example.test', 'fixture-only-hash', 'Studio', legacy());
  const session = 'rich-text-tests-only-session';
  repo.addSession(tokenHash(session), Date.now() + 3600000);
  const app = await buildApp({
    databasePath: path,
    siteUrl: 'http://localhost:3000',
    adminOrigin: 'http://localhost:3000',
    setupToken: 'fixture-only-install-key'.repeat(2),
    stylesheetPath: resolve('packages/blocks/src/styles.css'),
    rateLimit: false,
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
  const request = (method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown, auth = true) =>
    app.inject({
      method,
      url,
      headers: {
        origin: 'http://localhost:3000',
        ...(auth ? { cookie: `wjs_session=${session}` } : {}),
        ...(payload ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload ? { payload: JSON.stringify(payload) } : {}),
    });
  return { path, repo, home, close, request, session };
}

test('rich text saves privately, publishes, survives restart and restores both legacy and formatted history', async (t) => {
  const f = await fixture(t);
  const original = f.repo.revisions.list(f.home.id, 20, 0).items[0]!;
  f.repo.publish(f.home.id, f.home.revision, true);
  const publicBefore = (await f.request('GET', '/', undefined, false)).body;
  const saved = await f.request('PUT', `/api/content/${f.home.id}`, {
    ...rich(),
    revision: f.repo.get(f.home.id).revision,
  });
  assert.equal(saved.statusCode, 200, saved.body);
  const version = f.repo.revisions.list(f.home.id, 20, 0).items[0]!;
  assert.equal((await f.request('GET', '/', undefined, false)).body, publicBefore);
  assert.match(
    (await f.request('GET', `/api/content/${f.home.id}/preview`)).body,
    /<strong>Meaningful work/,
  );
  assert.equal(
    (await f.request('GET', `/api/content/${f.home.id}/preview`, undefined, false)).statusCode,
    401,
  );
  f.repo.publish(f.home.id, saved.json<ContentEntry>().revision, true);
  const publicRich = (await f.request('GET', '/', undefined, false)).body;
  assert.match(publicRich, /<ol start="3">/);
  assert.doesNotMatch(publicRich, /<script/);
  const restored = await f.request(
    'POST',
    `/api/content/${f.home.id}/revisions/${original.id}/restore`,
    { revision: f.repo.get(f.home.id).revision },
  );
  assert.equal(restored.statusCode, 200, restored.body);
  assert.equal(restored.json<ContentEntry>().document.schemaVersion, 1);
  assert.equal((await f.request('GET', '/', undefined, false)).body, publicRich);
  const back = await f.request(
    'POST',
    `/api/content/${f.home.id}/revisions/${version.id}/restore`,
    { revision: restored.json<ContentEntry>().revision },
  );
  assert.equal(back.statusCode, 200, back.body);
  assert.deepEqual(back.json<ContentEntry>().document, rich().document);
  await f.close();
  const reopened = new Repository(f.path);
  try {
    assert.deepEqual(reopened.get(f.home.id).document, rich().document);
  } finally {
    reopened.close();
  }
});

test('invalid rich-text saves and unsafe retained versions fail without changing saved state or history', async (t) => {
  const f = await fixture(t),
    before = f.repo.get(f.home.id);
  const versions = f.repo.revisions.list(f.home.id, 20, 0);
  const invalid = rich();
  invalid.document.schemaVersion = 1;
  assert.equal(
    (await f.request('PUT', `/api/content/${f.home.id}`, { ...invalid, revision: before.revision }))
      .statusCode,
    400,
  );
  assert.equal(
    (
      await f.request('PUT', `/api/content/${f.home.id}`, {
        ...rich(),
        revision: before.revision + 1,
      })
    ).statusCode,
    409,
  );
  const unsafe = rich(richTextFromPlainText('Link'));
  const block = unsafe.document.content[0]!;
  if (block.type === 'Text' && typeof block.props.text !== 'string')
    block.props.text.content = [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Bad link',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      },
    ];
  assert.equal(
    (await f.request('PUT', `/api/content/${f.home.id}`, { ...unsafe, revision: before.revision }))
      .statusCode,
    400,
  );
  assert.deepEqual(f.repo.get(f.home.id), before);
  assert.deepEqual(f.repo.revisions.list(f.home.id, 20, 0), versions);
  f.repo.db
    .prepare('UPDATE content_revisions SET snapshot = ? WHERE id = ?')
    .run(JSON.stringify(unsafe), versions.items[0]!.id);
  const path = `/api/content/${f.home.id}/revisions/${versions.items[0]!.id}`;
  assert.equal((await f.request('GET', `${path}/preview`)).statusCode, 409);
  assert.equal(
    (await f.request('POST', `${path}/restore`, { revision: before.revision })).statusCode,
    409,
  );
  assert.deepEqual(f.repo.get(f.home.id), before);
});

test('migration 5 preserves every v4 row, legacy history and media references without content conversion', async (t) => {
  const f = await fixture(t);
  const imageId = randomUUID();
  f.repo.media.reserve(imageId, { title: 'Fixture', alt: 'Fixture', caption: '' }, 4, 2, 2);
  const image = f.repo.media.activate(imageId);
  const withImage = legacy();
  withImage.document.content.push({
    type: 'MediaImage',
    props: { id: 'image', asset: mediaSelection(image) },
  });
  const saved = f.repo.save(f.home.id, withImage, f.home.revision);
  f.repo.publish(f.home.id, saved.revision, true);
  f.repo.save(f.home.id, { ...legacy(), title: 'Private words' }, f.repo.get(f.home.id).revision);
  const tables = [
    'users',
    'sessions',
    'settings',
    'content',
    'media',
    'content_media',
    'navigation',
    'redirects',
    'content_revisions',
    'revision_media',
  ];
  const before = tables.map((name) =>
    f.repo.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all(),
  );
  const snapshot = f.repo.get(f.home.id);
  await f.close();
  const old = new DatabaseSync(f.path);
  old.exec('PRAGMA user_version = 4');
  old.close();
  const upgraded = new Repository(f.path);
  try {
    assert.equal(upgraded.db.prepare('PRAGMA user_version').get()!.user_version, 5);
    assert.deepEqual(
      tables.map((name) => upgraded.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()),
      before,
    );
    assert.deepEqual(upgraded.get(f.home.id), snapshot);
    assert.ok(upgraded.session(tokenHash(f.session)));
    assert.deepEqual(upgraded.db.prepare('PRAGMA foreign_key_check').all(), []);
    const oldVersion = upgraded.revisions.list(f.home.id, 20, 0).items.at(-1)!;
    assert.equal(
      upgraded.restore(f.home.id, oldVersion.id, snapshot.revision).document.schemaVersion,
      1,
    );
    upgraded.db.exec('PRAGMA user_version = 6');
  } finally {
    upgraded.close();
  }
  assert.throws(() => new Repository(f.path), /newer than this application/);
});
