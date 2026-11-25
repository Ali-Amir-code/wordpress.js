import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const port = process.argv[2] || '3100';
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
  throw new Error('Invalid test port');
const directory = await mkdtemp(join(tmpdir(), 'wordpressjs-e2e-'));
const child = spawn(process.execPath, ['dist/server.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATA_DIR: directory,
    SETUP_TOKEN: 'browser-test-installation-key-not-for-real-deployment',
    PORT: port,
    SITE_URL: `http://127.0.0.1:${port}`,
    ADMIN_ORIGIN: `http://127.0.0.1:${port}`,
    HOST: '127.0.0.1',
  },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exitCode = code || 0;
});
