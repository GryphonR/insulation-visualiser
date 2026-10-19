/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from https://<user>.github.io/insulation-visualiser/ (a project page, not a
  // custom domain or user/org root page), so asset URLs need this subpath prefix.
  base: '/insulation-visualiser/',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
