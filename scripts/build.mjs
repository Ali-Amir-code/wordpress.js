import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['apps/server/src/index.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external: ['fastify', '@fastify/*', 'react', 'react-dom/*', 'zod', 'sharp'],
});
await copyFile('packages/blocks/src/styles.css', 'dist/site.css');
