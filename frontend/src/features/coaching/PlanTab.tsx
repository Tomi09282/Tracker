import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Check, ChevronRight, ClipboardList, Copy, Plus } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { usePlans, useCreatePlan, useClonePlan, type PlanSummary } from '../plans/usePlans';

/**
 * The client detail screen's Plan tab.
 *
 * NO NEW ENDPOINT. `GET /plans` already returns every plan this coach authored with its
 * `coach_client_id`, so "this client's plans" is a filter over data the screen would fetch anyway —
 * and the coach's ownership predicate stays in the ONE place it already lives rather than being
 * restated in a second query written for this tab. The page's `TERV` tile reads the same query.
 *
 * The filter is deliberately on `coach_client_id`, not on `client_user_id`: the link is the
 * authority everywhere else in this product, and archiving it must take the plans out of view with
 * it. Matching on the user id would keep showing a departed client's programme.
 */

const STATUS_TONE: Record<PlanSummary['status'], string> = {
  active: 'bg-success-subtle text-success',
  draft: 'bg-surface-3 text-text-2',
  paused: 'bg-warning-subtle text-warning',
  ended: 'bg-surface-3 text-text-3',
};

function PlanCard({ plan }: { plan: PlanSummary }) {
  const { t } = useTranslation();
  const dates = [plan.starts_on, plan.ends_on].filter(Boolean).join(' → ');

  return (
    <li>
      <Surface as={Link} to={`/coach/plans/${plan.id}`} interactive className="flex items-center gap-tight">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-tight">
            <span className="text-title-3 text-text-1">{plan.name}</span>
            {/* Concatenated, not `cn`: twMerge files a custom type scale and a colour in the same
                bucket and would drop `text-caption`. */}
            <span
              className={`text-caption inline-flex items-center gap-1 rounded-chip px-2 py-0.5 ${STATUS_TONE[plan.status]}`}
            >
              {t(`plans.status.${plan.status}`)}
              {plan.status === 'active' ? <Check className="size-icon-s" strokeWidth={2} aria-hidden /> : null}
            </span>
          </div>

          <p className="text-caption mt-1 text-text-2">
            {/* A plan with no start date generates no occurrences — it is invisible on the
                client's home screen no matter what its status says. Saying so here is the
                difference between a coach finding that out now and finding it out from a
                confused client. */}
            {plan.starts_on ? (
              <>
                {t('plans.dayCount', { count: plan.day_count })}
                {' · '}
                {t('plans.cycle', { days: plan.cycle_days })}
                {' · '}
                {dates}
              </>
            ) : (
              <span className="text-warning">{t('plans.needsStart')}</span>
            )}
          </p>
        </div>

        <ChevronRight className="size-icon-m shrink-0 text-text-3" aria-hidden />
      </Surface>
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
  const mine = useMemo(() => plans.filter((p) => p.coach_client_id === linkId), [plans, linkId]);
  // Only templates can be cloned ONTO a client. A client-scoped plan belongs to someone already,
  // and personal plans are the coach's own training.
  const templates = useMemo(() => plans.filter((p) => p.scope === 'template'), [plans]);

  if (isPending) {
    // The new card geometry, so nothing shifts when the list arrives.
    return (
      <div className="flex flex-col gap-group">
        <Skeleton className="h-[92px] w-full rounded-card" />
        <Skeleton className="h-[92px] w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-group">
      {mine.length ? (
        <ul className="flex flex-col gap-tight">
          {mine.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={ClipboardList} title={t('plans.noneForClient')} body={t('plans.noneForClientBody')} />
      )}

      {/* The one primary on the panel, full width; the clone action defers to it underneath. */}
      <Pressable
        variant="primary"
        className="w-full"
        busy={createPlan.isPending}
        icon={<Plus className="size-icon-m" strokeWidth={2} aria-hidden />}
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
          className="w-full"
          aria-expanded={cloning}
          icon={<Copy className="size-icon-s" aria-hidden />}
          onClick={() => setCloning((v) => !v)}
        >
          {t('plans.cloneOpen')}
        </Pressable>
      ) : null}

      {/* The template list is revealed INLINE rather than shown in a dialog: on a phone a dialog
          over this tab hides the plans the coach is comparing against. */}
      {cloning ? (
        <Surface>
          <ul className="flex flex-col gap-tight">
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
                  <span className="min-w-0 truncate text-text-1">{tpl.name}</span>
                  <span className="text-caption shrink-0 text-text-3">
                    {t('plans.dayCount', { count: tpl.day_count })}
                  </span>
                </Pressable>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
    </div>
  );
}
