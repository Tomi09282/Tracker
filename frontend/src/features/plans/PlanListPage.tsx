import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Check, Plus } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { StatBlock } from '../../ui/data/StatBlock';
import { Numeral } from '../../ui/data/Numeral';
import { SplitBar, type SplitTone } from '../../ui/data/SplitBar';
import { Monogram } from '../../ui/data/Monogram';
import { Pic } from '../../ui/media/Pic';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { usePlans, useCreatePlan, type PlanSummary } from './usePlans';
import { useOnline } from './useOnline';
import { useSession } from '../auth/useSession';
import { initialsOf, personLabel } from '../../lib/person';

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

/**
 * The light level of each status in the bar and its legend (coach-plans-1): the lamp for live work,
 * ink at half for a draft, the warning ink for a pause, the track for what is over.
 */
const STATUS_TONE: Record<PlanStatus, SplitTone> = {
  active: 'live',
  draft: 'half',
  paused: 'warn',
  ended: 'off',
};

/**
 * The status word at the head of a row's meta line. The active word stands in ink after the lime
 * tick (the row's `subLead`), a pause in the warning ink, a draft and an ended plan stay quiet with
 * the rest of the line.
 */
const STATUS_INK: Record<PlanStatus, string | undefined> = {
  active: 'text-text-1',
  draft: undefined,
  paused: 'text-warning',
  ended: undefined,
};

/**
 * One plan of the library (coach-plans-1 "Plan row"): the name as a 22 / 28 title in up to two
 * balanced lines, the meta line in mono under it, the chevron at the edge. The whole row is the
 * link to the editor. A client plan leads with the client's 28 pt monogram; the client's name is
 * read to the ear only (the monogram's `label`) — this list answers "which plan", and the client
 * is confirmed one tap later.
 */
function PlanRow({ plan }: { plan: PlanSummary }) {
  const { t } = useTranslation();
  // A template has no client, so both fields are null and the row simply has no person on it.
  const clientLabel = plan.client_email
    ? personLabel({ email: plan.client_email, display_name: plan.client_display_name })
    : '';
  const ink = STATUS_INK[plan.status];
  return (
    <ListRow
      to={`/coach/plans/${plan.id}`}
      chevron
      pad="loose"
      titleSize="title"
      lines={2}
      subFace="data"
      subLead={plan.status === 'active' ? <Check strokeWidth={2.5} /> : undefined}
      leadSlot={clientLabel !== ''}
      lead={clientLabel ? <Monogram initials={initialsOf(clientLabel)} size={28} label={clientLabel} /> : undefined}
      title={plan.name}
      sub={
        <>
          <span className={ink}>{t(`plans.status.${plan.status}`)}</span>
          {' · '}
          {t('plans.dayCount', { count: plan.day_count })}
          {' · '}
          {t('plans.cycle', { days: plan.cycle_days })}
        </>
      }
    />
  );
}

/**
 * The coach's plan library — [[58-Pulse/Screens/coach-plans]], frames coach-plans-1 (the library)
 * and coach-plans-2 (empty).
 *
 * ═══ THE ANCHOR IS A BAR, AND THE CREATE FORM IS GONE ══════════════════════════════════════════
 *
 * The screen opens with the one number a coach cannot get by scrolling: how much of the library is
 * actually live — the giant total, the status bar under it and the legend that spells the bar out.
 * The screen's ONE lime pill, `Új terv`, closes that block: it creates a draft and goes straight to
 * the editor with the name focused and selected, which is a better moment to name a thing than
 * before it exists. Below, two ruled sections of plan rows. Nothing is enclosed.
 */
export function PlanListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const online = useOnline();
  const { data: user } = useSession();
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
    //
    // `plans.defaultName`, not `plans.newName` — that one is the editor input's aria-label ("Új
    // terv neve", a FIELD LABEL), and a coach who did not type over the selected name left a row
    // in the library literally reading it.
    const created = await create.mutateAsync({ name: t('plans.defaultName') });
    void navigate(`/coach/plans/${created.id}`, { state: { focusName: true } });
  };

  // ROLE GATE, ahead of the query branches. Without it a member who opens /coach/plans got the
  // server's 403 as a retryable error that fails on every press. The forbidden state is the page:
  // its title is the h1, and there is no header and no pill.
  if (user && user.role !== 'coach' && user.role !== 'admin') {
    return (
      <Screen top="root">
        <EmptyState heading="h1" title={t('coaching.forbiddenTitle')} body={t('coaching.forbiddenBody')} />
      </Screen>
    );
  }

  // The screen's one lime pill — under the anchor in the library, the end of the message when the
  // library is empty. Disabled offline (the kit's grey), busy while the draft is being created.
  const newPlan = (
    <Pressable
      variant="primary"
      size="lg"
      className="w-full"
      icon={<Plus size={20} strokeWidth={2.25} aria-hidden />}
      busy={create.isPending}
      disabled={!online}
      onClick={() => void startPlan()}
    >
      {t('plans.newPlan')}
    </Pressable>
  );

  return (
    <Screen top="push">
      <ScreenHeader kind="section" tight eyebrow={t('plans.eyebrow')} title={t('plans.title')} />

      {plans.isPending ? (
        // Blocks where the text will be: the eyebrow, the numeral at the giant's cap height, then
        // two rows. No pill skeleton, no image.
        <div className="flex flex-col gap-8" role="status" aria-busy="true">
          <span className="sr-only">{t('common.loading')}</span>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-[102px] w-[53px]" />
          </div>
          <RowStack as="div">
            {[0, 1].map((i) => (
              <ListRowSkeleton key={i} sub index={i} />
            ))}
          </RowStack>
        </div>
      ) : plans.isError ? (
        // A real failure only (a member's 403 is the forbidden state above). The anchor is not
        // drawn: a bar built from a partial list is a lie with a shape.
        <NoticeLine
          tone="danger"
          role="alert"
          action={<TextLink onClick={() => void plans.refetch()}>{t('common.retry')}</TextLink>}
        >
          {t('auth.errors.generic')}
        </NoticeLine>
      ) : rows.length === 0 ? (
        // coach-plans-2: no anchor (a bar of zero segments is a decoration). The stacked plates
        // stand on the stage alone, then the empty state carries the pill as its one action.
        <div className="flex flex-col gap-8">
          <div aria-hidden className="relative h-[211px]">
            <Pic slot="hero-plates" width={352} priority bleed className="absolute -right-[25px] -top-[26px]" />
          </div>
          <EmptyState title={t('plans.emptyTitle')} body={t('plans.emptyBody')} action={newPlan} />
        </div>
      ) : (
        <>
          {/* THE ANCHOR AND ITS BUTTON ARE ONE BLOCK (coach-plans-1 "Anchor"): the total and its
              bar, then the pill 24 under the legend. The still stands on the numeral's baseline
              under the figure, its lit right edge 17 past the gutter (the scaffold clips it). */}
          <div className="relative flex flex-col gap-6">
            <Pic slot="hero-plates" width={238} priority bleed className="absolute -right-[17px] -top-[30px]" />
            <div className="relative flex flex-col gap-5">
              <StatBlock label={t('plans.total')}>
                <Numeral size="giant" value={rows.length} mode="roll" from={0} />
              </StatBlock>
              <SplitBar
                legend="inline"
                parts={byStatus.map(({ status, count }) => ({
                  label: t(`plans.status.${status}`),
                  count,
                  tone: STATUS_TONE[status],
                }))}
              />
            </div>
            {newPlan}
          </div>

          {/* An empty section renders nothing at all — not an empty heading with a zero. */}
          {templates.length ? (
            <Section title={t('plans.templates')} trailing={<span className="text-data text-text-2">{templates.length}</span>}>
              <RowStack trim>
                {templates.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </RowStack>
            </Section>
          ) : null}

          {clients.length ? (
            <Section title={t('plans.clientPlans')} trailing={<span className="text-data text-text-2">{clients.length}</span>}>
              <RowStack trim>
                {clients.map((p) => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </RowStack>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
