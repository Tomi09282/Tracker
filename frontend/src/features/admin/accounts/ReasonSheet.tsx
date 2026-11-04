import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TextLink } from '../../../ui/primitives/TextLink';
import { Field } from '../../../ui/primitives/Field';
import { Sheet } from '../../../ui/feedback/variants/E14E20';

/**
 * A confirmation that asks WHY (frame `admin-account-detail-2c-disable`): the `ConfirmSheet`'s pair of
 * links - the action in `danger` (or ink), then "Mégse" - with a required reason field standing between
 * the sentence and the links.
 *
 * ONE sheet, not a reason sheet followed by a second confirmation: the action's link is the
 * confirmation, and it stays inert until the reason has text. No pill - a confirmation never holds
 * the lime shape (Pulse System section 4, "Destructive action").
 *
 * The sheet does not close itself: the caller closes it when the server has answered, or keeps it
 * open with `error` (the header's danger dot with "Újra", and the sentence under the field).
 */
export function ReasonSheet({
  open,
  onClose,
  title,
  message,
  reasonLabel,
  reasonHint,
  confirmLabel,
  tone = 'danger',
  busy = false,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  reasonLabel: string;
  reasonHint: string;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  busy?: boolean;
  /** The refusal, in words (already translated). */
  error?: string | null;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    // The sheet takes the focus for itself when it opens; the field takes it one frame later.
    const id = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const trimmed = reason.trim();
  const ready = trimmed.length > 0 && !busy;

  return (
    <Sheet open={open} onClose={onClose} title={title} status={error ? 'error' : 'idle'}>
      <form
        data-kit="confirmSheet"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onConfirm(trimmed);
        }}
      >
        <p className="text-body text-text-2">{message}</p>
        <Field
          ref={field}
          label={reasonLabel}
          value={reason}
          maxLength={2000}
          hint={reasonHint}
          error={error ?? undefined}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex flex-col items-start">
          <TextLink
            text="body"
            tone={tone}
            busy={busy}
            disabled={!ready && !busy}
            onClick={() => {
              if (ready) onConfirm(trimmed);
            }}
          >
            {confirmLabel}
          </TextLink>
          <TextLink text="body" onClick={onClose}>
            {t('common.cancel')}
          </TextLink>
        </div>
      </form>
    </Sheet>
  );
}
