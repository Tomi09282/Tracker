import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

/**
 * The control recipe — every interactive element in the product is built from this.
 *
 * Why a shared recipe rather than per-component classes: the previous implementation lost the
 * 44 px floor in twelve places (a 24 px search field, nine 32 px chips), because each component
 * chose its own height. Here the floor is not a rule anyone has to remember — it is the base
 * layer of every variant, and `check-tokens.mjs` refuses raw `<button>` elements outside
 * `src/ui/` so nothing can bypass it.
 *
 * ═══ PULSE HAS TWO ACTION LOOKS, AND THEY ARE BOTH HERE ══════════════════════════════════════
 *
 *   the lime pill   `variant: 'primary'` + `size: 'lg'` (56) or `'sm'` (44)        kit: btnPrimary
 *   the text link   `variant: 'link'` (+ `tone: 'danger'`, `text: 'body'`)         kit: textLink
 *   the bare glyph  `variant: 'link'` + `shape: 'icon'`                            kit: iconBtn
 *
 * Every number below is the Figma kit's (`figma-build/app-kit.js`, lines 196-209) and the measured
 * boxes of the component board (`_components.json`: `Button/primary`, `Link/…`, `Button/icon · …`).
 *
 * ═══ AND THE OLD LOOKS STILL COMPILE, UNTOUCHED ══════════════════════════════════════════════
 *
 * `secondary`, `ghost`, `danger`, the `selected` wash, the chip and field shapes and the three
 * densities are the bridge: 110 call sites on screens nobody has rebuilt yet still name them.
 * They emit exactly the classes they emitted before this file learned Pulse — the same set, in
 * another order, so the same pixels and the same hit geometry — and they leave in the closing
 * cleanup, counted by `check:pulse` until then. Do not write new code against them.
 *
 * ═══ NOTHING GROWS BEHIND A SCREEN'S BACK ════════════════════════════════════════════════════
 *
 * The 56 pt pill is OPT-IN: `size` defaults to `md`, which is today's 44 with today's padding and
 * type. A screen gets the Pulse metrics by writing `size="lg"` or `size="sm"` when it is rebuilt
 * (the workout player is one viewport tall by law; twelve taller buttons would push its check
 * control off the screen). The default flips in the closing cleanup.
 */

/**
 * Press and disabled feedback of the three bridged variants — what the base carried for every
 * variant before Pulse gave the pill and the link their own. Kept to the letter.
 */
const LEGACY_STATES = 'active:scale-[0.97] disabled:opacity-45';

/**
 * The kit specimen has to show a pressed pill and a focused link side by side, and no page can
 * hold five real presses and five real keyboard focuses at once. So the two Pulse looks answer
 * to `data-force="pressed"` and `data-force="focus"` with the SAME declarations as the real
 * state, written next to it — the specimen shows the recipe's own state, not a copy of it.
 * Nothing in the product sets the attribute.
 */
const FORCED_FOCUS =
  'data-[force=focus]:outline-solid data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-[var(--focus-ring)]';

const recipe = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2',
    'font-body whitespace-nowrap',

    // THE FLOOR, width half. Both axes, on every variant, with no way to opt out from a call
    // site: the height half is the `size` axis below, whose smallest value is the same 44.
    // The WIDTH stays on `--target-min`: it is the floor for a square icon control, not a
    // stylistic dimension. (The text link is the one exception, and it keeps the floor another
    // way — see `link`.)
    'min-w-[var(--target-min)]',

    // Press feedback. `duration-instant` (100ms) because a press must answer immediately;
    // anything slower reads as lag rather than acknowledgement. Transform and opacity only.
    'transition-[transform,background-color,border-color,color,opacity]',
    'duration-[var(--duration-instant)] ease-[var(--ease-standard)]',

    // Focus is redrawn, never removed. The ring lives on the accent token so it survives a
    // theme swap.
    //
    // `focus-visible:outline-solid` IS the ring. In Tailwind 4 `outline-none` sets the style
    // variable `--tw-outline-style` to `none` as well as the property, and `outline-2` draws with
    // `outline-style: var(--tw-outline-style)` — so without this class the ring had a width and a
    // colour and no style, and every control showed NOTHING under keyboard focus (the built CSS
    // of 0860942 holds both rules; in headless Chrome a Tab-focused, `:focus-visible` control
    // computed `outline-style: none`). The global `:focus-visible` ring of index.css is in
    // `@layer base` and loses to any utility, so it could not stand in.
    'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-[var(--focus-ring)]',

    // Disabled must be unmistakable AND inert — a control that looks pressable but does
    // nothing is worse than one that looks disabled. What it LOOKS like is the variant's word.
    'disabled:pointer-events-none',

    // Busy: the control stays visible and keeps its size (no layout shift) but refuses input.
    'aria-busy:pointer-events-none aria-busy:cursor-progress',

    // Touch devices fire hover on tap, which leaves elements stuck in a hover state after a
    // press. Tailwind 4 already gates `hover:` behind `@media (hover: hover)`; this makes the
    // intent explicit for anyone reading the recipe.
    'cursor-pointer',
  ],
  {
    variants: {
      variant: {
        /**
         * THE LIME PILL — exactly one per screen, and the only thing in the product that glows.
         *
         *   rest      lamp fill, canvas-coloured label, the glow
         *   pressed   `accent-pressed`, glow off, scale 0.98 — all in `instant`
         *   disabled  `surface-2` fill, `text-3` label, no glow. A FILL change, not an opacity:
         *             a 40 % lime still reads as "the action", only dimmer
         *   busy      the lamp stays on, the glow goes, three dots stand in for the label
         *             (drawn by `Pressable`)
         *
         * The glow is a layer of its own (`::before`, same box, same radius) and not a shadow of
         * the pill, for two reasons: it can breathe — the resting pulse animates the OPACITY of
         * that layer, which a compositor does for free, where animating a box-shadow repaints
         * the label on every frame — and it can be switched off in one declaration without a
         * second shadow utility. Keep 20 px clear around a pill: nothing clips the layer here,
         * but an `overflow: hidden` ancestor will.
         *
         * Busy is `aria-busy` AND `disabled` on the element (a busy button must not submit
         * twice), so the busy rule is written one selector heavier than the disabled one and
         * wins on specificity, not on source order.
         */
        primary: [
          'bg-accent text-accent-fg',
          'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-glow',
          'active:scale-[0.98] active:bg-accent-pressed active:before:hidden',
          'data-[force=pressed]:scale-[0.98] data-[force=pressed]:bg-accent-pressed data-[force=pressed]:before:hidden',
          'disabled:bg-surface-2 disabled:text-text-3 disabled:before:hidden',
          'aria-busy:disabled:bg-accent aria-busy:disabled:text-accent-fg',
          FORCED_FOCUS,
        ].join(' '),
        // BRIDGE. The border WIDTH comes from the token; hover strengthens the edge as well as
        // the fill — a surface-2 hover on a surface-1 control is a 1.1:1 change, which is not an
        // answer to a pointer.
        secondary: [
          'border-[length:var(--border-width)] border-[var(--surface-border)]',
          'bg-surface-1 text-text-1',
          'hover:border-[var(--surface-border-strong)] hover:bg-surface-2',
          LEGACY_STATES,
        ].join(' '),
        // BRIDGE.
        ghost: `text-text-2 hover:bg-accent-subtle hover:text-text-1 ${LEGACY_STATES}`,
        // BRIDGE. Pulse has no filled red anywhere: a destructive action is `link` + `tone: 'danger'`.
        danger: `bg-danger text-on-danger hover:opacity-90 ${LEGACY_STATES}`,
        /**
         * THE TEXT LINK — every action that is not the screen's one pill. Bare text in a 44 pt
         * frame: no fill, no border, no hover wash. `text-1` at rest; pressed is 60 % and "off"
         * is 40 %, the one state grammar rows and links share. No scale: only the pill moves.
         *
         * What the frame looks like — hugging the words on the left edge, or a square for a bare
         * glyph — is decided with `shape` in the compound rules at the end of this recipe.
         * `aria-disabled` is honoured as well as `disabled`, because the router-link form is an
         * anchor and an anchor cannot be disabled. A busy link keeps its full ink: the three dots
         * are the message, and they must not be read as "off".
         */
        link: [
          'text-text-1',
          'active:opacity-[var(--pressed-opacity)] data-[force=pressed]:opacity-[var(--pressed-opacity)]',
          'disabled:opacity-[var(--disabled-opacity)] aria-busy:disabled:opacity-100',
          'aria-disabled:pointer-events-none aria-disabled:opacity-[var(--disabled-opacity)]',
          FORCED_FOCUS,
        ].join(' '),
      },
      /**
       * BRIDGE — the selected state of a legacy filter chip / toggle: `bg-accent-subtle` + accent ink.
       * Pulse marks selection with a 2 pt line under the word (`ChipRow`, `Segmented`), never a wash.
       *
       * A variant rather than a call-site constant because it was already being hand-written twice
       * (MarketplacePage, ComposePage), and the hover half is the part a call site forgets: without
       * `hover:bg-accent-subtle` the selected chip REVERTS to `surface-2` under the pointer, which
       * reads as "you are about to deselect" on a chip that is merely being hovered.
       *
       * The transparent border is not decoration: `secondary` carries a `--border-width` edge, so a
       * selected chip that simply dropped it would shrink by 1–2px and shove the row.
       *
       * DECLARED BETWEEN `variant` AND `density`, deliberately. cva emits variants in key order and
       * `cn()` runs twMerge over the result, so position decides who wins a conflict.
       */
      selected: {
        true: [
          'bg-accent-subtle text-on-accent-subtle',
          'border-[length:var(--border-width)] border-transparent',
          'hover:bg-accent-subtle hover:text-on-accent-subtle hover:border-transparent',
        ].join(' '),
      },
      shape: {
        button: 'rounded-button px-4',
        // Square controls: the floor already guarantees 44×44, so no width class is needed.
        // With `variant: 'link'` this is the Pulse icon button: a bare glyph, nothing around it.
        icon: 'rounded-chip px-0 min-w-[var(--control-h)]',
        // BRIDGE.
        chip: 'rounded-chip px-4',
        // BRIDGE.
        field: 'w-full justify-start rounded-field px-3 text-left font-normal',
      },
      /**
       * BRIDGE — visual density of the legacy looks. NOTE: this changes padding and type size only,
       * never the hit area. The Pulse pill and the link take their type from the role
       * (`body-b`; `cap-m` / `body-m`), so a density beside them changes nothing.
       */
      density: {
        compact: 'text-body-s px-3',
        default: 'text-body-s',
        large: 'text-title-3 px-5',
      },
      /**
       * HEIGHT, and with it the Pulse metrics of the pill.
       *
       *   md   44 — the default until the closing cleanup: today's height, today's padding and type
       *   lg   56 — the Pulse pill
       *   sm   44 — the small Pulse pill (a chat composer's "Küldés" beside a 44 pt field)
       *
       * Declared AFTER `shape` and `density` so that its word is the last one on padding and type.
       */
      size: {
        md: 'min-h-[var(--control-h)]',
        lg: 'min-h-[var(--control-h-primary)]',
        sm: 'min-h-[var(--control-h)]',
      },
      /** `link` only. `danger` = danger TEXT — never a red fill. A destructive action is confirmed in a sheet. */
      tone: {
        default: '',
        danger: '',
      },
      /**
       * `link` only — the type role of the words. `cap` (13 / 18 Medium) is the inline link: in a
       * section head, in a notice line. `body` (16 / 22 Medium) is the standalone link: a second
       * action under a pill, a row of a confirm sheet, an empty state's way out.
       */
      text: {
        cap: '',
        body: '',
      },
    },
    compoundVariants: [
      // The Pulse pill: label `body-b`, 24 either side, 6 between a glyph and the label. And the
      // resting pulse — the glow breathes 100 → 65 → 100 % on the ambient loop, starting 1.5 s
      // after the pill appears. Only here: a `md` primary on a screen that still holds two or
      // three of them would be two or three loops, and Pulse allows one per screen.
      // Reduced motion: the loop goes, the glow stays.
      {
        variant: 'primary',
        shape: 'button',
        size: ['lg', 'sm'],
        class: 'gap-1.5 px-6 text-body-b before:animate-pulse-rest motion-reduce:before:animate-none',
      },
      // The text link: hugs its words on the left edge, 4 between a glyph and the words, `cap-m`.
      // A glyph beside the words is 16 px at stroke 1.75 — the frame's word, not the call site's.
      // The frame is as wide as the words — "Újra" is 25 pt — so the 44 pt floor is kept by an
      // invisible layer centred on the link, at least 44 wide: the target, not the layout.
      //
      // Keyboard focus. The kit draws none, so the ring stays (Pulse System §4) — but drawn on
      // the element it would be a stadium 2 pt from the first and last letter, because the frame
      // has no side padding. So a link draws it on its own `::before` instead: the 44 pt frame
      // widened by 8 either side, radius 4, the same 2 pt `--focus-ring` line just outside it.
      // The element's own ring is switched off for the link only (`iconBtn` keeps the round one).
      {
        variant: 'link',
        shape: ['button', 'chip', 'field'],
        class: [
          'min-w-0 justify-start gap-1 px-0 text-cap-m',
          '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]',
          'after:absolute after:inset-y-0 after:left-1/2 after:w-full after:min-w-[var(--target-min)] after:-translate-x-1/2',
          'before:pointer-events-none before:absolute before:inset-y-0 before:-inset-x-2 before:rounded-2',
          'focus-visible:outline-none data-[force=focus]:outline-none',
          'focus-visible:before:outline-solid focus-visible:before:outline-2 focus-visible:before:outline-[var(--focus-ring)]',
          'data-[force=focus]:before:outline-solid data-[force=focus]:before:outline-2 data-[force=focus]:before:outline-[var(--focus-ring)]',
        ].join(' '),
      },
      { variant: 'link', text: 'body', class: 'text-body-m' },
      { variant: 'link', tone: 'danger', class: 'text-danger' },
      // The bare glyph: 24 px at stroke 1.75 in a 44 × 44 frame. Size and stroke are the frame's
      // word, not the call site's — an icon button cannot be handed a 20 px glyph by accident.
      { variant: 'link', shape: 'icon', class: '[&_svg]:size-6 [&_svg]:stroke-[1.75]' },
    ],
    defaultVariants: { variant: 'secondary', shape: 'button', density: 'default', size: 'md' },
  },
);

export type ControlVariants = VariantProps<typeof recipe>;

type ControlProps = Parameters<typeof recipe>[0];

/**
 * The class list of a control.
 *
 * A Pulse look is resolved here, once, so that it is right for EVERY consumer: `Pressable` runs
 * the class merger over the result anyway, but `<Link className={control(…)}>` does not, and the
 * pill's 24 px padding must replace the bridged shape's 16 rather than sit beside it and let the
 * stylesheet's source order decide. The bridged looks are returned exactly as the recipe emits
 * them — the same class set as before, for the two call sites that never merged.
 */
export function control(props?: ControlProps): string {
  const classes = recipe(props);
  const pulse = props?.variant === 'link' || props?.size === 'lg' || props?.size === 'sm';
  return pulse ? cn(classes) : classes;
}

/**
 * The `data-kit` name of a control: the kit function of the Figma board it is an instance of, or
 * `undefined` for a bridged look. The geometry probe finds a component by this name and compares
 * its box with the frame (PLAN R27), so a legacy 44 px primary must NOT call itself the pill.
 */
export function kitName({ variant, shape, size }: Pick<ControlVariants, 'variant' | 'shape' | 'size'>): 'btnPrimary' | 'textLink' | 'iconBtn' | undefined {
  if (variant === 'link') return shape === 'icon' ? 'iconBtn' : 'textLink';
  if (variant === 'primary' && (shape ?? 'button') === 'button' && (size === 'lg' || size === 'sm')) return 'btnPrimary';
  return undefined;
}

/**
 * BRIDGE — the STATUS chip: a chip-shaped label that reports state and does nothing when you touch it.
 * Pulse writes a state as a 6 pt dot and a word (`NoticeLine`) or a mono tag; the seven tinted
 * tones below leave in the closing cleanup. Do not write new code against them.
 *
 * Separate from `control` rather than a variant of it, because everything `control` guarantees is
 * wrong here: a `cursor-pointer` on a `<span>` promises an action that does not exist,
 * `active:scale-[0.97]` answers a press nobody made, `min-h-[var(--control-h)]` inflates a 24px
 * word to 44px, and the disabled/busy states have no meaning on a thing that was never a target.
 * The 44px floor exists to protect TARGETS; applying it to a label does not make anything more
 * accessible, it just makes the row taller.
 *
 * The tone strings carry the INK and the base carries the size, in that order on purpose: under
 * today's twMerge config `text-caption` and `text-danger` share one class group, and if the sizes
 * came last a `danger` pill would render in the inherited colour — a warning with no warning in
 * it.
 */
export const chip = cva(['inline-flex items-center gap-1 whitespace-nowrap', 'rounded-chip px-3 py-1', 'text-caption'], {
  variants: {
    tone: {
      /** The default: a bordered pill on the card surface. Says "state", claims nothing about it. */
      neutral:
        'border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-1 text-text-2',
      /** Borderless, recessed — for a count or a tag that must not compete with the row it labels. */
      quiet: 'bg-surface-2 text-text-3',
      // `text-on-accent-subtle`, NOT `text-accent` — the wash is the accent at 20%, so
      // accent-on-accent-wash cannot open a contrast gap at any hue.
      accent: 'bg-accent-subtle text-on-accent-subtle',
      success: 'bg-success-subtle text-success',
      warning: 'bg-warning-subtle text-warning',
      danger: 'bg-danger-subtle text-danger',
      info: 'bg-info-subtle text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type ChipVariants = VariantProps<typeof chip>;
