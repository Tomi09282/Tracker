import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { pulseSrcSet } from '../../assets/pulse';
import { Pic } from '../media/Pic';
import { Pressable } from '../primitives/Pressable';
import { Segmented } from '../feedback/variants/E6Segmented';
import { useMotionSafe } from '../feedback/useMotionSafe';
import { REGIONS } from './regions';
import { FIGURE_BOX, musclesOnSide, type MuscleSide } from './figure';

export type MuscleRole = 'primary' | 'secondary';
export type { MuscleSide } from './figure';

/** Declared once: both renderings of the side control read the same two values in the same order. */
const SIDES = ['front', 'back'] as const;

/** The canvas of the renders and of every region path (`regions.ts`): the figure box itself. */
const VIEWBOX = `0 0 ${FIGURE_BOX.width} ${FIGURE_BOX.height}`;

/**
 * THE SECONDARY STEP, measured on the lit render the frames were made from.
 *
 * In `figure-front-press` (exercise-detail-1: Mell primary, the shoulder cap secondary) the cap is
 * not a flat colour: the render's shading shows through it, light on top, dark underneath. Fitted
 * over the cap's pixels: secondary = accent x (0.469 + 0.459 x L), L the neutral render's
 * luminance (0..1) — mean error 7.8 / 255; a flat translucent fill does about as well on average
 * but loses most of the shading. Both factors are then scaled by 0.933: the shipped render is a
 * little brighter than the master the fit used, and the built app measured 7 % over the frame. So a secondary region is the render itself, clipped to
 * the region and recoloured by one `feColorMatrix` built from the accent token. No glow: the press
 * render has none around the cap (alpha 0 from 2 px out).
 */
const SECONDARY_BASE = 0.438;
const SECONDARY_SHADE = 0.428;
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * THE IMPRINT of the render's grooves inside a lit panel (see the filter). Measured on the baked lit
 * renders: inside the lime the green channel dips from 252 to about 244-248 on the grooves and is
 * flat elsewhere, so only luminance under IMPRINT_FROM darkens, by at most IMPRINT_MAX.
 */
const IMPRINT_FROM = 0.3;
const IMPRINT_MAX = 0.05;
/** Black, alpha = (IMPRINT_FROM - L) x IMPRINT_MAX / IMPRINT_FROM (clamped at 0 by the filter). */
const IMPRINT_MATRIX = (() => {
  const k = IMPRINT_MAX / IMPRINT_FROM;
  const alpha = [...LUMA.map((w) => +(-k * w).toFixed(4)), 0, IMPRINT_MAX];
  return [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], alpha].map((r) => r.join(' ')).join(' ');
})();

/**
 * THE SEAM: the sternum between two lit pectorals is a darker lime line in the frames, not the grey
 * render — (156-168, 195-213, 35-38) across it in library-2 / exercise-detail-1, about the accent x 0.78.
 * Drawn as the accent with the canvas colour laid over it at 1 - SEAM_SHADE (no blend mode): G ~202.
 */
const SEAM_SHADE = 0.78;

/** feFuncA table: the identity from 0 up to `ceiling`, flat above it (20 steps of 0.05). */
function ceilingTable(ceiling: number) {
  return Array.from({ length: 21 }, (_, i) => Math.min(i / 20, ceiling)).join(' ');
}

/** What one panel of the render is painted as (see `units` in `Figure`). */
interface PaintUnit {
  key: string;
  d: string;
  seam?: string;
  role: MuscleRole | undefined;
  bloom: readonly [number, number, number, number, number];
}
const RANK = { none: 0, secondary: 1, primary: 2 } as const;

/** `--accent` as 0..1 channels, for the secondary filter (a filter matrix cannot hold a var()). */
function readAccent(el: Element | null): readonly [number, number, number] | null {
  if (!el) return null;
  const hex = getComputedStyle(el).getPropertyValue('--accent').trim();
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : null;
}

/** The secondary filter's matrix: each channel = accent x (base + shade x luminance). */
function secondaryMatrix(accent: readonly [number, number, number]) {
  const rows = accent.map((c) => [...LUMA.map((w) => +(c * SECONDARY_SHADE * w).toFixed(4)), 0, +(c * SECONDARY_BASE).toFixed(4)]);
  // Alpha 1 throughout (the input is already opaque: the render laid on the canvas colour first).
  return [...rows, [0, 0, 0, 0, 1]].map((r) => r.join(' ')).join(' ');
}

/** The box's rendered width, for the render's `sizes` (the box is sized by the screen's class). */
function useBoxWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface MuscleMapProps {
  /** slug → role. Anything absent renders idle. */
  highlights?: Record<string, MuscleRole>;
  /**
   * When set, every muscle becomes a keyboard-reachable button that reports its slug — the
   * reversible direction of the map (owner requirement 21): read it to see what an exercise
   * targets, or tap it to find exercises that target it.
   */
  onSelect?: (slug: string) => void;
  selected?: string;
  /**
   * HERO FILL MODE. The figure is portrait (597 : 1261), so inside a wide, short hero panel a
   * width-sized figure leaves the map floating in the middle of an otherwise empty box. In fill
   * mode the figure is HEIGHT-constrained instead: it takes whatever the container has left after
   * the `Elöl` / `Hátul` control and the legend, and its width follows from the ratio.
   *
   * The "also on the other side" caption is dropped with it. On a hero the segmented control is
   * two inches away, and a sentence explaining a two-item toggle is a sentence.
   *
   * Additive and off by default: every existing call site renders exactly as before.
   */
  fill?: boolean;
  /**
   * Whether to print the primary/secondary key under the figure. See the note at the render site.
   * Defaults to on — most screens tint two kinds of muscle and need to say which is which.
   */
  legend?: boolean;
  /**
   * WHICH `Elöl` / `Hátul` CONTROL. The three screens that render this map do not draw the same
   * one, so it is a prop rather than a rewrite: 04-library.webp and 04-gyakorlat-reszletei.webp
   * both draw a pill PAIR (`Elöl` filled accent with a check, `Hátul` outlined, a gap between
   * them), while 02-workout-player.webp draws one rounded TRACK with the active label in an
   * inner pill — which is the shared E6 `Segmented`. Swapping the component outright would put
   * the workout's control on the two screens whose mockups draw chips.
   *
   * Defaults to the chips because two of the three want them, and because the read-only
   * exercise-detail screen wants the control that is left-aligned in a section, not a hero.
   *
   * `'none'` (Pulse, F15 stage 0): the SCREEN draws the `Elöl` / `Hátul` switch, the legend and
   * the "also on the other side" note where its frame puts them, and owns the side through
   * `side` / `onSideChange`. The map then renders the figure alone, in the fixed 597 : 1261 box
   * (`FIGURE_BOX`): the root element IS that box, so `className` places it and sizes it by ONE
   * dimension (`w-[195px]`, or `h-[221px]`) — the other follows from the ratio. `fill` and `legend`
   * do not apply in this mode. The box carries `data-kit="pic"`: the Figma kit draws the mannequin
   * as a `pic`, and the geometry probe maps the frames' `Image/figure-…` layers to it.
   */
  sideControl?: 'chips' | 'segmented' | 'none';
  /**
   * THE SIDE, CONTROLLED. Omitted (every call site before Pulse): the map keeps the side itself
   * and starts on the front, as it always has. Given: the map shows exactly this side and never
   * changes it on its own — its own control, if it draws one, asks through `onSideChange`.
   */
  side?: MuscleSide;
  /**
   * Called with the side the map's own control asks for (`chips` / `segmented`), controlled or
   * not; not called for a tap on the side already shown. With `sideControl="none"` the map has no
   * control, so the screen's own switch sets `side` directly.
   */
  onSideChange?: (side: MuscleSide) => void;
  className?: string;
}

/**
 * Interactive muscle map — the Pulse mannequin (F15 stage 1).
 *
 * WHAT IS DRAWN. The graphite render of the side (`<Pic slot="figure-front | figure-back">`) fills
 * the 597 : 1261 box, and one SVG in the render's own pixel space lies over it with a path per
 * muscle (`regions.ts`, traced on the render's panel grooves). An unlit muscle is the plain render:
 * its path is there — it is the hit area and the focus target — but paints nothing. A lit one is
 * the frames' panel: SOLID accent (primary, or the selected muscle) with a soft bloom under it, or
 * the weaker secondary step through which the render's shading still shows. Every colour is a
 * token, so a theme pack re-colours the figure with the rest of the app.
 *
 * THE BLOOM is the region itself, blurred and drawn in full accent under the solid fill (an SVG
 * `feGaussianBlur`, no blend mode). Its width per region was fitted on the lit renders the frames
 * were made from (`regions.ts`, `bloom`).
 *
 * THE 44 px FLOOR, AND WHY THIS COMPONENT IS THE ONE EXCEPTION.
 *
 * The regions are as large as the muscles of the figure, and at the frames' sizes several (the
 * neck, the forearms, the front delts) are well under 44 pt across. They cannot be made bigger
 * without destroying the thing they are for: inflating them where they are would put the biceps
 * over the ribs.
 *
 * So the map does not claim to meet the floor. It is a SECONDARY affordance, and the rule it does
 * obey is that it is never the only way to do its job: on the library screen the same filtering is
 * available from the taxonomy chips below it, which are `Pressable`s and do meet the floor.
 * Read-only uses (the exercise detail screen, the player) pass no `onSelect` at all and are not
 * interactive targets in the first place.
 *
 * If a future change makes this map the only path to selecting a muscle, that rule is broken and
 * the fix is to restore the chip row — not to inflate these regions.
 */
export function MuscleMap({
  highlights = {},
  onSelect,
  selected,
  fill = false,
  legend = true,
  sideControl = 'chips',
  side: sideProp,
  onSideChange,
  className,
}: MuscleMapProps) {
  const { t } = useTranslation();
  // Uncontrolled unless the screen passes `side` — the state is still created either way, so a
  // screen that starts or stops controlling never changes the hook order.
  const [ownSide, setOwnSide] = useState<MuscleSide>('front');
  const side = sideProp ?? ownSide;
  const setSide = (next: MuscleSide) => {
    if (next === side) return;
    if (sideProp === undefined) setOwnSide(next);
    onSideChange?.(next);
  };

  // A muscle that only exists on the other view still matters: if an exercise targets the lats
  // and you are looking at the front, nothing would light up and the map would look broken.
  const onSide = musclesOnSide(side);
  const hiddenHighlights = Object.keys(highlights).filter((slug) => !onSide.includes(slug));

  if (sideControl === 'none') {
    // The fixed box (R17): nothing but the figure — the screen draws the control, the note and the
    // legend where its frame puts them, and the box never changes shape.
    return (
      <Figure
        side={side}
        highlights={highlights}
        selected={selected}
        onSelect={onSelect}
        className={cn('relative shrink-0', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center',
        // `min-h-0` is what lets the figure below shrink inside a fixed-height hero instead of
        // pushing the legend out of the panel.
        fill && 'relative h-full min-h-0 gap-tight',
        className,
      )}
    >
      {sideControl === 'segmented' ? (
        // The hero's control. Segmented also brings what a pair of buttons cannot: one radiogroup
        // with one tab stop, arrows moving between the two, and "Elöl, 1 of 2" announced instead
        // of two unrelated pressed buttons. No `icon` passed — the mockup draws no check, and the
        // component has its own glyph story (a tick over the segment on commit), so adding one
        // would put two ticks on the same 44px.
        <div className="shrink-0">
          <Segmented
            options={SIDES.map((s) => ({ value: s, label: t(`muscleMap.${s}`) }))}
            value={side}
            onChange={setSide}
            label={t('muscleMap.viewLabel')}
          />
        </div>
      ) : (
        <div className="flex shrink-0 gap-2">
          {SIDES.map((s) => (
            <Pressable
              key={s}
              shape="chip"
              density="compact"
              variant={side === s ? 'primary' : 'secondary'}
              aria-pressed={side === s}
              /* The check is the same active-chip idiom the muscle chips below the figure use, and
                 the mockups draw it on both. Without it the two pills differ only by fill, which is
                 a colour distinction — the one kind roughly a twelfth of men cannot make. */
              icon={side === s ? <Check className="size-icon-s" strokeWidth={3} aria-hidden /> : undefined}
              onClick={() => setSide(s)}
            >
              {t(`muscleMap.${s}`)}
            </Pressable>
          ))}
        </div>
      )}

      {fill ? (
        <FillFigure side={side} highlights={highlights} selected={selected} onSelect={onSelect} />
      ) : (
        <Figure side={side} highlights={highlights} selected={selected} onSelect={onSelect} className="relative mt-3 w-full max-w-[280px]" />
      )}

      {!fill && hiddenHighlights.length > 0 ? (
        <p className="text-caption mt-2 text-text-3">
          {t('muscleMap.alsoOnOtherSide', {
            side: t(`muscleMap.${side === 'front' ? 'back' : 'front'}`).toLowerCase(),
          })}
        </p>
      ) : null}

      {/* THE LEGEND IS NOT ALWAYS WANTED.
          It earns its place where the two tints mean two different things — the workout player
          highlights a movement's primary and secondary muscles and the reader has to tell them
          apart. On the library screen every highlight is the same kind, so the row is two labels
          explaining a distinction the screen is not making, sitting exactly where the mockup puts
          the muscle chips. Opt-out rather than opt-in: the screens that need it outnumber the one
          that does not, and a legend missing where it was needed is the worse failure. */}
      {legend && Object.keys(highlights).length > 0 ? (
        <div className={cn('flex shrink-0 items-center gap-4', fill ? 'mt-0' : 'mt-3')}>
          <span className="text-caption inline-flex items-center gap-1.5 text-text-2">
            <span aria-hidden className="inline-block size-3 rounded-chip bg-accent" />
            {t('muscleMap.primary')}
          </span>
          <span className="text-caption inline-flex items-center gap-1.5 text-text-2">
            {/* The swatch has to be the FILL, not a near neighbour of it — a key that shows a
                different colour from the thing it keys is worse than no key. */}
            <span
              aria-hidden
              className="inline-block size-3 rounded-chip bg-[var(--muscle-secondary)]"
            />
            {t('muscleMap.secondary')}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The figure in hero fill mode. The column gives the figure "the leftover height": an empty SVG
 * with the canvas's viewBox takes exactly the place the vector drawing used to take (`h-0 flex-1`,
 * width from the viewBox), and the boxed figure is laid over that rectangle. Measured rather than
 * nested, because the box's own aspect-ratio does not resolve inside a column whose height is only
 * bounded (`max-h` / `min-h`), as the library's is.
 */
function FillFigure(props: Omit<FigureProps, 'className' | 'style'>) {
  const sizerRef = useRef<SVGSVGElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const sizer = sizerRef.current;
    const column = sizer?.parentElement;
    if (!sizer || !column) return;
    const read = () => {
      const s = sizer.getBoundingClientRect();
      const c = column.getBoundingClientRect();
      const next = { left: s.left - c.left, top: s.top - c.top, width: s.width, height: s.height };
      setRect((cur) =>
        cur && Object.keys(next).every((k) => Math.abs(cur[k as keyof typeof next] - next[k as keyof typeof next]) < 0.5) ? cur : next,
      );
    };
    read();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(read);
    ro.observe(sizer);
    ro.observe(column);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <svg ref={sizerRef} aria-hidden viewBox={VIEWBOX} className="h-0 min-h-0 w-auto max-w-full flex-1" />
      {rect ? <Figure {...props} className="absolute" style={rect} /> : null}
    </>
  );
}

interface FigureProps {
  side: MuscleSide;
  highlights: Record<string, MuscleRole>;
  selected?: string;
  onSelect?: (slug: string) => void;
  className?: string;
  /** Placement from a measurement (fill mode); the box's ratio still holds. */
  style?: CSSProperties;
}

/**
 * The figure in its 597 : 1261 box: the render, and the region layer over it.
 *
 * The root element is the box (`data-kit="pic"`, `aspect-ratio` from `FIGURE_BOX`), so a screen
 * sizes it by one dimension. The render inside is a plain `<Pic>` stretched over the box — its
 * 585 x 1236 pixels are the 597 x 1261 canvas scaled by 0.98 (the ratio differs by 0.03 %) — and
 * the SVG over it uses the canvas as its viewBox, so a region path lies on the render's own pixels
 * at every size.
 */
function Figure({ side, highlights, selected, onSelect, className, style }: FigureProps) {
  const { t } = useTranslation();
  const motionSafe = useMotionSafe();
  const titleId = useId();
  const filterBase = `mm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [boxRef, boxWidth] = useBoxWidth(195);
  const slot = side === 'front' ? 'figure-front' : 'figure-back';
  const interactive = typeof onSelect === 'function';
  const regions = REGIONS[side];

  const roleOf = (slug: string): MuscleRole | undefined =>
    selected === slug ? 'primary' : highlights[slug];

  // What is PAINTED: one unit per panel of the render. Regions that share a panel (the front and
  // the side delt on the one shoulder cap) paint it once, whole, at the strongest role any of them
  // has — the render draws no line between them, so lighting either lights the cap (the frames:
  // exercise-detail-1). Each region still keeps its own path as its button below.
  const units: PaintUnit[] = [];
  for (const r of regions) {
    const role = roleOf(r.slug);
    const key = r.group ?? r.slug;
    const cur = units.find((u) => u.key === key);
    if (!cur) units.push({ key, d: r.panel ?? r.d, seam: r.seam, role, bloom: r.bloom });
    else if (RANK[role ?? 'none'] > RANK[cur.role ?? 'none']) cur.role = role;
  }
  const primaries = units.filter((u) => u.role === 'primary');
  const secondaries = units.filter((u) => u.role === 'secondary');

  // One filter per bloom in use (a filter's deviations cannot come from CSS).
  const bloomKey = (b: readonly number[]) => b.join('-').replace(/\./g, '_');
  const blooms = new Map(primaries.map((u) => [bloomKey(u.bloom), u.bloom]));
  // The accent for the secondary matrix, read from the token once the box is in the document
  // (and again whenever a secondary region is drawn, so a theme pack switch is followed).
  const [accent, setAccent] = useState<readonly [number, number, number] | null>(null);
  useLayoutEffect(() => {
    if (!secondaries.length) return;
    const next = readAccent(boxRef.current);
    if (next && (!accent || next.some((c, i) => c !== accent[i]))) setAccent(next);
  });
  const fade = motionSafe ? 'var(--duration-base) var(--ease-standard)' : '0s';
  // The region whose focus ring is shown (keyboard focus only: `:focus-visible` on focus).
  const [ring, setRing] = useState<string | null>(null);

  return (
    <div
      ref={boxRef}
      data-kit="pic"
      data-side={side}
      className={className}
      style={{ aspectRatio: `${FIGURE_BOX.width} / ${FIGURE_BOX.height}`, ...style }}
    >
      <Pic slot={slot} width={boxWidth} className="absolute inset-0 size-full" />
      <svg
        viewBox={VIEWBOX}
        role="img"
        aria-labelledby={titleId}
        className="absolute inset-0 size-full overflow-visible"
      >
        <title id={titleId}>{t(`muscleMap.${side}Title`)}</title>
        <defs>
          {[...blooms].map(([key, [s1, k1, s2, k2, ceiling]]) => (
            // The whole canvas and a margin as the filter region: a narrow region (a forearm) blurs
            // three deviations past its own box, which a bounding-box region would clip. Two blurs,
            // a tight and a wide halo, summed — what the frames' glow measures as — and then held
            // under a ceiling: between two panels of one muscle (the pectorals) the two halves'
            // halos add up, and unclamped they reach full accent and close the groove the frames
            // keep as a dark line. The table is the identity up to the ceiling, flat above it.
            <filter
              key={key}
              id={`${filterBase}-bloom-${key}`}
              filterUnits="userSpaceOnUse"
              x={-120}
              y={-120}
              width={FIGURE_BOX.width + 240}
              height={FIGURE_BOX.height + 240}
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation={s1} result="tight" />
              <feGaussianBlur in="SourceGraphic" stdDeviation={s2} result="wide" />
              <feComposite in="tight" in2="wide" operator="arithmetic" k1={0} k2={k1} k3={k2} k4={0} />
              <feComponentTransfer>
                <feFuncA type="table" tableValues={ceilingTable(ceiling)} />
              </feComponentTransfer>
            </filter>
          ))}
          {secondaries.length > 0 && accent ? (
            // The shipped render carries its "lighten" look as alpha (its shadows are nearly
            // transparent), so it is first laid on the canvas colour — what the eye sees — and the
            // luminance is taken from that; the clip path is the panel's edge.
            <filter id={`${filterBase}-secondary`} colorInterpolationFilters="sRGB">
              <feFlood style={{ floodColor: 'var(--surface-0)' }} result="canvas" />
              <feMerge result="seen">
                <feMergeNode in="canvas" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
              <feColorMatrix in="seen" type="matrix" values={secondaryMatrix(accent)} />
            </filter>
          ) : null}
          {primaries.length > 0 ? (
            // THE IMPRINT: the lit panels of the frames are not perfectly flat — the render's
            // grooves show through the lime as faint dark lines. Only the dark lines: the render
            // (as seen on the canvas) becomes black with an alpha that rises as its luminance falls
            // under IMPRINT_FROM, at most IMPRINT_MAX; a panel's lit face keeps the token's accent.
            <filter id={`${filterBase}-imprint`} colorInterpolationFilters="sRGB">
              <feFlood style={{ floodColor: 'var(--surface-0)' }} result="canvas" />
              <feMerge result="seen">
                <feMergeNode in="canvas" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
              <feColorMatrix in="seen" type="matrix" values={IMPRINT_MATRIX} />
            </filter>
          ) : null}
          {[...secondaries, ...primaries].map((u) => (
            <clipPath key={u.key} id={`${filterBase}-clip-${u.key}`}>
              <path d={u.d} />
            </clipPath>
          ))}
        </defs>

        {/* Secondary panels: the render itself, clipped to the panel and recoloured. */}
        {accent
          ? secondaries.map((u) => (
              <image
                key={`secondary-${u.key}`}
                aria-hidden
                href={pulseSrcSet(slot).src}
                x={0}
                y={0}
                width={FIGURE_BOX.width}
                height={FIGURE_BOX.height}
                preserveAspectRatio="none"
                clipPath={`url(#${filterBase}-clip-${u.key})`}
                filter={`url(#${filterBase}-secondary)`}
                style={{ pointerEvents: 'none' }}
              />
            ))
          : null}

        {/* The blooms first, all of them, so no glow ever lies over a neighbouring lit panel. */}
        <g aria-hidden style={{ pointerEvents: 'none' }}>
          {primaries.map((u) => (
            <path key={`bloom-${u.key}`} d={u.d} fill="var(--accent)" filter={`url(#${filterBase}-bloom-${bloomKey(u.bloom)})`} />
          ))}
        </g>

        {/* The panels. The fill is a plain attribute with a CSS transition rather than animated by
            Motion: the highlight IS the information here — which muscles an exercise works — so it
            must be correct even when no animation frame ever runs (a background tab, a hidden
            pane, a webview that is not compositing). A secondary panel is drawn by its recoloured
            render underneath, so its path paints nothing. */}
        <g aria-hidden style={{ pointerEvents: 'none' }}>
          {/* The seams of lit muscles (the sternum): over the bloom, under the panels' edges. */}
          {primaries
            .filter((u) => u.seam)
            .map((u) => (
              <g key={`seam-${u.key}`}>
                <path d={u.seam} fill="var(--accent)" />
                <path d={u.seam} fill="var(--surface-0)" fillOpacity={1 - SEAM_SHADE} />
              </g>
            ))}
          {units.map((u) => (
            <path
              key={`panel-${u.key}`}
              d={u.d}
              fill="var(--accent)"
              fillOpacity={u.role === 'primary' ? 1 : 0}
              style={{ transition: `fill-opacity ${fade}` }}
            />
          ))}
          {primaries.map((u) => (
            <image
              key={`imprint-${u.key}`}
              href={pulseSrcSet(slot).src}
              x={0}
              y={0}
              width={FIGURE_BOX.width}
              height={FIGURE_BOX.height}
              preserveAspectRatio="none"
              clipPath={`url(#${filterBase}-clip-${u.key})`}
              filter={`url(#${filterBase}-imprint)`}
            />
          ))}
        </g>

        {interactive
          ? regions.map((r) => {
              const unit = units.find((u) => u.key === (r.group ?? r.slug));
              const lit = unit?.role !== undefined;
              const name = t(`muscle.${r.slug}`, { defaultValue: r.slug });
              const select = () => onSelect?.(r.slug);
              // One button per region, and one hit path per PANEL of it (each closed subpath: the
              // left and the right pectoral, …). The FIRST panel is the button — the one tab stop,
              // named, pressed or not — so a screen reader announces each muscle once; the other
              // panels are further hit areas of the same muscle (clickable, out of the tab order,
              // hidden from the accessibility tree). A pointer or a tool that aims at the middle of
              // the button lands on muscle, never on the gap between two halves.
              return r.d
                .split(/(?=M)/)
                .map((part, i) => (
                  <path
                    key={`${r.slug}-${i}`}
                    d={part}
                    fill="var(--accent)"
                    fillOpacity={0}
                    style={{ transition: `fill-opacity ${fade}` }}
                    {...(i === 0
                      ? { role: 'button', tabIndex: 0, 'aria-pressed': selected === r.slug, 'aria-label': name }
                      : { tabIndex: -1, 'aria-hidden': true })}
                    className={cn(
                      'cursor-pointer outline-none',
                      // Hover hints at the panel without claiming it: a faint accent, never on a lit one.
                      !lit && 'hover:[fill-opacity:0.3]',
                    )}
                    onClick={select}
                    onFocus={(e) => {
                      if (e.currentTarget.matches(':focus-visible')) setRing(r.slug);
                    }}
                    onBlur={() => setRing((cur) => (cur === r.slug ? null : cur))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select();
                      }
                    }}
                  />
                ));
            })
          : null}

        {/* The focus ring: every panel of the focused region outlined, two-tone — ink over a
            canvas-coloured edge — so it reads on the graphite render and on a lit panel alike and
            never looks like the lime of a selection. */}
        {ring
          ? regions
              .filter((r) => r.slug === ring)
              .map((r) => (
                <g key={`ring-${r.slug}`} aria-hidden style={{ pointerEvents: 'none' }} fill="none" strokeLinejoin="round">
                  <path d={r.d} vectorEffect="non-scaling-stroke" stroke="var(--surface-0)" strokeWidth={4.5} />
                  <path d={r.d} vectorEffect="non-scaling-stroke" stroke="rgb(var(--ink))" strokeWidth={2} />
                </g>
              ))
          : null}
      </svg>
    </div>
  );
}
