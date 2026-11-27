import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentPath,
  documentSchema,
  isSafeUrl,
  slugSchema,
  starterDocument,
} from '@wordpressjs/core';

test('starter content satisfies the persisted versioned contract', () => {
  const document = starterDocument();
  assert.deepEqual(documentSchema.parse(document), document);
  assert.equal(contentPath('page', 'home'), '/');
  assert.equal(contentPath('post', 'home'), '/blog/home');
});
test('URL allowlist rejects executable, ambiguous and control-character links', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    '//evil.example',
    '/\\evil.example',
    'java\nscript:foo',
    'ftp://example.com',
    ' https://example.com',
  ])
    assert.equal(isSafeUrl(value), false, value);
  for (const value of [
    'https://example.com/path',
    '/contact',
    '#story',
    'mailto:hello@example.com',
    'tel:+15555550100',
  ])
    assert.equal(isSafeUrl(value), true, value);
  assert.equal(isSafeUrl('mailto:test@example.com', true), false);
});
test('documents reject unknown schemas, unknown props, duplicate IDs and excessive content', () => {
  const document = starterDocument();
  assert.equal(documentSchema.safeParse({ ...document, schemaVersion: 3 }).success, false);
  assert.equal(
    documentSchema.safeParse({ ...document, content: [document.content[0], document.content[0]] })
      .success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({
      ...document,
      content: [{ type: 'Script', props: { id: 'x', src: '/x' } }],
    }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({
      ...document,
      content: [
        { ...document.content[0], props: { ...document.content[0]!.props, html: '<script/>' } },
      ],
    }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({
      ...document,
      content: Array.from({ length: 101 }, (_, i) => ({
        type: 'Spacer',
        props: { id: `s-${i}`, size: 'small' },
      })),
    }).success,
    false,
  );
});
test('slugs protect system routes and normalize no input silently', () => {
  for (const value of [
    'admin',
    'api',
    'blog',
    '../home',
    'A Title',
    '-hello',
    'hello-',
    'hello--world',
  ])
    assert.equal(slugSchema.safeParse(value).success, false, value);
  assert.equal(slugSchema.safeParse('hello-world').success, true);
});
