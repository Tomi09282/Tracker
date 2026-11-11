import { forwardRef, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field, type FieldProps } from '../../primitives/Field';

export interface FeedbackFieldProps extends FieldProps {
  /** The field is satisfied: the 16 pt tick on the line's end. */
  valid?: boolean;
  /**
   * A check is genuinely in flight — a handle lookup, a server-side uniqueness test.
   *
   * Separate from `valid`/`error` because "I do not know yet" is a third answer, and a field that
   * shows nothing while the server thinks looks broken. Only this prop announces itself to a
   * screen reader; the local settle beat below does not (see `SETTLE_MS`).
   */
  busy?: boolean;
}

/** What the field currently knows about its own value. */
type Status = 'idle' | 'busy' | 'valid' | 'error';

/**
 * How long the field withholds a verdict after the value changes (`--duration-slow`).
 *
 * A field that flips to a refusal on the second character of a twelve-character password is
 * shouting at somebody who has not finished talking, so the verdict is held until typing settles —
 * and the wait is SHOWN (the three dots), because a slot that sits empty and then holds a mark looks
 * like a glitch. It is a debounce, not an animation: reduced motion does not shorten it.
 */
const SETTLE_MS = 400;

/**
 * E7 — the field that answers, in Pulse's one look (the skin of F12 stage 2).
 *
 * It is the underline `Field` — every state of the line is the field's own: 1 px `edge`, 2 px lime
 * on focus, 2 px `danger` and the message under the line on an error — plus one mark on the line's
 * trailing edge, in the kit's vocabulary instead of five letters of motion:
 *
 *   busy     the three 6 pt dots of every busy Pulse control, `text-2`, rippling (still under
 *            reduced motion); a `role="status"` line says "Betöltés" — only for the `busy` prop
 *   valid    the 16 pt tick in `success` (`auth-2` "Mark/format ok")
 *   error    no mark: the 2 px danger line and the words under it are the answer
 *
 * The caller's own trailing control (`LibraryPage`'s clear button) is kept after the mark.
 *
 * The element no longer reads its style-studio letter (`pkg/F12/variants.json`, delta E7): Pulse
 * has one field. Letters A–E (glow ring, tinted fill, chips, gradient border) all drew a box or a
 * filled surface, which Pulse forbids.
 */
export const FeedbackField = forwardRef<HTMLInputElement, FeedbackFieldProps>(function FeedbackField(
  { valid, busy, error, trailing, value, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const [settling, setSettling] = useState(false);
  const verdict: Status | null = error ? 'error' : valid ? 'valid' : null;
  const firstRender = useRef(true);

  // The settle beat. It runs only when there IS a verdict to withhold, which is what keeps a plain
  // search field — no `valid`, no `error` — from showing dots on every keystroke.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return; // a prefilled valid field is not "checking"; it arrived already decided
    }
    if (!verdict) {
      setSettling(false);
      return;
    }
    setSettling(true);
    const id = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(id);
  }, [value, verdict]);

  const status: Status = busy || (settling && verdict !== null) ? 'busy' : (verdict ?? 'idle');

  const mark =
    status === 'busy' ? (
      <span aria-hidden data-kit-part="busy" className="flex h-11 items-center gap-1.5 text-text-2">
        <i className="size-1.5 rounded-full bg-current animate-busy-1 motion-reduce:animate-none" />
        <i className="size-1.5 rounded-full bg-current opacity-60 animate-busy-2 motion-reduce:animate-none" />
        <i className="size-1.5 rounded-full bg-current opacity-30 animate-busy-3 motion-reduce:animate-none" />
      </span>
    ) : status === 'valid' ? (
      <span aria-hidden data-kit-part="valid" className="flex h-11 items-center text-success [&_svg]:size-4 [&_svg]:stroke-[2.25]">
        <Check />
      </span>
    ) : null;

  const hasTrailing = trailing !== undefined && trailing !== null;

  return (
    <>
      <Field
        ref={ref}
        kit="feedbackField"
        value={value}
        error={error}
        aria-busy={busy || undefined}
        trailing={
          mark || hasTrailing ? (
            <span className="flex h-11 items-center gap-2.5">
              {mark}
              {trailing}
            </span>
          ) : undefined
        }
        {...rest}
      />
      {busy ? (
        <span role="status" className="sr-only">
          {t('common.loading')}
        </span>
      ) : null}
    </>
  );
});
