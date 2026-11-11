import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive } from 'lucide-react';
import type { Challenge, ChallengeCategory } from '../../lib/lifeos-api';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { Chip, ChipRow } from '../../ui/primitives/ChipRow';
import { Field } from '../../ui/primitives/Field';
import { NumberStepper } from '../../ui/primitives/NumberStepper';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { CATEGORIES } from './challengeFormat';
import { newClientKey, refusalOf, useArchiveChallenge, useCreateChallenge, useDeleteChallenge, usePatchChallenge } from './challengesApi';
import { WEIGHT_MAX } from './WeightBar';

/**
 * "Új kihívás" / editing one challenge — the sheet the pool's header plus opens (challenges-2.part.js:
 * "add = header plus (→ form sheet)"). Round B does not draw the sheet, so it is built from the kit
 * exactly as the round's other forms are (habit-form, task-form): the kit bottom sheet, the underline
 * field, the word chips, the stepper and the sheet's one lime pill.
 *
 *   Megnevezés          the name (1..80), focused on a new challenge
 *   Kategória           Fegyelem · Mozgás · Elme · Kapcsolat · Étkezés as single-choice word chips
 *                       (optional: the chosen chip tapped again clears it)
 *   Érme / teljesítés   the coins the picked task pays, 0..50, with "legfeljebb 50"
 *   Súly                1..5, the stepper (the pool draws it as five segments)
 *   pill                "Létrehozás" / "Mentés"
 *   edit only           "Archiválás" (out of the draw, kept) and "Törlés" (danger, confirmed)
 *
 * The coin default is the admin rule `challengePoints` as seeded (15, api.md "POST /challenges");
 * what is shown is what is sent. A refusal (the cap of 50 live challenges, a zone not set) or a
 * failure keeps the sheet open with the danger dot, "Újra" and one line.
 */

const NAME_MAX = 80;
const POINTS_MAX = 50;
const POINTS_DEFAULT = 15;

interface FormState {
  name: string;
  category: ChallengeCategory | null;
  points: string;
  weight: number;
}

const initial = (c?: Challenge): FormState =>
  c ? { name: c.name, category: c.category, points: String(c.points), weight: c.weight } : { name: '', category: null, points: String(POINTS_DEFAULT), weight: 1 };

export interface ChallengeSheetProps {
  open: boolean;
  onClose: () => void;
  /** Edit this challenge; without it the sheet creates one. */
  challenge?: Challenge;
}

export function ChallengeSheet({ open, onClose, challenge }: ChallengeSheetProps) {
  const { t } = useTranslation();
  const create = useCreateChallenge();
  const patch = usePatchChallenge();
  const archive = useArchiveChallenge();
  const remove = useDeleteChallenge();
  const [form, setForm] = useState<FormState>(() => initial(challenge));
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState(false);
  // One idempotency key per opened sheet: a retried create answers the first challenge, never a second.
  const clientKey = useRef(newClientKey('c'));
  const nameRef = useRef<HTMLInputElement>(null);
  const editing = challenge !== undefined;
  const write = editing ? patch : create;

  useEffect(() => {
    if (!open) return;
    setForm(initial(challenge));
    setTried(false);
    setAsking(false);
    create.reset();
    patch.reset();
    archive.reset();
    remove.reset();
    clientKey.current = newClientKey('c');
    if (!challenge) window.setTimeout(() => nameRef.current?.focus(), 0);
    // Reset only when the sheet opens (or opens on another challenge).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, challenge?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const name = form.name.trim();
  const points = /^\d{1,2}$/.test(form.points.trim()) && Number(form.points) <= POINTS_MAX ? Number(form.points) : null;
  const errors = {
    name: name.length === 0 ? t('challenges.form.nameRequired') : undefined,
    points: points === null ? t('challenges.form.max', { count: POINTS_MAX }) : undefined,
  };
  const valid = errors.name === undefined && errors.points === undefined;
  const shown = (e: string | undefined) => (tried ? e : undefined);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!valid || points === null || write.isPending) return;
    const fields = { name: name.slice(0, NAME_MAX), category: form.category, points, weight: form.weight };
    const done = { onSuccess: () => onClose() };
    if (editing) patch.mutate({ id: challenge.id, patch: fields }, done);
    else create.mutate({ clientKey: clientKey.current, ...fields }, done);
  };

  const toggleArchive = () => {
    if (!challenge) return;
    archive.mutate({ id: challenge.id, archive: !challenge.archived }, { onSuccess: () => onClose() });
  };

  const failedWrite = write.error ?? archive.error;
  const failure = failedWrite
    ? refusalOf(failedWrite) === 'LIMIT_REACHED'
      ? t('challenges.limit', { count: 50 })
      : t('challenges.failed')
    : null;

  // The category chips are a radiogroup: the arrows move the choice and the focus (as the habit sheet).
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const onChipsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const at = form.category ? CATEGORIES.indexOf(form.category) : dir > 0 ? -1 : 0;
    const to = (at + dir + CATEGORIES.length) % CATEGORIES.length;
    const next = CATEGORIES[to];
    if (next) set('category', next);
    chips.current[to]?.focus();
  };
  const focusIndex = form.category ? CATEGORIES.indexOf(form.category) : 0;

  return (
    <>
      <Sheet
        open={open && !asking}
        onClose={onClose}
        title={editing ? t('challenges.form.editTitle') : t('challenges.new')}
        status={write.isPending || archive.isPending ? 'busy' : failedWrite ? 'error' : 'idle'}
        onRetry={write.isError ? () => submit() : undefined}
      >
        <form noValidate onSubmit={submit} className="flex w-full flex-col gap-4">
          <Field
            ref={nameRef}
            label={t('challenges.form.name')}
            value={form.name}
            maxLength={NAME_MAX}
            enterKeyHint="next"
            error={shown(errors.name)}
            onChange={(e) => set('name', e.target.value)}
          />

          <div role="group" aria-labelledby="challenge-category-label" className="flex w-full flex-col gap-1">
            <span id="challenge-category-label" className="text-cap-m text-text-2">
              {t('challenges.form.category')}
            </span>
            <div onKeyDown={onChipsKey}>
              <ChipRow label={t('challenges.form.category')} role="radiogroup" wrap>
                {CATEGORIES.map((c, i) => (
                  <Chip
                    key={c}
                    ref={(el) => {
                      chips.current[i] = el;
                    }}
                    role="radio"
                    selected={form.category === c}
                    tabIndex={i === focusIndex ? 0 : -1}
                    onClick={() => set('category', form.category === c ? null : c)}
                  >
                    {t(`challenges.category.${c}`)}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-6">
            <Field
              label={t('challenges.form.points')}
              inputMode="numeric"
              value={form.points}
              hint={t('challenges.form.max', { count: POINTS_MAX })}
              error={shown(errors.points)}
              onChange={(e) => set('points', e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
            <NumberStepper
              label={t('challenges.form.weight')}
              value={form.weight}
              min={1}
              max={WEIGHT_MAX}
              onChange={(n) => set('weight', n ?? 1)}
            />
          </div>

          {failure ? (
            <NoticeLine tone="danger" role="alert">
              {failure}
            </NoticeLine>
          ) : null}

          <Pressable variant="primary" size="lg" type="submit" className="w-full" busy={write.isPending}>
            {editing ? t('common.save') : t('challenges.form.create')}
          </Pressable>

          {editing ? (
            <div className="flex flex-col items-start">
              <TextLink text="body" lead={<Archive aria-hidden />} busy={archive.isPending} onClick={toggleArchive}>
                {challenge.archived ? t('challenges.restore') : t('challenges.archive')}
              </TextLink>
              <TextLink text="body" tone="danger" onClick={() => setAsking(true)}>
                {t('common.delete')}
              </TextLink>
            </div>
          ) : null}
        </form>
      </Sheet>

      <ConfirmSheet
        open={open && asking}
        onClose={() => setAsking(false)}
        title={challenge?.name ?? ''}
        message={t('challenges.deleteAsk')}
        confirmLabel={t('common.delete')}
        busy={remove.isPending}
        status={remove.isError ? 'error' : undefined}
        onRetry={remove.isError && challenge ? () => remove.mutate(challenge.id, { onSuccess: onClose }) : undefined}
        onConfirm={() => challenge && remove.mutate(challenge.id, { onSuccess: onClose })}
      />
    </>
  );
}
