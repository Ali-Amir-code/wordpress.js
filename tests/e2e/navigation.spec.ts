import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { ContentView, NavigationState } from '@wordpressjs/core';

test.use({ actionTimeout: 15000 });

test('owner arranges navigation, previews private changes, selects a homepage and preserves links after renaming', async ({
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
  const get = async (id: string) =>
    (await (await page.request.get(`/api/content/${id}`)).json()) as ContentView;
  const publish = async (id: string) => {
    const entry = await get(id);
    const response = await page.request.post(`/api/content/${id}/publish`, {
      headers,
      data: { revision: entry.revision },
    });
    expect(response.ok(), await response.text()).toBe(true);
  };
  const home = (await (await page.request.get('/api/content')).json()).items[0] as ContentView;
  await publish(home.id);
  const created = await page.request.post('/api/content', {
    headers,
    data: { title: 'Our studio', slug: 'our-studio', kind: 'page', template: 'starter' },
  });
  expect(created.status()).toBe(201);
  const studio = (await created.json()) as ContentView;
  await publish(studio.id);
  await page.getByRole('link', { name: 'Navigation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Navigation', exact: true })).toBeVisible();

  const chooseHome = page.getByRole('button', { name: 'Choose homepage', exact: true });
  await chooseHome.focus();
  await page.keyboard.press('Enter');
  const homepagePicker = page.getByRole('dialog', { name: 'Choose your homepage' });
  await expect(homepagePicker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(homepagePicker).not.toBeVisible();
  await expect(chooseHome).toBeFocused();
  await chooseHome.click();
  await homepagePicker.getByLabel('Search pages and posts').fill('studio');
  await homepagePicker.getByRole('button', { name: 'Choose Our studio', exact: true }).click();
  await page.getByLabel('Header menu style').selectOption('custom');
  const header = page.getByRole('region', { name: 'Header menu', exact: true });
  const footer = page.getByRole('region', { name: 'Footer', exact: true });
  for (const [title, label] of [
    ['Our studio', 'The studio'],
    ['Home', 'Our beginnings'],
  ]) {
    await header.getByRole('button', { name: 'Add page or post', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a page or post', exact: true });
    await dialog.getByLabel('Search pages and posts').fill(title!);
    await dialog.getByRole('button', { name: `Choose ${title}`, exact: true }).click();
    const count = await header.getByRole('textbox').count();
    await page.getByLabel(`Header link ${count} label`, { exact: true }).fill(label!);
  }
  await header.getByRole('button', { name: 'Add custom link', exact: true }).click();
  await page.getByLabel('Header link 3 label', { exact: true }).fill('Journal');
  await page.getByLabel('Header link 3 address', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a valid website address');
  await page.getByLabel('Header link 3 address', { exact: true }).fill('/blog');
  const moveUp = header.getByRole('button', { name: 'Move header link 3 up', exact: true });
  await moveUp.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Header link 2 label', { exact: true })).toHaveValue('Journal');
  await expect(
    header.getByRole('button', { name: 'Move header link 2 up', exact: true }),
  ).toBeFocused();
  await page.getByLabel('Footer text', { exact: true }).fill('Thoughtfully made in our studio.');
  await footer.getByRole('button', { name: 'Add custom link', exact: true }).click();
  await page.getByLabel('Footer link 1 label', { exact: true }).fill('Say hello');
  await page.getByLabel('Footer link 1 address', { exact: true }).fill('mailto:hello@example.test');

  // Leaving an unsaved draft must offer an explicit chance to keep the work.
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Media', exact: true }).click();
  await expect(page).toHaveURL(/#navigation$/);
  await expect(page.getByLabel('Footer text', { exact: true })).toHaveValue(
    'Thoughtfully made in our studio.',
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByText('Navigation draft saved. Your public website is unchanged.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  expect(await (await visitor.get('/')).text()).not.toContain('Our beginnings');
  expect((await visitor.get('/api/navigation/preview')).status()).toBe(401);
  const [preview] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'Preview saved draft' }).click(),
  ]);
  await expect(
    preview.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link'),
  ).toHaveText(['The studio', 'Journal', 'Our beginnings']);
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
  await expect(preview).toHaveTitle('Our studio · The little studio');
  await preview.close();
  await page.screenshot({ path: 'test-results/navigation-workspace.png', fullPage: true });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/navigation-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Publish navigation', exact: true }).click();
  await expect(page.getByText('Navigation published. Your website is up to date.')).toBeVisible();

  const live = await page.context().newPage();
  await live.goto('/');
  await expect(live).toHaveTitle('Our studio · The little studio');
  const menu = live.getByRole('navigation', { name: 'Main navigation', exact: true });
  await expect(menu.getByRole('link')).toHaveText(['The studio', 'Journal', 'Our beginnings']);
  await expect(menu.getByRole('link', { name: 'The studio', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(menu.getByRole('link', { name: 'Our beginnings', exact: true })).toHaveAttribute(
    'href',
    '/home',
  );
  await expect(
    live
      .getByRole('navigation', { name: 'Footer navigation', exact: true })
      .getByRole('link', { name: 'Say hello' }),
  ).toHaveAttribute('href', 'mailto:hello@example.test');
  await expect(live.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/`);
  expect((await visitor.get('/our-studio', { maxRedirects: 0 })).status()).toBe(302);
  expect((await visitor.get('/home')).status()).toBe(200);
  expect(
    (
      await new AxeBuilder({ page: live })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await live.setViewportSize({ width: 390, height: 844 });
  expect(await live.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await live.screenshot({ path: 'test-results/navigation-public-mobile.png', fullPage: true });

  // Valid maximum-length text must still fit narrow public layouts.
  await page.getByLabel('Header link 1 label', { exact: true }).fill('W'.repeat(80));
  await page.getByLabel('Footer text', { exact: true }).fill('W'.repeat(300));
  await page.getByRole('button', { name: 'Publish navigation', exact: true }).click();
  await expect(page.getByText('Navigation published. Your website is up to date.')).toBeVisible();
  await live.reload();
  await expect(
    live
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link')
      .first(),
  ).toHaveText('W'.repeat(80));
  expect(await live.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Header link 1 label', { exact: true }).fill('The studio');
  await page.getByLabel('Footer text', { exact: true }).fill('Thoughtfully made in our studio.');
  await page.getByRole('button', { name: 'Publish navigation', exact: true }).click();
  await expect(page.getByText('Navigation published. Your website is up to date.')).toBeVisible();

  // Conflicts preserve local input and never silently overwrite another window's saved draft.
  await page.getByLabel('Footer text', { exact: true }).fill('My unsaved footer');
  const state = (await (await page.request.get('/api/navigation')).json()) as NavigationState;
  expect(
    (
      await page.request.put('/api/navigation', {
        headers,
        data: {
          document: {
            ...state.draft,
            footer: { ...state.draft.footer, text: 'Saved in another window' },
          },
          revision: state.revision,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Navigation changed in another window');
  await expect(page.getByLabel('Footer text', { exact: true })).toHaveValue('My unsaved footer');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Reload saved navigation' }).click();
  await expect(page.getByLabel('Footer text', { exact: true })).toHaveValue('My unsaved footer');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reload saved navigation' }).click();
  await expect(page.getByLabel('Footer text', { exact: true })).toHaveValue(
    'Saved in another window',
  );
  await page.getByRole('button', { name: 'Use original homepage' }).click();
  await page.getByRole('button', { name: 'Publish navigation', exact: true }).click();
  await expect(page.getByText('Navigation published. Your website is up to date.')).toBeVisible();
  const current = await get(studio.id);
  expect(
    (
      await page.request.put(`/api/content/${studio.id}`, {
        headers,
        data: {
          title: current.title,
          slug: 'meet-the-studio',
          description: current.description,
          document: current.document,
          revision: current.revision,
        },
      })
    ).ok(),
  ).toBe(true);
  await publish(studio.id);
  const redirect = await visitor.get('/our-studio', { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe('/meet-the-studio');
  await live.goto('/');
  await expect(live).toHaveTitle('Home · The little studio');
  await expect(
    live
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'The studio', exact: true }),
  ).toHaveAttribute('href', '/meet-the-studio');
  await live.close();
  expect(errors).toEqual([]);
});
