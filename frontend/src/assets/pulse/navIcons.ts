/*
 * THE BAR'S ICON KEYS → THE RASTER THAT DRAWS EACH ONE — pure data, hand-written, on purpose.
 *
 * This is the ONE slot mapping of the tab bar. `app/navTabs.ts` names an icon by KEY, the bar
 * (`ui/nav/NavIcon.tsx`) asks this table which raster draws that key, and `check-assets.mjs`
 * (assertion 4) imports it into bare Node and holds it to the files on disk. So it may hold
 * TYPE-ONLY imports and erasable syntax, nothing else — the rules of `navTabs.ts`.
 *
 * ═══ WHY A TABLE AND NOT `tab-<key>` ═══════════════════════════════════════════════════════════
 *
 * The role bars of design round A (frame `bars`, page "14 · PULSE — Nézetek") have six cells
 * whose icon masters do not exist yet: the two switch cells and Tervek, Pult, Fiókok, Piactér.
 * Round A draws them with PLACEHOLDER rasters that already ship (its README, "Placeholder icons"),
 * and the app draws exactly the same ones. When the owner's masters arrive (checkpoint C2) they go
 * through the asset pipeline as `tab-<key>` slots and the rows below change — no screen, no bar
 * and no tab table is touched.
 *
 *   key              future master          placeholder today
 *   switch-user      switch-user (idle)     tab-profile, idle raster only
 *   switch-trainer   switch-trainer (idle)  tab-coach, idle raster only
 *   plans            plans + lit            hero-tape (photo, cropped to the cell); lit = lime tint
 *   desk             desk + lit             hero-stopwatch (photo, cropped); lit = lime tint
 *   accounts         accounts + lit         hero-plates (photo, cropped); lit = lime tint
 *   market           market + lit           coin; lit = lime tint
 *
 * ═══ THE THREE WAYS A CELL LIGHTS ══════════════════════════════════════════════════════════════
 *
 *   raster  the slot has a lit twin on disk (`tab-*`): the bar cross-fades the pair.
 *   tint    a placeholder with no lit twin: the frame lays the accent over it in MULTIPLY. The app
 *           keeps blend modes out of `src` (check:assets 6), so the bar draws the accent through a
 *           LUMINANCE mask of the same raster instead — on the black canvas that is the same
 *           picture (accent × the raster's light) without a blend mode.
 *   none    a switch cell. It is not a destination and never lights (frame `bars`, "Váltó cella"):
 *           it has an idle raster and nothing else. check:assets fails a switch key that asks for
 *           any other mode, and a switch master that ever ships a lit file.
 */
import type { PulseSlot, TabIconKey } from './slots.ts';

/** The destination cells whose master is not made yet. */
export const PLACEHOLDER_NAV_KEYS = ['plans', 'desk', 'accounts', 'market'] as const;

/** The switch cells: idle raster only, never lit. */
export const SWITCH_ICON_KEYS = ['switch-user', 'switch-trainer'] as const;
export type SwitchIconKey = (typeof SWITCH_ICON_KEYS)[number];

/** Every icon a destination tab may name. */
export type NavIconKey = TabIconKey | (typeof PLACEHOLDER_NAV_KEYS)[number];

export interface NavIconSource {
  /** The raster that draws the idle state. */
  slot: PulseSlot;
  /** How the cell lights. See the header. */
  lit: 'raster' | 'tint' | 'none';
  /** A photo still cropped to the square cell (the frame's FILL), instead of fitted into it. */
  crop?: 'cover';
  /** The raster stands in for a master that does not exist yet. */
  placeholder?: true;
}

export const NAV_ICON_SOURCE: Readonly<Record<NavIconKey | SwitchIconKey, NavIconSource>> = {
  home: { slot: 'tab-home', lit: 'raster' },
  training: { slot: 'tab-training', lit: 'raster' },
  nutrition: { slot: 'tab-nutrition', lit: 'raster' },
  progress: { slot: 'tab-progress', lit: 'raster' },
  coach: { slot: 'tab-coach', lit: 'raster' },
  admin: { slot: 'tab-admin', lit: 'raster' },
  profile: { slot: 'tab-profile', lit: 'raster' },
  plans: { slot: 'hero-tape', lit: 'tint', crop: 'cover', placeholder: true },
  desk: { slot: 'hero-stopwatch', lit: 'tint', crop: 'cover', placeholder: true },
  accounts: { slot: 'hero-plates', lit: 'tint', crop: 'cover', placeholder: true },
  market: { slot: 'coin', lit: 'tint', placeholder: true },
  'switch-user': { slot: 'tab-profile', lit: 'none', placeholder: true },
  'switch-trainer': { slot: 'tab-coach', lit: 'none', placeholder: true },
};
