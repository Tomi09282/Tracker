# Kit reference — media (lane E, package F5)

Images in Pulse: the product's own rasters (`Pic`) and user uploads (`UserPhoto`).
Source of the rules: `docs/brain/58-Pulse/Pulse System.md` §5, `docs/pipeline/pulse/understand/assets.md`.
Specimen: `frontend/src/features/playground/kit/media.tsx`.

The API below is final. Changes after this page are additive only (R6).

## The three rules a screen has to know

1. **Draw a product image with `<Pic>`, a user upload with `<UserPhoto>`.** Nothing else renders an
   `<img>` for them. No blend mode, no mask, no wrapper with a background, no frame, no radius on a
   product image, no caption box, no text over the lit part of an image.
2. **Import the folder, never a file inside it.** `import { … } from '…/assets/pulse'` is the door.
   A path that reaches in (`assets/pulse/img/…`, `assets/pulse/urls`) and any image import outside
   `src/assets/pulse/urls.ts` fail `check:assets` (assertion 6).
3. **A missing image is not drawn.** `equipmentStill()` returns `null` for 4 of the 16 equipment
   slugs and for any slug it has never heard of: the row is text-only. Never a grey square, never a
   stand-in.

## `Pic` — `frontend/src/ui/media/Pic.tsx` · `data-kit="pic"`

```tsx
import { Pic } from '../../ui/media/Pic';

<Pic slot="hero-grip" width={216} priority bleed />        // the screen's one hero
<Pic slot="equip-barbell" width={48} />                    // a 48 pt thumb in a row's lead slot
<Pic slot="coin" width={22} />                             // a cut-out
<Pic slot={tabIconSlot(tab.icon)} width={32} lit={active} /> // a lit pair: both rasters in the DOM
<Pic slot="medal" width={56} lit={earned} className={earned ? undefined : 'opacity-45'} />
```

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `slot` | `PulseSlot` | — | which image. With `lit` it must be a `PulseLitSlot` — the compiler refuses `lit` on a slot with no lit raster |
| `width` | `number` | — | rendered width in CSS px (the number the frame gives). **There is no `height`**: it comes from the manifest, so the box is always reserved |
| `lit` | `boolean` | not given | given → the idle AND the lit raster are rendered, stacked in one box, and the opacity of each follows `lit` in `--duration-fast` ("ignite"). Not given → one `<img>` |
| `priority` | `boolean` | `false` | the screen's one hero: `loading="eager"` + `fetchPriority="high"`. At most one per screen |
| `loading` | `'eager' \| 'lazy'` | `lazy`; a lit pair: `eager` | tab icons are eager so both states are cached on the first online paint |
| `bleed` | `boolean` | `false` | `max-width: none` — the image may run past its container (a hero cut by the screen edge). The scaffold must clip (`overflow-x: clip`) |
| `lightsOn` | `boolean` | `true` | fade up from black over `--duration-slow` once decoded. Reduced motion: appears, no fade. Never applied to a lit pair |
| `alt` | `string` | `''` | decorative by default. State is never carried by an image alone (a locked medal also says so in text) |
| `className` | `string` | — | PLACEMENT only (`absolute right-0 top-0`, `shrink-0`, an opacity for a pressed / locked state) |

What it renders: `<img width height srcset sizes decoding="async" draggable="false" data-kit="pic" data-slot="…">`.
`width` / `height` attributes + the global `img { height: auto }` reserve the box before a byte
arrives. `sizes` is the rendered width, so the browser picks the density (a 3x phone takes the 2x
hero — heroes ship at 1x and 2x only; figures at 1x / 2x / 3x; icons, stills and the medal as one
3x file).

A lit pair renders `<span data-kit="pic" data-slot data-lit>` with the two images inside; `className`
goes to the span. The pressed state (60 % opacity) belongs to the control that holds it.

Until the image has decoded the reserved box is EMPTY. Pulse draws no skeleton for an image.

### Slots (27) — the manifest is `PULSE_SLOTS`

| Family | Slots | Files (px wide) | Drawn at (pt) |
|---|---|---|---|
| `icon` (lit pair) | `tab-home`, `tab-training`, `tab-nutrition`, `tab-progress`, `tab-coach`, `tab-admin`, `tab-profile` | 96 | 32 (28 with seven tabs) |
| `object` | `coin` | 72 · 188 · 376 · 512 | 20-22 in a row, 188 on the wallet |
| `object` (lit pair) | `medal` | 168 | 56 — locked: idle at 45 % opacity, earned: lit |
| `equipment` | `equip-barbell`, `-bodyweight`, `-dumbbell`, `-kettlebell`, `-machine`, `-cable`, `-bench`, `-resistance-band` | 144 | 48 |
| `figure` | `figure-front`, `figure-back` (neutral — the app draws the lime over them) | 195 · 390 · 585 | 195 selector, 189 detail, 105 player |
| `hero` | `hero-grip` (Home), `hero-chalk` (sign-in), `hero-plates` (onboarding, plans), `hero-kettlebell` (workout), `hero-bowl` (nutrition), `hero-tape` (progress), `hero-stopwatch` (coach) | 1x · 2x | 216 · 250 · up to 480 · 379 · 267 · 200 · 239 |
| `texture` | `texture-monogram` — a TEXT fill, not a picture | 512 | fills the 176 pt monogram |

All figures, heroes and stills carry their own alpha ("knee alpha", canvas `#0B0D0A`, knee 32): over
the canvas they are pixel-for-pixel what the design's "lighten" shows, and they cannot show a
rectangle, whatever they are placed inside. On the sheet surface their edges still dissolve; only
the darkest interior tones sit at the canvas value.

## `UserPhoto` — `frontend/src/ui/media/UserPhoto.tsx` · `data-kit="userPhoto"`

```tsx
import { UserPhoto } from '../../ui/media/UserPhoto';

<UserPhoto src={`/api/v1/public/media/${post.cover_key}`} alt={post.cover_alt} ratio={5 / 2} priority />
<UserPhoto src={thumbUrl} alt="" ratio={80 / 56} desaturate className="w-20" />   // a list row
```

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `src` | `string` | — | a same-origin media URL from the API |
| `alt` | `string` | — | REQUIRED. `''` only where the text beside it already says what the picture is |
| `ratio` | `number` | — | REQUIRED. width ÷ height of the box (`16 / 9`, `5 / 2`, `1`): the only thing that reserves it |
| `desaturate` | `boolean` | `false` | lists and feeds show photos without colour. Static `grayscale` — never animate a filter |
| `fit` | `'cover' \| 'contain'` | `cover` | crop to the box, or show the whole upload inside it |
| `priority` | `boolean` | `false` | the lead image of a screen: eager + high priority (the marketplace lead cover) |
| `loading` | `'eager' \| 'lazy'` | `lazy` | |
| `className` | `string` | — | placement and WIDTH only (`w-20`, a grid cell). It fills the width it is given |

One element: `<img>` with its own `aspect-ratio`, `object-fit`, radius 2 (`--radius-1`), no border.
There is no wrapper to hang a background on. It replaces the eight hand-styled `<img>` sites
(library row and detail, marketplace lead and post, progress photos, post editor cover, moderation
queue); each moves with its screen package.

## The folder's API — `frontend/src/assets/pulse/index.ts`

| Export | What |
|---|---|
| `PULSE_SLOTS` | `{ [slot]: { family, width, height, widths, lit } }` — intrinsic size of the largest variant |
| `PulseSlot`, `PulseLitSlot`, `PulseFamily`, `PulseSlotMeta` | types; `PulseLitSlot` = the slots `<Pic lit>` accepts |
| `TAB_ICON_KEYS`, `TabIconKey` | `'home' \| 'training' \| 'nutrition' \| 'progress' \| 'coach' \| 'admin' \| 'profile'` |
| `tabIconSlot(key)` | `TabIconKey` → `PulseLitSlot` (`'tab-' + key`) |
| `EQUIPMENT_STILL` | every equipment slug of the database → its still or `null` |
| `equipmentStill(slug)` | the same, safe for an unknown, `null` or `undefined` slug |
| `pulseSrcSet(slot, { lit? })` | `{ src, srcSet, width, height }` — for the two places that need a URL, not an element: the monogram's text fill and a preload |
| `pulseHeight(slot, width)` | the rendered height for a width |

`app/navTabs.ts` is imported into bare Node by two gates, so it must not import anything that
imports an image. It takes the key type straight from the generated manifest, type-only:

```ts
import type { TabIconKey } from '../assets/pulse/slots.ts';   // erased before Node resolves it
export interface NavTabSpec { to: string; icon: TabIconKey; labelKey: string; /* … */ }
```

and the bar resolves the pair: `<Pic slot={tabIconSlot(tab.icon)} width={32} lit={active} />`.
In the same commit `"navTabs": { "leg": "enforced" }` is set in `frontend/assets-src/pulse/assets.json`
(one word, through the lane's `shared.patch`): that switches on the second leg of assertion 4.
`check:assets` fails if every tab already names a key and the leg is still `pending`.

The monogram texture as a text fill (lane ST):

```tsx
style={{ backgroundImage: `url(${pulseSrcSet('texture-monogram').src})` }}
// + background-clip: text, color: transparent, and an ink background-COLOR under the image:
// without it a late or failed texture is invisible initials.
```

## Adding or changing an image

1. Put the PNG master in the archive folder (`5-pulse/kepek`; the masters are NOT in the repository).
2. Add or edit the slot in `frontend/assets-src/pulse/assets.json`. A slot name may not start with a
   word that reads as a colour utility (`ring-`, `text-`, `bg-`, `fill-`, `stroke-`, `border-`,
   `outline-`, `divide-`, `decoration-`). `alpha`: `knee` for a still shot on true black, `keep` for
   a cut-out, `none` for an opaque texture.
3. `npm run assets:pulse -- --src <absolute folder of the masters>` (`--sharp-from <checkout>` when the
   main checkout has no `backend/node_modules`). It refuses to write when a master is missing, would
   be upscaled, does not fade to black at its edge, or — for a lit raster — is not in the accent.
4. `npm run check:assets`, then LOOK at the new files over `#0B0D0A` before committing them.

An equipment still for one of the four slugs without one: add the slot, point the slug at it in
`equipmentStill`, re-run. Nothing else changes — the rows that were text-only draw the thumb.

## The gate — `npm run check:assets` (in `npm run build`)

| # | Holds | Probe (`node scripts/check-assets.mjs --probe`) |
|---|---|---|
| 1 list | manifest = `slots.ts` = `urls.ts` = lock = files on disk; no orphan; no excluded source; images are the ones the script wrote | a `-lit` file deleted · an orphan · `portrait-coach.png` given a slot · the knee edited without a re-export · one byte of an image flipped |
| 2 pixels | every file's real size (WebP header) is its width and the slot's aspect ratio; lit = idle | a wrong height in `slots.ts` · a file holding another width's pixels |
| 3 budget | folder ≤ 1,048,576 B; per file: icon / still / medal 8 kB, coin 40 kB, figure 70 kB, hero 100 kB, texture 8 kB | a hero over its cap and the folder over 1.0 MB |
| 4 tabs | every tab icon key has both rasters; every tab of `NAV_TABS` names a key (second leg: `navTabs.leg` in `assets.json`) | the lit flag dropped · a tab naming `whistle` · a tab still carrying a component · the switch left on `pending` |
| 5 equipment | `EQUIPMENT_STILL` decides every slug of the database roster and points only at equipment stills | a slug removed · a slug pointed at a hero · a new slug in a migration |
| 6 door | no image import and no path into the folder outside `src/assets/pulse` / `src/ui/media`; no blend mode anywhere in `src` | a blend utility in a feature file · an image import · a deep import · `Pic` importing an image itself |
| 7 canvas | `assets.json` `canvas` = every `--surface-0` in `tokens.css` | `--surface-0` changed alone |
| 8 accent | `assets.json` `accent` = every `--accent` in `tokens.css` | `--accent` changed alone · the baked accent changed alone |

The probes run in copies under the OS temp folder; the working tree is never touched.

Not checked by the gate (it cannot see a bundle): that no Pulse image is inlined as base64. That is
the `build.assetsInlineLimit` line in `vite.config.ts`; verify with
`grep -l "data:image" dist/assets/*.js` (expect nothing).

## A new accent (not built — D1 ships one look)

The lit rasters are pixels, so a token cannot re-colour them: the accent exists in `tokens.css`
(`--accent`) and in `assets.json` (`accent`), and assertion 8 holds the two equal. A pack needs a
second lit set. The ramp that makes one is in `scripts/build-pulse-assets.mjs` (`accentRamp`), and
the export verifies every lit master against it pixel by pixel — so the mechanism to bring back is:
re-tint the eight lit masters through the ramp of the new accent, add the set as `…-lit-<pack>-…`,
one lookup in `Pic`.
