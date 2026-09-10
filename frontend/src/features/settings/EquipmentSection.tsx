import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toggle } from '../../ui/primitives/Toggle';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useOnboarding, useDraftSave } from '../onboarding/useOnboarding';

/** Same set of ids, order ignored — the server does not promise an order. */
const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

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
  const { data, dataUpdatedAt, isPending } = useOnboarding();
  const { save, state } = useDraftSave();
  // Overlay, because the cache only moves when the debounce fires: without this the chip would
  // sit unticked for 700ms after the tap. Mirrored into a ref alongside the state for the same
  // reason `OnboardingPage`'s `draftRef`/`live()` exists — see the note above its
  // `toggleEquipment`: two taps landing before React repaints must not both read the same
  // render-closure snapshot.
  const [sel, setSel] = useState<number[] | null>(null);
  const selRef = useRef<number[] | null>(null);
  const serverEquipment = data?.profile?.equipment;

  // The overlay exists only until the server confirms it. Once the cache holds the same set (as
  // a set — order is not promised) the overlay predicted, drop it so the screen renders the
  // canonical list again. Gated on the actual list rather than on `state === 'saved'`: a save in
  // flight can finish and report 'saved' after a newer tap already queued a different patch
  // (`useDraftSave`'s pending-merge quirk), and clearing the overlay then would let that newer
  // tap compute its next array from a list missing its own pending edit.
  //
  // Consequence: once confirmed, a coach's later edit arrives through the next refetch and is
  // what the client sees and edits from next. If the coach writes while the client's own save is
  // still in flight, the client's save wins when it lands — last write wins, per
  // docs/brain/60-Decisions/0013-coach-writes-client-equipment.md.
  //
  // `dataUpdatedAt` is in the dependency list alongside `serverEquipment` because TanStack Query's
  // structural sharing (`replaceEqualDeep`) keeps the very same `equipment` array object whenever a
  // response carries the same ids in the same order — a no-net-change save, or a retry — so
  // `serverEquipment` alone does not change identity and this effect would never re-run to check.
  // `dataUpdatedAt` moves on every confirmation regardless, so it re-triggers the equality check
  // every time; the check above still decides, this dependency only makes sure it runs.
  useEffect(() => {
    if (selRef.current && serverEquipment && sameSet(selRef.current, serverEquipment)) {
      selRef.current = null;
      setSel(null);
    }
  }, [serverEquipment, dataUpdatedAt]);

  if (isPending) return <Skeleton className="h-28 w-full rounded-card" />;

  const options = data?.options?.equipment ?? [];
  const current = sel ?? serverEquipment ?? [];

  const toggle = (id: number) => {
    const now = selRef.current ?? serverEquipment ?? [];
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    selRef.current = next;
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
