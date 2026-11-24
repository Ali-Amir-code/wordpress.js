import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { newToken } from './auth';

const development = import.meta.url.endsWith('.ts');
const root = fileURLToPath(new URL(development ? '../../../' : '../', import.meta.url));
const production = process.env.NODE_ENV === 'production';
const origin = (value: string) => {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== value ||
    url.username ||
    url.password
  )
    throw new Error(
      'SITE_URL and ADMIN_ORIGIN must be origins such as https://example.com, without a path or trailing slash.',
    );
  if (production && url.protocol !== 'https:')
    throw new Error('Production requires HTTPS origins. Terminate TLS at a reverse proxy.');
  return value;
};
const siteUrl = origin(process.env.SITE_URL || 'http://localhost:3000');
const adminOrigin = origin(
  process.env.ADMIN_ORIGIN || (development ? 'http://localhost:5173' : siteUrl),
);
const dataDir = resolve(root, process.env.DATA_DIR || 'data');
await mkdir(dataDir, { recursive: true, mode: 0o700 });
const tokenFile = resolve(dataDir, 'setup-token.txt');
let setupToken = process.env.SETUP_TOKEN;
if (!setupToken) {
  try {
    setupToken = (await readFile(tokenFile, 'utf8')).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    setupToken = newToken();
    await writeFile(tokenFile, setupToken + '\n', { mode: 0o600, flag: 'wx' });
  }
}
if (setupToken.length < 32) throw new Error('SETUP_TOKEN must contain at least 32 characters.');
const app = await buildApp({
  databasePath: resolve(dataDir, 'wordpressjs.sqlite'),
  setupToken,
  siteUrl,
  adminOrigin,
  logger: true,
  stylesheetPath: resolve(root, development ? 'packages/blocks/src/styles.css' : 'dist/site.css'),
  staticDir: development ? undefined : resolve(root, 'dist/admin'),
});
const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: process.env.HOST || '127.0.0.1' });
app.log.info(
  `Admin: ${adminOrigin}/admin/ · Installation key: ${process.env.SETUP_TOKEN ? 'provided by SETUP_TOKEN' : tokenFile}`,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    app.close().catch((error) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
