/**
 * Rasterises `public/favicon.svg` into the PNG sizes an installable PWA needs.
 *
 * ═══ WHY PNGs AT ALL, WHEN THE SOURCE IS AN SVG ═══════════════════════════════════════════════
 *
 * A manifest may declare an SVG icon with `sizes: "any"`, and Chrome will accept it for
 * installability. Android's launcher, the iOS home screen and the task switcher will not — they
 * want raster, and what they do without it varies by launcher: a blank tile, a generic globe, or a
 * screenshot of the page.
 *
 * `maskable` is a separate export rather than the same file listed twice. A maskable icon is
 * cropped to whatever shape the launcher enforces (Android circles, squircles, rounded squares),
 * and this mark reaches the edge of its viewBox — declared maskable as-is, the corners of the
 * lightning bolt would be shaved off. The maskable variant is drawn at 60% inside the safe zone
 * the spec defines, on the brand background.
 *
 * ═══ AND WHY THIS FILE IS IN THE BACKEND ═══════════════════════════════════════════════════════
 *
 * Because `sharp` is. It is a ~30 MB native dependency the backend already carries for upload
 * ingestion, and adding a second copy to the frontend to run one authoring script — by hand, when
 * the logo changes, against committed output — is the worse trade. The icons it writes are
 * frontend assets; the tool that writes them lives where the tool already is.
 *
 * Run: npm run icons  (in backend/, only when the mark changes — the PNGs are committed)
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const PUBLIC = path.join(import.meta.dirname, '..', '..', 'frontend', 'public');
const source = await fs.readFile(path.join(PUBLIC, 'favicon.svg'));

// surface-0 of the default pack, the same value index.html pins as theme-color. A transparent
// maskable icon is a spec violation: the launcher fills the crop with white on some devices.
const BACKGROUND = { r: 0x0b, g: 0x0d, b: 0x10, alpha: 1 };

const written = [];

for (const size of [192, 512]) {
  const file = path.join(PUBLIC, `icon-${size}.png`);
  await sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(file);
  written.push(path.basename(file));

  // The maskable pair. 60% of the canvas is the safe zone the spec guarantees survives any crop.
  const inner = Math.round(size * 0.6);
  const pad = Math.round((size - inner) / 2);
  const maskFile = path.join(PUBLIC, `icon-${size}-maskable.png`);
  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([
      {
        input: await sharp(source, { density: 384 })
          .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer(),
        top: pad,
        left: pad,
      },
    ])
    .png()
    .toFile(maskFile);
  written.push(path.basename(maskFile));
}

// Apple ignores the manifest entirely and reads `apple-touch-icon`, which must be opaque — iOS
// composites a transparent one onto black regardless of the home screen wallpaper.
const apple = path.join(PUBLIC, 'apple-touch-icon.png');
await sharp({ create: { width: 180, height: 180, channels: 4, background: BACKGROUND } })
  .composite([
    {
      input: await sharp(source, { density: 384 }).resize(126, 126, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
      top: 27,
      left: 27,
    },
  ])
  .png()
  .toFile(apple);
written.push(path.basename(apple));

console.log(`icons: wrote ${written.join(', ')}`);
