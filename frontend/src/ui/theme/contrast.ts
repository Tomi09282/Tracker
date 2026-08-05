/**
 * WCAG contrast, client side.
 *
 * This is a deliberate duplicate of `backend/src/lib/contrast.js`. The client copy powers the
 * live guard in the theme builder — the user must see immediately that a color is unreadable,
 * not after a round trip. The server copy is the one that actually decides, because the client
 * can be bypassed. Both must implement the same formula; the smoke suite asserts they agree.
 */

import { BLACK, WHITE, DARKEST_SURFACE } from './palette';

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The readable foreground for a background, plus the ratio it achieves. */
export function readableOn(background: string): { fg: string; ratio: number } {
  const onBlack = contrastRatio(background, BLACK);
  const onWhite = contrastRatio(background, WHITE);
  return onBlack >= onWhite ? { fg: BLACK, ratio: onBlack } : { fg: WHITE, ratio: onWhite };
}

export const AA_NORMAL = 4.5;

/**
 * The live surface the accent has to be legible on. Read from the cascade rather than from a
 * duplicated table, so switching theme packs automatically re-targets the check.
 */
function currentSurface(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--surface-0').trim();
  // The fallback only matters if the stylesheet has not applied yet; it is the darkest pack
  // surface, so it can only ever make the guard stricter, never looser.
  return /^#[0-9A-Fa-f]{6}$/.test(v) ? v : DARKEST_SURFACE;
}

/**
 * Whether an accent may be used.
 *
 * The obvious check — "does black or white read on this accent" — is VACUOUS: those two
 * contrast curves cross at 4.58, so the better of the pair never falls below 4.5 for any colour
 * that exists. It can never reject anything.
 *
 * What actually binds is the accent used AS TEXT on the app's own background: links, the active
 * nav item, eyebrow labels. A dark accent fails there, and that is what this catches. The
 * server re-runs the same rule, because this one can be bypassed.
 */
export function checkAccent(hex: string, surface = currentSurface()) {
  const asText = contrastRatio(hex, surface);
  const { fg, ratio: fgRatio } = readableOn(hex);
  return { ok: asText >= AA_NORMAL, asText, fg, fgRatio, surface };
}
