// src/lib/media.js — the upload pipeline.
//
// Every step here exists because the client cannot be trusted about ANY property of a file:
// not its name, not its extension, not its Content-Type, not even its declared dimensions.
//
//   1. multipart lands in a QUARANTINE directory, never in the served tree
//   2. the real type is sniffed from magic bytes and checked against an allowlist
//   3. the file is stat-ed before decode, so a decompression bomb never reaches sharp
//   4. sharp re-encodes it, which strips EXIF (including GPS) as a side effect of re-encoding
//   5. the result is stored under a random key — the uploaded filename never touches the disk
//   6. serving is gated on the DB visibility of the owning row, with nosniff and a disposition
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import sharp from 'sharp';

export const STORAGE_ROOT = path.resolve('storage');
export const MEDIA_DIR = path.join(STORAGE_ROOT, 'media');
export const QUARANTINE_DIR = path.join(STORAGE_ROOT, 'tmp');

/**
 * The public subtree, and it is a SEPARATE DIRECTORY for a stated reason.
 *
 * Migration 021 promised this and nothing implemented it: "any public route whose key regex
 * overlaps those shapes is one reordered statement away from serving a client's progress photo to
 * the open internet. Disjoint namespaces make that unreachable rather than guarded."
 *
 * Today the private and public key shapes happen not to overlap, so the flat layout is safe — by
 * coincidence of two regexes rather than by construction. This makes it safe by construction: a
 * public key can only ever be joined onto the public directory, and a private one onto the private
 * directory, whatever a future route asks for.
 */
export const PUBLIC_MEDIA_DIR = path.join(MEDIA_DIR, 'public');

/**
 * Allowlist, keyed by the SNIFFED mime. SVG is deliberately absent: it is a document format
 * that can carry script, and "an image" that executes is not an image.
 */
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Guards against decompression bombs: a 40MP image is not a product photo. */
const MAX_PIXELS = 40_000_000;
const OUTPUT_MAX_EDGE = 1600;

export async function ensureDirs() {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_MEDIA_DIR, { recursive: true });
  await fs.mkdir(QUARANTINE_DIR, { recursive: true });
}

export class MediaError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'MediaError';
    this.reason = reason;
  }
}

/**
 * Validate and re-encode one quarantined upload.
 *
 * Returns the stored descriptor. Throws `MediaError` for anything a client did wrong, so the
 * route can answer 400 without leaking which internal step objected.
 */
/**
 * Everything that decides whether a quarantined file is an image we will accept.
 *
 * EXTRACTED so the public pipeline runs the SAME checks rather than its own. There are already
 * four places in this repository that sniff a file type and three of them do not re-encode; a
 * fifth, written beside a new feature, is how an allowlist comes to differ from itself. One sniff,
 * one allowlist, two policies for what to DO with the result.
 *
 * Returns an open sharp handle so the caller re-encodes without decoding twice.
 */
export async function validateImage(tmpPath) {
  // stat BEFORE decode. Checking size after sharp has opened the file is checking after the
  // damage is done.
  const stat = await fs.stat(tmpPath);
  if (stat.size === 0) throw new MediaError('empty file');
  if (stat.size > MAX_IMAGE_BYTES) throw new MediaError('file too large');

  // The client's Content-Type and the filename extension are both ignored. This reads the first
  // bytes off disk and reports what the file ACTUALLY is.
  const sniffed = await fileTypeFromFile(tmpPath);
  if (!sniffed || !ALLOWED_IMAGE.has(sniffed.mime)) throw new MediaError('unsupported image type');

  const image = sharp(tmpPath, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new MediaError('unreadable image');
  if (meta.width * meta.height > MAX_PIXELS) throw new MediaError('image dimensions too large');

  return { image, meta };
}

export async function ingestImage(tmpPath) {
  try {
    const { image } = await validateImage(tmpPath);

    // Re-encoding is the sanitisation: the output is built from decoded pixels, so EXIF, GPS,
    // colour-profile payloads and any trailing appended data simply do not come along.
    const storageKey = `${randomUUID()}.webp`;
    const outPath = path.join(MEDIA_DIR, storageKey);
    const info = await image
      .rotate() // apply the EXIF orientation before it is discarded, or portraits come out sideways
      .resize({ width: OUTPUT_MAX_EDGE, height: OUTPUT_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(outPath);

    return {
      storageKey,
      mime: 'image/webp', // what the SERVER produced, never what the client claimed
      width: info.width,
      height: info.height,
      bytes: info.size,
    };
  } finally {
    // The quarantined original is always removed, on success and on every failure path.
    await fs.rm(tmpPath, { force: true });
  }
}

/**
 * Resolve a storage key to an absolute path, refusing anything that is not a plain key.
 *
 * The key comes from the database, not from the URL — but this check is cheap and it is the
 * difference between a bug and a path traversal if that ever stops being true.
 */
/**
 * Turn a storage key into a path, or refuse.
 *
 * TWO SHAPES, one function. Exercise media is a UUID `.webp` (re-encoded on ingest); a chat
 * attachment is 48 hex characters with an optional `.mp4`. Both are generated by us and neither
 * is ever taken from a filename.
 *
 * They share this function rather than each resolving their own path, because "a key becomes a
 * safe path" is exactly the kind of rule that must exist once. A second copy is a second place for
 * the containment check to be forgotten — and that check is the whole defence against traversal.
 */
const NAMESPACES = {
  private: { dir: MEDIA_DIR, shapes: [/^[0-9a-f-]{36}\.webp$/, /^[0-9a-f]{48}(\.mp4)?$/] },
  public: { dir: PUBLIC_MEDIA_DIR, shapes: [/^pub_[a-f0-9]{32}\.webp$/] },
};

export function resolveStoredPath(storageKey, namespace = 'private') {
  const ns = NAMESPACES[namespace];
  if (!ns) return null;
  // A key belongs to exactly one namespace. Asking the public namespace for a private key gets
  // null, not a path — which is the property 021 asked for and the reason this takes a second
  // argument at all.
  if (!ns.shapes.some((re) => re.test(storageKey))) return null;
  const full = path.join(ns.dir, storageKey);
  // Belt and braces: the resolved path must still be inside its own directory.
  if (!full.startsWith(ns.dir + path.sep)) return null;
  return full;
}

/** Sweeps quarantined files older than an hour — crashed uploads must not accumulate. */
export async function sweepQuarantine(maxAgeMs = 60 * 60 * 1000) {
  let removed = 0;
  const now = Date.now();
  for (const name of await fs.readdir(QUARANTINE_DIR).catch(() => [])) {
    const full = path.join(QUARANTINE_DIR, name);
    const stat = await fs.stat(full).catch(() => null);
    if (stat && now - stat.mtimeMs > maxAgeMs) {
      await fs.rm(full, { force: true });
      removed += 1;
    }
  }
  return removed;
}

/**
 * Ingest an image for the PUBLIC marketplace: a display variant, a card variant, and a hash.
 *
 * ═══ TWO VARIANTS, BECAUSE THE BILL HAS NO CEILING ═════════════════════════════════════════════
 *
 * Serving a full-resolution original to every anonymous request is a bandwidth cost with no
 * account attached to it. The feed reads the 480px card; the post page reads the 1600px display.
 *
 * ═══ AND A HASH, BECAUSE A REPLAY MUST COMPARE INTENT ══════════════════════════════════════════
 *
 * Two uploads under one idempotency key are a retry only if they carry the same bytes. Without the
 * hash the second request is answered with the first one's row whatever the coach actually sent,
 * which turns a network hiccup into the wrong image on a published post with the API reporting OK.
 *
 * Both buffers come from one pass each, so `bytes` and `sha256` describe exactly what was written.
 */
export async function ingestPublicImage(tmpPath) {
  const written = [];
  try {
    const { image } = await validateImage(tmpPath);

    // 4 + 32 + 5 = 41 characters, lowercase hex only, satisfying all four column CHECKs at once.
    // TWO INDEPENDENT DRAWS, asserted distinct: the serve route matches storage_key OR thumb_key,
    // so a row where the two are equal would serve the full image wherever a card was asked for.
    const key = () => `pub_${randomBytes(16).toString('hex')}.webp`;
    const storageKey = key();
    let thumbKey = key();
    while (thumbKey === storageKey) thumbKey = key();

    const display = await image
      .clone()
      .rotate() // apply the EXIF orientation before it is discarded, or portraits come out sideways
      .resize({ width: OUTPUT_MAX_EDGE, height: OUTPUT_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    const thumb = await image
      .clone()
      .rotate()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });

    const displayPath = path.join(PUBLIC_MEDIA_DIR, storageKey);
    await fs.writeFile(displayPath, display.data);
    written.push(displayPath);
    const thumbPath = path.join(PUBLIC_MEDIA_DIR, thumbKey);
    await fs.writeFile(thumbPath, thumb.data);
    written.push(thumbPath);

    return {
      storageKey,
      thumbKey,
      mime: 'image/webp', // what the SERVER produced, never what the client claimed
      width: display.info.width,
      height: display.info.height,
      bytes: display.info.size,
      sha256: createHash('sha256').update(display.data).digest('hex'),
    };
  } catch (err) {
    // A half-written pair is worse than none: the row would name two keys and only one file would
    // exist, and the serve route would 404 for a post that looks like it has a cover.
    await Promise.all(written.map((p) => fs.rm(p, { force: true })));
    throw err;
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

/** Remove both variants of a public image. Missing files are not an error — the row is the record. */
export async function removePublicImage(storageKey, thumbKey) {
  for (const key of [storageKey, thumbKey]) {
    const full = key ? resolveStoredPath(key, 'public') : null;
    if (full) await fs.rm(full, { force: true });
  }
}
