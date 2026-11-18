/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode cloud` (see .env.cloud) builds for the Cloudflare Worker: served from the root, with sign-in and sync.
// Otherwise it's the GitHub Pages build, served from https://<user>.github.io/insulation-visualiser/ with no accounts.
export default defineConfig(({ mode }) => ({
  base: mode === 'cloud' ? '/' : '/insulation-visualiser/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'worker/**/*.test.ts'] },
}));
