import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CalendarDays, ClipboardList, Copy, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { usePlans, useCreatePlan, useClonePlan, type PlanSummary } from '../plans/usePlans';

/**
 * The client detail screen's Plan tab.
 *
 * NO NEW ENDPOINT. `GET /plans` already returns every plan this coach authored with its
 * `coach_client_id`, so "this client's plans" is a filter over data the screen would fetch anyway —
 * and the coach's ownership predicate stays in the ONE place it already lives rather than being
 * restated in a second query written for this tab.
 *
 * The filter is deliberately on `coach_client_id`, not on `client_user_id`: the link is the
 * authority everywhere else in this product, and archiving it must take the plans out of view with
 * it. Matching on the user id would keep showing a departed client's programme.
 */

const STATUS_TONE: Record<PlanSummary['status'], string> = {
  active: 'bg-success/15 text-success',
  draft: 'bg-surface-3 text-text-2',
  paused: 'bg-warning/15 text-warning',
  ended: 'bg-surface-3 text-text-3',
};

function PlanCard({ plan }: { plan: PlanSummary }) {
  const { t } = useTranslation();
  const dates = [plan.starts_on, plan.ends_on].filter(Boolean).join(' → ');

  return (
    <li>
      <Link
        to={`/coach/plans/${plan.id}`}
        className={cn(
          'flex min-h-[var(--target-min)] flex-col gap-2 rounded-card border border-[var(--surface-border)]',
          'bg-surface-1 p-4 transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)]',
          'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-body font-medium text-text-1">{plan.name}</span>
          <span className={cn('text-caption shrink-0 rounded-chip px-2 py-0.5', STATUS_TONE[plan.status])}>
            {t(`plans.status.${plan.status}`)}
          </span>
        </div>

        <div className="text-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-text-2">
          <span className="inline-flex items-center gap-1">
            <ClipboardList className="size-icon-s" aria-hidden />
            {t('plans.dayCount', { count: plan.day_count })}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-icon-s" aria-hidden />
            {t('plans.cycle', { days: plan.cycle_days })}
          </span>
          {/* A plan with no start date generates no occurrences — it is invisible on the client's
              home screen no matter what its status says. Saying so here is the difference between
              a coach finding that out now and finding it out from a confused client. */}
          {plan.starts_on ? <span>{dates}</span> : <span className="text-warning">{t('plans.needsStart')}</span>}
        </div>
      </Link>
    </li>
  );
}

export function PlanTab({ linkId }: { linkId: number }) {
  const { t } = useTranslation();
  const { data, isPending } = usePlans();
  const createPlan = useCreatePlan();
  const clonePlan = useClonePlan();
  const [cloning, setCloning] = useState(false);

  const plans = data?.plans ?? [];
  const mine = useMemo(
    () => plans.filter((p) => p.coach_client_id === linkId),
    [plans, linkId],
  );
  // Only templates can be cloned ONTO a client. A client-scoped plan belongs to someone already,
  // and personal plans are the coach's own training.
  const templates = useMemo(() => plans.filter((p) => p.scope === 'template'), [plans]);

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {mine.length ? (
        <ul className="flex flex-col gap-3">
          {mine.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={ClipboardList} title={t('plans.noneForClient')} body={t('plans.noneForClientBody')} />
      )}

      <div className="flex flex-wrap gap-2">
        <Pressable
          variant="primary"
          busy={createPlan.isPending}
          icon={<Plus className="size-icon-s" aria-hidden />}
          // The plan is created THROUGH the link — the server's INSERT ... SELECT carries the
          // ownership check, so this sends the link id and nothing else that matters.
          onClick={() =>
            createPlan.mutate({ name: t('plans.newName'), coach_client_id: linkId, cycle_days: 7 })
          }
        >
          {t('plans.newForClient')}
        </Pressable>

        {templates.length ? (
          <Pressable
            variant="secondary"
            aria-expanded={cloning}
            icon={<Copy className="size-icon-s" aria-hidden />}
            onClick={() => setCloning((v) => !v)}
          >
            {t('plans.cloneOpen')}
          </Pressable>
        ) : null}
      </div>

      {/* The template list is revealed rather than shown in a dialog: on a phone a dialog over this
          tab hides the plans the coach is comparing against. */}
      {cloning ? (
        <ul className="flex flex-col gap-2 rounded-card border border-[var(--surface-border)] bg-surface-1 p-3">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <Pressable
                variant="ghost"
                className="w-full justify-between"
                busy={clonePlan.isPending}
                onClick={() =>
                  clonePlan.mutate(
                    { id: tpl.id, coach_client_id: linkId, name: tpl.name },
                    { onSuccess: () => setCloning(false) },
                  )
                }
              >
                <span className="truncate">{tpl.name}</span>
                <span className="text-caption text-text-3">{t('plans.dayCount', { count: tpl.day_count })}</span>
              </Pressable>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
