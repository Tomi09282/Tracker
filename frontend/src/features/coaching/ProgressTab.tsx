import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Section, SectionHeader } from '../../ui/data/SectionHeader';
import { useClientWorkouts, useClientRecords, useProgress } from './useCoaching';
import { ProgressChart, type Measure } from '../../ui/feedback/ProgressChart';

const fmtVolume = (kg: number | null) =>
  kg == null ? '—' : kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`;

const fmtDuration = (seconds: number | null) => {
  if (seconds == null) return null;
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/**
 * One movement's chart. Self-fetching so each series is its own query — one slow response does
 * not hold the others up, and an exercise with too little history collapses to a line of text
 * without affecting its neighbours.
 *
 * WHICH MEASURE is chosen from the data, not configured: a plank has seconds and no load, a row
 * has load and no distance. Picking the first measure that has values means a client whose whole
 * programme is isometrics gets a real chart instead of an empty axis.
 */
function ExerciseProgress({ linkId, exerciseId, name }: { linkId: number; exerciseId: number; name: string }) {
  const { t } = useTranslation();
  const { data, isPending } = useProgress(exerciseId, linkId);
  const points = data?.points ?? [];
  // While loading, render NOTHING rather than "not enough data" — the honest message for an
  // unanswered query is silence, not a verdict that will be contradicted a moment later.
  if (isPending) return null;

  const MEASURES: { key: Measure; unit: string }[] = [
    { key: 'e1rm_kg', unit: 'kg' },
    { key: 'best_seconds', unit: t('workout.seconds') },
    { key: 'best_distance_m', unit: t('workout.metres') },
    { key: 'top_load_kg', unit: 'kg' },
  ];
  const chosen = MEASURES.find((m) => points.filter((p) => p[m.key] != null).length >= 3);
  // No measure has three days yet. Say so per exercise rather than returning null: a heading with
  // nothing under it is a bug the reader has to interpret, and "keep going, two more sessions" is
  // information they can act on.
  if (!chosen) {
    return (
      <div>
        <p className="text-body-m text-text-1">{name}</p>
        <p className="text-cap mt-1 text-text-2">{t('progress.notEnough', { count: points.length })}</p>
      </div>
    );
  }

  return (
    <ProgressChart
      points={points}
      measure={chosen.key}
      unit={chosen.unit}
      label={name}
    />
  );
}

/**
 * The Progress tab on the client detail screen.
 *
 * Sessions and records, both read through the LINK — so an archived client's history disappears
 * from the coach's view on the very next request, with the same unexpired token.
 *
 * THE CHARTS ARRIVED, AND THE OLD RULE SURVIVED THEM. This file used to say there was deliberately
 * no chart, because one drawn from two data points implies a trend nobody measured. That is still
 * enforced — `ProgressChart` refuses below three points and says so — but the rule was never
 * "no charts", it was "no fake ones". With a real series endpoint the honest version is possible.
 *
 * Only movements the client has beaten a record on are charted. An exercise with a record has, by
 * definition, been done more than once; charting whatever happens to be most recent would draw a
 * line through a single point.
 */
export function ProgressTab({ linkId }: { linkId: number }) {
  const { t } = useTranslation();
  const workouts = useClientWorkouts(linkId);
  const records = useClientRecords(linkId);

  if (workouts.isPending || records.isPending) {
    return (
      <div className="pt-2" role="status" aria-label={t('common.loading')}>
        <RowStack as="div">
          {[0, 1, 2].map((i) => (
            <ListRowSkeleton key={i} sub index={i} />
          ))}
        </RowStack>
      </div>
    );
  }

  const logs = workouts.data?.logs ?? [];
  const prs = records.data?.records ?? [];

  // One entry per exercise, newest first. A client with four records on one movement should get
  // ONE chart of it, not four identical ones.
  const chartable = [...new Map(
    prs.filter((r) => r.exercise_id != null).map((r) => [r.exercise_id, { exerciseId: r.exercise_id, name: r.exercise_name_snapshot }]),
  ).values()].slice(0, 3) as { exerciseId: number; name: string }[];

  if (!logs.length && !prs.length) {
    return <EmptyState className="mt-2" title={t('coaching.noHistoryTitle')} body={t('coaching.noHistoryBody')} />;
  }

  return (
    // 16 under the view switch (the page leaves 8); the blocks stand 32 apart (client-detail-3)
    <div className="flex flex-col gap-section pt-2">
      {/* THE CHARTS COME FIRST, and only for movements the client has actually beaten a record on.
          That is the honest selection: an exercise with a record has, by definition, been done
          more than once, so there is something to plot. Charting whatever happens to be most
          recent would produce a line through one point. The block directly under the switch has
          no rule. */}
      {chartable.length ? (
        <section aria-labelledby="progress-heading" className="flex flex-col gap-4">
          <SectionHeader rule={false} titleId="progress-heading" title={t('progress.heading')} />
          <div className="flex flex-col gap-section">
            {chartable.map((c) => (
              <ExerciseProgress key={c.exerciseId} linkId={linkId} exerciseId={c.exerciseId} name={c.name} />
            ))}
          </div>
        </section>
      ) : null}

      {prs.length ? (
        <Section title={t('coaching.records')}>
          <RowStack>
            {prs.slice(0, 8).map((r) => (
              <ListRow
                key={r.id}
                title={r.exercise_name_snapshot}
                sub={`${t(`workout.record.${r.kind}`)}${r.rep_bucket > 0 ? ` · ${r.rep_bucket}${r.rep_bucket === 13 ? '+' : ''}` : ''} · ${r.local_date}`}
                // the figure and the unit as stored (a locale defect kept 1:1: "131.3 kg")
                value={String(Math.round(r.value * 10) / 10)}
                valueUnit={r.value_unit}
              />
            ))}
          </RowStack>
        </Section>
      ) : null}

      {logs.length ? (
        <Section title={t('coaching.sessions')}>
          <RowStack>
            {logs.map((l) => (
              <ListRow
                key={l.id}
                title={l.day_name_snapshot ?? l.title ?? t('workout.freestyle')}
                value={l.local_date}
                sub={
                  <>
                    {[
                      t('coaching.setsCount', { count: l.total_working_sets ?? 0 }),
                      t('coaching.repsCount', { count: l.total_reps ?? 0 }),
                      fmtVolume(l.total_volume_kg),
                      fmtDuration(l.duration_seconds),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {/* A session still running is not a result. Saying so prevents a coach reading a
                        half-finished workout as a completed one. */}
                    {l.completed_at == null ? (
                      <>
                        {' · '}
                        <span className="text-accent">{t('coaching.stillRunning')}</span>
                      </>
                    ) : null}
                  </>
                }
              />
            ))}
          </RowStack>
        </Section>
      ) : null}
    </div>
  );
}
