// F13 evidence harness — the tree's own vite.config.ts, with this folder's index.html as the only
// entry and the output in a scratch folder (F13_KIT_OUT). Same plugins, same CSS, same fonts.
import path from 'node:path';
import { mergeConfig } from 'vite';
import base from '../vite.config.ts';

const here = import.meta.dirname;
const out = process.env.F13_KIT_OUT;
if (!out) throw new Error('F13_KIT_OUT is not set');

export default mergeConfig(base, {
  root: path.resolve(here, '..'),
  build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.resolve(here, 'index.html') } },
  preview: { proxy: {} },
});
