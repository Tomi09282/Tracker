import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, X } from 'lucide-react';
import { Field } from '../../ui/primitives/Field';
import { useComposeContext, useHandleAvailable } from './useCompose';

/**
 * The handle box, with a live availability answer — used by BOTH the create form and the rename
 * flow, because they ask the same question and would otherwise answer it two ways.
 *
 * ═══ THE PATTERN COMES FROM THE SERVER ═════════════════════════════════════════════════════════
 *
 * `/compose/context` ships `handlePattern`, the source of the same `HANDLE_RE` the routes validate
 * with and the column CHECK agrees with. Writing the regex here would be a fourth copy of a rule
 * that already has three readers, and the copy that drifted would be the one telling a coach their
 * handle is fine.
 *
 * Until the context loads there is no pattern, so nothing is called invalid. An empty box and an
 * unloaded rule look identical to a person, and guessing wrong means telling somebody their
 * perfectly good handle is malformed.
 *
 * ═══ AND THE ANSWER IS A HINT, NEVER A PERMISSION ══════════════════════════════════════════════
 *
 * Somebody else can claim the handle between the check and the submit. The green tick means "free a
 * moment ago"; the rename itself is the only authority, and it refuses with `handle_unavailable`.
 * So this never disables the submit button on the strength of a probe — it only tells the coach
 * what to expect.
 */
export function HandleField({
  value,
  onChange,
  label,
  hint,
  /** The handle the coach already holds, if any — asking about your own is not a useful question. */
  ownHandle = null,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  hint?: string;
  ownHandle?: string | null;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const ctx = useComposeContext();

  // 350ms: long enough that a typed word is one question rather than eight, short enough that the
  // answer arrives while the coach is still looking at the field.
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), 350);
    return () => clearTimeout(id);
  }, [value]);

  const pattern = useMemo(() => {
    const src = ctx.data?.handlePattern;
    if (!src) return null;
    try {
      return new RegExp(src);
    } catch {
      // A pattern the browser cannot compile is a server bug, not a reason to call every handle
      // invalid. Fall back to asking the server, which is the authority anyway.
      return null;
    }
  }, [ctx.data?.handlePattern]);

  const malformed = settled.length > 0 && pattern !== null && !pattern.test(settled);
  const isOwn = ownHandle !== null && settled === ownHandle;
  const probe = useHandleAvailable(settled, settled.length > 0 && !malformed && !isOwn);

  const typing = value !== settled;
  const status = (() => {
    if (settled.length === 0) return null;
    if (malformed) return 'malformed' as const;
    if (isOwn) return 'own' as const;
    if (typing || probe.isFetching) return 'checking' as const;
    // A failed probe is not a "taken". Saying so would send a coach hunting for a new name because
    // their network blinked.
    if (probe.isError) return 'unknown' as const;
    if (probe.data) return probe.data.available ? ('free' as const) : ('taken' as const);
    return null;
  })();

  const TONE = {
    malformed: 'text-danger',
    taken: 'text-danger',
    free: 'text-success',
    own: 'text-text-3',
    checking: 'text-text-3',
    unknown: 'text-text-3',
  } as const;

  return (
    <div className="flex flex-col gap-1">
      <Field
        label={label}
        value={value}
        // Handles are lowercase by the pattern, so uppercase input is corrected rather than
        // refused. Refusing a capital letter teaches nothing; fixing it silently is what the coach
        // meant. Spaces become hyphens for the same reason.
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
        hint={hint}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {/*
        `aria-live="polite"` and never "assertive": this changes on a timer while somebody is typing,
        and an assertive region would interrupt the screen reader mid-word on every keystroke.
        The region is always present so it can announce a change — one that appears only when there
        is something to say is a region that has just been created, and is often not announced.
      */}
      <p className={`text-caption flex min-h-5 items-center gap-1 ${status ? TONE[status] : 'text-text-3'}`} aria-live="polite">
        {status === 'checking' ? (
          <>
            <Loader2 className="size-icon-s animate-spin motion-reduce:animate-none" aria-hidden />
            {t('compose.handleChecking')}
          </>
        ) : null}
        {status === 'free' ? (
          <>
            <Check className="size-icon-s" aria-hidden />
            {t('compose.handleFree')}
          </>
        ) : null}
        {status === 'taken' ? (
          <>
            <X className="size-icon-s" aria-hidden />
            {t('compose.handleTaken')}
          </>
        ) : null}
        {status === 'malformed' ? t('compose.handleMalformed') : null}
        {status === 'own' ? t('compose.handleIsYours') : null}
        {status === 'unknown' ? t('compose.handleUnknown') : null}
      </p>
    </div>
  );
}
