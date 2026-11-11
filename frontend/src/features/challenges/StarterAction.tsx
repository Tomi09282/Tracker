import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { useToast } from '../../ui/feedback/ToastHost';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { StarterRunError, STARTERS, starterRefusal, useAddStarterChallenges } from './starterChallenges';

/**
 * "Kezdő kihívások hozzáadása" — the one opt-in action of an empty challenge pool (finding O2), on the
 * pool's empty state (`pill`, the screen's one lime shape) and on Ma's NAPI DOBÁS when the pool is empty
 * (`link`). It is drawn only while the pool is empty, so it is gone the moment the list exists; the
 * parents decide that, this component only runs the write.
 *
 * Busy while the ten writes run (the button shows its three dots and ignores a second tap). A run that
 * fails before anything was created leaves the line "Nem sikerült a művelet." with "Újra" under the
 * button; a run that stopped half way has already filled the pool (this block is gone by then), so it is
 * a toast. Both are safe to repeat: the keys are fixed, the server replays what it already made.
 */
export function StarterAction({ variant }: { variant: 'pill' | 'link' }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const add = useAddStarterChallenges();

  const run = () => {
    const names: Record<string, string> = {};
    for (const s of STARTERS) names[s.id] = t(`challenges.starter.${s.id}`);
    add.mutate(names, {
      onError: (err) => {
        // Half done: the pool is non-empty now and this block unmounts, so the word goes to a toast.
        if (err instanceof StarterRunError && err.created > 0) toast(t('challenges.failed'), 'error');
      },
    });
  };

  const label = t('challenges.starter.add');
  const failed = add.isError && !(add.error instanceof StarterRunError && add.error.created > 0);

  return (
    <>
      {variant === 'pill' ? (
        <Pressable variant="primary" size="lg" busy={add.isPending} onClick={run}>
          {label}
        </Pressable>
      ) : (
        <TextLink text="body" lead={<Plus aria-hidden />} busy={add.isPending} onClick={run}>
          {label}
        </TextLink>
      )}
      {failed ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={run} busy={add.isPending}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {starterRefusal(add.error) === 'TIMEZONE_REQUIRED' ? t('challenges.noZone') : t('challenges.failed')}
        </NoticeLine>
      ) : null}
    </>
  );
}
