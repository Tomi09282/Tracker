// scripts/brain-sync.mjs — mirror the repo brain (docs/brain/) into the Obsidian vault.
// Per ADR-0006 / kickoff decision D-K1: the repo is the source of truth; the vault is a mirror.
// (In the 2026-08-04 rebuild that mirror was the ONLY surviving copy of the project brain.)
// Usage: node scripts/brain-sync.mjs [--vault <path>]
//        default vault: C:\Users\Petike\Documents\GymTracker\GymTracker
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('docs/brain');
const arg = process.argv.indexOf('--vault');
const DEST = arg > -1 && process.argv[arg + 1]
  ? path.resolve(process.argv[arg + 1])
  : path.resolve('C:/Users/Petike/Documents/GymTracker/GymTracker');

const TEXT_EXT = new Set(['.md', '.mermaid', '.excalidraw', '.json', '.canvas']);

// Dot-directories are vault-owned, never brain-owned: `.obsidian` holds the user's app config
// (core-plugins, appearance, graph, workspace) and `.trash` holds their deletions. The mirror
// must neither copy into them nor delete out of them — doing so once destroyed the vault's
// Obsidian settings, because `.json` is a mirrored extension.
const isVaultOwned = (name) => name.startsWith('.');

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (isVaultOwned(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && TEXT_EXT.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

async function main() {
  await fs.access(SRC).catch(() => { throw new Error(`brain source not found: ${SRC}`); });
  await fs.mkdir(DEST, { recursive: true });

  let copied = 0;
  const seen = new Set();
  for await (const file of walk(SRC)) {
    const rel = path.relative(SRC, file);
    seen.add(rel);
    const dest = path.join(DEST, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const [srcBuf, dstBuf] = await Promise.all([
      fs.readFile(file),
      fs.readFile(dest).catch(() => null),
    ]);
    if (!dstBuf || !srcBuf.equals(dstBuf)) {
      await fs.writeFile(dest, srcBuf);
      copied += 1;
    }
  }

  // Mirror, not overlay: vault files that no longer exist in the repo are removed.
  // `walk` is an async generator — it has no `.catch`, so guard the traversal here.
  let removed = 0;
  try {
    for await (const file of walk(DEST)) {
      const rel = path.relative(DEST, file);
      if (!seen.has(rel)) { await fs.rm(file); removed += 1; }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  console.log(`brain-sync: ${copied} copied, ${removed} removed → ${DEST}`);
}

main().catch((err) => { console.error('brain-sync failed:', err.message); process.exit(1); });
