import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * The four font files nearly every Hungarian screen needs before its first paint: both subsets of
 * the display face and of the text face. "Kezdőlap" is on the tab bar and "EDZŐ" in an eyebrow, so
 * `latin-ext` is not optional (ő and ű live there). The mono face is left out on purpose: it is
 * fetched when the first figure is set in it.
 *
 * The names are the file stems of `src/ui/tokens/fonts.css`, without the content hash.
 */
const PRELOADED_FONTS = [
  'big-shoulders-display-latin-wght-normal',
  'big-shoulders-display-latin-ext-wght-normal',
  'geist-latin-wght-normal',
  'geist-latin-ext-wght-normal',
];

/**
 * Preload tags for those four, written into the built `index.html` with their HASHED names.
 *
 * Without them the browser learns that it needs a font only after it has downloaded and parsed the
 * stylesheet and laid out the first text — and the display face blocks (`font-display: block`), so
 * every numeral and title would be invisible for that whole round trip.
 *
 * The href cannot be typed into `index.html`: the bundler renames the files on every content
 * change. So the tags are made from the bundle itself, and a stem that matches no emitted file
 * FAILS THE BUILD — a preload that quietly disappears is a regression nobody sees on a fast machine.
 *
 * Build only. The dev server serves the fonts unhashed and on demand, which is what a developer wants.
 */
function preloadFonts(): Plugin {
  let base = '/';
  return {
    name: 'tracker:preload-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const emitted = Object.keys(ctx.bundle ?? {});
        return PRELOADED_FONTS.map((stem) => {
          const file = emitted.find((name) => name.endsWith('.woff2') && path.posix.basename(name).startsWith(`${stem}-`));
          if (!file) {
            throw new Error(
              `preload-fonts: no emitted .woff2 starts with "${stem}-". Either src/ui/tokens/fonts.css no longer ` +
                'loads that file or the bundler names assets differently now — fix PRELOADED_FONTS in vite.config.ts.',
            );
          }
          return {
            tag: 'link',
            // `crossorigin` is required even on the same origin: fonts are always fetched in CORS
            // mode, and a preload without it is a second, wasted download.
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${file}`, crossorigin: true },
            injectTo: 'head' as const,
          };
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    // Vite turns every imported asset under 4 kB into a base64 string INSIDE the JavaScript. 23 of
    // the 49 Pulse images are that small, and one module the whole app loads imports them all:
    // left alone, about 68 kB of images would ride in a shared chunk on every screen, where no
    // request can cache them and the service worker never sees them. So a Pulse image is always a
    // file; every other asset keeps the default. `check:assets` cannot see the bundle — this line
    // is the whole guard, and `grep data:image dist/assets/*.js` is how it is checked.
    assetsInlineLimit: (file) => (/[\\/]assets[\\/]pulse[\\/]/.test(file) ? false : undefined),
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
