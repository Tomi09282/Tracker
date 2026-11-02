import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Dock } from '../../ui/shell/Dock';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { Rule } from '../../ui/data/Rule';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { newFocusKey, refusalOf, useStartFocus, type FocusCurrent } from './focusApi';
import { useServerNow } from './focusClock';
import { CHECKINS, DEFAULT_CHECKIN, DEFAULT_MINUTES, DURATIONS, TITLE_MAX, clockAt, expectedCoins, span } from './focusFormat';

/**
 * focus-1 — the setup (`figma-build/lifeos/focus-1.body.js`):
 *
 *   header      pushed: "‹ MA" (app/routeMeta.ts), the title "Fókusz"
 *   field       "Min dolgozol?" — the kit underline field
 *   IDŐTARTAM   the head carries "21:10 → 22:00" (mono: now and now + the chosen length); the five
 *               duration words as the kit chip row (radios)
 *   ELLENŐRZÉS  the four check-in words, then the reward rule in one cap line
 *   dock        the one lime pill "Fókusz indítása"
 *
 * The two sections of this frame are built with an 8 pt rhythm (`sect(…, { gap: 8 })`: rule, 8,
 * eyebrow, 8, chips) where the kit's section is 16 / 16, so each is the kit rule + a section
 * without its own rule, both 8 apart — the same parts, the frame's spacing.
 *
 * The estimate is drawn with the server's rules (GET /focus/current carries them before a block
 * exists); what a block pays is decided by the server at the finish.
 */
export function FocusSetup({ current }: { current: FocusCurrent }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'hu';
  const start = useStartFocus();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState<number>(DEFAULT_MINUTES);
  const [checkin, setCheckin] = useState<number>(DEFAULT_CHECKIN);
  // One idempotency key per intended block: a retry after a lost answer starts nothing twice.
  const key = useRef<string | null>(null);
  const now = useServerNow(current.now, current.receivedAt, true);

  const rules = current.rules;
  const coins = expectedCoins(minutes, checkin, rules);
  const startClock = clockAt(now, locale);
  const endClock = clockAt(now + minutes * 60, locale);
  const refusal = refusalOf(start.error);
  const noZone = !current.started || refusal === 'TIMEZONE_REQUIRED';
  const trimmed = title.trim();

  const submit = () => {
    if (!trimmed || start.isPending || noZone) return;
    key.current ??= newFocusKey();
    start.mutate(
      { clientKey: key.current, title: trimmed.slice(0, TITLE_MAX), minutes, checkinMinutes: checkin },
      {
        onSuccess: () => {
          key.current = null;
        },
        onError: (err) => {
          // A refusal is an answer: the next tap is a new attempt. A lost answer keeps the key.
          if (refusalOf(err)) key.current = null;
        },
      },
    );
  };

  const durationWord = (m: number) =>
    m < 60
      ? t('focus.minutes', { n: m })
      : t('focus.hours', { n: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(m / 60) });

  return (
    <Screen top="push">
      <ScreenHeader kind="push" title={t('focus.title')} />

      <Field
        label={t('focus.what')}
        value={title}
        maxLength={TITLE_MAX}
        enterKeyHint="go"
        autoComplete="off"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />

      <TightSection title={t('focus.duration')} trailing={<span className="text-data text-text-2">{span(startClock, endClock, '→')}</span>}>
        <Radios label={t('focus.duration')} values={DURATIONS} value={minutes} onChange={setMinutes} word={durationWord} />
      </TightSection>

      <TightSection title={t('focus.checkin')}>
        <Radios
          label={t('focus.checkin')}
          values={CHECKINS}
          value={checkin}
          onChange={setCheckin}
          word={(m) => (m === 0 ? t('focus.none') : t('focus.minutes', { n: m }))}
        />
        <p className="text-cap text-text-2">
          {checkin > 0
            ? t('focus.rule', { coins, perHour: rules.pointsPerHour, perCheckin: rules.checkinPoint })
            : t('focus.ruleNoCheckin', { coins, perHour: rules.pointsPerHour })}
        </p>
      </TightSection>

      {noZone ? (
        <NoticeLine
          role="status"
          action={
            <TextLink className="min-w-11" to="/settings/day">
              {t('settings.day.title')}
            </TextLink>
          }
        >
          {t('focus.noZone')}
        </NoticeLine>
      ) : refusal === 'LIMIT_REACHED' ? (
        <NoticeLine tone="warn" role="alert">
          {t('focus.limit')}
        </NoticeLine>
      ) : start.isError && refusal !== 'FOCUS_OPEN' ? (
        <NoticeLine tone="danger" role="alert">
          {t('focus.startFailed')}
        </NoticeLine>
      ) : null}

      <Dock as="footer">
        <Pressable variant="primary" size="lg" className="w-full" disabled={!trimmed || noZone} busy={start.isPending} onClick={submit}>
          {t('focus.start')}
        </Pressable>
      </Dock>
    </Screen>
  );
}

/**
 * focus-1's section: the kit's strong rule, the kit's section head and the content, 8 apart
 * (`sect(…, { gap: 8 })` of the body script) where the kit `Section` is 16 / 16.
 */
function TightSection({ title, trailing, children }: { title: string; trailing?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex w-full flex-col gap-2">
      <Rule strong />
      <SectionHeader rule={false} title={title} titleId={id} trailing={trailing} />
      {children}
    </section>
  );
}

/** A kit chip row used as one radio group: ←/→ move the choice, one tab stop (as the habit sheet). */
function Radios({
  label,
  values,
  value,
  onChange,
  word,
}: {
  label: string;
  values: readonly number[];
  value: number;
  onChange: (v: number) => void;
  word: (v: number) => string;
}) {
  const chips = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const at = values.indexOf(value);
    const next = (at + step + values.length) % values.length;
    onChange(values[next]!);
    chips.current[next]?.focus();
  };
  return (
    <div onKeyDown={onKey}>
      <ChipRow label={label} role="radiogroup">
        {values.map((v, i) => (
          <Chip
            key={v}
            ref={(el) => {
              chips.current[i] = el;
            }}
            role="radio"
            selected={v === value}
            tabIndex={v === value ? 0 : -1}
            onClick={() => onChange(v)}
          >
            {word(v)}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}
