import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { ApiError, apiWithRefresh } from '../../lib/api';
import type { AdminRulesPut, AdminRulesPutResponse, AdminRulesResponse, PointRuleKey, PointRules } from '../../lib/lifeos-api';
import { cn } from '../../lib/cn';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Rule } from '../../ui/data/Rule';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { useToast } from '../../ui/feedback/ToastHost';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { hasRole, useSession } from '../auth/useSession';
import { AdminForbidden } from './AdminShell';
import {
  EDITABLE_KEYS,
  RULE_SECTIONS,
  boundsOf,
  changedKeys,
  formatRuleValue,
  unitKeyOf,
  type RuleRowSpec,
  type RuleSectionSpec,
} from './rulesModel';

const RULES_KEY = ['admin', 'rules'] as const;
/** The note goes into the audit log with the new version; the server takes 1..280 characters. */
const NOTE_MAX = 280;

/**
 * One rule's stepper — the frame's `NumberStepper/<value> · 64`: the bare 44 pt minus, the figure
 * centred in 64 (mono 16 / 20, the unit 3 after it in cap text-2), the bare 44 pt plus.
 *
 * It is NOT the kit's `NumberStepper`, which is the onboarding field (label row, 48 pt display
 * figure, underline). Design round B composes this one from kit parts in the row's control slot
 * (`c.common.js numStep`: iconBtn · text · iconBtn), and so does this function.
 *
 * The figure is a spinbutton: Tab stops on it, ArrowUp / ArrowDown step it, PageUp / PageDown by
 * ten steps, Home / End jump to the bounds. − and + do not take focus away from it on a pointer
 * tap and are disabled at the bounds (40 %, they keep their place).
 *
 * An edited value is ink SemiBold — never lime: an unsaved change is not live data (the frame's
 * "Value · edited (ink SemiBold)").
 */
function RuleStepper({
  label,
  value,
  figure,
  unit,
  min,
  max,
  step,
  edited,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  figure: string;
  unit: string | null;
  min: number;
  max: number;
  step: number;
  edited: boolean;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  const { t } = useTranslation();
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  const onKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    const by: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 10, PageDown: -step * 10 };
    if (e.key in by) set(value + by[e.key]);
    else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else return;
    e.preventDefault();
  };
  const glyph = '[&_svg]:size-5 [&_svg]:stroke-2';

  return (
    <span className="flex items-center">
      <Pressable
        variant="link"
        shape="icon"
        aria-label={t('common.less')}
        disabled={disabled || value <= min}
        onPointerDown={keepFocus}
        onClick={() => set(value - step)}
        className={glyph}
      >
        <Minus aria-hidden />
      </Pressable>
      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={unit ? `${figure} ${unit}` : figure}
        aria-disabled={disabled || undefined}
        onKeyDown={disabled ? undefined : onKey}
        className={cn(
          'flex h-5 w-16 items-baseline justify-center gap-0.75 rounded-2',
          'outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        )}
      >
        <span className={cn('text-data-l text-text-1', edited && 'font-semibold')}>{figure}</span>
        {unit ? <span className="text-cap text-text-2">{unit}</span> : null}
      </span>
      <Pressable
        variant="link"
        shape="icon"
        aria-label={t('common.more')}
        disabled={disabled || value >= max}
        onPointerDown={keepFocus}
        onClick={() => set(value + step)}
        className={glyph}
      >
        <Plus aria-hidden />
      </Pressable>
    </span>
  );
}

/**
 * A section of rules — the frame's `sect(label, { gap: 8 })`: the strong rule, 8, the eyebrow (with
 * "érme" on its right when every row is paid in coins), 8, the rows on their hairlines.
 *
 * `SectionHeader` keeps its rule-to-eyebrow distance at the 16 of every other section; these ten
 * stand tighter, so the rule is drawn here and the head is asked for none.
 */
function RuleSection({
  spec,
  current,
  draft,
  ranges,
  disabled,
  onChange,
}: {
  spec: RuleSectionSpec;
  current: PointRules;
  draft: PointRules;
  ranges: AdminRulesResponse['ranges'];
  disabled: boolean;
  onChange: (key: PointRuleKey, value: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const title = t(`adminRules.section.${spec.id}`);

  const rowOf = (r: RuleRowSpec) => {
    const value = draft[r.key];
    const saved = current[r.key];
    const edited = value !== saved;
    const unitKey = unitKeyOf(r.unit);
    const unit = unitKey ? t(unitKey) : null;
    const name = r.daysFrom ? t(r.titleKey, { days: draft[r.daysFrom] }) : t(r.titleKey);
    const sub = r.subKey ? t(r.subKey) : null;
    const savedFigure = formatRuleValue(r.key, saved, lang);
    // The edited row names the value in force: "mentve 20 · arányosan" (the frame's Óránként).
    const savedLine = edited ? t('adminRules.savedValue', { value: unit ? `${savedFigure} ${unit}` : savedFigure }) : null;
    const [min, max] = boundsOf(r.key, draft, ranges);
    return (
      <ListRow
        key={r.key}
        title={name}
        // Two lines when a narrow phone or a longer language needs them; at 402 every hu sub is one.
        subLines={2}
        sub={savedLine && sub ? `${savedLine} · ${sub}` : (savedLine ?? sub ?? undefined)}
        control={
          <RuleStepper
            label={name}
            value={value}
            figure={formatRuleValue(r.key, value, lang)}
            unit={unit}
            min={min}
            max={max}
            step={r.step}
            edited={edited}
            disabled={disabled}
            onChange={(next) => onChange(r.key, next)}
          />
        }
      />
    );
  };

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <Rule strong />
      <SectionHeader
        rule={false}
        title={title}
        trailing={spec.coinHead ? <span className="text-cap text-text-3">{t('adminRules.coin')}</span> : undefined}
      />
      <RowStack>{spec.rows.map(rowOf)}</RowStack>
    </section>
  );
}

/** Where the rows will stand while `/admin/rules` loads: three sections of skeleton rows. */
function RulesSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-8">
      <span className="sr-only">{t('common.loading')}</span>
      {[3, 2, 2].map((n, i) => (
        <div key={i} aria-hidden className="flex flex-col gap-2">
          <Rule strong />
          <RowStack>
            {Array.from({ length: n }, (_, j) => (
              <ListRowSkeleton key={j} sub index={j} />
            ))}
          </RowStack>
        </div>
      ))}
    </div>
  );
}

/**
 * Szabályok (`/admin/rules`) — the admin-global point rules of LifeOS (plan L1), pushed from
 * Moderáció's "Szabályok" door row; the admin bar keeps Moderáció lit.
 *
 * lifeos/admin-rules: the back eyebrow "Moderáció" with "Alapértékek" on its row, the title, the
 * version line (the version in ink, who published it and when in text-2) and the one-line intro;
 * ten sections of rule rows, each with its stepper; MENTÉS with the unsaved-change count, the note
 * that goes into the audit log with the next version, the one lime pill and the closing line.
 *
 * ═══ A DRAFT OVER THE SET IN FORCE ═════════════════════════════════════════════════════════════
 *
 * The page keeps only the EDITS. What is shown is the set in force with the edits laid over it, so
 * a refetch (after a 409, or after somebody else published) re-bases the draft: an edit that now
 * equals the server's value simply stops counting. Nothing is saved until Mentés.
 *
 * ═══ THE WRITE ═════════════════════════════════════════════════════════════════════════════════
 *
 * PUT /admin/rules with EVERY key (the keys without a stepper travel unchanged), `expectedVersion`
 * = the version the draft was made on, and the note when there is one. The server appends a new
 * version (history is never edited) or answers `unchanged`; a 409 RULES_STALE means another admin
 * published first — the notice says so, and its "Újra" re-reads the set in force with the edits
 * kept on top of it. Not queued offline
 * (plan L9): a failed write says so and keeps the draft.
 *
 * "Alapértékek" lays the defaults over the draft for every rule that has a stepper. It saves
 * nothing by itself — it is an edit like any other, and Mentés with a note publishes it.
 */
export function RulesPage() {
  const { t, i18n } = useTranslation();
  const { data: user } = useSession();
  const isAdmin = hasRole(user, 'admin');
  const qc = useQueryClient();
  const { toast } = useToast();

  const rules = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => apiWithRefresh<AdminRulesResponse>('/admin/rules'),
    enabled: isAdmin,
  });

  const [edits, setEdits] = useState<Partial<PointRules>>({});
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<'stale' | 'failed' | null>(null);

  const save = useMutation({
    mutationFn: (body: AdminRulesPut) => apiWithRefresh<AdminRulesPutResponse>('/admin/rules', { method: 'PUT', body }),
    onSuccess: (res) => {
      qc.setQueryData<AdminRulesResponse>(RULES_KEY, (old) => (old ? { ...old, current: res.current } : old));
      setEdits({});
      setNote('');
      setOutcome(null);
      toast(t('adminRules.savedToast'), 'success');
    },
    onError: (err) => {
      setOutcome(err instanceof ApiError && err.code === 'RULES_STALE' ? 'stale' : 'failed');
    },
  });

  // The server enforces this too — this is only so a non-admin sees an explanation instead of a
  // failed request.
  if (user && !isAdmin) return <AdminForbidden />;

  const data = rules.data;
  const current = data?.current.rules;
  const draft: PointRules | null = current ? { ...current, ...edits } : null;
  const changed = current && draft ? changedKeys(current, draft) : [];
  const atDefaults = !!data && !!draft && EDITABLE_KEYS.every((k) => draft[k] === data.defaults[k]);
  const busy = save.isPending;
  const lang = i18n.resolvedLanguage ?? i18n.language;

  const edit = (key: PointRuleKey, value: number) => {
    setOutcome(null);
    setEdits((prev) => ({ ...prev, [key]: value }));
  };
  const resetToDefaults = () => {
    if (!data) return;
    setOutcome(null);
    setEdits((prev) => ({ ...prev, ...Object.fromEntries(EDITABLE_KEYS.map((k) => [k, data.defaults[k]])) }));
  };
  const submit = () => {
    if (!data || !draft || changed.length === 0) return;
    const text = note.trim();
    save.mutate({ expectedVersion: data.current.version, rules: draft, ...(text ? { note: text } : {}) });
  };

  const version = data?.current;
  const when = version
    ? new Intl.DateTimeFormat(lang, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
        new Date(version.createdAt * 1000),
      )
    : null;

  return (
    <Screen top="push">
      <ScreenHeader
        kind="push"
        title={t('adminRules.title')}
        trailing={
          data ? (
            <TextLink disabled={busy || atDefaults} onClick={resetToDefaults}>
              {t('adminRules.defaults')}
            </TextLink>
          ) : undefined
        }
      >
        {version ? (
          // 8 under the title (the header's own 4 + 4), the intro 8 under the version line.
          <div className="mt-1 flex flex-col gap-2">
            <p className="text-cap text-text-2">
              <span className="text-text-1">{t('adminRules.version', { version: version.version })}</span>
              {version.createdByName ? ` · ${version.createdByName}` : null}
              {` · ${when}`}
            </p>
            <p className="text-cap text-text-3">{t('adminRules.intro')}</p>
          </div>
        ) : null}
      </ScreenHeader>

      {rules.isPending ? (
        <RulesSkeleton />
      ) : !data || !current || !draft ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink busy={rules.isFetching} onClick={() => void rules.refetch()}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('adminRules.failed')}
        </NoticeLine>
      ) : (
        <>
          {RULE_SECTIONS.map((spec) => (
            <RuleSection key={spec.id} spec={spec} current={current} draft={draft} ranges={data.ranges} disabled={busy} onChange={edit} />
          ))}

          <section aria-label={t('adminRules.section.save')} className="flex flex-col gap-4">
            <SectionHeader
              title={t('adminRules.section.save')}
              trailing={
                changed.length > 0 ? (
                  // Plain cap text, no dot: an unsaved change is neither live nor done data.
                  <span className="text-cap text-text-2">{t('adminRules.changes', { count: changed.length })}</span>
                ) : undefined
              }
            />
            <Field
              label={t('adminRules.note')}
              value={note}
              maxLength={NOTE_MAX}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              hint={t('adminRules.noteHint', { version: data.current.version + 1 })}
            />
            {outcome ? (
              <NoticeLine
                tone={outcome === 'stale' ? 'warn' : 'danger'}
                role="alert"
                action={
                  outcome === 'stale' ? (
                    // Re-reads the set in force; the edits stay on top of it (the draft re-bases).
                    <TextLink busy={rules.isFetching} onClick={() => void rules.refetch().then(() => setOutcome(null))}>
                      {t('common.retry')}
                    </TextLink>
                  ) : undefined
                }
              >
                {t(outcome === 'stale' ? 'adminRules.stale' : 'adminRules.failed')}
              </NoticeLine>
            ) : null}
            <Pressable variant="primary" size="lg" className="w-full" busy={busy} disabled={changed.length === 0} onClick={submit}>
              {t('common.save')}
            </Pressable>
            <p className="text-cap text-text-3">{t('adminRules.appliesFrom')}</p>
          </section>
        </>
      )}
    </Screen>
  );
}
