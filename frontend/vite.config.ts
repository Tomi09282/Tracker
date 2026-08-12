import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in dev so the auth cookies behave exactly as they will in production.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      // `/healthz` is not under /api and was therefore not proxied, so it fell through to the dev
      // server's SPA fallback and answered 200 text/html — which the offline indicator read as
      // "the backend is up". Dev has to reach the same endpoint production does, or the one
      // component whose whole job is telling the truth about the network cannot be tested at all.
      '/healthz': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    // The preview server serves the production BUILD, which is where the service worker actually
    // registers — so it needs the same proxying, or every verification of it happens against an
    // app whose API calls all fail for an unrelated reason.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/healthz': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
