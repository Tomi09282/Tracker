import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = process.env.GSHELL_FRONT || 'C:/Users/Petike/Documents/Cursor/tracker-wt/slot-6/frontend';
const req = createRequire(path.join(FRONT, 'package.json'));
const load = async (id) => import(pathToFileURL(req.resolve(id)).href);
const { defineConfig } = await load('vite');
const react = (await load('@vitejs/plugin-react')).default;
const tailwindcss = (await load('@tailwindcss/vite')).default;
const nm = (p) => path.join(FRONT, 'node_modules', p);

export default defineConfig({
  root: HERE,
  logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@fontsource-variable\/(.*)$/, replacement: nm('@fontsource-variable') + '/$1' },
      { find: /^@fontsource\/(.*)$/, replacement: nm('@fontsource') + '/$1' },
      { find: /^react-router$/, replacement: nm('react-router') },
      { find: /^lucide-react$/, replacement: nm('lucide-react') },
      { find: '@', replacement: path.join(FRONT, 'src') },
      { find: /^react-dom(\/.*)?$/, replacement: nm('react-dom') + '$1' },
      { find: /^react(\/.*)?$/, replacement: nm('react') + '$1' },
    ],
  },
  server: { fs: { allow: [FRONT, HERE] } },
  build: { outDir: path.join(HERE, 'dist'), emptyOutDir: true, assetsInlineLimit: 0 },
});
