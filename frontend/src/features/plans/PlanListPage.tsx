import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ClipboardList, Plus, User } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { usePlans, useCreatePlan, type PlanSummary } from './usePlans';

const STATUS_TONE: Record<PlanSummary['status'], string> = {
  draft: 'text-text-3',
  active: 'text-success',
  paused: 'text-warning',
  ended: 'text-text-3',
};

/**
 * The coach's plan library.
 *
 * Templates and client instances are shown in one list, separated by a heading rather than by a
 * tab. A coach thinks "my programmes" — splitting them makes the common question ("what does Anna
 * have?") a two-step, and the scope is already visible on every row.
 */
export function PlanListPage() {
  const { t } = useTranslation();
  const plans = usePlans();
  const create = useCreatePlan();
  const [name, setName] = useState('');

  const rows = plans.data?.plans ?? [];
  const templates = rows.filter((p) => p.scope === 'template');
  const clients = rows.filter((p) => p.scope === 'client');

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await create.mutateAsync({ name: trimmed });
    setName('');
  };

  const Row = ({ plan }: { plan: PlanSummary }) => (
    <li>
      <Link
        to={`/coach/plans/${plan.id}`}
        className="flex min-h-[var(--target-min)] items-center gap-3 rounded-card border border-[var(--surface-border)] bg-surface-1 p-3"
      >
        <ClipboardList className="size-icon-m shrink-0 text-text-2" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body truncate font-medium">{plan.name}</p>
          <p className="text-caption flex flex-wrap items-center gap-x-2 text-text-2">
            <span className={STATUS_TONE[plan.status]}>{t(`plans.status.${plan.status}`)}</span>
            <span className="tabular-nums">{t('plans.dayCount', { count: plan.day_count })}</span>
            <span className="tabular-nums">{t('plans.cycle', { days: plan.cycle_days })}</span>
            {plan.client_email ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <User className="size-icon-s shrink-0" aria-hidden />
                <span className="truncate">{plan.client_email}</span>
              </span>
            ) : null}
          </p>
        </div>
      </Link>
    </li>
  );

  return (
    <div className="col-mobile screen-x flex flex-col gap-6 py-6">
      <header>
        <p className="text-micro uppercase text-accent">{t('plans.eyebrow')}</p>
        <h1 className="text-title-1 font-display">{t('plans.title')}</h1>
      </header>

      <section className="flex flex-col gap-2 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
        <Field
          label={t('plans.newName')}
          hint={t('plans.newHint')}
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <Pressable
          variant="primary"
          icon={<Plus className="size-icon-s" aria-hidden />}
          busy={create.isPending}
          disabled={!name.trim()}
          onClick={() => void submit()}
        >
          {t('plans.create')}
        </Pressable>
      </section>

      {plans.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t('plans.emptyTitle')} body={t('plans.emptyBody')} />
      ) : (
        <>
          {templates.length ? (
            <section aria-labelledby="tpl-heading">
              <h2 id="tpl-heading" className={cn('text-label uppercase tracking-wide text-text-2')}>
                {t('plans.templates')}
              </h2>
              <ul className="mt-2 flex flex-col gap-2">
                {templates.map((p) => (
                  <Row key={p.id} plan={p} />
                ))}
              </ul>
            </section>
          ) : null}

          {clients.length ? (
            <section aria-labelledby="cli-heading">
              <h2 id="cli-heading" className="text-label uppercase tracking-wide text-text-2">
                {t('plans.clientPlans')}
              </h2>
              <ul className="mt-2 flex flex-col gap-2">
                {clients.map((p) => (
                  <Row key={p.id} plan={p} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
