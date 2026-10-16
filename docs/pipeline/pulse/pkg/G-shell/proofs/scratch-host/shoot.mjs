// usage: node shoot.mjs <out dir> [view…]   — serves ./dist on 127.0.0.1:5197, headless Chrome at
// 402 x H (the kit view 860 x 3200), scale 2; writes <view>.png and <view>.boxes.json (the
// `data-measure` boxes from the page, via --dump-dom).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const DIST = path.join(HERE, 'dist');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const VIEWS = {
  'workout-1': [402, 874], 'auth-1': [402, 874], 'nutrition-1': [402, 874], 'plan-editor-2': [402, 1200],
  'compose-profile-1': [402, 874], 'compose-profile-2': [402, 874], 'coins-1': [402, 874], 'compose-hub-1': [402, 874],
  'library-3': [402, 874], fixed: [402, 874], kit: [860, 3400],
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(5197, '127.0.0.1', r));
const [OUT, ...only] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const run = (args) => new Promise((resolve) => execFile(CHROME, args, { maxBuffer: 64 << 20 }, (_e, stdout) => resolve(stdout)));
for (const [view, [w, h]] of Object.entries(VIEWS)) {
  if (only.length && !only.includes(view)) continue;
  const common = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(OUT, '.prof')}`, `--window-size=${w},${h}`, '--force-device-scale-factor=2', '--virtual-time-budget=8000'];
  const url = `http://127.0.0.1:5197/?view=${view}`;
  await run([...common, `--screenshot=${path.join(OUT, `${view}.png`)}`, url]);
  const dom = await run([...common, '--dump-dom', url]);
  const m = /<pre id="boxes"[^>]*>([^<]*)<\/pre>/.exec(String(dom));
  fs.writeFileSync(path.join(OUT, `${view}.boxes.json`), m ? m[1].replace(/&quot;/g, '"') : '{"error":"no boxes"}');
  console.log(view, fs.existsSync(path.join(OUT, `${view}.png`)), m ? m[1].replace(/&quot;/g, '"').slice(0, 400) : 'NO BOXES');
}
server.close();
