import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, ShieldCheck, ImageOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { apiWithRefresh } from '../../lib/api';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';

interface QueueItem {
  id: number;
  name: string;
  owner_email: string | null;
  submitted_at: number;
  difficulty: string | null;
  media_count: number;
}

interface Submission {
  exercise: {
    id: number;
    name: string;
    description: string | null;
    instructions: string[];
    difficulty: string | null;
    exercise_type: string | null;
    owner_email: string | null;
    submitted_at: number;
  };
  muscles: { slug: string; label: string; role: 'primary' | 'secondary' }[];
  equipment: { slug: string; label: string }[];
  media: { id: number; storage_key: string; width: number | null; height: number | null }[];
}

/**
 * ═══ THE DECISION CONTROLS LIVE IN THE PANEL, NOT IN THE ROW ═══════════════════════════════════
 *
 * The lite queue put Approve and Reject in the table row, beside a name, an owner's email and a
 * media count. Approving publishes a movement into the shared library — every user in the product
 * can find it, and follow it under load — and the only thing the moderator had read was its name.
 *
 * Moving the buttons into the review panel is not a nudge towards looking. It makes deciding
 * without loading the submission impossible: the buttons do not exist until the panel is open, and
 * the panel is what fetches the instructions, the muscles and the media. A warning would have been
 * the cheaper change and it would have been obeyed exactly as often as warnings are.
 *
 * The panel sits BESIDE the queue rather than over it — a two-pane layout, stacked under 1024px.
 * A modal would have meant a portal, a focus trap, a scroll lock and an Escape handler, four things
 * to get wrong for a screen that has plenty of room.
 */
export function ModerationQueue() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const queue = useQuery({
    queryKey: ['admin', 'moderation'],
    queryFn: () => apiWithRefresh<{ queue: QueueItem[] }>('/admin/moderation'),
  });

  const submission = useQuery({
    queryKey: ['admin', 'moderation', selected, i18n.language],
    queryFn: () => apiWithRefresh<Submission>(`/admin/moderation/${selected}?lang=${i18n.language}`),
    enabled: selected !== null,
  });

  const decide = useMutation({
    mutationFn: (v: { id: number; decision: 'approve' | 'reject'; reason?: string }) =>
      apiWithRefresh(`/admin/moderation/${v.id}`, {
        method: 'POST',
        body: { decision: v.decision, ...(v.reason ? { reason: v.reason } : {}) },
      }),
    onSuccess: () => {
      // The decided submission leaves the queue, so the panel must close with it — leaving it open
      // would show a submission that is no longer there and offer to decide it again.
      setSelected(null);
      setRejecting(false);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  const rows = queue.data?.queue ?? [];

  if (queue.isPending) return <Skeleton className="mt-4 h-64 rounded-card" />;

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-card border border-[var(--surface-border)] bg-surface-1">
        <EmptyState icon={Check} title={t('admin.queueEmptyTitle')} body={t('admin.queueEmptyBody')} />
      </div>
    );
  }

  return (
    // THE SAME TWELVE COLUMNS THE SHELL AROUND IT USES.
    //
    // This was an arbitrary two-track template — a fixed 22rem first column against a 1fr second
    // — at `gap-4`, while the shell around it runs a 3:9 twelve-column split at `gap-6`
    // (AdminShell.tsx:53,62,103). The two disagreed by a few percent, so switching admin sections
    // moved the left edge of the content column sideways for no reason a reader could attribute
    // to anything. (The old value is not quoted verbatim here on purpose: Tailwind scans comments
    // too, and a class named in prose is a class it generates into the bundle.)
    //
    // 4:8 is a column ratio, not a measurement: the panel keeps its proportions and now shares an
    // edge with the section list outside it. `min-w-0` is not decoration — it is what
    // `minmax(0, …)` was doing before. Without it a grid child's `min-width: auto` lets a wide
    // media row push the whole grid out instead of scrolling inside itself.
    <div className="mt-4 grid gap-6 lg:grid-cols-12">
      {/* ── the queue ───────────────────────────────────────────────────────────────────────── */}
      <ul className="flex min-w-0 flex-col gap-2 lg:col-span-4" aria-label={t('admin.moderation')}>
        {rows.map((row) => {
          const active = row.id === selected;
          return (
            <li key={row.id}>
              {/*
                A Pressable, not a raw <button> — `check-tokens` refuses those outside `src/ui/`,
                and it was right to: the recipe is where the 44 px floor, the focus ring and the
                press feedback live, and a hand-rolled queue row would have quietly had none of
                them. `shape="field"` is already full-width and left-aligned; the className only
                turns the single row into a stack.

                `aria-current` is what tells a screen reader which submission the panel is showing.
              */}
              <Pressable
                shape="field"
                variant="secondary"
                onClick={() => {
                  setSelected(row.id);
                  setRejecting(false);
                  setReason('');
                }}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'h-auto flex-col items-start gap-1 whitespace-normal py-3',
                  active && 'border-accent bg-accent-subtle',
                )}
              >
                <span className="text-body block truncate text-text-1">{row.name}</span>
                <span className="text-caption block truncate text-text-3">{row.owner_email ?? '—'}</span>
                <span className="text-micro flex items-center gap-2 text-text-3">
                  {row.media_count === 0 ? (
                    <>
                      <ImageOff className="size-icon-s" strokeWidth={2} aria-hidden />
                      {t('admin.noMedia')}
                    </>
                  ) : (
                    t('admin.mediaCount', { count: row.media_count })
                  )}
                </span>
              </Pressable>
            </li>
          );
        })}
      </ul>

      {/* ── the review panel ────────────────────────────────────────────────────────────────── */}
      <div className="min-w-0 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4 lg:col-span-8">
        {selected === null ? (
          <EmptyState icon={ShieldCheck} title={t('admin.reviewPickTitle')} body={t('admin.reviewPickBody')} />
        ) : submission.isPending ? (
          <Skeleton className="h-64 rounded-card" />
        ) : submission.isError || !submission.data ? (
          // A submission somebody else decided while this queue was on screen is a 404, and saying
          // so beats a spinner that never resolves.
          <EmptyState icon={X} title={t('admin.reviewGoneTitle')} body={t('admin.reviewGoneBody')} />
        ) : (
          <ReviewBody
            data={submission.data}
            busy={decide.isPending}
            rejecting={rejecting}
            reason={reason}
            onReason={setReason}
            onStartReject={() => {
              setRejecting(true);
              setReason('');
            }}
            onCancelReject={() => setRejecting(false)}
            onDecide={(decision) =>
              decide.mutate({ id: submission.data.exercise.id, decision, ...(decision === 'reject' ? { reason } : {}) })
            }
          />
        )}
      </div>
    </div>
  );
}

function ReviewBody({
  data,
  busy,
  rejecting,
  reason,
  onReason,
  onStartReject,
  onCancelReject,
  onDecide,
}: {
  data: Submission;
  busy: boolean;
  rejecting: boolean;
  reason: string;
  onReason: (v: string) => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onDecide: (decision: 'approve' | 'reject') => void;
}) {
  const { t } = useTranslation();
  const { exercise, muscles, equipment, media } = data;

  return (
    <article>
      <header>
        <h3 className="text-title-3 text-text-1">{exercise.name}</h3>
        <p className="text-caption mt-1 text-text-3">{exercise.owner_email ?? '—'}</p>
      </header>

      {/* The media, at the size somebody can actually judge. The moderation queue used to serve
          these as a COUNT, and the route behind them answered 404 for admins — measured, then
          fixed in `exercises/media.js`. */}
      {media.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {media.map((m) => (
            <li key={m.id}>
              <img
                src={`/api/v1/media/${m.storage_key}`}
                alt={t('admin.mediaAlt', { name: exercise.name })}
                width={m.width ?? undefined}
                height={m.height ?? undefined}
                className="max-h-56 w-auto rounded-card border border-[var(--surface-border)] object-cover"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption mt-4 flex items-center gap-2 text-text-3">
          <ImageOff className="size-icon-s" strokeWidth={2} aria-hidden />
          {t('admin.noMedia')}
        </p>
      )}

      {exercise.description ? <p className="text-body mt-4 text-text-2">{exercise.description}</p> : null}

      {exercise.instructions.length > 0 ? (
        <section className="mt-4">
          <h4 className="text-micro uppercase text-text-3">{t('library.howTo')}</h4>
          <ol className="text-body mt-2 flex list-decimal flex-col gap-1 pl-5 text-text-2">
            {exercise.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      ) : (
        // Not decoration: a submission with no instructions is the most common reason to reject
        // one, and it has to be visible rather than absent.
        <p className="text-caption mt-4 text-warning">{t('admin.noInstructions')}</p>
      )}

      {muscles.length > 0 ? (
        <section className="mt-4">
          <h4 className="text-micro uppercase text-text-3">{t('library.muscle')}</h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {muscles.map((m) => (
              <li
                key={m.slug}
                className={cn(
                  'text-caption rounded-chip px-2 py-0.5',
                  m.role === 'primary' ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-text-2',
                )}
              >
                {m.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {equipment.length > 0 ? (
        <section className="mt-4">
          <h4 className="text-micro uppercase text-text-3">{t('library.equipment')}</h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {equipment.map((q) => (
              <li key={q.slug} className="text-caption rounded-chip bg-surface-2 px-2 py-0.5 text-text-2">
                {q.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── the decision ──────────────────────────────────────────────────────────────────── */}
      <footer className="mt-8 border-t border-[var(--surface-border)] pt-4">
        {rejecting ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label={t('admin.reason')}
              value={reason}
              onChange={(e) => onReason(e.target.value)}
              className="w-64"
              /* The author READS this — `ExerciseDetailPage` renders it on their own exercise —
                 so it is the one field here that reaches somebody outside this screen. */
              hint={t('admin.reasonHint')}
            />
            <Pressable
              variant="danger"
              density="compact"
              disabled={reason.trim().length === 0}
              busy={busy}
              onClick={() => onDecide('reject')}
            >
              {t('admin.reject')}
            </Pressable>
            <Pressable density="compact" variant="ghost" onClick={onCancelReject}>
              {t('common.cancel')}
            </Pressable>
          </div>
        ) : (
          <div className="flex gap-2">
            <Pressable
              variant="primary"
              density="compact"
              busy={busy}
              icon={<Check className="size-icon-m" strokeWidth={2} aria-hidden />}
              onClick={() => onDecide('approve')}
            >
              {t('admin.approve')}
            </Pressable>
            {/* Destructive action: never in the primary position, and it cannot fire without a
                reason the author can act on. */}
            <Pressable
              variant="ghost"
              density="compact"
              icon={<X className="size-icon-m" strokeWidth={2} aria-hidden />}
              onClick={onStartReject}
            >
              {t('admin.reject')}
            </Pressable>
          </div>
        )}
      </footer>
    </article>
  );
}
