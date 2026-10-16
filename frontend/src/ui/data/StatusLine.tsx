import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Dot, type DotTone } from './Dot';

/*
 * StatusLine — the state of a plan or a diet in the sub line of its row (kit gap G-data 1):
 *
 *     ●  AKTÍV   7 nap · 7 napos ciklus · 2026-07-13
 *     6 6 micro 12 cap, text-2
 *
 * client-detail-1 (plan row, y 1105) and client-detail-2 (diet row) draw exactly this: a 6 pt dot,
 * 6, the state word in `micro` (Geist Mono 11 / 16, upper case, tracking 10 %), 12, the meta in
 * `cap` `text-2` — one 18 pt line. The dot is drawn only where the state has a colour (the frames:
 * lime for `active` only, warn for `paused`); a state without one (a draft, an ended plan) is the
 * word alone, and then the word is `text-2` — a quiet state does not speak in ink.
 *
 * It goes in `ListRow sub` (a node), so it stands where the sub line stands. The meta is cut with
 * an ellipsis on a narrow row; the word never is.
 */

export interface StatusLineProps {
  /** The dot's tone. Not given = no dot (a state without a colour). */
  tone?: DotTone;
  /** The state word, from the existing status keys (`plans.status.*`). Drawn upper case. */
  word: string;
  /** The meta after the word, `cap` `text-2` ("7 nap · 7 napos ciklus · 2026-07-13"). */
  meta?: ReactNode;
  /** The word's ink. Default: `ink` with a dot, `quiet` (text-2) without one. */
  wordTone?: 'ink' | 'quiet';
  /** Placement only. */
  className?: string;
}

export function StatusLine({ tone, word, meta, wordTone, className }: StatusLineProps) {
  const ink = (wordTone ?? (tone ? 'ink' : 'quiet')) === 'ink';
  const hasMeta = meta !== undefined && meta !== null && meta !== false && meta !== '';
  return (
    <span data-kit="statusLine" data-tone={tone} className={cn('flex min-w-0 items-center gap-3', className)}>
      <span className="flex shrink-0 items-center gap-1.5">
        {tone ? <Dot tone={tone} /> : null}
        <span className={cn('whitespace-nowrap text-micro', ink ? 'text-text-1' : 'text-text-2')}>{word}</span>
      </span>
      {hasMeta ? <span className="min-w-0 truncate text-cap text-text-2">{meta}</span> : null}
    </span>
  );
}
