import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Field } from '../../../ui/primitives/Field';
import { ConfirmSheetBody } from '../../../ui/feedback/ConfirmSheet';
import { Sheet } from '../../../ui/feedback/variants/E14E20';
import { useOnline } from '../../plans/useOnline';
import { decideReports, useRefreshAll, useTakeDown } from './adminPostsApi';

/**
 * What the sheet takes down, and why it is asked:
 *   post     one post (admin-post-detail-2-takedown)
 *   profile  the author's profile and with it every post of theirs
 *   both     the post and the author's profile in one act, one reason (admin-post-detail-3)
 *   report   upholds the reports of one reason on the post and takes the post down with them
 */
export type TakeDownKind = 'post' | 'profile' | 'both' | 'report';

export interface TakeDownTarget {
  kind: TakeDownKind;
  postId: string;
  /** The author's public handle: needed for `profile` and `both`. */
  handle?: string | null;
  /** The reports to uphold: needed for `report`. */
  reportIds?: number[];
}

/**
 * The take-down sheet. ONE sheet with the required reason and the confirmation pair — not a reason
 * sheet and then a second "are you sure" (admin-post-detail-2-takedown): the reason IS the
 * confirmation. A ConfirmSheet's rule holds: no pill, a danger text link and "Mégse".
 *
 * The reason goes into the audit log and is never shown to the author. The server refuses a
 * take-down without one; the link is dimmed until there is one, so the refusal is never the first
 * the admin hears of it. `both` is two calls on the server (the post, then the profile); the second
 * is safe to run again, so a failure in the middle is answered with the sheet's own "Újra".
 */
/**
 * `target` stays set while the sheet leaves (its words must not change mid-exit); `open` is what shows it.
 */
export function TakeDownSheet({ target, open, onClose }: { target: TakeDownTarget | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const online = useOnline();
  const takeDown = useTakeDown();
  const refresh = useRefreshAll();
  const [reason, setReason] = useState('');
  const field = useRef<HTMLInputElement>(null);

  // A fresh sheet every time: an old reason never carries over to another post.
  useEffect(() => {
    if (!open) return;
    setReason('');
    const id = setTimeout(() => field.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open, target?.kind, target?.postId]);

  const act = useMutation({
    networkMode: 'always', // see useTakeDown
    mutationFn: async () => {
      if (!target) return;
      const why = reason.trim();
      if (target.kind === 'report') {
        await decideReports(target.reportIds ?? [], 'upheld', why);
        return;
      }
      if (target.kind === 'post' || target.kind === 'both') await takeDown.mutateAsync({ postId: target.postId, reason: why });
      if ((target.kind === 'profile' || target.kind === 'both') && target.handle) {
        await takeDown.mutateAsync({ handle: target.handle, reason: why });
      }
    },
    onSuccess: async () => {
      await refresh();
      act.reset();
      onClose();
    },
  });

  const kind = target?.kind ?? 'post';
  const title = t(`adminPosts.takedown.${kind}.title`);
  const ready = reason.trim().length > 0 && online;
  const close = () => {
    if (act.isPending) return;
    act.reset();
    onClose();
  };
  const submit = () => {
    if (ready && !act.isPending) act.mutate();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      status={act.isPending ? 'busy' : act.isError ? 'error' : 'idle'}
      onRetry={submit}
    >
      <p className="text-body text-text-2">{t(`adminPosts.takedown.${kind}.message`)}</p>
      <Field
        ref={field}
        label={t('adminPosts.takedown.reason')}
        hint={t('adminPosts.takedown.reasonHint')}
        value={reason}
        maxLength={2000}
        autoComplete="off"
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <ConfirmSheetBody
        confirmLabel={title}
        onConfirm={submit}
        onCancel={close}
        busy={act.isPending}
        confirmDisabled={!ready}
      />
    </Sheet>
  );
}
