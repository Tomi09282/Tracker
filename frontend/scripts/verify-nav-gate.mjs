/**
 * Prove check-nav.mjs is load-bearing by breaking, one at a time, each thing it claims to guard.
 *
 * A gate that has never been seen to fail is not evidence — it is a green tick whose meaning is
 * unverified.
 *
 * ═══ THIS USED TO CARRY ITS OWN SIX CASES ══════════════════════════════════════════════════════
 *
 * Each was anchored on an exact string, indentation included, and nothing ran this file as part
 * of anything. So when the profile tab gained `owns: ['/coins']`, the fourth case — "a tab
 * pointing at a route that does not exist" — lost its anchor and the probe went red on it, with
 * nobody looking. A probe that is silently broken is the same green tick it was written to
 * replace.
 *
 * The cases now live in ONE place, `verify-gates.mjs`, beside the probes of every other gate,
 * anchored on patterns instead of lines (the fourth is `nav/tab-to-missing-route`), with the
 * backup, the lock and the byte-for-byte restore that file documents. This command stays because
 * it is the name people know: it runs exactly the check-nav probes.
 *
 * Run: npm run verify:nav-gate            (any extra argument is passed on, e.g. --allow-dirty)
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./verify-gates.mjs', import.meta.url));
const { status } = spawnSync(process.execPath, [runner, '--gate', 'check:nav', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(status ?? 1);
