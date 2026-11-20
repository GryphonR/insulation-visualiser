/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode cloud` (see .env.cloud) builds for the Cloudflare Worker: served from the root, with sign-in and sync.
// Otherwise it's the GitHub Pages build, served from https://<user>.github.io/insulation-visualiser/ with no accounts.
// Two pages: the public site at the root (landing + Learn, prerendered by scripts/prerender.mjs) and the app at app/.
export default defineConfig(({ mode }) => ({
  base: mode === 'cloud' ? '/' : '/insulation-visualiser/',
  plugins: [react()],
  build: { rollupOptions: { input: { site: resolve(__dirname, 'index.html'), app: resolve(__dirname, 'app/index.html') } } },
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'worker/**/*.test.ts'] },
}));
