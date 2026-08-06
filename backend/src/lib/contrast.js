// src/lib/contrast.js — WCAG relative luminance and contrast ratio.
//
// This lives on the SERVER as well as the client on purpose. The theme builder shows a live
// contrast guard while the user picks a color, but that guard is UX: a request can be forged
// with a proxy, so the same rule is re-applied here before anything is stored. The frontend is
// not a security boundary, and "the picker wouldn't let me choose that" is not an argument.

/** #RRGGBB → [r, g, b] in 0..255. Assumes the caller has already validated the format. */
function parseHex(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x relative luminance. */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colors, 1..21. */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Pick the readable foreground for a background — this is the `accent-fg` the Bible asks for.
 * Returns black or white, whichever wins, plus the ratio so the caller can reject the color
 * outright when even the better option falls short.
 */
export function readableOn(background) {
  const onBlack = contrastRatio(background, '#000000');
  const onWhite = contrastRatio(background, '#FFFFFF');
  return onBlack >= onWhite
    ? { fg: '#000000', ratio: onBlack }
    : { fg: '#FFFFFF', ratio: onWhite };
}

/** The Bible's floor for body text and interactive labels. */
export const AA_NORMAL = 4.5;

/**
 * The darkest surface of each pack — what an accent has to be legible ON.
 *
 * Duplicated from the frontend token layer, which is not ideal, but the alternative is worse:
 * without it the server cannot validate an accent at all, and "the picker wouldn't let you"
 * is not a control. The smoke suite asserts these stay in step with tokens.css.
 */
/**
 * THE SURFACES MAP USED TO LIVE HERE AND IT WAS A SECOND COPY.
 *
 * It listed five packs and `checkAccent` fell back to 'midnight' for anything it did not know —
 * which, the day migration 019 added a sixth pack, would have silently validated that pack's
 * accent against the WRONG surface. And midnight is the near-black one, so the fallback was also
 * the most PERMISSIVE: a new pack's accent would have been checked against the easiest possible
 * background and passed things that are illegible on the real one.
 *
 * That is this project's recurring defect wearing a fifth costume: two things that must agree,
 * with one of them able to fall silently out of date. `theme_packs.surface_hex` is now the single
 * authority and the caller reads it from there, so an unknown pack has no fallback to be wrong
 * with — it simply does not exist.
 */

/**
 * Whether an accent may be used, and why not if it may not.
 *
 * NOTE, learned the hard way: checking only `max(contrast vs black, contrast vs white) >= 4.5`
 * is VACUOUS. Those two curves cross at a ratio of 4.58, so the better of the pair never drops
 * below 4.5 for any colour in existence — the check can never fail and protects nothing.
 *
 * The constraint that actually binds is the other direction: the accent is not only a fill with
 * `accent-fg` on top, it is also TEXT — links, the active nav item, eyebrow labels — drawn on
 * the app's own dark surface. A dark accent fails there, and that is what this rejects.
 */
/**
 * There is NO DEFAULT here any more, and its absence is the guard.
 *
 * The old signature was `(hex, pack = 'midnight')`, so a caller that forgot the second argument
 * silently validated against the darkest, most permissive surface and got an "ok" it had not
 * earned. A required argument means a caller that forgets it fails at the call site instead.
 */
export function checkAccent(hex, surfaceHex) {
  const surface = surfaceHex;
  const asText = contrastRatio(hex, surface);
  const { fg, ratio: fgRatio } = readableOn(hex);
  return {
    ok: asText >= AA_NORMAL,
    asText,
    surface,
    fg,
    fgRatio,
  };
}
