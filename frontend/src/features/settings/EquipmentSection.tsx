import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toggle } from '../../ui/primitives/Toggle';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useOnboarding, useDraftSave } from '../onboarding/useOnboarding';

/**
 * The client's own equipment list, after onboarding.
 *
 * The route `/onboarding` was always live and unguarded once complete, and `PATCH /onboarding`
 * always took `equipment`. What was missing was a door, so the answer given once on step three
 * could never be revised. Same endpoint, same control, reachable.
 *
 * NO SAVE BUTTON. `useDraftSave` is the questionnaire's own autosave — debounced, merging two
 * answers inside one window, flushed on `pagehide` and on unmount. A second save mechanism next
 * to it would be a second set of those three bugs to get right.
 */
export function EquipmentSection() {
  const { t } = useTranslation();
  const { data, isPending } = useOnboarding();
  const { save, state } = useDraftSave();
  // Local, because the cache only moves when the debounce fires: without this the chip would sit
  // unticked for 700ms after the tap. `OnboardingPage` holds the same local copy for the same
  // reason — see the note above its `toggleEquipment`.
  const [sel, setSel] = useState<number[] | null>(null);

  if (isPending) return <Skeleton className="h-28 w-full rounded-card" />;

  const options = data?.options?.equipment ?? [];
  const current = sel ?? data?.profile?.equipment ?? [];

  const toggle = (id: number) => {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setSel(next);
    save({ equipment: next });
  };

  return (
    <div className="flex flex-col gap-group">
      <p className="text-body-s text-text-2">{t('settings.equipmentHint')}</p>
      <div className="flex flex-wrap gap-tight">
        {options.map((eq) => (
          <Toggle key={eq.id} on={current.includes(eq.id)} label={eq.name} onToggle={() => toggle(eq.id)} />
        ))}
      </div>
      {/* `error` is not silent: a failed save that renders nothing reads as a successful one. The
          key is the questionnaire's own — `onboarding.saveError` — reused rather than duplicated,
          since it says the same true thing here: the answer is kept and will be retried. */}
      <p aria-live="polite" className={state === 'error' ? 'text-caption text-danger' : 'text-caption text-text-3'}>
        {state === 'saving'
          ? t('common.saving')
          : state === 'saved'
            ? t('settings.equipmentSaved')
            : state === 'error'
              ? t('onboarding.saveError')
              : ''}
      </p>
    </div>
  );
}
