import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('owner sets up a site, edits blocks, publishes, preserves a private draft and signs in again', async ({
  page,
}) => {
  test.setTimeout(60000);
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
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true });
  await expect(page.getByText('Your workspace', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open the editor' }).click();
  await expect(page.getByRole('heading', { name: /Your canvas/ })).toBeVisible();
  await expect
    .poll(async () => (await page.locator('iframe').boundingBox())?.height || 0)
    .toBeGreaterThan(400);
  await page
    .frameLocator('iframe')
    .getByRole('heading', { name: 'Good things start with a little space to grow.' })
    .click({ force: true });
  await page
    .getByRole('textbox', { name: 'Headline', exact: true })
    .fill('Small studio. Thoughtful work.');
  await page.getByRole('button', { name: 'Switch to Small viewport' }).click();
  await page.getByRole('button', { name: 'Switch to Large viewport' }).click();
  await page.getByRole('button', { name: 'Page details' }).click();
  await page.getByLabel('Search description').fill('A thoughtful independent studio.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Draft saved.');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Published.');
  const publicResponse = await page.request.get('/');
  expect(await publicResponse.text()).toContain('A thoughtful independent studio.');
  expect(await publicResponse.text()).toContain('Small studio. Thoughtful work.');
  await page.getByLabel('Title', { exact: true }).fill('Private working title');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Draft saved.');
  expect(await (await page.request.get('/')).text()).not.toContain('Private working title');
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to content' }).click();
  await page.getByRole('button', { name: 'New page', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('About us');
  await page.getByLabel('Starting point').selectOption('starter');
  await page.getByRole('button', { name: 'Create page', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Your canvas/ })).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('Published.');
  expect((await page.request.get('/about-us')).status()).toBe(200);
  await page.getByRole('button', { name: 'Back to content' }).click();
  await page.getByRole('link', { name: 'Site settings' }).click();
  await page.getByLabel('Website name').fill('Little Studio Collective');
  await page.getByLabel('Ocean', { exact: true }).check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('Settings saved.');
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByLabel('Email address').fill('alex@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a-browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Alex.' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Small studio. Thoughtful work.' })).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/public-site.png', fullPage: true });
  expect(errors).toEqual([]);
});
