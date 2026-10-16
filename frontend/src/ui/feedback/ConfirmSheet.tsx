import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TextLink } from '../primitives/TextLink';
import { Sheet, type ElementStatus } from './variants/E14E20';

export interface ConfirmSheetProps {
  open: boolean;
  /** Close without acting: the cancel link, the close button, Escape, the scrim, a drag. */
  onClose: () => void;
  /** The sheet's title (`title` 22): "Kijelentkezés", "Biztosan archiválod?". */
  title: string;
  /** What will happen, in `body` `text-2` — one or two sentences. */
  message?: ReactNode;
  /** The action's words — the same verb as the control that opened the sheet. */
  confirmLabel: string;
  onConfirm: () => void;
  /** Default `common.cancel` ("Mégse"). */
  cancelLabel?: string;
  /** `danger` (the default): a destructive action, its link in `danger`. `default`: an ink link. */
  tone?: 'danger' | 'default';
  /** The action is in flight: its link shows the three dots and cannot fire twice. */
  busy?: boolean;
  /** The sheet's status and retry, passed to `Sheet` (error = the danger dot + "Újra" in the header). */
  status?: ElementStatus;
  onRetry?: () => void;
}

/**
 * The two links of a confirmation, stacked with no gap: the action (`body-m`, `danger` when it
 * destroys), then the cancel (`body-m`, `text-1`). No pill — a confirmation sheet never holds the
 * lime pill (Pulse System §4 "Destructive action"). Exported for the kit specimen, which draws the
 * sheet still; a screen writes `ConfirmSheet`.
 */
export function ConfirmSheetBody({
  message,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  tone = 'danger',
  busy = false,
}: Pick<ConfirmSheetProps, 'message' | 'confirmLabel' | 'onConfirm' | 'cancelLabel' | 'tone' | 'busy'> & { onCancel?: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      {message ? <p className="text-body text-text-2">{message}</p> : null}
      <div className="flex flex-col items-start">
        <TextLink text="body" tone={tone === 'danger' ? 'danger' : 'default'} busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </TextLink>
        <TextLink text="body" onClick={onCancel}>
          {cancelLabel ?? t('common.cancel')}
        </TextLink>
      </div>
    </>
  );
}

/**
 * A confirmation — the board's "Kijelentkezés" sheet: the bottom `Sheet` with the question, the
 * action as a danger text link and "Mégse" under it. Every destructive action of the product is
 * confirmed here; there is no `window.confirm()` and no centred alert.
 *
 * Focus moves to the sheet when it opens; the first Tab reaches the action, the second the cancel.
 * The sheet does not close itself on confirm — the caller closes it when the work is done (or keeps
 * it open with `status="error"` and `onRetry`), so a failed action is never hidden by a vanishing
 * sheet.
 */
export function ConfirmSheet({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  cancelLabel,
  tone = 'danger',
  busy = false,
  status,
  onRetry,
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title} status={status ?? 'idle'} onRetry={onRetry}>
      <div data-kit="confirmSheet" className="contents">
        <ConfirmSheetBody
          message={message}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          cancelLabel={cancelLabel}
          onCancel={onClose}
          tone={tone}
          busy={busy}
        />
      </div>
    </Sheet>
  );
}
