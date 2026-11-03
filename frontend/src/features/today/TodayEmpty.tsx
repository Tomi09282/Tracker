import { Plus } from 'lucide-react';
import { TextLink } from '../../ui/primitives/TextLink';

/**
 * A Ma section with nothing in it yet — frame ma-3 (`empty` in `ma-3.part.js`):
 *
 *   MÉG NINCS SZOKÁSOD               display 32 / 34, upper, text-1 (the kit's empty-state title)
 *                                    8
 *   Kezdj eggyel, például a vízzel.  body, text-2
 *                                    8
 *   + Első szokás                    the text link with a leading plus (body-m), 44 high
 *
 * The kit's `EmptyState` puts 20 above its action (its pill's glow clearance); Ma's empty sections
 * carry a text link, never the pill (the pill is Indítás), and the frame sets it 8 under the line,
 * so the three lines are composed here from the same type roles. The frame's fourth line — what an
 * item pays ("+10 érme / nap · 7 nap után ×1,25", "+5–20 érme teendőnként", mono micro in text-3, straight under
 * the link) — quotes the rules `GET /lifeos/today` sends (`dayRules`, `taskRules`); without them it is left
 * out rather than printed from constants.
 */
export function TodayEmpty({
  title,
  body,
  action,
  onClick,
  pays,
}: {
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  /** The frame's fourth line: what an item pays, quoted from the rules the server sends (left out without them). */
  pays?: string | null;
}) {
  return (
    <div data-kit="emptyState" className="flex flex-col gap-2">
      <h3 className="text-display break-words text-text-1">{title}</h3>
      <p className="text-body text-text-2">{body}</p>
      {/* Both of Ma's empty actions open a sheet over the page (the new habit, the capture). */}
      <div className="flex flex-col items-start">
        <TextLink text="body" onClick={onClick} lead={<Plus />} aria-haspopup="dialog">
          {action}
        </TextLink>
        {pays ? <p className="text-micro uppercase text-text-3">{pays}</p> : null}
      </div>
    </div>
  );
}
