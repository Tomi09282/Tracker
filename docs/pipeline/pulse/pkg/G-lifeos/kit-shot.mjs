// Scratch capture of the G-lifeos kit specimens: the built slot-9 preview, the cached jar of user@,
// each "lifeos · <cell>" region scrolled to the top and clipped, scale 2.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FRONT = 'C:/Users/Petike/Documents/Cursor/tracker-wt/slot-9/frontend';
const shot = await import(pathToFileURL(path.join(FRONT, 'scripts/pulse-shot.mjs')).href);
const OUT = process.argv[2];
const PORT = 5189;
const W = Number(process.argv[3] || 402);
fs.mkdirSync(OUT, { recursive: true });

const preview = await shot.startPreview(FRONT, PORT);
const browser = await shot.launchChrome({ windowSize: [W, 1500] });
try {
  const page = await shot.openPage(browser, { width: W, height: 1500 });
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: 1500, deviceScaleFactor: 2, mobile: W < 768 });
  const access = await shot.getAccess('user@tracker.local', { minRemainingMs: 4 * 60 * 1000, quiet: true });
  await page.send('Network.setCookie', { name: 'access', value: access.value, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax', expires: Math.floor(access.expires / 1000) });
  const origin = `http://localhost:${PORT}`;
  await page.send('Page.navigate', { url: origin + '/' });
  await shot.sleep(1500);
  await page.evaluate(`localStorage.setItem('tracker.lang','hu'); localStorage.setItem('tracker.playground.kit-layout','list'); true`);
  await page.send('Page.navigate', { url: origin + '/playground' });
  // wait for the regions
  for (let i = 0; i < 60; i++) {
    const n = await page.evaluate(`document.querySelectorAll('section[aria-label^="lifeos · "]').length`);
    if (n >= 5) break;
    await shot.sleep(250);
  }
  await page.evaluate(`document.fonts.ready.then(() => true)`);
  await shot.sleep(800);
  const names = await page.evaluate(`[...document.querySelectorAll('section[aria-label^="lifeos · "]')].map(s => s.getAttribute('aria-label'))`);
  for (const name of names) {
    const box = await page.evaluate(`(() => { const s = [...document.querySelectorAll('section[aria-label]')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(name)});
      s.scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy(0, -16);
      const r = s.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
    await shot.sleep(500);
    const pad = 24;
    const clip = { x: Math.max(0, box.x - pad), y: box.y - 16, width: Math.min(W, box.w + 2 * pad), height: box.h + 32, scale: 1 };
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    const file = path.join(OUT, `${name.replace('lifeos · ', '').split(' ')[0]}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('wrote', file, JSON.stringify(box));
  }
  await page.close();
} finally {
  await browser.close?.();
  try { preview.kill?.(); } catch {}
  await preview.stop();
  shot.killListenerOnPort(PORT);
}
