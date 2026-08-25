import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  ListChecks,
  MessageSquare,
  Salad,
  ShieldAlert,
  Target,
  TrendingUp,
  TriangleAlert,
  UserX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { SummaryTile } from '../../ui/data/SummaryTile';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Monogram } from './Monogram';
import { NutritionTab } from './NutritionTab';
import { ProgressTab } from './ProgressTab';
import { PlanTab } from './PlanTab';
import { ChatTab } from './ChatTab';
import { usePlans } from '../plans/usePlans';
import { useClient, useClientOnboarding, type ClientOnboarding } from './useCoaching';
import { personLabel } from '../../lib/person';

/* ── tabs ─────────────────────────────────────────────────────────────────────────────────────
   The glyphs are the ones the rest of the product already spends on these two nouns: the clipboard
   is `Tervek` three rows above this strip, and the salad is `ÉTKEZÉS` in the bottom bar. `Terv` was
   a dumbbell, which on THIS screen already means "completed sessions" — the same glyph for two
   different facts, a thumb's width apart. */
const TABS = [
  { key: 'plan', icon: ClipboardList },
  { key: 'nutrition', icon: Salad },
  { key: 'progress', icon: TrendingUp },
  { key: 'chat', icon: MessageSquare },
] as const;
type TabKey = (typeof TABS)[number]['key'];

type Limitation = ClientOnboarding['limitations'][number];

/* ── pieces ───────────────────────────────────────────────────────────────────────────────── */

/** One label/value line. It exists ONLY inside the questionnaire sheet now. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-body-s text-text-2">{label}</span>
      <span className="text-body text-right font-medium text-text-1">{value}</span>
    </div>
  );
}

/**
 * A promoted questionnaire answer: the caption above, the answer below, an icon holder beside.
 *
 * Two tones, because `Kerülendő` and `Óvatosan` are different instructions and flattening them into
 * one amber would tell a coach that a knee to be careful with and a knee that must not run are the
 * same fact. `strong` is `avoid` only.
 */
function AnswerTile({
  icon: Icon,
  caption,
  value,
  note,
  extra,
  tone = 'neutral',
  className,
}: {
  icon: LucideIcon;
  caption: string;
  value: string;
  note?: string | null;
  /** How many further flagged areas this tile is NOT showing. */
  extra?: number;
  tone?: 'neutral' | 'soft' | 'strong';
  className?: string;
}) {
  // `strong` fills the card; `soft` keeps the ordinary card and spends the amber on the glyph and
  // the caption only. Two visibly different weights of the SAME alert colour, because
  // `kerülendő` and `óvatosan` are two weights of the same instruction — reaching for danger red
  // would file "be careful with this knee" alongside "this operation failed".
  const shell = tone === 'strong' ? 'border-warning-border bg-warning-subtle' : '';
  const holder =
    tone === 'neutral' ? 'bg-accent-subtle text-accent' : 'bg-[var(--warning-subtle)] text-warning';
  const captionTone = tone === 'neutral' ? 'text-text-3' : 'text-warning';

  return (
    <Surface className={cn('flex items-start gap-tight', shell, className)}>
      <span className={cn('inline-grid size-11 shrink-0 place-items-center rounded-chip', holder)} aria-hidden>
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        {/* Concatenated, not `cn`: twMerge files a custom type scale and a colour in the same
            bucket and would drop `text-micro`. */}
        <p className={`text-micro uppercase ${captionTone}`}>{caption}</p>
        <p className="text-body-strong mt-1 text-text-1">
          {value}
          {extra && extra > 0 ? (
            // The remainder is a COUNT rather than a silence. A coach who reads one limitation and
            // assumes it is the whole list is exactly the failure this data exists to prevent.
            <span className="text-micro ms-2 rounded-chip bg-[var(--warning-subtle)] px-2 py-0.5 align-middle tabular-nums text-warning">
              +{extra}
            </span>
          ) : null}
        </p>
        {/* The client's own words, in the client's own language. Never translated — a
            machine-translated injury description is worse than the original. */}
        {note ? <p className="text-body-s mt-1 text-text-2">{note}</p> : null}
      </div>
    </Surface>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────────────────────── */

/**
 * One client, in full.
 *
 * ═══ THE ELEVEN-ROW TABLE IS GONE ══════════════════════════════════════════════════════════════
 *
 * This screen was wall-to-wall label/value rows: goal, weekly sessions, location, experience,
 * session length, height, weight, birth year, sex, equipment, free-text notes, plus a Több/Kevesebb
 * toggle — and the plan list, the reason a coach opens the page at all, started underneath all of
 * it.
 *
 * Two answers were promoted to tiles (goal, and the worst limitation), one number became a stat
 * tile, and the remaining rows moved behind the `Kérdőív` disclosure — into a SHEET rather than a
 * route, because the coach reads the questionnaire *against* the plan list and must not lose their
 * place in it.
 *
 * ═══ THE ANCHOR IS A PERSON, NOT THEIR DATA ════════════════════════════════════════════════════
 *
 * A large monogram in a status ring. Every other candidate anchor — a chart, a ring of numbers —
 * would have made the screen about the data instead. The ring is not decoration: it carries the
 * handover state, accent for an account the client owns and amber for one whose password the coach
 * still knows.
 */
export function ClientDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const linkId = Number.parseInt(params.id ?? '', 10);
  const { data, isPending, isError } = useClient(Number.isFinite(linkId) ? linkId : null);
  const onboarding = useClientOnboarding(Number.isFinite(linkId) ? linkId : null);
  // NO SECOND ENDPOINT. `GET /plans` is the query `PlanTab` already runs; asking for it here too
  // hits the same react-query key, so the `TERV` tile costs one cache read rather than a request.
  const plans = usePlans();
  const [tab, setTab] = useState<TabKey>('plan');
  const [profileOpen, setProfileOpen] = useState(false);

  if (isPending) {
    // Same geometry as the real thing: a circle where the avatar goes, a title bar, three tiles.
    return (
      <div className="col-wide screen-x flex flex-col gap-section py-6">
        <Skeleton className="h-6 w-24" />
        <div className="flex flex-col items-center gap-group">
          <Skeleton className="size-[132px] rounded-full" />
          <Skeleton className="h-7 w-64" />
        </div>
        <div className="grid grid-cols-3 gap-group">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[140px] rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  // The server returns 404 for "not yours", "archived" and "never existed" alike, so the UI shows
  // one message for all three. Distinguishing them here would rebuild the oracle the API refuses
  // to be — and it is also the role gate: the link id is what carries the proof of access.
  if (isError || !data?.client) {
    return (
      <div className="col-wide screen-x flex flex-col gap-group py-6">
        <EmptyState
          icon={UserX}
          heading="h1"
          title={t('coaching.clientMissingTitle')}
          body={t('coaching.clientMissingBody')}
          action={
            <Pressable
              variant="secondary"
              onClick={() => history.back()}
              icon={<ArrowLeft className="size-icon-s" aria-hidden />}
            >
              {t('common.back')}
            </Pressable>
          }
        />
      </div>
    );
  }

  const c = data.client;
  const pending = c.must_change_credentials === 1;
  const p = onboarding.data?.profile ?? null;

  /* `Régi, már nem fáj` never surfaces here — it is filtered out before the tile is built.
     `Kerülendő` outranks `Óvatosan`, so the tile promotes the worst one and counts the rest. */
  const flagged = (p?.limitations ?? [])
    .filter((l: Limitation) => l.severity !== 'past')
    .sort((a: Limitation, b: Limitation) =>
      a.severity === b.severity ? 0 : a.severity === 'avoid' ? -1 : 1,
    );
  const worst = flagged[0] ?? null;
  const multiFlag = flagged.length > 1;

  const planCount = plans.data?.plans.filter((x) => x.coach_client_id === linkId).length ?? 0;

  return (
    <div className="col-wide screen-x flex flex-col gap-section py-6">
      <Link
        to="/coach"
        className="text-body-s inline-flex min-h-[var(--target-min)] items-center gap-2 self-start text-text-2"
      >
        <ArrowLeft className="size-icon-s" aria-hidden />
        {t('coaching.title')}
      </Link>

      {/* ── anchor + identity ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-group text-center">
        <div className="relative">
          <div
            className={cn(
              'grid size-[132px] place-items-center rounded-full border-4',
              pending ? 'border-[var(--warning)]' : 'border-accent',
            )}
          >
            <Monogram person={c} size="lg" />
          </div>
          {/* Decorative: when it is amber, the banner directly below says the same thing in
              words, and when it is a check there is nothing to announce. */}
          <span
            aria-hidden
            className={cn(
              'absolute bottom-0 right-0 grid size-8 place-items-center rounded-chip',
              'border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-1',
              pending ? 'text-warning' : 'text-accent',
            )}
          >
            {pending ? (
              <TriangleAlert className="size-icon-s" strokeWidth={2} />
            ) : (
              <BadgeCheck className="size-icon-s" strokeWidth={2} />
            )}
          </span>
        </div>

        <div className="flex flex-col items-center gap-tight">
          {/* Wraps, never truncates: the e-mail is the client's name on this screen. */}
          <h1 className="text-title-1 break-words text-text-1">{personLabel(c)}</h1>
          <div className="text-body-s flex flex-wrap items-center justify-center gap-tight text-text-2">
            {c.team_name ? (
              <span className="rounded-chip bg-surface-2 px-3 py-2 text-text-1">{c.team_name}</span>
            ) : null}
            <span>{t(`coaching.origin.${c.origin}`)}</span>
          </div>
        </div>
      </div>

      {pending ? (
        <Surface className="flex items-start gap-group border-warning-border bg-warning-subtle">
          <span
            aria-hidden
            className="inline-grid size-11 shrink-0 place-items-center rounded-chip bg-[var(--warning-subtle)] text-warning"
          >
            <TriangleAlert className="size-icon-m" strokeWidth={2} />
          </span>
          <p className="text-body-s measure text-text-2">{t('coaching.handoverBody')}</p>
        </Surface>
      ) : null}

      {/* ── the three numbers ────────────────────────────────────────────────────────────────
          `align="center"` and `captionCase="upper"` on all three, as 07-coach-client-detail-terv.webp
          draws them: puck over figure over an eyebrow (`EDZÉS / 28 NAP`), one axis per tile. The
          caption is an eyebrow here rather than metadata because it names the METRIC — the header
          above already carries the client, so these three lines are the only labels in the block. */}
      <div className="grid grid-cols-3 gap-group">
        <SummaryTile
          icon={Dumbbell}
          align="center"
          captionCase="upper"
          value={c.sessions_28d ?? 0}
          // The window is part of the fact. A bare "6 edzés" reads as a lifetime total.
          caption={`${t('coaching.sessions')} / ${t('plans.dayCount', { count: 28 })}`}
        />
        <SummaryTile
          icon={CalendarDays}
          align="center"
          captionCase="upper"
          // A dash rather than a zero when there is no questionnaire: nobody answered, which is
          // not the same claim as "they train zero times a week".
          value={p?.sessions_per_week ?? '—'}
          caption={t('onboarding.field.sessions_per_week')}
        />
        <SummaryTile
          icon={ClipboardList}
          align="center"
          captionCase="upper"
          value={plans.isPending ? '—' : planCount}
          caption={t('nav.plans')}
        />
      </div>

      {/* ── the two answers that change what gets written ──────────────────────────────────── */}
      {onboarding.isPending ? (
        <div className="grid grid-cols-2 gap-group">
          <Skeleton className="h-[104px] rounded-card" />
          <Skeleton className="h-[104px] rounded-card" />
        </div>
      ) : !p ? (
        <Surface>
          <p className="text-body-s text-text-2">{t('coaching.noProfile')}</p>
        </Surface>
      ) : (
        // Two columns at phone width, not from `sm` up: this project has no custom `sm`, so the
        // prefix meant 640px and the pair stacked on every phone the app is used on. The three
        // stat tiles directly above already commit to an unconditional `grid-cols-3`.
        <div className={cn('grid gap-group', worst && 'grid-cols-2')}>
          <AnswerTile
            icon={Target}
            caption={t('onboarding.field.primary_goal')}
            value={p.primary_goal ? t(`onboarding.goal.${p.primary_goal}`) : '—'}
          />
          {worst ? (
            <AnswerTile
              icon={ShieldAlert}
              tone={worst.severity === 'avoid' ? 'strong' : 'soft'}
              caption={t('coaching.limitations')}
              value={`${t(`onboarding.area.${worst.body_area}`)} — ${t(`onboarding.sev.${worst.severity}`)}`}
              note={worst.note}
              extra={flagged.length - 1}
            />
          ) : null}
        </div>
      )}

      {/* ── everything else the client answered ────────────────────────────────────────────── */}
      <Pressable
        variant="secondary"
        onClick={() => setProfileOpen(true)}
        className={cn(
          'h-auto w-full justify-between rounded-card px-4 py-3 whitespace-normal',
          // A tile that shows one of several limitations must not be the only signal that there
          // are more. The door to the full list takes the alert tone too.
          multiFlag && 'border-[var(--warning-border)]',
        )}
      >
        <span className="flex min-w-0 items-center gap-tight">
          <ListChecks className="size-icon-m shrink-0 text-text-2" aria-hidden />
          {/* Its own key. The sheet this row opens is titled `Kérdőív`; the row is the door to the
              WHOLE of it, and one key serving both made the row and its destination the same
              word. */}
          <span className="text-body truncate text-text-1">{t('coaching.profileFull')}</span>
        </span>
        <span className="flex shrink-0 items-center gap-tight">
          {/* A word, not a bare glyph. `Hiányos` is the state itself; a lone triangle needed an
              `aria-label` to say anything and said nothing at all to a sighted reader who has not
              met it before. The full sentence still lives inside the sheet, where acting on the
              incomplete answers begins. */}
          {p?.status === 'draft' ? (
            <span className="text-caption rounded-chip bg-warning-subtle px-2 py-0.5 text-warning">
              {t('coaching.profileIncomplete')}
            </span>
          ) : null}
          <ChevronRight className="size-icon-m text-text-3" aria-hidden />
        </span>
      </Pressable>

      {/* ── the four working surfaces ──────────────────────────────────────────────────────── */}
      {/* `role="tablist"` with real keyboard semantics rather than four buttons that merely look
          like tabs — arrow keys move between them, which is what a screen-reader user will try
          first. */}
      <div className="flex flex-col gap-group">
        <div
          role="tablist"
          aria-label={t('coaching.tabs')}
          className="-mx-1 flex gap-tight overflow-x-auto px-1 py-1"
          onKeyDown={(e) => {
            const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            const i = TABS.findIndex((x) => x.key === tab);
            setTab(TABS[(i + dir + TABS.length) % TABS.length].key);
          }}
        >
          {TABS.map(({ key, icon: Icon }: { key: TabKey; icon: LucideIcon }) => (
            <Pressable
              key={key}
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              // The selected tab is a SELECTION, not the screen's action. As a filled `primary` it
              // was a second one beside `Új terv a kliensnek` — and the wider of the two — which
              // is the one-primary-per-screen rule failing where it is most visible. `accent-subtle`
              // is the app's declared "this one is selected" wash, and `secondary` already inks it
              // at `--text-1`, which is exactly what `--on-accent-subtle` resolves to (DESIGN.md 63
              // forbids `text-accent` here). No text class is passed for that reason AND because
              // `cn` is `twMerge`: any `text-*` from a call site silently eats the density's
              // `text-body-s` and the chip would come out a different size from its neighbours.
              variant="secondary"
              shape="chip"
              density="compact"
              className={cn('shrink-0', tab === key && 'border-accent bg-accent-subtle')}
              onClick={() => setTab(key)}
              icon={<Icon className="size-icon-s" aria-hidden />}
            >
              {t(`coaching.tab.${key}`)}
            </Pressable>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-h-40">
          {tab === 'progress' ? (
            <ProgressTab linkId={linkId} />
          ) : tab === 'plan' ? (
            <PlanTab linkId={linkId} />
          ) : tab === 'chat' ? (
            <ChatTab linkId={linkId} />
          ) : (
            // ALL FOUR TABS HAVE A FEATURE, and TypeScript is what said so: with nutrition wired,
            // `tab` narrowed to `never` in the fallback and the "arrives in phase N" placeholder
            // stopped compiling.
            <NutritionTab linkId={linkId} />
          )}
        </div>
      </div>

      {/* ── the questionnaire, in full ─────────────────────────────────────────────────────── */}
      <Sheet open={profileOpen} onClose={() => setProfileOpen(false)} title={t('coaching.profileTitle')}>
        {p ? (
          <div className="flex flex-col gap-group">
            {/* The full sentence lives HERE, where acting on incomplete answers actually begins.
                On the page it is a glyph; a coach about to write a plan gets the whole warning. */}
            {p.status === 'draft' ? (
              <Surface className="flex items-start gap-tight border-warning-border bg-warning-subtle">
                <TriangleAlert className="size-icon-m mt-0.5 shrink-0 text-warning" strokeWidth={2} aria-hidden />
                <p className="text-body-s text-text-1">{t('coaching.profileDraft')}</p>
              </Surface>
            ) : null}

            <div className="flex flex-col">
              <Row
                label={t('onboarding.step.goal.title')}
                value={p.primary_goal ? t(`onboarding.goal.${p.primary_goal}`) : '—'}
              />
              <Row
                label={t('onboarding.sessionsPerWeek')}
                value={p.sessions_per_week ? String(p.sessions_per_week) : '—'}
              />
              <Row
                label={t('onboarding.location')}
                value={p.training_location ? t(`onboarding.loc.${p.training_location}`) : '—'}
              />
              <Row
                label={t('onboarding.experience')}
                value={p.experience ? t(`onboarding.exp.${p.experience}`) : '—'}
              />
              <Row
                label={t('onboarding.sessionMinutes')}
                value={p.session_minutes ? `${p.session_minutes} ${t('common.minutesShort')}` : '—'}
              />
              <Row label={t('onboarding.heightCm')} value={p.height_cm ? `${p.height_cm} cm` : '—'} />
              <Row label={t('onboarding.weightKg')} value={p.bodyweight_kg ? `${p.bodyweight_kg} kg` : '—'} />
              <Row label={t('onboarding.birthYear')} value={p.birth_year ? String(p.birth_year) : '—'} />
              <Row label={t('onboarding.sex')} value={p.sex ? t(`onboarding.sexOpt.${p.sex}`) : '—'} />
              <Row
                label={t('onboarding.equipment')}
                value={
                  p.equipment.length
                    ? p.equipment.map((e: ClientOnboarding['equipment'][number]) => e.name).join(', ')
                    : '—'
                }
              />
            </div>

            {/* Every flagged area, not just the promoted one. */}
            {flagged.length ? (
              <Surface
                elevation="inset"
                className="flex flex-col gap-tight border-warning-border bg-warning-subtle"
              >
                <p className="text-micro uppercase text-warning">{t('coaching.limitations')}</p>
                {flagged.map((l: Limitation) => (
                  <p key={l.body_area} className="text-body-s text-text-1">
                    <span className="font-medium">{t(`onboarding.area.${l.body_area}`)}</span>
                    {' — '}
                    {t(`onboarding.sev.${l.severity}`)}
                    {l.note ? <span className="text-text-2"> · {l.note}</span> : null}
                  </p>
                ))}
              </Surface>
            ) : null}

            {p.notes ? (
              <div className="flex flex-col gap-tight">
                <span className="text-body-s text-text-2">{t('onboarding.notes')}</span>
                <p className="text-body whitespace-pre-wrap text-text-1">{p.notes}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-body-s text-text-2">{t('coaching.noProfile')}</p>
        )}
      </Sheet>
    </div>
  );
}
