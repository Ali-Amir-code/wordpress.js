import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'wordpressjs-e2e-'));
const child = spawn(process.execPath, ['dist/server.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATA_DIR: directory,
    SETUP_TOKEN: 'browser-test-installation-key-not-for-real-deployment',
    PORT: '3100',
    SITE_URL: 'http://127.0.0.1:3100',
    ADMIN_ORIGIN: 'http://127.0.0.1:3100',
    HOST: '127.0.0.1',
  },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exitCode = code || 0;
});
