import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'publishing', testMatch: 'publishing.spec.ts' },
    { name: 'media', testMatch: 'media.spec.ts', use: { baseURL: 'http://127.0.0.1:3101' } },
    {
      name: 'navigation',
      testMatch: 'navigation.spec.ts',
      use: { baseURL: 'http://127.0.0.1:3102' },
    },
    {
      name: 'revisions',
      testMatch: 'revisions.spec.ts',
      use: { baseURL: 'http://127.0.0.1:3103' },
    },
  ],
  webServer: [3100, 3101, 3102, 3103].map((port) => ({
    command: `node scripts/e2e-server.mjs ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  })),
});
