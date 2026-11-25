import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import type { MediaList } from '@wordpressjs/core';

test.use({ actionTimeout: 15000 });

test('owner uploads, describes, selects and publishes an image with private drafts and protected deletion', async ({
  page,
  request: visitor,
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
  await page.getByRole('link', { name: 'Media', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A home for your images' })).toBeVisible();
  await page.getByLabel('Upload image file').setInputFiles({
    name: 'unsafe.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await expect(page.getByRole('alert')).toContainText('Choose a JPEG, PNG or WebP');
  const picture = await sharp({
    create: { width: 900, height: 600, channels: 3, background: '#244d3c' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel('Upload image file')
    .setInputFiles({ name: 'studio.png', mimeType: 'image/png', buffer: picture });
  const details = page.getByRole('dialog', { name: 'Image details' });
  await expect(details).toBeVisible();
  await details.getByLabel('Image title').fill('The studio');
  await details.getByLabel('Alternative text').fill('A calm green studio wall');
  await details.getByLabel('Caption').fill('A space to make things');
  await details.getByRole('button', { name: 'Save image details' }).click();
  await expect(details.getByRole('status')).toContainText('Image details saved.');
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/media-details.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(details).not.toBeVisible();
  const catalog = (await (await page.request.get('/api/media')).json()) as MediaList;
  const asset = catalog.items[0]!;
  expect((await visitor.get(asset.url)).status()).toBe(404);
  await page.getByLabel('Search images').fill('studio');
  await expect(page.getByRole('button', { name: 'Choose The studio', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/media-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/media-library.png', fullPage: true });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);

  await page.getByRole('link', { name: /^Pages\b/ }).click();
  await page.getByRole('button', { name: 'New page', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Our studio');
  await page.getByRole('button', { name: 'Create page', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Your canvas/ })).toBeVisible();
  const source = page.getByRole('button', { name: 'Library image', exact: true });
  const canvas = page.frameLocator('iframe').locator('[data-puck-dropzone]').first();
  await expect(canvas).toBeVisible();
  const start = (await source.boundingBox())!;
  const target = (await canvas.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 15, start.y + start.height / 2, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 30 });
  await page.mouse.up();
  await page
    .frameLocator('iframe')
    .getByText('Choose an image from your media library.')
    .click({ force: true });
  await page.getByRole('button', { name: 'Choose image', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose an image' });
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose image', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Choose The studio', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(picker).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Alternative text/ })).toHaveValue(
    'A calm green studio wall',
  );
  await page
    .getByRole('textbox', { name: 'Caption', exact: true })
    .fill('The studio, ready for a new day');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Draft saved.');
  await expect(page.getByText('Unsaved changes', { exact: true })).not.toBeVisible();
  expect((await visitor.get(asset.url)).status()).toBe(404);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Published.');
  expect((await visitor.get(asset.url)).status()).toBe(200);
  expect(await (await visitor.get('/our-studio')).text()).toContain(
    'The studio, ready for a new day',
  );
  await page.getByRole('textbox', { name: 'Caption', exact: true }).fill('Private draft caption');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Draft saved.');
  expect(await (await visitor.get('/our-studio')).text()).not.toContain('Private draft caption');

  await page.getByRole('button', { name: 'Back to content' }).click();
  await page.getByRole('link', { name: 'Media', exact: true }).click();
  await page.getByRole('button', { name: 'Choose The studio', exact: true }).click();
  await expect(details.getByRole('button', { name: 'Delete image' })).toBeDisabled();
  await details.getByLabel('Caption').fill('New default caption');
  await details.getByRole('button', { name: 'Save image details' }).click();
  await expect(details.getByRole('status')).toContainText('Image details saved.');
  expect(await (await visitor.get('/our-studio')).text()).not.toContain('New default caption');
  await details.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: /^Pages\b/ }).click();
  await page.getByRole('link', { name: /^Our studio\b/ }).click();
  await page.getByRole('button', { name: 'Page details' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Unpublished.');
  expect((await visitor.get(asset.url)).status()).toBe(404);
  await page.frameLocator('iframe').locator('figure').click({ force: true });
  await page.getByRole('button', { name: 'Remove image', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Draft saved.');
  await page.getByRole('button', { name: 'Back to content' }).click();
  await page.getByRole('link', { name: 'Media', exact: true }).click();
  await page.getByRole('button', { name: 'Choose The studio', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await details.getByRole('button', { name: 'Delete image' }).click();
  await expect(details).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'A home for your images' })).toBeVisible();
  expect((await page.request.get(asset.url)).status()).toBe(404);
  expect(errors).toEqual([]);
});
