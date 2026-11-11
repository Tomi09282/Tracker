import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * A status line — kit `noticeLine(msg, kind, action)`: a 6 pt semantic dot, the message in `cap-m`
 * `text-1`, and at most one trailing action, on one line at least 44 high.
 *
 *     ●  Nem sikerült menteni.                                   Újra
 *     6  8                                                     8  textLink
 *
 * It is how Pulse says anything that is not content: the inline error under a form, the offline
 * strip, "Felszerelés mentve", the gate of a screen ("1 fiók átadásra vár"). It has no fill, no
 * border, no radius and no icon disc — the colour lives in the dot only, and the words are always
 * `text-1` (Pulse System 2.1: semantic colours appear "only as a 6 pt dot, as text, as a 2 px
 * underline or as an over-target value", never as a surface). The toast band (F13) is this line
 * dropped over the header zone with a rule under it.
 *
 * ═══ THE DOT BELONGS TO THE FIRST LINE ══════════════════════════════════════════════════════════
 *
 * A message that wraps keeps its dot centred on its FIRST line, not on the block (`compose-profile-2`
 * draws exactly that), so the dot sits in an 18 px box — one `cap-m` line — at the top of the text.
 * The text block itself is centred in the 44 px line, which puts a one-line message where the kit
 * draws it (dot at y 19, text at y 13).
 *
 * Forms the frames draw, all on this one component:
 *
 *   tone + message                    `notifications`, `compose-profile-2` "Szabad"
 *   + action                          a `TextLink` ("Újra") or a bare icon button (close)
 *   + detail                          a second line in `cap` `text-2`, 4 below (`coach-dashboard-3`)
 *   lead instead of the dot           a 16 px ink glyph (`workout-2`: the record trophy)
 *   compact                           20 high instead of 44: the alert line 20 above a pill
 *                                     (`auth`, `onboarding-3`)
 *
 * `role` is the caller's: `alert` for an error that appears after an action, `status` for a line
 * that changes quietly, nothing for a line that is simply part of the page.
 */
export type NoticeTone = 'info' | 'ok' | 'warn' | 'danger';

export interface NoticeLineProps {
  /** The dot: `danger` · `warn` (also offline) · `ok` (saved) · `info` (ink). Default `info`. */
  tone?: NoticeTone;
  /** The message, `cap-m` `text-1`. It wraps; it is never cut. */
  children: ReactNode;
  /** A second line under the message, `cap` `text-2`: what the notice means for the user. */
  detail?: ReactNode;
  /** A 16 px glyph in place of the dot, drawn in ink — pass a bare Lucide icon. */
  lead?: ReactNode;
  /** ONE trailing action: a `TextLink` (`text="cap"`) or a bare icon button. */
  action?: ReactNode;
  /** 20 high instead of 44 — the alert line that stands 20 above a pill and carries no action. */
  compact?: boolean;
  role?: 'alert' | 'status';
  id?: string;
  /** Placement only. */
  className?: string;
}

const DOT: Record<NoticeTone, string> = {
  info: 'bg-text-1',
  ok: 'bg-success',
  warn: 'bg-warning',
  danger: 'bg-danger',
};

export function NoticeLine({ tone = 'info', children, detail, lead, action, compact = false, role, id, className }: NoticeLineProps) {
  const has = (node: ReactNode) => node !== undefined && node !== null && node !== false;
  // The kit's floor is 44 so that a trailing 44 pt control fits. A line with a second line and no
  // control hugs its two lines (`coach-dashboard-3`), and `compact` is the drawn 20.
  const floor = compact ? 'min-h-5' : has(detail) && !has(action) ? undefined : 'min-h-11';
  return (
    <div id={id} role={role} data-kit="noticeLine" data-tone={tone} className={cn('flex w-full items-center gap-2', floor, className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <span aria-hidden className="flex h-4.5 shrink-0 items-center [&>svg]:size-4 [&>svg]:stroke-[1.75] [&>svg]:text-text-1">
          {has(lead) ? lead : <span className={cn('size-1.5 rounded-full', DOT[tone])} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-cap-m break-words text-text-1">{children}</span>
          {has(detail) ? <span className="text-cap break-words text-text-2">{detail}</span> : null}
        </span>
      </div>
      {has(action) ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </div>
  );
}
