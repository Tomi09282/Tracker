import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { StatusLine } from '../../ui/data/StatusLine';
import type { DotTone } from '../../ui/data/Dot';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { usePlans, useCreatePlan, useClonePlan, type PlanSummary } from '../plans/usePlans';
import { useOnline } from '../plans/useOnline';

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

/**
 * Status → the dot of the row's status line (Pulse: a colour is a 6 pt dot or text, never a fill).
 * Lime is the live state only; a paused plan waits (warn); draft and ended carry no dot and say
 * their word in the quiet ink.
 */
const STATUS_DOT: Record<PlanSummary['status'], DotTone | undefined> = {
  active: 'live',
  draft: undefined,
  paused: 'warn',
  ended: undefined,
};

/** client-detail-1 "Plans": the plan's name over its status word and meta, the chevron. */
function PlanRow({ plan }: { plan: PlanSummary }) {
  const { t } = useTranslation();
  const dates = [plan.starts_on, plan.ends_on].filter(Boolean).join(' → ');

  return (
    <ListRow
      to={`/coach/plans/${plan.id}`}
      chevron
      lines={2}
      title={plan.name}
      sub={
        // A plan with no start date generates no occurrences — it is invisible on the client's
        // home screen no matter what its status says. Saying so here is the difference between a
        // coach finding that out now and finding it out from a confused client.
        <StatusLine
          tone={STATUS_DOT[plan.status]}
          word={t(`plans.status.${plan.status}`)}
          meta={
            plan.starts_on ? (
              `${t('plans.dayCount', { count: plan.day_count })} · ${t('plans.cycle', { days: plan.cycle_days })} · ${dates}`
            ) : (
              <span className="text-warning">{t('plans.needsStart')}</span>
            )
          }
        />
      }
    />
  );
}

export function PlanTab({ linkId }: { linkId: number }) {
  const { t } = useTranslation();
  const { data, isPending } = usePlans();
  const createPlan = useCreatePlan();
  const clonePlan = useClonePlan();
  const [cloning, setCloning] = useState(false);
  // Both acts here CREATE a plan, and there is no queued-write store behind the plan endpoints —
  // a create fired offline is lost, and the coach walks away believing the client has a programme.
  const offline = !useOnline();

  const plans = data?.plans ?? [];
  const mine = useMemo(() => plans.filter((p) => p.coach_client_id === linkId), [plans, linkId]);
  // Only templates can be cloned ONTO a client. A client-scoped plan belongs to someone already,
  // and personal plans are the coach's own training.
  const templates = useMemo(() => plans.filter((p) => p.scope === 'template'), [plans]);

  if (isPending) {
    // The row geometry, so nothing shifts when the list arrives.
    return (
      <RowStack as="div">
        <ListRowSkeleton sub index={0} />
        <ListRowSkeleton sub index={1} />
      </RowStack>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {mine.length ? (
        <RowStack>
          {mine.map((p) => (
            <PlanRow key={p.id} plan={p} />
          ))}
        </RowStack>
      ) : (
        <EmptyState title={t('plans.noneForClient')} body={t('plans.noneForClientBody')} />
      )}

      <div className="flex flex-col gap-2 pt-3">
        {/* The screen's one pill, full width; the clone link defers to it underneath. */}
        <Pressable
          variant="primary"
          size="lg"
          className="w-full"
          busy={createPlan.isPending}
          disabled={offline}
          // The plan is created THROUGH the link — the server's INSERT ... SELECT carries the
          // ownership check, so this sends the link id and nothing else that matters.
          onClick={() =>
            // `plans.defaultName`, not `plans.newName`: the latter is the editor input's FIELD LABEL
            // ("Új terv neve"), and creating with it left rows in the library reading like a form.
            createPlan.mutate({ name: t('plans.defaultName'), coach_client_id: linkId, cycle_days: 7 })
          }
        >
          {t('plans.newForClient')}
        </Pressable>

        {templates.length ? (
          <TextLink
            text="body"
            className="self-start"
            trail={cloning ? <ChevronUp /> : <ChevronDown />}
            aria-expanded={cloning}
            disabled={offline}
            onClick={() => setCloning((v) => !v)}
          >
            {t('plans.cloneOpen')}
          </TextLink>
        ) : null}

        {/* The template list is revealed INLINE rather than shown in a dialog: on a phone a dialog
            over this view hides the plans the coach is comparing against. */}
        {cloning ? (
          <RowStack>
            {templates.map((tpl) => (
              <ListRow
                key={tpl.id}
                title={tpl.name}
                value={t('plans.dayCount', { count: tpl.day_count })}
                busy={clonePlan.isPending}
                // The list can already be open when the connection drops, so the rows carry the
                // guard too rather than relying on the link above them.
                disabled={offline}
                onClick={() =>
                  clonePlan.mutate(
                    { id: tpl.id, coach_client_id: linkId, name: tpl.name },
                    { onSuccess: () => setCloning(false) },
                  )
                }
              />
            ))}
          </RowStack>
        ) : null}
      </div>
    </div>
  );
}
