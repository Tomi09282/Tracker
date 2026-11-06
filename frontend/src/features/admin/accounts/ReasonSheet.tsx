import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TextLink } from '../../../ui/primitives/TextLink';
import { Field } from '../../../ui/primitives/Field';
import { MaskedField } from '../../../ui/primitives/MaskedField';
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
 *
 * `password` adds the admin's OWN password under the reason - the step-up of re-enabling a disabled ADMIN
 * (B-admin-polish H1; the same field and words as the role sheet's grant of admin). A refusal of the
 * password (`passwordError`) stands under THAT field and clears as soon as it is edited; "Újra" in the
 * header sends what is in the fields NOW, never the previous attempt (review S-admin-accounts 9a / 9b).
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
  password,
  passwordError,
  offline = false,
  onEdit,
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
  /** Ask for the admin's own password too; the label and hint are the caller's (already translated). */
  password?: { label: string; hint: string };
  /** The refusal of the password, in words - shown under the password field instead of `error`. */
  passwordError?: string | null;
  /** The connection is off: the action is inert (a sheet opened before the drop). */
  offline?: boolean;
  /** The admin changed a field: the caller forgets the last refusal. */
  onEdit?: () => void;
  onConfirm: (reason: string, password?: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [pw, setPw] = useState('');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setPw('');
    // The sheet takes the focus for itself when it opens; the field takes it one frame later.
    const id = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const trimmed = reason.trim();
  const ready = trimmed.length > 0 && (!password || pw.length > 0) && !busy && !offline;
  const send = () => {
    if (ready) onConfirm(trimmed, password ? pw : undefined);
  };
  const shown = error ?? passwordError ?? null;

  return (
    <Sheet open={open} onClose={onClose} title={title} status={shown ? 'error' : 'idle'} onRetry={send}>
      <form
        data-kit="confirmSheet"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
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
          onChange={(e) => {
            setReason(e.target.value);
            onEdit?.();
          }}
        />
        {password ? (
          <MaskedField
            label={password.label}
            // An admin's own password is never shown (the role sheet's field, frame 2b).
            revealable={false}
            value={pw}
            autoComplete="current-password"
            hint={password.hint}
            error={passwordError ?? undefined}
            onChange={(e) => {
              setPw(e.target.value);
              onEdit?.();
            }}
          />
        ) : null}
        <div className="flex flex-col items-start">
          <TextLink
            text="body"
            tone={tone}
            busy={busy}
            disabled={!ready && !busy}
            onClick={send}
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
