/**
 * The Pulse images — the public API of this folder. Hand-written; everything else here is generated.
 *
 * ═══ ONE DOOR ══════════════════════════════════════════════════════════════════════════════════
 *
 * Import THIS file (`…/assets/pulse`), never a file inside the folder. `check:assets` fails the
 * build on any path that reaches in (`assets/pulse/img/…`, `assets/pulse/urls`) and on any image
 * import outside `urls.ts` — because the moment a second file imports a raster, the manifest stops
 * being the list of what ships, and the budget, the reserved boxes and the lit pairs stop being
 * checkable.
 *
 *   slots.ts   GENERATED — the manifest: family, intrinsic size, widths, lit flag. Pure TypeScript.
 *   urls.ts    GENERATED — the one file that imports the 49 WebP files (hashed URLs from Vite).
 *   img/       GENERATED — `<slot>-<width>.webp`, `<slot>-lit-<width>.webp`. Never edited by hand.
 *
 * To add or change an image: edit `assets-src/pulse/assets.json`, run
 * `npm run assets:pulse -- --src <masters folder>`, look at the result over the canvas, commit.
 *
 * To DRAW one, use `<Pic slot="…" width={…} />` (`ui/media/Pic.tsx`): it reserves the box from the
 * manifest, so no caller can forget a height. `pulseSrcSet` is for the two places that need a URL
 * rather than an element — a CSS text fill (the monogram texture) and a preload.
 *
 * The exception to "import this file": a module that a build gate imports into bare Node
 * (`app/navTabs.ts`) may not import anything that imports an image. It takes its key TYPE straight
 * from `slots.ts` with `import type`, which is erased before Node ever resolves it.
 */
import { EQUIPMENT_STILL, PULSE_SLOTS, TAB_ICON_KEYS } from './slots';
import type { PulseFamily, PulseLitSlot, PulseSlot, PulseSlotMeta, TabIconKey } from './slots';
import { PULSE_URLS } from './urls';
import type { PulseVariants } from './urls';

export { EQUIPMENT_STILL, PULSE_SLOTS, TAB_ICON_KEYS };
export type { PulseFamily, PulseLitSlot, PulseSlot, PulseSlotMeta, TabIconKey };

/** What an `<img>` needs to draw a slot, straight from the manifest. */
export interface PulseSource {
  /** The largest variant: the fallback of a browser that ignores `srcSet`. */
  src: string;
  /** Width-descriptor candidates (`url 216w, url 432w`), or undefined when the slot has one file. */
  srcSet: string | undefined;
  /** Intrinsic pixel size of the largest variant. Every variant has this aspect ratio. */
  width: number;
  height: number;
}

/**
 * The URLs of a slot.
 *
 * `lit: true` is only meaningful for a slot that has a lit raster; `PulseLitSlot` is the type that
 * says which. Asked for a lit raster a slot does not have, this returns the idle one rather than
 * throwing — a tab that fails to light is a defect, a tab bar that takes the screen down is worse.
 */
export function pulseSrcSet(slot: PulseSlot, options: { lit?: boolean } = {}): PulseSource {
  const entry: { idle: PulseVariants; lit?: PulseVariants } = PULSE_URLS[slot];
  const variants = (options.lit ? entry.lit : undefined) ?? entry.idle;
  const meta = PULSE_SLOTS[slot];
  return {
    src: variants[variants.length - 1][1],
    srcSet: variants.length > 1 ? variants.map(([width, url]) => `${url} ${width}w`).join(', ') : undefined,
    width: meta.width,
    height: meta.height,
  };
}

/** The rendered height, in CSS px, of a slot drawn `width` CSS px wide. */
export function pulseHeight(slot: PulseSlot, width: number): number {
  const meta = PULSE_SLOTS[slot];
  return Math.round((width * meta.height) / meta.width);
}

/** A tab's icon key → its slot. The slot always has a lit raster (`check:assets`, assertion 4). */
export function tabIconSlot(key: TabIconKey): PulseLitSlot {
  return `tab-${key}`;
}

/**
 * An equipment slug from the API → its still, or null.
 *
 * Null means "draw a text-only row", never "draw a placeholder": a still exists for 8 of the 16
 * slugs, four more borrow a neighbour's, and a slug this build has never heard of is null too.
 */
export function equipmentStill(slug: string | null | undefined): PulseSlot | null {
  if (!slug || !Object.hasOwn(EQUIPMENT_STILL, slug)) return null;
  return EQUIPMENT_STILL[slug];
}
