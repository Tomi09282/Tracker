/*
 * pulse-ports — the one place that maps a worktree to its preview port.
 *
 *   slot-1 .. slot-8   -> 5181 .. 5188   (5180 + n)
 *   the integration    -> 5189
 *   slot-9 .. slot-29  -> 5209 .. 5229   (5200 + n; 5180 + 9 would collide with the integration tree)
 *   5180               -> the default of an ad-hoc pulse-shot run
 */

export const MAX_SLOT = 29;
export const INT_PORT = 5189;

/** Every port a preview may be started on, and the only ports the tools will ever free. */
export const PREVIEW_PORTS = Object.freeze([
  ...Array.from({ length: 10 }, (_, i) => 5180 + i),
  ...Array.from({ length: MAX_SLOT - 9 + 1 }, (_, i) => 5209 + i),
]);

/** The ranges in words, for help texts and error messages. */
export const PREVIEW_PORT_RANGES = '5180-5189 or 5209-5229';

/** slot-<n> -> its preview port, or null when n is not a slot number. */
export function portForSlot(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SLOT) return null;
  return n <= 8 ? 5180 + n : 5200 + n;
}

/** The slot number of a path inside …/slot-<n>/…, or null. */
export function slotOfPath(p) {
  const m = /[\\/]slot-(\d{1,2})(?=[\\/]|$)/.exec(String(p));
  if (!m) return null;
  return portForSlot(m[1]) === null ? null : Number(m[1]);
}

/** The preview port of the worktree a path lies in: a slot, the integration tree, or null. */
export function portForTree(p) {
  const s = String(p);
  const slot = slotOfPath(s);
  if (slot !== null) return portForSlot(slot);
  if (/[\\/]tracker-wt[\\/]int(?=[\\/]|$)/.test(s)) return INT_PORT;
  return null;
}
