import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toggle } from '../../ui/primitives/Toggle';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { ApiError } from '../../lib/api';
import { sameSet } from '../../lib/equipment';
import { useTaxonomies } from '../library/useExercises';
import { useClientOnboarding, useSetClientEquipment } from './useCoaching';

/**
 * The equipment row from the old eleven-row table, back as an editor rather than a line of text.
 *
 * ═══ WHY THIS HAS A SAVE BUTTON WHEN `EquipmentSection` DOES NOT ═══════════════════════════════
 *
 * Same chips, same toggle, same route family — and a deliberately different commit model.
 * `EquipmentSection` autosaves because the person tapping it owns the list: the only cost of a
 * stray tap is their own answer, debounced and self-correcting. Here a stray tap rewrites
 * somebody ELSE's profile and fires a notification into their inbox. Debouncing a side effect
 * that lands in another person's phone would be the wrong trade, so the coach commits on purpose
 * with an explicit button instead.
 *
 * ═══ THE THREE STATES THIS CARD REFUSES TO CONFUSE ═════════════════════════════════════════════
 *
 * - No `onboarding_profiles` row yet (`profile: null` from the server): there is nothing to edit
 *   and nothing to read back after a save, so no editor is offered — just the same
 *   `coaching.noProfile` line the page already uses for the summary tiles above this card.
 * - The link stopped being this coach's between page load and now (a 404, on the read or on the
 *   save): reuse `coaching.clientMissingBody`, the same sentence the whole-page 404 state already
 *   shows, so a coach who has seen one has seen the other.
 * - An ordinary save failure (network blip, 5xx): reuse `onboarding.saveError` — the draft is kept
 *   and the coach can retry, which is exactly what that string already promises.
 *
 * ═══ WHY `toggle` USES A FUNCTIONAL UPDATER ════════════════════════════════════════════════════
 *
 * `OnboardingPage`'s own chip toggle computes the next array from a `current` read out of the
 * render closure, and two taps landing in the same tick both read the same stale array — one tap
 * is silently lost. That bug is documented there as measured, not hypothetical, for this exact
 * chip shape. Nothing here needs the array synchronously (the commit is the explicit button
 * below, not the tap), so `setDraft` always derives its next value from the PREVIOUS state passed
 * into the updater, never from a variable closed over at render time.
 */
export function ClientEquipmentCard({ linkId }: { linkId: number }) {
  const { t, i18n } = useTranslation();
  const onboarding = useClientOnboarding(linkId);
  const taxonomies = useTaxonomies(i18n.language);
  const save = useSetClientEquipment(linkId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Skeleton, not an empty chip row: an empty `options` list mid-fetch reads as "this client has
  // no equipment at all", which is a claim neither query has made yet.
  if (onboarding.isPending || taxonomies.isPending) {
    return <Skeleton className="h-36 w-full rounded-card" />;
  }

  // The link's own 404 (not yours, archived, never existed) — the same story the page-level
  // `isError` guard above already tells for the whole screen.
  if (onboarding.isError) {
    return (
      <Surface>
        <p className="text-body-s text-text-2">{t('coaching.clientMissingBody')}</p>
      </Surface>
    );
  }

  const profile = onboarding.data?.profile ?? null;
  // No row to edit, and nothing this card could save that it could then read back and show —
  // offering chips here would let a save silently vanish into a profile that does not exist yet.
  if (!profile) {
    return (
      <Surface>
        <p className="text-body-s text-text-2">{t('coaching.noProfile')}</p>
      </Surface>
    );
  }

  const options = taxonomies.data?.equipment ?? [];
  const stored = profile.equipment.map((e) => e.id);
  const current = draft ?? stored;
  // A chip tapped on and back off leaves `draft` non-null but equal to `stored` as a SET — and a
  // save from here would still fire the client-facing notification and an audit row for a change
  // that never happened. `draft === null` alone caught "never touched"; this also catches
  // "touched and reverted".
  const unsaved = draft !== null && !sameSet(draft, stored);

  const toggle = (id: number) => {
    setError(null);
    setDraft((prev) => {
      const base = prev ?? stored;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  const handleSave = async () => {
    if (!unsaved) return;
    setError(null);
    try {
      await save.mutateAsync(draft);
      setDraft(null);
      toast(t('coaching.equipmentSaved'));
    } catch (err) {
      // Never a silent rejection: the draft stays exactly as the coach left it, ready to retry.
      setError(
        err instanceof ApiError && err.status === 404
          ? t('coaching.clientMissingBody')
          : t('onboarding.saveError'),
      );
    }
  };

  return (
    <Surface className="flex flex-col gap-group">
      <p className="text-title-2 text-text-1">{t('settings.equipment')}</p>
      {/* States the consequence, not just the field: the coach is editing somebody else's answer. */}
      <p className="text-body-s text-text-2">{t('coaching.equipmentHint')}</p>
      <div className="flex flex-wrap gap-tight">
        {options.map((eq) => (
          <Toggle key={eq.id} on={current.includes(eq.id)} label={eq.name} onToggle={() => toggle(eq.id)} />
        ))}
      </div>
      <Pressable
        variant="primary"
        disabled={!unsaved || save.isPending}
        busy={save.isPending}
        onClick={handleSave}
      >
        {t('common.save')}
      </Pressable>
      {error ? (
        <p aria-live="polite" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}
