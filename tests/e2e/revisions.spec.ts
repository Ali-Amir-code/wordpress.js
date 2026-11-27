import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ContentView, Draft, RevisionList } from '@wordpressjs/core';

test.use({ actionTimeout: 15000 });

test('owner previews, compares and restores a version as a private draft, then edits and publishes it', async ({
  page,
  request: visitor,
  baseURL,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin/');
  await page.getByLabel('Your name').fill('Alex Morgan');
  await page.getByLabel('Website name').fill('The little studio');
  await page.getByLabel('Email address').fill('alex@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a-browser-test-password');
  await page
    .getByLabel('Installation key')
    .fill('browser-test-installation-key-not-for-real-deployment');
  await page.getByRole('button', { name: 'Create my website' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Alex.' })).toBeVisible();

  const headers = { origin: baseURL! };
  const created = await page.request.post('/api/content', {
    headers,
    data: { title: 'The first chapter', slug: 'our-beginnings', kind: 'page', template: 'starter' },
  });
  expect(created.status()).toBe(201);
  let entry = (await created.json()) as ContentView;
  const get = async () =>
    (await (await page.request.get(`/api/content/${entry.id}`)).json()) as ContentView;
  const history = async () =>
    (await (
      await page.request.get(`/api/content/${entry.id}/revisions?limit=50`)
    ).json()) as RevisionList;
  const save = async (title: string, slug: string, headline: string) => {
    const current = await get();
    const draft: Draft = {
      title,
      slug,
      description: `About ${title.toLowerCase()}.`,
      document: {
        ...current.document,
        content: current.document.content.map((block) =>
          block.type === 'Hero' ? { ...block, props: { ...block.props, title: headline } } : block,
        ),
      },
    };
    const response = await page.request.put(`/api/content/${entry.id}`, {
      headers,
      data: { ...draft, revision: current.revision },
    });
    expect(response.ok(), await response.text()).toBe(true);
    entry = (await response.json()) as ContentView;
  };
  const publish = async () => {
    const current = await get();
    const response = await page.request.post(`/api/content/${entry.id}/publish`, {
      headers,
      data: { revision: current.revision },
    });
    expect(response.ok(), await response.text()).toBe(true);
  };
  await save('The first chapter', 'our-beginnings', 'A small beginning.');
  const original = (await history()).items[0]!;
  await publish();
  await save('Today at the studio', 'our-story', 'Look how far we have come.');
  await publish();
  const claimed = await page.request.post('/api/content', {
    headers,
    data: { title: 'A different page', slug: 'our-beginnings', kind: 'page', template: 'blank' },
  });
  expect(claimed.status()).toBe(201);
  const publicBefore = await (await visitor.get('/our-story')).text();
  await page.goto(`/admin/#edit/${entry.id}`);
  await expect(page.getByRole('heading', { name: /Your canvas/ })).toBeVisible();
  const openHistory = page.getByRole('button', { name: 'Version history', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Version history' });
  await openHistory.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: 'Restore as draft' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(openHistory).toBeFocused();

  // A temporary list failure must leave Refresh available without stale restore controls.
  await openHistory.click();
  await expect(dialog.getByRole('button', { name: 'Restore as draft' })).toBeEnabled();
  await page.route(
    `**/api/content/${entry.id}/revisions?*`,
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'History is temporarily unavailable. Try again.' }),
      });
    },
    { times: 1 },
  );
  await dialog.getByRole('button', { name: 'Refresh history' }).click();
  await expect(dialog.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(dialog.getByRole('button', { name: 'Restore as draft' })).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Refresh history' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Refresh history' }).click();
  await expect(dialog.getByRole('button', { name: 'Restore as draft' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  // Inspecting history is allowed with local edits; replacement is blocked until they are saved.
  await page.getByRole('button', { name: 'Page details', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Our current working title');
  await openHistory.click();
  await expect(dialog.getByRole('status')).toContainText('You have unsaved edits.');
  await expect(dialog.getByRole('button', { name: 'Restore as draft' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Draft saved.');
  await openHistory.click();
  await dialog
    .getByRole('button', { name: `View version ${original.id}: The first chapter`, exact: true })
    .click();
  await expect(dialog.getByLabel('Restore address')).toHaveValue('our-beginnings');
  await expect(dialog.getByRole('table')).toContainText('Our current working title');
  await expect(dialog.getByText('0 blocks added · 0 removed · 1 changed')).toBeVisible();
  const [preview] = await Promise.all([
    page.waitForEvent('popup'),
    dialog.getByRole('link', { name: 'Preview version' }).click(),
  ]);
  await expect(preview.getByRole('heading', { name: 'A small beginning.' })).toBeVisible();
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  await preview.close();
  expect(
    (await visitor.get(`/api/content/${entry.id}/revisions/${original.id}/preview`)).status(),
  ).toBe(401);
  await page.screenshot({ path: 'test-results/revisions-desktop.png', fullPage: true });
  expect(
    (
      await new AxeBuilder({ page })
        .include('dialog')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/revisions-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Restore as draft' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Restore as draft' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/revisions-mobile-restore.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });

  page.once('dialog', (confirmation) => confirmation.dismiss());
  await dialog.getByRole('button', { name: 'Restore as draft' }).click();
  await expect(dialog).toBeVisible();
  expect((await get()).title).toBe('Our current working title');
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: 'Restore as draft' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/slug|address/i);
  expect((await get()).title).toBe('Our current working title');
  await dialog.getByLabel('Restore address').fill('recovered-story');
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: 'Restore as draft' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText(
    'Version restored as a private draft.',
  );
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('The first chapter');
  await expect(page.getByLabel('URL slug')).toHaveValue('recovered-story');
  await expect(page.getByLabel('Search description')).toHaveValue('About the first chapter.');
  const canvas = page.frameLocator('iframe');
  await expect(canvas.getByRole('heading', { name: 'A small beginning.' })).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).not.toBeVisible();
  expect(await (await visitor.get('/our-story')).text()).toBe(publicBefore);
  expect((await visitor.get('/recovered-story')).status()).toBe(404);
  expect((await history()).items[0]!.restoredFrom).toBe(original.id);

  // Puck must reset its internal document and undo history before accepting further edits.
  await canvas.getByRole('heading', { name: 'A small beginning.' }).click({ force: true });
  await page
    .getByRole('textbox', { name: 'Headline', exact: true })
    .fill('A beginning worth keeping.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Draft saved.');
  await page.reload();
  await expect(canvas.getByRole('heading', { name: 'A beginning worth keeping.' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Published.');
  expect(await (await visitor.get('/recovered-story')).text()).toContain(
    'A beginning worth keeping.',
  );
  expect((await visitor.get('/our-story', { maxRedirects: 0 })).status()).toBe(308);

  // A newer save in another window prevents an old editor from restoring over it.
  await openHistory.click();
  await expect(dialog.getByRole('button', { name: 'Restore as draft' })).toBeEnabled();
  await save('Saved in another window', 'recovered-story', 'Another window kept this.');
  const beforeConflict = (await history()).total;
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: 'Restore as draft' }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed in another window');
  expect((await get()).title).toBe('Saved in another window');
  expect((await history()).total).toBe(beforeConflict);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  for (let i = 0; i < 4; i++)
    await save(`Recent edit ${i}`, 'recovered-story', 'Another window kept this.');
  await page.reload();
  await openHistory.click();
  await dialog.getByRole('button', { name: 'Older versions' }).click();
  await expect(dialog.getByRole('button', { name: 'Newer versions' })).toBeEnabled();
  await expect(
    dialog.getByRole('button', {
      name: `View version ${original.id}: The first chapter`,
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Newer versions' }).click();
  await expect(dialog.getByRole('button', { name: 'Newer versions' })).toBeDisabled();
  expect(errors).toEqual([]);
});
