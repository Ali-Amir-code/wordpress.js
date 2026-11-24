import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000', '/placeholder.svg': 'http://127.0.0.1:3000' },
  },
  build: { outDir: '../../dist/admin', emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
