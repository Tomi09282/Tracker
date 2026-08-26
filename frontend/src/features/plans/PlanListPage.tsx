import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { AlertCircle, Check, ChevronRight, ClipboardList, Plus, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { chip, type ChipVariants } from '../../ui/primitives/control';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { CountUp } from '../../ui/feedback/CountUp';
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

/** The bar's segments. Accent for live work, ink for drafts, the faintest edge for what is over. */
const SEGMENT_FILL: Record<PlanStatus, string> = {
  active: 'bg-accent',
  draft: 'bg-text-3',
  paused: 'bg-warning',
  ended: 'bg-[var(--surface-border-strong)]',
};

/**
 * The row chip's TONE, resolved by the `chip` recipe. Only `active` and `paused` spend a colour —
 * a draft is not a warning, so it takes the recipe's `quiet`.
 *
 * It used to be a map of hand-written class strings at `text-micro px-2 py-1`; the recipe is
 * `text-caption px-3 py-1` with the same tones, and the mockup's pill is the roomier one. The
 * reason this call site hand-rolled a string — twMerge eating the type step next to a colour — is
 * gone since `lib/cn.ts` learned the project's font-size names.
 */
const CHIP_TONE: Record<PlanStatus, NonNullable<ChipVariants['tone']>> = {
  active: 'success',
  draft: 'quiet',
  paused: 'warning',
  ended: 'quiet',
};

/** `anna@example.com` → `AN`. Two letters is what fits, and it is enough to tell two clients apart. */

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

  /*
   * The check rides `active` alone — it is the one status that means the client is training today,
   * and a tone plus a glyph is what makes it findable in a column of four greys. LEADING, as
   * 07-coach-plans.webp draws both of its `Aktív` chips: the glyph opens the meta line here, while
   * the client-detail plan card closes its title with the same chip and keeps it trailing.
   */
  const StatusChip = ({ status }: { status: PlanStatus }) => (
    <span className={chip({ tone: CHIP_TONE[status] })}>
      {status === 'active' ? <Check className="size-icon-s" strokeWidth={2} aria-hidden /> : null}
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

  const Row = ({ plan }: { plan: PlanSummary }) => {
    // A template has no client, so both fields are null and the row simply has no person on it.
    const clientLabel = plan.client_email
      ? personLabel({ email: plan.client_email, display_name: plan.client_display_name })
      : '';
    return (
    <li>
      <Surface
        as={Link}
        to={`/coach/plans/${plan.id}`}
        interactive
        className="flex min-h-[var(--target-min)] items-center gap-group"
      >
        {clientLabel ? (
          <span
            aria-hidden
            className="text-body-s inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-surface-2 font-display text-text-2"
          >
            {initialsOf(clientLabel)}
          </span>
        ) : null}

        <span className="flex min-w-0 flex-1 flex-col gap-tight">
          <span className="text-body-strong block truncate text-text-1">{plan.name}</span>
          {/* THE CLIENT IS NAMED TO THE EAR, NOT TO THE EYE — and that is the third answer this
              row has had, so it is worth writing down why this one stops.

              It began as the full e-mail, visible: four wrapping near-identical addresses, four
              rows of noise. It was demoted to `sr-only`, which fixed the noise and kept the privacy
              problem — a client's whole address read aloud to anyone using a screen reader. When
              029 gave people names I brought it back VISIBLE, on the grounds that a name is short
              and safe to say. The mockup disagrees: `07-coach-plans.webp` draws exactly two lines,
              the bold plan name and the chip beside `4 nap · 7 napos ciklus`, and the monogram is
              what carries the identity.

              It is right, and the reason is that this list answers "which PLAN", not "which
              client" — the client is already implied by the monogram and confirmed one tap later.
              So the name goes back to being announced only. The privacy objection is gone either
              way: `personLabel` never yields an address. */}
          {clientLabel ? <span className="sr-only">{clientLabel}</span> : null}
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
  };

  // ROLE GATE, ahead of the query branches. Without it a member who opens /coach/plans got the
  // server's 403 as the generic red alert card with an `Újra` button that fails on every press —
  // an error dressed as something retryable. The spec owes the forbidden empty state instead, and
  // this is the shape `CoachDashboard` already uses. The generic card stays for real failures.
  if (user && user.role !== 'coach' && user.role !== 'admin') {
    return (
      <div className="col-mobile screen-x py-6">
        <EmptyState
          icon={ClipboardList}
          title={t('coaching.forbiddenTitle')}
          body={t('coaching.forbiddenBody')}
          heading="h1"
        />
      </div>
    );
  }

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
        // shape. A REAL failure only — the 403 a member used to land here with now goes to the
        // forbidden state above, because retrying a refusal is not a next step.
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
          {/* THE ANCHOR AND ITS BUTTON ARE ONE UNIT. On the root's `gap-section` all four blocks
              sat 32px apart, so the create action read as unrelated to the library it adds to —
              `--spacing-section` is documented as "between two things that are not each other's
              business". The mockup hugs the button to the card and opens the air again before
              `Sablonok`; it also buys back ~16px, which is what brings the `Kliens-tervek` head
              back into the first screenful. */}
          <div className="flex flex-col gap-group">
            {/* An empty library gets no anchor: a bar of zero segments is a decoration. */}
            {rows.length > 0 ? (
              <Surface className="flex flex-col items-center gap-tight">
                <p className="text-display font-display tabular-nums text-text-1">
                  <CountUp to={rows.length} />
                </p>
                {/* Names the METRIC, not the screen. `nav.plans` is "Tervek" — the same word as the
                    h1 one line above — so the anchor was captioning itself instead of saying what
                    the number counts. */}
                <p className="text-micro uppercase text-text-3">{t('plans.total')}</p>

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
              {/* `plans.newPlan`, not `plans.create`: "Létrehozás" was the submit label of the
                  create card the redesign merged away, and it is still the generic create verb
                  elsewhere. This button names the THING it makes. */}
              {t('plans.newPlan')}
            </Pressable>
          </div>

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
