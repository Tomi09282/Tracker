import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const DIST = path.join(HERE, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(5196, '127.0.0.1', r));
const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
for (const [view, h] of [['list', 2100], ['settings-1', 874], ['coach-profile-1', 874], ['client-detail-1', 874], ['coach-chat-1', 874], ['coach-chat-2', 874]]) {
  const file = path.join(OUT, `${view}.png`);
  await new Promise((resolve) => {
    import('node:child_process').then(({ execFile }) => execFile('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(HERE, 'prof')}`, `--window-size=402,${h}`, '--force-device-scale-factor=2', '--virtual-time-budget=8000', `--screenshot=${file}`, `http://127.0.0.1:5196/?view=${view}`], () => resolve()));
  });
  console.log(view, fs.existsSync(file));
}
server.close();
