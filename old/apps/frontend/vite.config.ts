import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@cv/core': resolve(__dirname, '../../packages/core/src/index.ts') },
  },
  server: {
    port: 5173,
    // Calls go to /api and are forwarded, so there is no CORS dance in dev.
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },
});
