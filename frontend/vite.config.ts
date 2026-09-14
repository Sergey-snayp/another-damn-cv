import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Calls go to /api and are forwarded, so there is no CORS dance in dev.
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },
});
