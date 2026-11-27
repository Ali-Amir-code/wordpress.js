import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ContentView, RevisionList } from '@wordpressjs/core';

test.use({ actionTimeout: 15000 });

test('owner formats legacy text, handles links and paste safely, publishes and restores old and rich versions', async ({
  page,
  request: visitor,
  baseURL,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [],
    unwantedRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('must-not-load-pasted-image')) unwantedRequests.push(request.url());
  });
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
  const home = (await (await page.request.get('/api/content')).json()).items[0] as ContentView;
  const get = async () =>
    (await (await page.request.get(`/api/content/${home.id}`)).json()) as ContentView;
  const history = async () =>
    (await (await page.request.get(`/api/content/${home.id}/revisions`)).json()) as RevisionList;
  const legacy = await page.request.put(`/api/content/${home.id}`, {
    headers,
    data: {
      title: home.title,
      slug: home.slug,
      description: home.description,
      document: { ...home.document, schemaVersion: 1 },
      revision: home.revision,
    },
  });
  expect(legacy.ok(), await legacy.text()).toBe(true);
  const legacyVersion = (await history()).items[0]!;
  expect(
    (
      await page.request.post(`/api/content/${home.id}/publish`, {
        headers,
        data: { revision: (await get()).revision },
      })
    ).ok(),
  ).toBe(true);
  const savedLegacy = await get();
  const publicBefore = await (await visitor.get('/')).text();
  await page.goto(`/admin/#edit/${home.id}`);
  const canvas = page.frameLocator('iframe');
  await canvas.getByRole('heading', { name: 'A small introduction.' }).click({ force: true });
  const openText = page.getByRole('button', { name: 'Edit text', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Edit text', exact: true });
  const content = dialog.getByRole('textbox', { name: 'Text content', exact: true });
  await openText.focus();
  await page.keyboard.press('Enter');
  await expect(content).toContainText('Every great story starts somewhere.');
  await expect(dialog.getByRole('button', { name: 'Apply text', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(openText).toBeFocused();
  await expect(page.getByText('Unsaved changes', { exact: true })).not.toBeVisible();
  expect(await get()).toEqual(savedLegacy);

  await openText.click();
  await content.fill('Discard this text.');
  await Promise.all([
    page.waitForEvent('dialog').then((confirmation) => confirmation.dismiss()),
    page.keyboard.press('Escape'),
  ]);
  await expect(dialog).toBeVisible();
  page.once('dialog', (confirmation) => confirmation.accept());
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await get()).toEqual(savedLegacy);
  await openText.click();
  await expect(content).toContainText('Every great story starts somewhere.');

  const words =
    'Welcome to our studio.\nThoughtful work for your business.\nWhy it matters\nFirst service\nSecond service';
  const paste = async (text: string, html: string) =>
    content.evaluate(
      (element, values) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', values.text);
        clipboardData.setData('text/html', values.html);
        element.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
        );
      },
      { text, html },
    );
  await content.click();
  await page.keyboard.press('ControlOrMeta+a');
  await paste(
    words,
    '<h1 onclick="alert(1)">Imported</h1><img src="/must-not-load-pasted-image.png"><script>throw new Error("pasted script")</script>',
  );
  await expect(content).toContainText('Thoughtful work');
  await expect(content.locator('img, script, h1, [onclick]')).toHaveCount(0);
  expect(unwantedRequests).toEqual([]);
  await dialog.getByRole('button', { name: 'Undo text edit', exact: true }).click();
  await expect(content).toContainText('Every great story starts somewhere.');
  await dialog.getByRole('button', { name: 'Redo text edit', exact: true }).click();
  await expect(content).toContainText('Thoughtful work');

  const select = async (first: string, last = first) => {
    await content.evaluate(
      (element, { first, last }) => {
        (element as HTMLElement).focus();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let start: Text | null = null,
          end: Text | null = null;
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (!start && node.data.includes(first)) start = node;
          if (start && node.data.includes(last)) {
            end = node;
            break;
          }
        }
        if (!start || !end) throw new Error('Selection text not found');
        const range = document.createRange();
        range.setStart(start, start.data.indexOf(first));
        range.setEnd(end, end.data.indexOf(last) + last.length);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
      },
      { first, last },
    );
    await expect
      .poll(() => content.evaluate(() => window.getSelection()?.toString()))
      .toContain(first);
  };
  await select('Welcome to our studio.');
  await dialog.getByLabel('Paragraph style').selectOption('2');
  await expect(content.locator('h2')).toHaveText('Welcome to our studio.');
  await select('Why it matters');
  await dialog.getByLabel('Paragraph style').selectOption('3');
  await expect(content.locator('h3')).toHaveText('Why it matters');
  await select('Thoughtful');
  await dialog.getByRole('button', { name: 'Bold', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(content.locator('strong')).toHaveText('Thoughtful');
  await select('work');
  await dialog.getByRole('button', { name: 'Italic', exact: true }).click();
  await expect(content.locator('em')).toHaveText('work');
  await select('business');
  await dialog.getByRole('button', { name: 'Underline', exact: true }).click();
  await expect(content.locator('u')).toHaveText('business');
  await select('business');
  await dialog.getByRole('button', { name: 'Edit link', exact: true }).click();
  await dialog.getByLabel('Link address').fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Apply link', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Enter a /relative');
  await expect(content.locator('a')).toHaveCount(0);
  await dialog.getByLabel('Link address').fill('/contact');
  await dialog.getByRole('button', { name: 'Apply link', exact: true }).click();
  await expect(content.getByRole('link', { name: 'business' })).toHaveAttribute('href', '/contact');
  await select('First service', 'Second service');
  await dialog.getByRole('button', { name: 'Bulleted list', exact: true }).click();
  await expect(content.locator('ul > li')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Numbered list', exact: true }).click();
  await expect(content.locator('ol > li')).toHaveCount(2);
  await select('Second service');
  await dialog.getByRole('button', { name: 'Indent list item', exact: true }).click();
  await expect(content.locator('ol ol')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Outdent list item', exact: true }).click();
  await expect(content.locator('ol ol')).toHaveCount(0);
  await expect(content.locator('ol > li')).toHaveCount(2);

  await page.screenshot({ path: 'test-results/rich-text-desktop.png', fullPage: true });
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
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= 0 && rect.right <= innerWidth && element.scrollWidth <= element.clientWidth
      );
    }),
  ).toBe(true);
  await dialog.getByRole('button', { name: 'Apply text', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Apply text', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/rich-text-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole('button', { name: 'Apply text', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(canvas.getByRole('heading', { name: 'Welcome to our studio.' })).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  expect(await get()).toEqual(savedLegacy);
  // Applying text is a single page-editor edit. Undo must also undo the pending format upgrade.
  await page.getByRole('button', { name: 'undo', exact: true }).click();
  await expect(canvas.getByText('Every great story starts somewhere. This is ours.')).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'redo', exact: true }).click();
  await expect(canvas.getByRole('heading', { name: 'Welcome to our studio.' })).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Draft saved.');
  expect((await get()).document.schemaVersion).toBe(2);
  const richVersion = (await history()).items[0]!;
  expect(await (await visitor.get('/')).text()).toBe(publicBefore);
  const [preview] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'Preview saved' }).click(),
  ]);
  await expect(preview.locator('strong')).toContainText('Thoughtful');
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  await preview.close();
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Published.');
  const live = await page.context().newPage();
  await live.goto('/');
  await expect(live.getByRole('link', { name: 'business', exact: true })).toHaveAttribute(
    'href',
    '/contact',
  );
  await expect(live.locator('.site-rich-text ol > li')).toHaveCount(2);
  expect(
    (
      await new AxeBuilder({ page: live })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await live.close();
  const publicRich = await (await visitor.get('/')).text();

  const versions = page.getByRole('dialog', { name: 'Version history' });
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await versions
    .getByRole('button', { name: `View version ${legacyVersion.id}: ${home.title}`, exact: true })
    .click();
  await expect(versions.getByLabel('Restore address')).toHaveValue('home');
  page.once('dialog', (confirmation) => confirmation.accept());
  await versions.getByRole('button', { name: 'Restore as draft' }).click();
  await expect(versions).not.toBeVisible();
  await expect(canvas.getByText('Every great story starts somewhere. This is ours.')).toBeVisible();
  expect((await get()).document.schemaVersion).toBe(1);
  expect(await (await visitor.get('/')).text()).toBe(publicRich);
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await versions
    .getByRole('button', { name: `View version ${richVersion.id}: ${home.title}`, exact: true })
    .click();
  await expect(versions.getByText(/1 changed/)).toBeVisible();
  page.once('dialog', (confirmation) => confirmation.accept());
  await versions.getByRole('button', { name: 'Restore as draft' }).click();
  await expect(versions).not.toBeVisible();
  await canvas.getByRole('heading', { name: 'Welcome to our studio.' }).click({ force: true });
  await openText.click();
  await expect(content.locator('strong')).toHaveText('Thoughtful');
  await expect(dialog.getByRole('button', { name: 'Apply text', exact: true })).toBeDisabled();
  const before = await content.innerText();
  await content.click();
  await page.keyboard.press('ControlOrMeta+a');
  await paste('x'.repeat(12001), '<p>Too much text</p>');
  await expect(dialog.getByRole('alert')).toContainText('too long');
  expect(await content.innerText()).toBe(before);
  await content.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/html', '<img src="/must-not-load-pasted-image.png">');
    element.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByRole('alert')).toContainText('Paste text');
  expect(await content.innerText()).toBe(before);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(unwantedRequests).toEqual([]);
  expect(errors).toEqual([]);
});
