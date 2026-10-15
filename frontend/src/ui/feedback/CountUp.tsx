import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMotionSafe } from './useMotionSafe';

/*
 * THE DIGIT ROLLER — the one place in the app where a changing number moves.
 *
 * Pulse System 2.4: "Count-up (hero numeral, bars): only when the value changed: digits roll in
 * `slow`". A digit that changed travels out of its place and the new one travels in, in
 * `--duration-slow` on `--ease-standard`, transform and opacity only. Nothing counts through the
 * numbers in between any more: a balance that went 190 → 215 shows 190 and then 215, never 191,
 * 192 … — the old sweep read as the number being recalculated.
 *
 * ═══ WHY THERE ARE TWO LAYOUTS ══════════════════════════════════════════════════════════════════
 *
 * Big Shoulders Display — the face of every big figure in Pulse — has NO tabular figures: "1" is
 * about half as wide as "0" (docs/pipeline/pulse/pkg/_int/proofs/F1.2, ruling DEV-003). So:
 *
 *   cells    every digit stands centred in a fixed-width cell. For a number that ticks (a rest
 *            countdown): without cells "1:11" is narrower than "0:59" and the whole figure jumps
 *            sideways every second. The width of a cell is the caller's (`Numeral` passes the
 *            widest digit of its face); `1ch` is right for a face with tabular figures.
 *   no cells every digit keeps its own width — the figure is exactly as the frame draws it. A
 *            number that changes now and then (a balance, a count) reflows once, at the moment it
 *            changes, and its changed digits roll into the new places.
 *
 * At rest and without cells the roller renders ONE text node, the same DOM as a plain string, so
 * a capture measures it exactly as it measures any other text.
 *
 * ═══ THE NUMBER ALWAYS LANDS ═══════════════════════════════════════════════════════════════════
 *
 * The roll is an animation of two layers over the FINAL layout. If the animation never runs (a
 * background tab, a webview that does not composite) a timer one roll later removes the outgoing
 * layer anyway: a figure that keeps showing its old value is not a missing animation, it is a
 * wrong number.
 */

const DIGIT = /\d/;

/** Read a motion token at the moment it is needed (a module-scope read would precede the theme). */
function motionToken(el: Element, name: '--duration-slow' | '--ease-standard'): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function durationMs(value: string): number {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return value.endsWith('ms') ? n : n * 1000;
}

export interface DigitRollerProps {
  /** The figure as it stands now, already formatted ("1 840", "83,1", "2:59"). */
  text: string;
  /** Every digit in a fixed-width cell — for a number that ticks. Default false: digits keep their own widths. */
  cells?: boolean;
  /** The width of one digit cell, a CSS length. Default `1ch` — right for a face with tabular figures. */
  cell?: string;
  /** Roll the digits that changed when `text` changes. Default true. Reduced motion never rolls. */
  roll?: boolean;
  /** Roll in from this figure when the roller first appears (a balance that moved while the user was away). */
  fromText?: string;
  /** Which way a changed digit travels: `up` (the new one comes from below) or `down`. Default `up`. */
  direction?: 'up' | 'down';
  /** Placement only. */
  className?: string;
}

/** One position of the figure: a character, and the one it replaces while a roll runs. */
interface Slot {
  now: string;
  was: string | null;
}

/** Aligns the two figures from the right — units under units — so a figure that grows a digit rolls the right places. */
function slotsOf(text: string, from: string | null): Slot[] {
  const now = [...text];
  if (from === null) return now.map((ch) => ({ now: ch, was: null }));
  const was = [...from];
  const offset = was.length - now.length;
  return now.map((ch, i) => {
    const old = was[i + offset];
    return { now: ch, was: old !== undefined && old !== ch ? old : old === undefined ? '' : null };
  });
}

export function DigitRoller({ text, cells = false, cell = '1ch', roll = true, fromText, direction = 'up', className }: DigitRollerProps) {
  const motionSafe = useMotionSafe();
  const rolls = roll && motionSafe;
  const root = useRef<HTMLSpanElement>(null);

  // The figure the current roll started from. Derived from the previous `text` DURING render (the
  // React pattern for state that follows a prop), so the first frame of a change already shows
  // both layers and nothing flashes in between.
  const [shown, setShown] = useState(text);
  const [from, setFrom] = useState<string | null>(() => (rolls && fromText !== undefined && fromText !== text ? fromText : null));
  if (shown !== text) {
    setShown(text);
    setFrom(rolls ? shown : null);
  }

  useLayoutEffect(() => {
    const el = root.current;
    if (from === null || !el) return;
    const duration = durationMs(motionToken(el, '--duration-slow'));
    const easing = motionToken(el, '--ease-standard') || 'ease-out';
    const sign = direction === 'up' ? 1 : -1;
    const animations: Animation[] = [];
    if (duration > 0 && typeof el.animate === 'function') {
      for (const node of el.querySelectorAll<HTMLElement>('[data-roll="in"]')) {
        animations.push(node.animate([{ transform: `translateY(${sign * 100}%)` }, { transform: 'translateY(0)' }], { duration, easing }));
      }
      for (const node of el.querySelectorAll<HTMLElement>('[data-roll="out"]')) {
        animations.push(
          node.animate(
            [
              { transform: 'translateY(0)', opacity: 1 },
              { transform: `translateY(${sign * -100}%)`, opacity: 0 },
            ],
            { duration, easing, fill: 'forwards' },
          ),
        );
      }
    }
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      setFrom(null);
    };
    // The floor: the outgoing layer goes one roll later whether or not a frame ever ran.
    const floor = setTimeout(settle, duration + 100);
    if (animations.length) void Promise.all(animations.map((a) => a.finished)).then(settle, () => undefined);
    else settle();
    return () => {
      clearTimeout(floor);
      for (const a of animations) a.cancel();
    };
  }, [from, direction]);

  // At rest, without cells: one text node, exactly a string.
  if (from === null && !cells) {
    return <span className={className}>{text}</span>;
  }

  const cellStyle: CSSProperties | undefined = cells ? { width: cell, textAlign: 'center' } : undefined;
  const parts: ReactNode[] = slotsOf(text, from).map((slot, index) => {
    const digit = DIGIT.test(slot.now);
    const fixed = cells && digit ? cellStyle : undefined;
    if (slot.was === null) {
      return digit && cells ? (
        <span key={index} className="inline-block" style={fixed}>
          {slot.now}
        </span>
      ) : (
        <span key={index}>{slot.now}</span>
      );
    }
    // A changed place: the new character in flow (it holds the final layout), the old one over it.
    // The clip is vertical only — a wider old digit may overhang its neighbours while it leaves.
    return (
      <span key={index} className="relative inline-block [clip-path:inset(0_-50%)]" style={fixed}>
        <span data-roll="in" className="inline-block">
          {slot.now}
        </span>
        {slot.was ? (
          <span data-roll="out" className="absolute inset-x-0 top-0 inline-block text-center">
            {slot.was}
          </span>
        ) : null}
      </span>
    );
  });

  return (
    <span ref={root} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{parts}</span>
    </span>
  );
}

/**
 * Count-up number (E16-D) — now the digit roller with a number in it.
 *
 * The public API is the one the hybrid screens already call (`to`, `from`, `duration`). What
 * changed is the motion: the digits that differ ROLL from `from` to `to` once, in
 * `--duration-slow`; nothing sweeps through the numbers in between.
 *
 * ═══ `from` EXISTS FOR BALANCES, AND ITS DEFAULT IS WHY ════════════════════════════════════════
 *
 * A statistic is revealed: "1652 exercises" rolls in from 0. A BALANCE is not: a wallet going
 * 1400 → 1450 rolls from 1400, and a balance that did not move does not roll at all. The default
 * stays 0 so the existing callers (admin stats, coach roster, plan list) are untouched.
 *
 * ═══ THE LOCALE COMES FROM i18next, NOT FROM THE BROWSER ═══════════════════════════════════════
 *
 * `toLocaleString()` with no argument uses the BROWSER's locale, while this app's language is
 * chosen in-app and defaults to Hungarian — a Hungarian UI on an en-US browser would print "1,652"
 * where every other number on the screen reads "1652". The language is passed explicitly.
 *
 * `tabular-nums` stays: in Geist and Geist Mono it gives the digits equal widths. In the display
 * face it does nothing — a display-face figure that changes is drawn by `Numeral`, which sets the
 * cells itself.
 */
export function CountUp(props: {
  to: number;
  from?: number;
  /**
   * @deprecated Ignored. The roll always takes `--duration-slow` (Pulse System 2.4: UI motion
   * never exceeds 500 ms). Kept so existing call sites compile; screen packages remove it.
   */
  duration?: number;
}) {
  const { to, from = 0 } = props;
  const { i18n } = useTranslation();
  // Up when the number grew since the last value it showed, down when it fell.
  const [last, setLast] = useState({ to, direction: to >= from ? ('up' as const) : ('down' as const) });
  if (last.to !== to) setLast({ to, direction: to >= last.to ? 'up' : 'down' });
  const text = to.toLocaleString(i18n.language);
  const fromText = from === to ? undefined : from.toLocaleString(i18n.language);
  return <DigitRoller className="tabular-nums" text={text} fromText={fromText} direction={last.direction} />;
}
