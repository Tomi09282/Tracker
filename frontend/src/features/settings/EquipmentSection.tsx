import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Section } from '../../ui/data/SectionHeader';
import { ChipRow } from '../../ui/primitives/ChipRow';
import { Toggle } from '../../ui/primitives/Toggle';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { cn } from '../../lib/cn';
import { useOnboarding, useDraftSave } from '../onboarding/useOnboarding';
import { sameSet } from '../../lib/equipment';

/** Widths of the loading words: one block per chip line, three lines — the shape of the list, not of a tile. */
const LOADING_WORDS = [['w-24', 'w-8', 'w-20'], ['w-16', 'w-8', 'w-12', 'w-16'], ['w-20', 'w-12', 'w-28']];

/**
 * The client's own equipment list, after onboarding — the "Felszerelés" section of `settings-2`.
 *
 * The route `/onboarding` was always live and unguarded once complete, and `PATCH /onboarding`
 * always took `equipment`. What was missing was a door, so the answer given once on step three
 * could never be revised. Same endpoint, same control, reachable.
 *
 * NO SAVE BUTTON. `useDraftSave` is the questionnaire's own autosave — debounced, merging two
 * answers inside one window, flushed on `pagehide` and on unmount. The status it reports sits in
 * the section head, where the frame draws "● Felszerelés mentve"; a refusal is a danger line under
 * the words, because its sentence does not fit beside an eyebrow.
 */
export function EquipmentSection() {
  const { t } = useTranslation();
  const { data, dataUpdatedAt, isPending } = useOnboarding();
  const { save, state } = useDraftSave();
  // Overlay, because the cache only moves when the debounce fires: without this the chip would
  // sit unmarked for 700ms after the tap. Mirrored into a ref alongside the state for the same
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

  const options = data?.options?.equipment ?? [];
  const current = sel ?? serverEquipment ?? [];

  const toggle = (id: number) => {
    const now = selRef.current ?? serverEquipment ?? [];
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    selRef.current = next;
    setSel(next);
    save({ equipment: next });
  };

  // The head's status: a 6 pt dot and the words, `cap` `text-2` (Pulse: a semantic colour is a
  // dot or text, never a strip). `saving` is the ink dot, `saved` the success dot. Polite, so the
  // change is announced without taking the focus.
  const status =
    state === 'saving' ? t('common.saving') : state === 'saved' ? t('settings.equipmentSaved') : null;

  return (
    <Section
      title={t('settings.equipment')}
      trailing={
        <span role="status" aria-live="polite" className="inline-flex items-baseline gap-1.5 text-cap text-text-2">
          {status ? (
            <>
              <span aria-hidden className={cn('size-1.5 self-center rounded-full', state === 'saved' ? 'bg-success' : 'bg-text-2')} />
              {status}
            </>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-col gap-1">
        <p className="text-cap text-text-3">{t('settings.equipmentHint')}</p>
        {isPending ? (
          <div role="status" aria-label={t('common.loading')}>
            {LOADING_WORDS.map((line, i) => (
              <div key={i} aria-hidden className="flex h-11 items-center gap-6">
                {line.map((w, j) => (
                  <Skeleton key={j} className={cn('h-4', w)} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <ChipRow wrap label={t('settings.equipment')}>
            {options.map((eq) => (
              <Toggle key={eq.id} on={current.includes(eq.id)} label={eq.name} onToggle={() => toggle(eq.id)} />
            ))}
          </ChipRow>
        )}
      </div>
      {/* A failed save is not silent: a refusal that renders nothing reads as a success. The key is
          the questionnaire's own, since it says the same true thing here: the answer is kept and
          will be retried. */}
      {state === 'error' ? (
        <NoticeLine tone="danger" role="alert">
          {t('onboarding.saveError')}
        </NoticeLine>
      ) : null}
    </Section>
  );
}
