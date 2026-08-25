import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../primitives/Pressable';
import { Segmented } from '../feedback/variants/E6Segmented';
import { useMotionSafe } from '../feedback/useMotionSafe';
import { MUSCLES_BY_SIDE, SILHOUETTE, VIEW, type BodySide } from './shapes';

export type MuscleRole = 'primary' | 'secondary';

/** Declared once: both renderings of the side control read the same two values in the same order. */
const SIDES = ['front', 'back'] as const;

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
   * HERO FILL MODE. The figure is 260 × 560 — portrait — so inside a wide, short hero panel the
   * `max-w-[280px]` cap leaves the map floating in the middle of an otherwise empty box. In fill
   * mode the figure is HEIGHT-constrained instead: it takes whatever the container has left after
   * the `Elöl` / `Hátul` control and the legend, and its width follows from the viewBox.
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
   */
  sideControl?: 'chips' | 'segmented';
  className?: string;
}

/**
 * Interactive muscle map.
 *
 * Fills come from theme tokens, so it re-colours with the rest of the app on a pack switch:
 * primary targets take the full accent, secondary ones the 12% subtle fill, everything else the
 * surface ramp. That distinction is the whole point — "this exercise works your chest, and
 * incidentally your triceps" is information a list of chips conveys far less directly.
 *
 * THE 44 px FLOOR, AND WHY THIS COMPONENT IS THE ONE EXCEPTION.
 *
 * Measured on the current figure: the widest region (quadriceps) is ~33 px at the component's
 * 280 px max width, and the narrowest (sternocleidomastoid) is ~9 px. They cannot be made bigger
 * without destroying the thing they are for: twelve anatomically-placed regions each 44 px would
 * need a figure roughly a metre tall, and inflating them where they are would put the biceps over
 * the ribs.
 *
 * So the map does not claim to meet the floor. It is a SECONDARY affordance, and the rule it does
 * obey is that it is never the only way to do its job: on the library screen it is the top card,
 * and the same filtering is available from the taxonomy chips below it, which are `Pressable`s and
 * do meet the floor. Read-only uses (the exercise detail screen) pass no `onSelect` at all and are
 * not interactive targets in the first place.
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
  className,
}: MuscleMapProps) {
  const { t } = useTranslation();
  const motionSafe = useMotionSafe();
  const [side, setSide] = useState<BodySide>('front');
  const titleId = useId();

  const interactive = typeof onSelect === 'function';
  const shapes = MUSCLES_BY_SIDE[side];

  // A muscle that only exists on the other view still matters: if an exercise targets the lats
  // and you are looking at the front, nothing would light up and the map would look broken.
  const hiddenHighlights = Object.keys(highlights).filter(
    (slug) => !shapes.some((s) => s.slug === slug),
  );

  const fillFor = (slug: string) => {
    if (selected === slug) return 'var(--accent)';
    const role = highlights[slug];
    if (role === 'primary') return 'var(--accent)';
    if (role === 'secondary') return 'var(--accent-subtle)';
    return 'var(--surface-2)';
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center',
        // `min-h-0` is what lets the figure below shrink inside a fixed-height hero instead of
        // pushing the legend out of the panel.
        fill && 'h-full min-h-0 gap-tight',
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

      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-labelledby={titleId}
        className={cn(
          'h-auto w-full max-w-[280px]',
          // `h-0 flex-1` is the flex-column idiom for "take the leftover height and no more".
          // `w-auto` then lets the viewBox decide the width, so the figure keeps its proportions.
          fill ? 'h-0 min-h-0 w-auto max-w-full flex-1' : 'mt-3',
        )}
      >
        <title id={titleId}>{t(`muscleMap.${side}Title`)}</title>

        {/* The body under everything, so unhighlighted regions still read as a figure rather than
            as a scatter of disconnected blobs. Drawn as separate anatomical parts — head, neck,
            torso, arms, legs — because one continuous outline is what made the head render as a
            martini glass in the previous version. */}
        <g fill="var(--surface-1)" stroke="var(--surface-border)" strokeWidth={1.25} strokeLinejoin="round">
          {SILHOUETTE[side].map((d, i) => (
            <path key={`silhouette-${i}`} d={d} />
          ))}
        </g>

        {shapes.map((shape) =>
          shape.d.map((d, i) => {
            // The fill is set as a plain style with a CSS transition rather than animated by
            // Motion. The highlight IS the information here — which muscles an exercise works —
            // so it must be correct even when no animation frame ever runs: a background tab, a
            // hidden pane, a webview that is not compositing. A JS-driven value would sit at its
            // starting colour in all three, showing the wrong muscles rather than merely a
            // missing transition. CSS transitions also survive interruption better, which is
            // what emil-design-eng recommends for exactly this kind of rapidly-toggled state.
            const common = {
              d,
              style: {
                fill: fillFor(shape.slug),
                transition: motionSafe
                  ? 'fill var(--duration-base) var(--ease-standard)'
                  : 'none',
              },
              stroke: 'var(--surface-border)',
              strokeWidth: 1,
            };

            if (!interactive) {
              return <path key={`${shape.slug}-${i}`} {...common} />;
            }

            return (
              <path
                key={`${shape.slug}-${i}`}
                {...common}
                // Every region is a real button: focusable, Enter/Space activated, and named.
                // An SVG shape with an onClick and nothing else is unreachable by keyboard.
                role="button"
                tabIndex={0}
                aria-pressed={selected === shape.slug}
                aria-label={t(`muscle.${shape.slug}`, { defaultValue: shape.slug })}
                className={cn(
                  'cursor-pointer outline-none',
                  'focus-visible:stroke-[var(--focus-ring)] focus-visible:[stroke-width:3]',
                  'hover:[fill:var(--surface-3)]',
                  // Hover must not fight a highlighted muscle: a lit target stays lit.
                  (highlights[shape.slug] || selected === shape.slug) && 'hover:[fill:var(--accent)]',
                )}
                onClick={() => onSelect?.(shape.slug)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect?.(shape.slug);
                  }
                }}
              />
            );
          }),
        )}
      </svg>

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
            <span aria-hidden className="inline-block size-3 rounded-chip bg-accent-subtle" />
            {t('muscleMap.secondary')}
          </span>
        </div>
      ) : null}
    </div>
  );
}
