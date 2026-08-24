import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { AlertCircle, ChevronRight, ClipboardList, Plus, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { CountUp } from '../../ui/feedback/CountUp';
import { usePlans, useCreatePlan, type PlanSummary } from './usePlans';
import { useOnline } from './useOnline';

type PlanStatus = PlanSummary['status'];

/**
 * The status pipeline, in reading order.
 *
 * `draft → active → ended` is the life of a plan, and the bar reads left to right the way that
 * pipeline does — which is the whole reason the anchor is a bar and not a ring. `paused` is a
 * detour off `active` and sits beside it; it renders only when something is actually paused, so
 * the ordinary library shows the three the design names and never an empty fourth segment.
 */
const STATUS_ORDER = ['active', 'draft', 'paused', 'ended'] as const;

/** The bar's segments. Accent for live work, ink for drafts, the faintest edge for what is over. */
const SEGMENT_FILL: Record<PlanStatus, string> = {
  active: 'bg-accent',
  draft: 'bg-text-3',
  paused: 'bg-warning',
  ended: 'bg-[var(--surface-border-strong)]',
};

/** The row chip. Only `active` and `paused` spend a colour — a draft is not a warning. */
const CHIP_TONE: Record<PlanStatus, string> = {
  active: 'bg-success-subtle text-success',
  draft: 'bg-surface-2 text-text-2',
  paused: 'bg-warning-subtle text-warning',
  ended: 'bg-surface-2 text-text-3',
};

/** `anna@example.com` → `AN`. Two letters is what fits, and it is enough to tell two clients apart. */
const monogram = (source: string) => source.trim().slice(0, 2).toUpperCase();

/**
 * The coach's plan library — [[55-Screens/coach-plans]].
 *
 * ═══ THE ANCHOR IS A BAR, AND THE CREATE FORM IS GONE ══════════════════════════════════════════
 *
 * The screen used to open with a text field, a character counter and a two-line hint, so the list —
 * the entire reason to be here — started below the fold. It now opens with the one number a coach
 * cannot get by scrolling: how much of the library is actually live.
 *
 * Naming moved rather than disappeared. `Új terv` creates a draft and goes straight to the editor
 * with the name focused and selected, which is a better moment to name a thing than before it
 * exists. The relocated hint is the empty state's body, the only time a coach does not already
 * know it.
 */
export function PlanListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const online = useOnline();
  const plans = usePlans();
  const create = useCreatePlan();

  const rows = plans.data?.plans ?? [];
  const templates = rows.filter((p) => p.scope === 'template');
  const clients = rows.filter((p) => p.scope === 'client');

  // ONE array, two partitions. The legend cuts by status, the sections cut by scope, and both
  // counts are derived here rather than fetched — two independent counts are two things that can
  // disagree with each other on screen.
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: rows.filter((p) => p.status === status).length,
  })).filter((s) => s.count > 0);

  const startPlan = async () => {
    // A default name, because the editor is where it gets typed. See the note on `focusName`
    // in PlanEditorPage: without that focus this list fills with rows that all read the same.
    const created = await create.mutateAsync({ name: t('plans.newName') });
    void navigate(`/coach/plans/${created.id}`, { state: { focusName: true } });
  };

  const StatusChip = ({ status }: { status: PlanStatus }) => (
    <span className={cn('text-micro rounded-chip px-2 py-1', CHIP_TONE[status])}>
      {t(`plans.status.${status}`)}
    </span>
  );

  const SectionHead = ({ icon: Icon, title, count, id }: { icon: LucideIcon; title: string; count: number; id: string }) => (
    <div className="flex items-center gap-group">
      <span
        aria-hidden
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-accent-subtle text-accent"
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>
      <h2 id={id} className="text-title-2 min-w-0 flex-1 truncate text-text-1">
        {title}
      </h2>
      <span className="text-caption inline-flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-2 tabular-nums text-text-2">
        {count}
      </span>
    </div>
  );

  const Row = ({ plan }: { plan: PlanSummary }) => (
    <li>
      <Surface
        as={Link}
        to={`/coach/plans/${plan.id}`}
        interactive
        className="flex min-h-[var(--target-min)] items-center gap-group"
      >
        {plan.client_email ? (
          <span
            aria-hidden
            className="text-body-s inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-surface-2 font-display text-text-2"
          >
            {monogram(plan.client_email.split('@')[0])}
          </span>
        ) : null}

        <span className="flex min-w-0 flex-1 flex-col gap-tight">
          <span className="text-body-strong block truncate text-text-1">{plan.name}</span>
          {/* The address left the row because four wrapping near-identical strings were four rows
              of noise. It is still ANNOUNCED — the monogram is a picture, and a picture of two
              letters is not a client's name to a screen reader. */}
          {plan.client_email ? <span className="sr-only">{plan.client_email}</span> : null}
          <span className="flex flex-wrap items-center gap-tight">
            <StatusChip status={plan.status} />
            <span className="text-caption tabular-nums text-text-2">
              {t('plans.dayCount', { count: plan.day_count })} ·{' '}
              {t('plans.cycle', { days: plan.cycle_days })}
            </span>
          </span>
        </span>

        <ChevronRight className="size-icon-m shrink-0 text-text-3" aria-hidden />
      </Surface>
    </li>
  );

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      <header>
        <p className="text-micro uppercase text-accent">{t('plans.eyebrow')}</p>
        <h1 className="text-title-1 font-display">{t('plans.title')}</h1>
      </header>

      {plans.isPending ? (
        // The skeleton carries the NEW geometry: anchor card, then rows at their real height, so
        // nothing moves when the data lands.
        <div className="flex flex-col gap-section" role="status" aria-busy="true">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-40 w-full rounded-card" />
          <div className="flex flex-col gap-group">
            <Skeleton className="h-[88px] w-full rounded-card" />
            <Skeleton className="h-[88px] w-full rounded-card" />
          </div>
        </div>
      ) : plans.isError ? (
        // Generic, and the anchor is not drawn: a bar built from a partial list is a lie with a
        // shape. This is also what a member who reaches the URL sees — the server refuses, and it
        // is the server's refusal that matters, not the nav.
        <Surface role="alert" className="flex flex-wrap items-center gap-group">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-field bg-danger-subtle text-danger"
          >
            <AlertCircle className="size-icon-m" strokeWidth={2} />
          </span>
          <p className="text-body-s min-w-0 flex-1 text-text-2">{t('auth.errors.generic')}</p>
          <Pressable density="compact" onClick={() => void plans.refetch()}>
            {t('common.retry')}
          </Pressable>
        </Surface>
      ) : (
        <>
          {/* An empty library gets no anchor: a bar of zero segments is a decoration. */}
          {rows.length > 0 ? (
            <Surface className="flex flex-col items-center gap-tight">
              <p className="text-display font-display tabular-nums text-text-1">
                <CountUp to={rows.length} />
              </p>
              <p className="text-micro uppercase text-text-3">{t('nav.plans')}</p>

              {/* The bar is decoration with a shape — every number in it is spelled out in the
                  legend below, as text, which is what a reader actually gets. */}
              <div aria-hidden className="mt-1 flex h-6 w-full gap-1">
                {byStatus.map(({ status, count }) => (
                  <span
                    key={status}
                    className={cn('rounded-field', SEGMENT_FILL[status])}
                    style={{ flexGrow: count }}
                  />
                ))}
              </div>

              <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-group gap-y-tight">
                {byStatus.map(({ status, count }) => (
                  <li key={status} className="text-body-s flex items-center gap-tight text-text-2">
                    <span
                      aria-hidden
                      className={cn('size-2 shrink-0 rounded-chip', SEGMENT_FILL[status])}
                    />
                    {t(`plans.status.${status}`)}
                    <span className="tabular-nums text-text-1">{count}</span>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}

          <Pressable
            variant="primary"
            className="w-full"
            icon={<Plus className="size-icon-s" aria-hidden />}
            busy={create.isPending}
            disabled={!online}
            onClick={() => void startPlan()}
          >
            {t('plans.create')}
          </Pressable>

          {rows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t('plans.emptyTitle')}
              body={t('plans.emptyBody')}
            />
          ) : (
            <>
              {/* An empty section renders nothing at all — not an empty heading with a zero. */}
              {templates.length ? (
                <section aria-labelledby="tpl-heading" className="flex flex-col gap-group">
                  <SectionHead
                    id="tpl-heading"
                    icon={ClipboardList}
                    title={t('plans.templates')}
                    count={templates.length}
                  />
                  <ul className="flex flex-col gap-group">
                    {templates.map((p) => (
                      <Row key={p.id} plan={p} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {clients.length ? (
                <section aria-labelledby="cli-heading" className="flex flex-col gap-group">
                  <SectionHead
                    id="cli-heading"
                    icon={User}
                    title={t('plans.clientPlans')}
                    count={clients.length}
                  />
                  <ul className="flex flex-col gap-group">
                    {clients.map((p) => (
                      <Row key={p.id} plan={p} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
