import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, ShieldCheck, ImageOff, Film } from 'lucide-react';
import { cn } from '../../lib/cn';
import { apiWithRefresh } from '../../lib/api';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { Surface } from '../../ui/primitives/Surface';
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

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "2 napja", "20 órája" — from `Intl`, not from the bundle.
 *
 * A relative timestamp is one of the few strings that does NOT want a translation key: CLDR already
 * carries the plural rules and the suffix for every locale the app ships, and three hand-written
 * keys per unit is three chances for a German plural to be wrong. `numeric: 'always'` on purpose —
 * `'auto'` renders "tegnap" for a one-day-old submission, which reads as a date rather than an age
 * when it sits in a column of ages.
 */
function useAgo() {
  const { i18n } = useTranslation();
  const rtf = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.language, { numeric: 'always' }),
    [i18n.language],
  );
  return (unixSeconds: number) => {
    const diff = unixSeconds - Math.floor(Date.now() / 1000);
    const abs = Math.abs(diff);
    if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
    if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
    return rtf.format(Math.round(diff / DAY), 'day');
  };
}

/**
 * Is there room for the two-pane split?
 *
 * A media query in JS rather than in CSS because this decides WHERE ONE SUBTREE LIVES, not how it
 * looks: below the breakpoint the review renders inside the selected row, above it in the panel
 * beside the list. Rendering both and hiding one with `lg:hidden` would put two copies of every
 * submitted image and two copies of the rejection field in the document.
 */
function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return wide;
}

/**
 * ═══ THE DECISION CONTROLS LIVE IN THE REVIEW, NOT IN THE ROW ══════════════════════════════════
 *
 * The lite queue put Approve and Reject in the table row, beside a name, an owner's email and a
 * media count. Approving publishes a movement into the shared library — every user in the product
 * can find it, and follow it under load — and the only thing the moderator had read was its name.
 *
 * Keeping the buttons inside the review is not a nudge towards looking. It makes deciding without
 * loading the submission impossible: the buttons do not exist until the review is open, and the
 * review is what fetches the instructions, the muscles and the media. A warning would have been the
 * cheaper change and it would have been obeyed exactly as often as warnings are.
 *
 * ═══ WHICH IS WHY SELECTING A ROW EXPANDS IT, RATHER THAN ARMING IT ════════════════════════════
 *
 * The phone layout has no room for a panel beside the list, and the obvious phone shape — a row
 * that reveals Approve and Reject when you tap it — is EXACTLY the defect above wearing a different
 * hat. So the row expands in place into the whole review: media, instructions, muscle and equipment
 * chips, the missing-description warning, and the two controls at the bottom of all of it. The
 * invariant is unchanged; only the container moved. Above 1024px the two-pane split stays as it was.
 */
export function ModerationQueue() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const wide = useWide();
  const ago = useAgo();
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
      // The decided submission leaves the queue, so the review must close with it — leaving it open
      // would show a submission that is no longer there and offer to decide it again.
      setSelected(null);
      setRejecting(false);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  const rows = queue.data?.queue ?? [];

  if (queue.isPending) {
    // Row-shaped, at the height the real rows render at, so the swap does not move the page.
    return (
      <div className="flex flex-col gap-tight">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-18 rounded-field" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Surface>
        <EmptyState icon={Check} title={t('admin.queueEmptyTitle')} body={t('admin.queueEmptyBody')} />
      </Surface>
    );
  }

  // ONE review subtree, placed by `wide` rather than duplicated and hidden. See `useWide`.
  const review: ReactNode =
    selected === null ? (
      <EmptyState icon={ShieldCheck} title={t('admin.reviewPickTitle')} body={t('admin.reviewPickBody')} />
    ) : submission.isPending ? (
      <Skeleton className="h-64 rounded-card" />
    ) : submission.isError || !submission.data ? (
      // A submission somebody else decided while this queue was on screen is a 404, and saying so
      // beats a spinner that never resolves. The refresh control in the panel header is the way out.
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
          decide.mutate({
            id: submission.data.exercise.id,
            decision,
            ...(decision === 'reject' ? { reason } : {}),
          })
        }
      />
    );

  return (
    // THE SAME TWELVE COLUMNS THE SHELL AROUND IT USES.
    //
    // This was an arbitrary two-track template — a fixed first column against a 1fr second — while
    // the shell around it runs a 3:9 twelve-column split, so switching admin sections moved the left
    // edge of the content column sideways for no reason a reader could attribute to anything.
    //
    // 4:8 is a column ratio, not a measurement. `min-w-0` is not decoration — without it a grid
    // child's `min-width: auto` lets a wide media row push the whole grid out instead of scrolling
    // inside itself.
    <div className="grid gap-6 lg:grid-cols-12">
      <ul className="flex min-w-0 flex-col gap-tight lg:col-span-4" aria-label={t('admin.moderation')}>
        {rows.map((row) => {
          const active = row.id === selected;
          return (
            <li key={row.id}>
              {/*
                A Pressable, not a raw <button> — `check-tokens` refuses those outside `src/ui/`,
                and it was right to: the recipe is where the 44 px floor, the focus ring and the
                press feedback live. `shape="field"` is already full-width and left-aligned; the
                className only turns the single row into a stack.

                `aria-current` tells a screen reader which submission the review is showing;
                `aria-expanded` is added only where the row really does own the expansion.
              */}
              <Pressable
                shape="field"
                variant="secondary"
                onClick={() => {
                  setSelected(active ? null : row.id);
                  setRejecting(false);
                  setReason('');
                }}
                aria-current={active ? 'true' : undefined}
                aria-expanded={wide ? undefined : active}
                className={cn(
                  'relative h-auto flex-col items-start gap-tight whitespace-normal py-3 pl-5',
                  active && 'border-accent bg-accent-subtle',
                )}
              >
                {/* The leading edge bar. Every row has one so the list reads as a column of
                    objects; only the open one is accent. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-3 left-2 w-1 rounded-chip',
                    active ? 'bg-accent' : 'bg-[var(--surface-border-strong)]',
                  )}
                />
                <span className="flex w-full items-baseline gap-tight">
                  <span className="text-body min-w-0 flex-1 truncate text-text-1">{row.name}</span>
                  <span className="text-caption shrink-0 tabular-nums text-text-3">
                    {ago(row.submitted_at)}
                  </span>
                </span>
                <span className="flex w-full flex-wrap items-center gap-tight">
                  <span className="text-caption min-w-0 flex-1 truncate text-text-3">
                    {row.owner_email ?? '—'}
                  </span>
                  <span className="text-micro flex shrink-0 items-center gap-tight text-text-3">
                    {row.media_count === 0 ? (
                      <>
                        <ImageOff className="size-icon-s shrink-0" strokeWidth={2} aria-hidden />
                        {t('admin.noMedia')}
                      </>
                    ) : (
                      <>
                        <Film className="size-icon-s shrink-0" strokeWidth={2} aria-hidden />
                        {t('admin.mediaCount', { count: row.media_count })}
                      </>
                    )}
                  </span>
                </span>
              </Pressable>

              {!wide && active ? <Surface className="mt-2">{review}</Surface> : null}
            </li>
          );
        })}
      </ul>

      {wide ? (
        <Surface className="min-w-0 lg:col-span-8">{review}</Surface>
      ) : selected === null ? (
        // On a phone there is no panel to hold the "open one first" guidance, and it is the
        // sentence that explains why the buttons are not on the rows. It goes under the list.
        <Surface>{review}</Surface>
      ) : null}
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
    <article className="flex flex-col gap-group">
      <header>
        <h3 className="text-title-3 text-text-1">{exercise.name}</h3>
        <p className="text-caption mt-1 text-text-3">{exercise.owner_email ?? '—'}</p>
      </header>

      {/* The media, at the size somebody can actually judge. The moderation queue used to serve
          these as a COUNT, and the route behind them answered 404 for admins — measured, then
          fixed in `exercises/media.js`. */}
      {media.length > 0 ? (
        <ul className="flex flex-wrap gap-tight">
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
        <p className="text-caption flex items-center gap-tight text-text-3">
          <ImageOff className="size-icon-s" strokeWidth={2} aria-hidden />
          {t('admin.noMedia')}
        </p>
      )}

      {exercise.description ? <p className="text-body text-text-2">{exercise.description}</p> : null}

      {exercise.instructions.length > 0 ? (
        <section>
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
        <p className="text-caption text-warning">{t('admin.noInstructions')}</p>
      )}

      {muscles.length > 0 ? (
        <section>
          <h4 className="text-micro uppercase text-text-3">{t('library.muscle')}</h4>
          <ul className="mt-2 flex flex-wrap gap-tight">
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
        <section>
          <h4 className="text-micro uppercase text-text-3">{t('library.equipment')}</h4>
          <ul className="mt-2 flex flex-wrap gap-tight">
            {equipment.map((q) => (
              <li key={q.slug} className="text-caption rounded-chip bg-surface-2 px-2 py-0.5 text-text-2">
                {q.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── the decision ──────────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--surface-border)] pt-4">
        {rejecting ? (
          <div className="flex flex-col gap-tight">
            <Field
              label={t('admin.reason')}
              value={reason}
              onChange={(e) => onReason(e.target.value)}
              /* The author READS this — `ExerciseDetailPage` renders it on their own exercise —
                 so it is the one field here that reaches somebody outside this screen. */
              hint={t('admin.reasonHint')}
            />
            <div className="grid grid-cols-2 gap-tight">
              <Pressable
                variant="danger"
                density="compact"
                className="w-full"
                disabled={reason.trim().length === 0}
                busy={busy}
                onClick={() => onDecide('reject')}
              >
                {t('admin.reject')}
              </Pressable>
              <Pressable density="compact" variant="ghost" className="w-full" onClick={onCancelReject}>
                {t('common.cancel')}
              </Pressable>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-tight">
            <Pressable
              variant="primary"
              density="compact"
              className="w-full"
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
              className="w-full"
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
