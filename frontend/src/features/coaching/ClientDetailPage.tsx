import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ArrowLeft, TriangleAlert, Dumbbell, Apple, TrendingUp, MessageSquare, UserX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NutritionTab } from './NutritionTab';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useClient, useClientOnboarding, type ClientOnboarding } from './useCoaching';
import { ProgressTab } from './ProgressTab';
import { PlanTab } from './PlanTab';
import { ChatTab } from './ChatTab';

/* ── tabs ─────────────────────────────────────────────────────────────────────────────────── */
// The four tabs the blueprint specifies. Three of them have no feature behind them yet, and they
// say so rather than being hidden: a coach who cannot find the nutrition tab assumes the product
// lacks it, while a tab that names its phase tells them it is coming and stops them looking.
const TABS = [
  { key: 'plan', icon: Dumbbell },
  { key: 'nutrition', icon: Apple },
  { key: 'progress', icon: TrendingUp },
  { key: 'chat', icon: MessageSquare },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/* ── the onboarding panel ─────────────────────────────────────────────────────────────────── */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-body-s text-text-2">{label}</span>
      <span className="text-body text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * The client's questionnaire answers.
 *
 * It sits ABOVE the tabs rather than inside one, because it is context the coach needs while
 * looking at any of them — an avoid-list matters most exactly when the plan tab is open. Putting
 * it in a tab would mean reading it, switching away, and trying to remember it.
 */
function OnboardingPanel({ linkId }: { linkId: number }) {
  const { t } = useTranslation();
  const { data, isPending } = useClientOnboarding(linkId);
  const [open, setOpen] = useState(false);

  if (isPending) return <Skeleton className="h-24 w-full rounded-card" />;

  const p = data?.profile;
  if (!p) {
    return (
      <div className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
        <p className="text-body-s text-text-2">{t('coaching.noProfile')}</p>
      </div>
    );
  }

  const avoid = p.limitations.filter((l: ClientOnboarding['limitations'][number]) => l.severity !== 'past');

  return (
    <section className="flex flex-col gap-4 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-title-3 font-display">{t('coaching.profileTitle')}</h2>
          {p.status === 'draft' ? (
            // A draft is not a finished answer set. Saying so stops a coach building a plan on
            // half an answer without realising it.
            <p className="text-body-s text-warning">{t('coaching.profileDraft')}</p>
          ) : null}
        </div>
        <Pressable variant="ghost" density="compact" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {t(open ? 'common.less' : 'common.more')}
        </Pressable>
      </div>

      {/* The three answers that change what a coach writes are always visible; the rest is behind
          the toggle. A panel that shows everything is a panel nobody reads. */}
      <div className="flex flex-col">
        <Row label={t('onboarding.step.goal.title')} value={p.primary_goal ? t(`onboarding.goal.${p.primary_goal}`) : '—'} />
        <Row
          label={t('onboarding.sessionsPerWeek')}
          value={p.sessions_per_week ? String(p.sessions_per_week) : '—'}
        />
        <Row label={t('onboarding.location')} value={p.training_location ? t(`onboarding.loc.${p.training_location}`) : '—'} />
      </div>

      {avoid.length ? (
        // Limitations are surfaced unconditionally, never behind the toggle. This is the one
        // answer where a coach not seeing it can hurt someone.
        <div className="flex flex-col gap-2 rounded-card border border-danger-border bg-danger-subtle p-3">
          <p className="text-micro uppercase text-danger">{t('coaching.limitations')}</p>
          {avoid.map((l: ClientOnboarding['limitations'][number]) => (
            <p key={l.body_area} className="text-body-s">
              <span className="font-medium">{t(`onboarding.area.${l.body_area}`)}</span>
              {' — '}
              {t(`onboarding.sev.${l.severity}`)}
              {l.note ? <span className="text-text-2"> · {l.note}</span> : null}
            </p>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="flex flex-col border-t border-[var(--surface-border)] pt-4">
          <Row label={t('onboarding.experience')} value={p.experience ? t(`onboarding.exp.${p.experience}`) : '—'} />
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
            value={p.equipment.length ? p.equipment.map((e: ClientOnboarding['equipment'][number]) => e.name).join(', ') : '—'}
          />
          {p.notes ? (
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-body-s text-text-2">{t('onboarding.notes')}</span>
              {/* The client's own words, in the client's own language. Never translated — a
                  machine-translated injury description is worse than the original. */}
              <p className="whitespace-pre-wrap text-body">{p.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────────────────────── */

export function ClientDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const linkId = Number.parseInt(params.id ?? '', 10);
  const { data, isPending, isError } = useClient(Number.isFinite(linkId) ? linkId : null);
  const [tab, setTab] = useState<TabKey>('plan');

  if (isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-6">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    );
  }

  // The server returns 404 for "not yours", "archived" and "never existed" alike, so the UI shows
  // one message for all three. Distinguishing them here would rebuild the oracle the API refuses
  // to be.
  if (isError || !data?.client) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-6">
        <EmptyState icon={UserX} heading="h1" title={t('coaching.clientMissingTitle')} body={t('coaching.clientMissingBody')} />
        <Pressable variant="secondary" onClick={() => history.back()} icon={<ArrowLeft className="size-icon-s" aria-hidden />}>
          {t('common.back')}
        </Pressable>
      </div>
    );
  }

  const c = data.client;

  return (
    <div className="col-mobile screen-x flex flex-col gap-8 py-6">
      <Link to="/coach" className="inline-flex min-h-[var(--target-min)] items-center gap-2 text-body-s text-text-2">
        <ArrowLeft className="size-icon-s" aria-hidden />
        {t('coaching.title')}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="break-all text-title-1 font-display">{c.email}</h1>
        <div className="flex flex-wrap items-center gap-2 text-body-s text-text-2">
          {c.team_name ? <span className="rounded-chip bg-surface-2 px-2 py-1">{c.team_name}</span> : null}
          <span>{t(`coaching.origin.${c.origin}`)}</span>
        </div>
      </header>

      {c.must_change_credentials ? (
        <div className="flex items-start gap-3 rounded-card border border-warning-border bg-warning-subtle p-4">
          <TriangleAlert className="size-icon-m shrink-0 text-warning" aria-hidden />
          <p className="text-body-s">{t('coaching.handoverBody')}</p>
        </div>
      ) : null}

      <OnboardingPanel linkId={linkId} />

      {/* Tabs. `role="tablist"` with real keyboard semantics rather than four buttons that merely
          look like tabs — arrow keys move between them, which is what a screen-reader user will
          try first. */}
      <div
        role="tablist"
        aria-label={t('coaching.tabs')}
        className="flex gap-2 overflow-x-auto"
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
            variant={tab === key ? 'primary' : 'ghost'}
            shape="chip"
            density="compact"
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
          // ALL FOUR TABS NOW HAVE A FEATURE, and TypeScript is what said so: with nutrition
          // wired, `tab` narrowed to `never` in the fallback and the "arrives in phase N"
          // placeholder stopped compiling. A placeholder that outlives the thing it was waiting
          // for is the same shape as the dashboard comment that still said nothing logs a workout
          // — except the compiler catches this one.
          <NutritionTab linkId={linkId} />
        )}
      </div>
    </div>
  );
}
