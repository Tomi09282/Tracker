import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import { ApiError, apiWithRefresh } from '../../lib/api';
import { useOnline } from '../plans/useOnline';
import { equipmentStill } from '../../assets/pulse';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { Numeral } from '../../ui/data/Numeral';
import { RoleKey } from '../../ui/data/RoleKey';
import { Pic } from '../../ui/media/Pic';
import { UserPhoto } from '../../ui/media/UserPhoto';

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
  // The server answers the localised word as `name` (`exercises/detail.js` labelJoin); `label` is
  // what this type promised before and never received — read both, name first.
  muscles: { slug: string; name?: string; label?: string; role: 'primary' | 'secondary' }[];
  equipment: { slug: string; name?: string; label?: string }[];
  media: { id: number; storage_key: string; width: number | null; height: number | null }[];
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "3 nappal ezelőtt", "20 órával ezelőtt" — from `Intl`, not from the bundle.
 *
 * A relative timestamp is one of the few strings that does NOT want a translation key: CLDR already
 * carries the plural rules and the suffix for every locale the app ships. `numeric: 'always'` on
 * purpose — `'auto'` renders "tegnap" for a one-day-old submission, which reads as a date rather
 * than an age when it sits in a column of ages.
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
 * Is there room for the two-pane split (and for the section rail of `AdminShell`)?
 *
 * A media query in JS rather than in CSS because this decides WHERE ONE SUBTREE LIVES, not how it
 * looks: below the breakpoint the review renders inside the open row, above it in the pane beside
 * the list. Rendering both and hiding one would put two copies of every submitted image and two
 * copies of the rejection field in the document.
 */
export function useWide() {
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

/** The queue's read; the panel head shares it (one cache entry) to say how many of the waiting rows the list holds. */
export function useModerationQueue() {
  return useQuery({
    queryKey: ['admin', 'moderation'],
    queryFn: () => apiWithRefresh<{ queue: QueueItem[] }>('/admin/moderation'),
  });
}

const wordOf = (item: { name?: string; label?: string; slug: string }) => item.name ?? item.label ?? item.slug;

/**
 * ═══ THE DECISION CONTROLS LIVE IN THE REVIEW, NOT IN THE ROW ══════════════════════════════════
 *
 * Approving publishes a movement into the shared library — every user can find it and follow it
 * under load. So the buttons do not exist until the review is open, and the review is what fetches
 * the instructions, the muscles and the media: deciding without loading the submission is
 * impossible, not discouraged.
 *
 * ═══ ON A PHONE THE ROW OPENS IN PLACE (admin-2) ═══════════════════════════════════════════════
 *
 * The open row is one block between two strong rules: its head (the name in the display face, the
 * e-mail, the age and media line, the chevron up — a tap closes it), the image at judging size, the
 * description, the muscles, the equipment, the numbered steps and the decision. The rows before it
 * and after it stay rows, dimmed while one is open. Above 1024 px the list and the review stand side
 * by side as before (R21).
 */
export function ModerationQueue({ quietError = false, pending }: { quietError?: boolean; pending?: number }) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const qc = useQueryClient();
  const wide = useWide();
  const ago = useAgo();
  const [selected, setSelected] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const queue = useModerationQueue();

  const submission = useQuery({
    queryKey: ['admin', 'moderation', selected, i18n.language],
    queryFn: () => apiWithRefresh<Submission>(`/admin/moderation/${selected}?lang=${i18n.language}`),
    enabled: selected !== null,
  });

  const decide = useMutation({
    // NEVER queued while offline (review S-admin-moderation 2): a paused approval fires by itself on reconnect and
    // publishes a movement to the shared library with no tap. It fails at once instead, and the review says so.
    networkMode: 'always',
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
    // Three blocks per row where its three lines will be, at the real row's 82 pt.
    return (
      <div role="status">
        <span className="sr-only">{t('common.loading')}</span>
        <RowStack as="div" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 py-3">
              <Skeleton className={i === 1 ? 'h-4 w-45' : 'h-4 w-65'} />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-35" />
            </div>
          ))}
        </RowStack>
      </div>
    );
  }

  if (queue.isError) {
    // The panel above already says it (one line, one "Újra" for both reads).
    if (quietError) return null;
    // A list that failed to load is not an empty queue: saying "Minden beküldött gyakorlatot
    // elbíráltál" over a failed read would be false. The same words and the same way out as the
    // panel above ("Nem sikerült betölteni", "Újra").
    return (
      <NoticeLine
        tone="danger"
        role="alert"
        action={
          <TextLink busy={queue.isFetching} onClick={() => void queue.refetch()}>
            {t('common.retry')}
          </TextLink>
        }
      >
        {t('adminStats.errorTitle')}
      </NoticeLine>
    );
  }

  if (rows.length === 0) {
    // admin-moderation-v2-empty: the graphite shield (the Admin tab's object, unlit) over the
    // display title and the one line.
    return (
      <div className="flex flex-col gap-6 pt-2">
        <Pic slot="tab-admin" width={96} />
        <EmptyState title={t('admin.queueEmptyTitle')} body={t('admin.queueEmptyBody')} />
      </div>
    );
  }

  const toggle = (id: number) => {
    decide.reset();
    setSelected(selected === id ? null : id);
    setRejecting(false);
    setReason('');
  };

  const metaOf = (row: QueueItem) =>
    `${ago(row.submitted_at)} · ${row.media_count === 0 ? t('admin.noMedia') : t('admin.mediaCount', { count: row.media_count })}`;

  // The two lines under a row's name: the submitter, then the age and media line in mono.
  const subOf = (row: QueueItem) => (
    <>
      <span className="block truncate">{row.owner_email ?? '—'}</span>
      <span className="mt-0.5 block truncate text-data">{metaOf(row)}</span>
    </>
  );

  const closedRow = (row: QueueItem) => (
    <ListRow
      key={row.id}
      title={row.name}
      sub={subOf(row)}
      subLines={2}
      tone={selected !== null && selected !== row.id ? 'muted' : 'default'}
      trailing={
        // On a phone the row opens in place (down); when wide the review opens beside the list, so
        // the chevron points there, and the chosen row's chevron is in ink like its name.
        wide ? (
          <ChevronRight aria-hidden className={row.id === selected ? '-me-0.75 size-4 text-text-1' : '-me-0.75 size-4 text-text-3'} strokeWidth={1.75} />
        ) : (
          <ChevronDown aria-hidden className="-me-0.75 size-4 text-text-3" strokeWidth={1.75} />
        )
      }
      onClick={() => toggle(row.id)}
      aria-current={row.id === selected ? 'true' : undefined}
      aria-expanded={wide ? undefined : row.id === selected}
    />
  );

  // ONE review subtree, placed by `wide` rather than duplicated and hidden. See `useWide`.
  const review: ReactNode =
    selected === null ? null : submission.isPending ? (
      <ReviewSkeleton />
    ) : submission.isError || !submission.data ? (
      // A submission somebody else decided while this queue was on screen is a 404. The refresh
      // glyph in the panel head is the way out.
      <NoticeLine tone="warn" role="status" detail={t('admin.reviewGoneBody')}>
        {t('admin.reviewGoneTitle')}
      </NoticeLine>
    ) : (
      <ReviewBody
        data={submission.data}
        showHeader={wide}
        busy={decide.isPending}
        offline={!online}
        failure={decide.isError ? decideFailure(decide.error, t) : null}
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

  // The route lists its first page only: when more wait than the list holds, the line says the rest follows.
  const capped =
    pending !== undefined && pending > rows.length ? <p className="pt-3 text-cap text-text-3">{t('admin.queueCapped', { count: rows.length })}</p> : null;

  // "Open one first": why the rows carry no approve control.
  const hint = (
    <div className="flex flex-col gap-1">
      <p className="text-body-m text-text-1">{t('admin.reviewPickTitle')}</p>
      <p className="text-cap text-text-2">{t('admin.reviewPickBody')}</p>
    </div>
  );

  if (wide) {
    return (
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 min-w-0">
          <RowStack close aria-label={t('admin.moderation')}>
            {rows.map(closedRow)}
          </RowStack>
          {capped}
        </div>
        <div className="col-span-8 min-w-0">{selected === null ? hint : review}</div>
      </div>
    );
  }

  const at = rows.findIndex((row) => row.id === selected);
  if (at < 0) {
    // On a phone a row opens in place, so the "open one first" hint of the two-pane layout says
    // nothing here (admin-view-1 drops it; design round A review, finding 4).
    return (
      <>
        <RowStack close aria-label={t('admin.moderation')}>
          {rows.map(closedRow)}
        </RowStack>
        {capped}
      </>
    );
  }

  const open = rows[at];
  return (
    <div className="flex flex-col">
      {at > 0 ? <RowStack aria-label={t('admin.moderation')}>{rows.slice(0, at).map(closedRow)}</RowStack> : null}
      <Rule strong />
      <div className="flex flex-col pt-2.5 pb-3">
        {/* The open head: the same three lines, the name in the display face; a tap closes it. The
            chevron stands on the name's line (admin-2), so it is drawn beside the row, not in it. */}
        <div className="relative">
          <ListRow
            title={<span className="mb-0.5 block text-display uppercase">{open.name}</span>}
            lines={2}
            sub={subOf(open)}
            subLines={2}
            onClick={() => toggle(open.id)}
            aria-current="true"
            aria-expanded
          />
          <ChevronUp aria-hidden className="pointer-events-none absolute top-4.75 -right-0.75 size-4 text-text-1" strokeWidth={1.75} />
        </div>
        {/* 24 under the head's last line: the row's own 10 of padding + 14. */}
        <div className="mt-3.5">{review}</div>
      </div>
      <Rule strong />
      {at < rows.length - 1 ? <RowStack>{rows.slice(at + 1).map(closedRow)}</RowStack> : null}
      {capped}
    </div>
  );
}

/** The sentence for a decision that did not go through: gone (somebody was first), offline, or the server. */
function decideFailure(err: unknown, t: TFunction): { title: string; body?: string } {
  if (err instanceof ApiError && (err.status === 404 || err.status === 409)) return { title: t('admin.reviewGoneTitle'), body: t('admin.reviewGoneBody') };
  if (!(err instanceof ApiError) && typeof navigator !== 'undefined' && !navigator.onLine) return { title: t('admin.decideOffline') };
  return { title: t('admin.decideFailed') };
}

/** The review while it loads: a display line, two mono lines, the image's 16:9, three text lines. */
function ReviewSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="aspect-video w-full" />
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-70" />
        <Skeleton className="h-4 w-50" />
      </div>
    </div>
  );
}

function ReviewBody({
  data,
  showHeader,
  busy,
  offline,
  failure,
  rejecting,
  reason,
  onReason,
  onStartReject,
  onCancelReject,
  onDecide,
}: {
  data: Submission;
  /** The name and e-mail as the review's own header — the wide pane; on a phone the open row is the header. */
  showHeader: boolean;
  busy: boolean;
  /** The connection is off: the two decisions are inert and say why. */
  offline: boolean;
  /** The last decision did not go through: said under the controls, in words. */
  failure: { title: string; body?: string } | null;
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
    <article className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        {showHeader ? (
          <header className="flex flex-col gap-1">
            <h3 className="text-display uppercase text-text-1">{exercise.name}</h3>
            <p className="text-cap text-text-2">{exercise.owner_email ?? '—'}</p>
          </header>
        ) : null}

        {/* The media at the size somebody can judge: user content, never hero art, not desaturated. */}
        {media.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {media.map((m) => (
              // The upload's own 354 x 199 rectangle (admin-2) stands even when the file draws
              // nothing: a blank or transparent still (what the demo seed stores) or a broken one
              // shows the kit's skeleton block, as the frame's body script specifies for a blank
              // still, instead of a hole an admin cannot tell from "no media". An opaque photo
              // covers it completely.
              <li key={m.id} className="rounded-[var(--radius-1)] bg-[var(--skeleton-base)]">
                <UserPhoto
                  src={`/api/v1/media/${m.storage_key}`}
                  alt={t('admin.mediaAlt', { name: exercise.name })}
                  ratio={m.width && m.height ? Math.min(16 / 9, Math.max(1, m.width / m.height)) : 16 / 9}
                  fit="contain"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-cap text-text-2">{t('admin.noMedia')}</p>
        )}

        {exercise.description ? <p className="text-body text-text-1">{exercise.description}</p> : null}
      </div>

      {muscles.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader rule={false} heading="h3" title={t('library.muscle')} />
          <RoleKey
            layout="inline"
            items={muscles.map((m) => ({ role: m.role, label: wordOf(m) }))}
            roleLabels={{ primary: t('muscleMap.primary'), secondary: t('muscleMap.secondary') }}
          />
        </section>
      ) : null}

      {equipment.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader rule={false} heading="h3" title={t('library.equipment')} />
          <ul className="flex flex-wrap gap-x-6 gap-y-4">
            {equipment.map((q) => {
              const still = equipmentStill(q.slug);
              return (
                <li key={q.slug} className="flex items-center gap-3">
                  {still ? <Pic slot={still} width={48} /> : null}
                  <span className="text-body-m text-text-1">{wordOf(q)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-6">
        {exercise.instructions.length > 0 ? (
          <section className="flex flex-col gap-4">
            <SectionHeader rule={false} heading="h3" title={t('library.howTo')} />
            <RowStack as="ol" close>
              {exercise.instructions.map((step, i) => (
                <div key={i} className={i === 0 ? 'flex gap-4 pb-4' : 'flex gap-4 py-4'}>
                  {/* The column is the text's 44 pt high and the 48 pt numeral overhangs it, so a
                      row is as tall as its paragraph (admin-2: 60 for two lines). */}
                  <span className="mt-1 -mb-1 h-11 w-8 shrink-0">
                    <Numeral size="num" value={i + 1} />
                  </span>
                  <p className="text-body text-text-2">{step}</p>
                </div>
              ))}
            </RowStack>
          </section>
        ) : (
          // Not decoration: a submission with no instructions is the most common reason to reject one.
          <NoticeLine tone="warn">{t('admin.noInstructions')}</NoticeLine>
        )}

        {failure ? (
          <NoticeLine tone="danger" role="alert" detail={failure.body}>
            {failure.title}
          </NoticeLine>
        ) : null}

        {/* ── the decision ── */}
        {rejecting ? (
          <div className="flex flex-col gap-4">
            <Field
              label={t('admin.reason')}
              value={reason}
              onChange={(e) => onReason(e.target.value)}
              /* The author READS this on their own exercise. */
              hint={t('admin.reasonHint')}
            />
            <div className="flex items-center gap-6">
              {/* Destructive: it cannot fire without a reason the author can act on. */}
              <TextLink
                text="body"
                tone="danger"
                disabled={reason.trim().length === 0 || offline}
                busy={busy}
                onClick={() => onDecide('reject')}
              >
                {t('admin.reject')}
              </TextLink>
              <TextLink text="body" onClick={onCancelReject}>
                {t('common.cancel')}
              </TextLink>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Pressable variant="primary" size="lg" className="w-full" busy={busy} disabled={offline} onClick={() => onDecide('approve')}>
              {t('admin.approve')}
            </Pressable>
            <TextLink text="body" onClick={onStartReject}>
              {t('admin.reject')}
            </TextLink>
          </div>
        )}
      </div>
    </article>
  );
}
