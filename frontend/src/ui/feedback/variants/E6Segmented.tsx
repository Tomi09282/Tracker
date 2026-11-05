import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { ControlBody } from '../../primitives/Pressable';

/*
 * Segmented — the kit's `segSwitch` (Pulse System §4 "Segmented switch"; figma-build/app-kit.js
 * `chipRow` with `{ ink: true }`, line 221; measured boxes: `_components.json`, cells
 * "segSwitch · hug" and "segSwitch · equal cells on a hairline").
 *
 * WORDS, NOT A CAPSULE. A segmented switch in Pulse has no track, no thumb, no fill and no border:
 * it is the options written out in `body-m`, the chosen one in `text-1`, the others in `text-2`,
 * and a 2 pt INK mark under the chosen one. Ink, not lime — the switch changes the VIEW, not the
 * subject, and lime is kept for what is live or done (§1 rule 3).
 *
 * Two forms, both 44 pt high:
 *
 *   hug     the words 24 apart and the control as wide as its words; the mark is the width of the
 *           word, 4 under its line box (y 37 of 44). In a section head, beside a figure, in a
 *           footer ("Elöl / Hátul", the language switch).
 *   cells   equal cells across the whole width of the container, the word centred in each, on a
 *           1 pt hairline (white 8 %) at the bottom; the mark is the width of the CELL and sits on
 *           the line (y 42 of 44). Page-level tabs ("Bolt / Eredmények / Kimutatás").
 *
 * A hug control can also sit on the hairline (`rule`): the client page's view switch draws the
 * words hugging on the left and the line under the full width, the mark on the line.
 *
 * ═══ ONE LOOK — E6 NO LONGER STEERS IT ═══════════════════════════════════════════════════════
 *
 * This file used to render five mechanisms chosen by the element variant E6 (sliding thumb,
 * underline sweep, scale-elevate, icon bounce, fill cascade). Pulse has one look per element
 * (PLAN R11, D1): the letter is not read any more, and E6 is handed in as dormant
 * (`docs/pipeline/pulse/pkg/F8/variants.json`).
 *
 * ═══ WHAT IS KEPT, BECAUSE SCREENS AND SCREEN READERS DEPEND ON IT ═══════════════════════════
 *
 *   - a real radiogroup: one tab stop, arrows move AND select (focus follows), "2 of 3 selected";
 *   - `onChange` may return a promise, and the control reads it (the async layer):
 *       busy     three dots stand in for the word, which keeps its width (Pulse never spins);
 *       done     the mark ignites under the new choice — the selection IS the confirmation;
 *       failed   the word turns `danger` for 2.4 s and the mark stays where it was, because the
 *                value never moved;
 *     and all three are spoken through one polite live region;
 *   - `readOnly`: the settled answer, announced as such, kept in the tab order (not `disabled`).
 *
 * Motion is the Pulse "ignite": the mark fades in over `--duration-fast` where it lands and the
 * previous one fades out where it was. Nothing slides. Reduced motion: the change is instant.
 *
 * Reference: docs/pipeline/pulse/kit/selection.md.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /**
   * BRIDGE — not rendered. Pulse draws a segmented switch in words only; the prop stays optional
   * so the call sites that still pass one compile until their screen package removes it (R5).
   */
  icon?: ReactNode;
  /**
   * A live count after the word — the admin page's "Moderáció 3": mono `data`, lime, 6 after the
   * word on its baseline. Not rendered at 0 or below. It is part of the option's accessible name.
   */
  count?: number;
  /** The language the label is written in (`lang` on the option), so a screen reader switches voice. */
  lang?: string;
}

/** `hug`: as wide as the words, 24 apart. `cells`: equal cells across the container, on a hairline. */
export type SegmentedLayout = 'hug' | 'cells';

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  /**
   * Commit the selection.
   *
   * MAY return a promise, and the control reads it: while it is pending the chosen segment shows
   * three dots, a resolve lets the mark ignite under it, a reject paints its word `danger` for a
   * moment and leaves the mark where it was. A caller that changes state synchronously returns
   * nothing and gets the ignite at once — the same grammar, only shorter.
   */
  onChange: (next: T) => void | Promise<unknown>;
  /** The accessible name of the group. */
  label: string;
  /**
   * The choice is settled and cannot be changed. NOT the same as disabled.
   *
   * A read-only control keeps its contrast, keeps its place in the tab order and is announced as
   * read-only (`aria-disabled` on each option) — "this is the answer, and it is final". A disabled
   * one is dimmed and skipped by the keyboard, which reads as "not available right now".
   */
  readOnly?: boolean;
  /** `hug` (default) or `cells`. */
  layout?: SegmentedLayout;
  /**
   * Seat a `hug` control on a full-width hairline with the mark on the line. `cells` always sits
   * on one, so this only changes `hug`.
   */
  rule?: boolean;
  /** The whole control is unavailable: 40 % and out of the tab order. */
  disabled?: boolean;
  /**
   * The options are FIGURES ("00:00 / 02:00 / 04:00 / 06:00"), not words: each is set in `data-l`
   * (Geist Mono Medium 16, -1 %) instead of `body-m` — Pulse System 2.2, figures are mono
   * (frames `settings-day`, `settings-day-v2`: the segSwitch's texts re-set to mono Medium, -1 %).
   */
  figures?: boolean;
  /**
   * The quiet page switch of a screen with two views (admin-market-v2: "JELENTÉSEK 4 | POSZTOK"):
   * the words in mono `data`, upper case and tracked, a `count` after the word in `text-3` instead
   * of the lamp colour — the screen's lime is kept for its filter. Use with `layout="cells"`.
   */
  quiet?: boolean;
  /** Placement only (`self-start`, `shrink-0`, a margin). Never a colour, size or type. */
  className?: string;
}

export interface SegmentProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** The option this segment stands for is the chosen one: `text-1` and the ink mark. */
  selected: boolean;
  /** Which form the segment is part of; `cells` makes it one equal share of the row. */
  layout: SegmentedLayout;
  /** The control sits on a hairline: the mark is drawn on the line (y 42) instead of under the word (y 37). */
  onRule?: boolean;
  /** Three dots stand in for the word, which keeps its width. Sets `aria-busy`. */
  busy?: boolean;
  /** The last attempt to choose this segment failed: its word is `danger`. */
  failed?: boolean;
  /** A live count after the word (mono `data`, lime, 6 after it). Not rendered at 0 or below. */
  count?: number;
  /**
   * The colour of the 2 pt mark. `ink` (default): a segmented switch — it changes the VIEW. `accent`:
   * a filter chip (`ChipRow` / `Chip`) — it changes the SUBJECT, so the mark is lime (Pulse System
   * §4 "Filter chips"). A chip is dimmed on its own when `disabled`; a segment is dimmed by its group.
   */
  mark?: 'ink' | 'accent';
  /** The option is a figure: `data-l` (mono) instead of `body-m` (see `SegmentedProps.figures`). */
  figures?: boolean;
  /** The quiet page switch (see `SegmentedProps.quiet`): mono upper-case words, the count in `text-3`. */
  quiet?: boolean;
  /** The word. */
  children: ReactNode;
}

/**
 * Pressed and focus, shown without a finger or a keyboard: the kit specimen and the captures set
 * `data-force="pressed"` / `data-force="focus"`, and the segment answers with the same
 * declarations as `:active` / `:focus-visible` (the idiom of `control()`). Nothing in the product
 * sets the attribute.
 */
const FORCED = [
  'data-[force=pressed]:opacity-[var(--pressed-opacity)]',
  'data-[force=focus]:outline-2 data-[force=focus]:outline-solid data-[force=focus]:outline-offset-2 data-[force=focus]:outline-[var(--focus-ring)]',
].join(' ');

/**
 * One segment: a 44 pt button holding a word (and an optional count), the ink mark and the busy
 * dots. The face of `Segmented` and of `LanguageToggle` — the roles are the caller's: `Segmented`
 * makes it a `radio`, the language switch keeps it a pressed button.
 *
 * THE TARGET IS 44 × 44 EVEN WHEN THE WORD IS NOT. A hug segment lays out as wide as its word
 * ("Elöl" is 28 pt), so its box reaches 8 past the word on either side (padding given back in
 * negative margins — the layout does not move) and an invisible layer centred on it keeps 44 for
 * a word shorter than that — the target, not the layout.
 */
export const Segment = forwardRef<HTMLButtonElement, SegmentProps>(function Segment(
  { selected, layout, onRule = layout === 'cells', busy = false, failed = false, count, mark = 'ink', figures = false, quiet = false, children, type, disabled, ...rest },
  ref,
) {
  const inert = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true';
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-busy={busy || undefined}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-11 shrink-0 select-none items-center whitespace-nowrap',
        quiet ? 'text-data uppercase tracking-widest' : figures ? 'text-data-l' : 'text-body-m',
        // A hug segment's BOX reaches 8 past its word on either side and gives the 16 back in
        // negative margins: the layout is the word (the next word still starts 24 after it, the
        // control is still as wide as its words), the target is the word + 16 — 44 for "Elöl",
        // the shortest word a hug switch carries — and the focus ring stands 8 off the word, as
        // around a text link (actions lane). The capture's target probe reads the box.
        layout === 'cells' ? 'min-w-0 flex-1 basis-0 justify-center' : '-mx-2 justify-start px-2',
        // Selection never changes weight (Pulse System §2.2): only the ink and the mark.
        failed ? 'text-danger' : selected ? 'text-text-1' : 'text-text-2',
        'transition-[color,opacity] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        // The floor, width half, for a word shorter than 28 (see above). The height half is `h-11`.
        'after:absolute after:inset-y-0 after:left-1/2 after:w-full after:min-w-[var(--target-min)] after:-translate-x-1/2',
        // Pressed is 60 %, as for rows and links; no scale — only the pill moves.
        !inert && !disabled && 'cursor-pointer active:opacity-[var(--pressed-opacity)]',
        'aria-busy:cursor-progress',
        // A chip stands alone (no group dims it): 40 %, as every Pulse control that is off.
        mark === 'accent' && 'disabled:cursor-not-allowed disabled:opacity-[var(--disabled-opacity)]',
        // Focus is redrawn on the lamp, around the 44 pt frame of the segment. NO `outline-none` at
        // rest and an explicit `outline-solid`: in Tailwind 4 `outline-none` sets
        // `--tw-outline-style: none` on the element, and `outline-2` reads that variable — so the
        // pair `outline-none focus-visible:outline-2` draws a 2 px outline of style NONE, i.e.
        // nothing (measured: computed `outline-style: none` on a keyboard-focused segment). A
        // mouse press is not `:focus-visible`, so nothing is drawn without it either.
        'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        FORCED,
      )}
      {...rest}
    >
      {/* The inside of every Pulse control (`ControlBody`, actions lane): while busy the word is
          kept invisible — it holds the width — and the three dots stand over it, at 100 / 60 /
          30 % in its ink, rippling on the ambient loop (held still under reduced motion). */}
      <ControlBody variant="link" busy={busy}>
        <span className="inline-flex items-baseline gap-1.5">
          <span>{children}</span>
        {/* The space is for the accessible name ("Moderáció 3", not "Moderáció3"); a flex row does
            not draw a whitespace-only run, so the 6 pt gap stays the only distance on screen. */}
          {count != null && count > 0 ? (
            <>
              {' '}
              <span className={cn('text-data', quiet ? 'text-text-3' : 'text-accent')}>{count}</span>
            </>
          ) : null}
        </span>
      </ControlBody>

      {/* The ink mark: 2 pt, the width of the segment — the word in a hug control, the cell in a
          row of cells. Always in the DOM so that it can fade in where it lands ("ignite"). */}
      <span
        aria-hidden
        data-kit-part="mark"
        className={cn(
          'pointer-events-none absolute h-0.5',
          mark === 'accent' ? 'bg-accent' : 'bg-text-1',
          layout === 'cells' ? 'inset-x-0' : 'inset-x-2',
          onRule ? 'bottom-0' : 'bottom-[5px]',
          'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
          selected ? 'opacity-100' : 'opacity-0',
        )}
      />
    </button>
  );
});

/** The 1 pt hairline a `cells` (or a ruled `hug`) control sits on: white 8 %, the row rule. */
function SegmentRule() {
  return <span aria-hidden data-kit-part="rule" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-hair" />;
}

type Phase = 'busy' | 'done' | 'failed';

/** How long the "done" announcement holds before the live region clears. */
const DONE_MS = 900;
/**
 * A failure holds nearly three times as long. It is the only signal that the selection did NOT
 * take — the value never moved — so it has to survive being glanced at.
 */
const FAILED_MS = 2400;

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return typeof v === 'object' && v !== null && typeof (v as PromiseLike<unknown>).then === 'function';
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  readOnly = false,
  layout = 'hug',
  rule = false,
  disabled = false,
  figures = false,
  quiet = false,
  className,
}: SegmentedProps<T>) {
  const { t } = useTranslation();

  const [status, setStatus] = useState<{ value: T; phase: Phase } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  /**
   * Which commit is allowed to write a status.
   *
   * Two clicks in a row leave two promises in flight, and the slower one is not necessarily the
   * older one — without this, a stale resolve would announce "done" for the segment the user has
   * since moved away from.
   */
  const ticket = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const activeIndex = options.findIndex((o) => o.value === value);
  const fromIndex = activeIndex === -1 ? 0 : activeIndex;
  const locked = readOnly || disabled;

  const hold = (next: T, phase: Phase, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus({ value: next, phase });
    timer.current = setTimeout(() => setStatus(null), ms);
  };

  const select = (next: T) => {
    if (locked) return;
    const mine = (ticket.current += 1);
    if (timer.current) clearTimeout(timer.current);

    const result = onChange(next);
    if (!isThenable(result)) {
      // Synchronous commit: it cannot fail, and the mark has already ignited under it.
      hold(next, 'done', DONE_MS);
      return;
    }

    setStatus({ value: next, phase: 'busy' });
    result.then(
      () => {
        if (ticket.current === mine) hold(next, 'done', DONE_MS);
      },
      () => {
        if (ticket.current === mine) hold(next, 'failed', FAILED_MS);
      },
    );
  };

  const move = (dir: 1 | -1) => {
    if (locked || options.length === 0) return;
    const to = (fromIndex + dir + options.length) % options.length;
    const next = options[to];
    if (!next) return;
    select(next.value);
    // A radiogroup's focus follows the selection: the arrow lands on the segment it chose.
    buttons.current[to]?.focus();
  };

  const statusText =
    status?.phase === 'busy'
      ? t('common.loading')
      : status?.phase === 'done'
        ? t('home.done')
        : status?.phase === 'failed'
          ? t('common.retry')
          : '';

  const onRule = layout === 'cells' || rule;

  const group = (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-kit="segSwitch"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
      className={cn(
        'relative',
        // A hug control is as wide as its words even where a flex column would stretch it.
        layout === 'cells' ? 'flex w-full' : 'inline-flex w-fit gap-6',
        disabled && 'opacity-[var(--disabled-opacity)]',
        // A ruled hug control: the wrapper below carries the placement.
        !(layout === 'hug' && rule) && className,
      )}
    >
      {options.map((opt, index) => {
        const active = opt.value === value;
        const phase = status && status.value === opt.value ? status.phase : null;
        return (
          <Segment
            key={opt.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            role="radio"
            aria-checked={active}
            aria-disabled={readOnly || undefined}
            disabled={disabled}
            lang={opt.lang}
            // Roving tabindex: the group is one tab stop and the arrows move inside it.
            tabIndex={active || (activeIndex === -1 && index === 0) ? 0 : -1}
            layout={layout}
            onRule={onRule}
            selected={active}
            busy={phase === 'busy'}
            failed={phase === 'failed'}
            count={opt.count}
            figures={figures}
            quiet={quiet}
            onClick={() => select(opt.value)}
          >
            {opt.label}
          </Segment>
        );
      })}
      {layout === 'cells' ? <SegmentRule /> : null}
    </div>
  );

  return (
    <>
      {layout === 'hug' && rule ? (
        // The words hug on the left; the line runs under the full width of the container.
        <div className={cn('relative flex w-full', className)}>
          {group}
          <SegmentRule />
        </div>
      ) : (
        group
      )}

      {/*
        The same three states, for a screen reader. The dots are aria-hidden on purpose: an
        aria-label on a child would be absorbed into the radio's accessible NAME, and the option
        would start announcing itself as "Loading" instead of as what it is.
      */}
      <span role="status" className="sr-only">
        {statusText}
      </span>
    </>
  );
}
