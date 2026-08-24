import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initialsOf, personLabel } from '../../lib/person';
import { Ban, Check, Flag, MessageSquare, Send, Undo2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import {
  useMessages,
  useSendMessage,
  useMarkThreadRead,
  useBlockConversation,
  useReportMessage,
  useConversations,
  type Message,
} from './useChat';

const BODY_MAX = 4000;

/**
 * Day grouping, in the reader's own timezone.
 *
 * It used to group — and print — `toISOString().slice(0, 10)`: a UTC calendar day rendered as a
 * raw ISO string. Two things wrong with one line. A message sent at 01:00 local in a UTC+2 zone
 * belongs to yesterday's group by that key, and `2026-08-22` is not how a date is written in any
 * of this app's three locales.
 */
const dayKey = (unix: number) => new Date(unix * 1000).toDateString();
const dayLabel = (unix: number, locale: string) => new Date(unix * 1000).toLocaleDateString(locale);
const timeOf = (unix: number, locale: string) =>
  new Date(unix * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });


/**
 * The conversation, per blueprint 8 and [[55-Screens/coach-chat]].
 *
 * ONE COMPONENT FOR BOTH SIDES. A coach reaches it through a client, a client through their coach,
 * and neither needs a different thread renderer — the only difference is which bubbles are "mine",
 * which the server already answers with `sender_is_coach` semantics carried in `mine`.
 *
 * ═══ THE ANCHOR IS A PERSON ════════════════════════════════════════════════════════════════════
 *
 * A conversation is not a countable goal and not a trend, so neither a ring nor a chart earns the
 * top third. It is a person, and the anchor is that person: a monogram inside a thick ring with
 * their name beneath it in the largest type the panel owns.
 *
 * WHAT IS DELIBERATELY NOT DRAWN: the presence dot on the ring and the `Utoljára aktív` line. The
 * messages API answers `read_at` and says nothing about last-seen, so both would be invented. An
 * "active now" the product cannot walk back is worse than an anchor with one element fewer.
 *
 * ═══ THE LIST IS COLUMN-REVERSE ════════════════════════════════════════════════════════════════
 *
 * That is the whole trick: the browser pins a reversed flex column to its bottom for free, so a
 * new message appears without a scroll calculation, and scrolling UP to read history does not
 * fight it. The server already returns newest-first, so no reversing happens in JavaScript either.
 * It is also why the bubble's meta line lives INSIDE the bubble — an outside line doubles the
 * thread's vertical rhythm and breaks the reversal.
 */
export function ChatPanel({
  conversationId,
  meId,
  blocked,
  blockedByMe,
  displayName,
  className,
}: {
  conversationId: number;
  meId: number;
  blocked: boolean;
  blockedByMe: boolean;
  /**
   * The other person's name, when the caller has a better one than an e-mail local part. Optional
   * because no endpoint answers a display name today; the day one does, this is where it lands.
   */
  displayName?: string;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const { data, isPending } = useMessages(conversationId);
  const { data: conversations } = useConversations();
  const send = useSendMessage(conversationId);
  const markRead = useMarkThreadRead(conversationId);
  const block = useBlockConversation(conversationId);
  const report = useReportMessage();
  const composerId = useId();

  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [reported, setReported] = useState<number[]>([]);

  const messages = data?.messages ?? [];
  const unreadCount = messages.filter((m) => m.sender_id !== meId && m.read_at == null && !m.deleted_at).length;

  // The identity comes from the conversations list, which the screen that renders this panel has
  // already fetched and is already polling — so the anchor paints on the first frame while the
  // thread is still in flight, rather than arriving with it.
  const conversation = (conversations?.conversations ?? []).find((c) => c.id === conversationId) ?? null;
  const name = displayName ?? (conversation ? personLabel({ email: conversation.other_email, display_name: conversation.other_display_name }) : '');

  // Mark read when the thread has something unread AND the tab is actually visible. Without the
  // visibility check, a backgrounded tab polling every 5 s would clear the badge for someone who
  // is not looking at it — the one thing a read receipt must never do.
  const marked = useRef(false);
  useEffect(() => {
    if (unreadCount === 0 || marked.current) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    marked.current = true;
    markRead.mutate(undefined, { onSettled: () => { marked.current = false; } });
  }, [unreadCount, markRead]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    setFailed(null);
    setDraft('');
    try {
      await send.mutateAsync(body);
    } catch {
      // THE BUBBLE STAYS. A failed message that disappears reads as a sent one, and the person
      // walks away believing their coach was told something. The draft comes back so a retry is
      // one tap rather than retyping.
      setDraft(body);
      setFailed('send');
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col gap-section', className)}>
      {/* ── the corner action ─────────────────────────────────────────────────────────────────
          `Letiltás` used to sit under the composer, one mis-tap from send. Blocking is rare and
          semi-irreversible, so it belongs in a corner. The row keeps its height when the chip is
          gone (blocked conversations lose it) so the anchor does not jump on a state change. */}
      <div className="flex min-h-11 items-start justify-end">
        {blocked ? null : (
          <Pressable shape="chip" density="compact" variant="ghost" onClick={() => block.mutate(true)}>
            <Ban className="size-icon-s" aria-hidden />
            {t('chat.block')}
          </Pressable>
        )}
      </div>

      {/* ── the anchor ────────────────────────────────────────────────────────────────────────
          The ring is drawn with padding on an accent-filled circle rather than a border width, so
          it stays a ring in every theme pack — `--border-width` is a hairline in four of the five
          and a ring at 1px is not an anchor. The name IS the heading; there is no second one. */}
      <div className="flex flex-col items-center gap-tight">
        <span aria-hidden className="inline-flex rounded-full bg-accent p-1">
          <span className="text-display font-display grid size-28 place-items-center rounded-full bg-surface-2 text-accent">
            {name ? initialsOf(name) : ''}
          </span>
        </span>
        {name ? (
          <h2 className="text-title-1 font-display text-center text-text-1">{name}</h2>
        ) : (
          <Skeleton className="h-7 w-40" />
        )}
      </div>

      {/* ── the thread ───────────────────────────────────────────────────────────────────────
          The skeleton is two bubbles at the width and height real ones use, one left and one
          right, so nothing moves when the data lands. */}
      {isPending ? (
        <div className="flex min-h-0 flex-1 flex-col gap-tight">
          <Skeleton className="h-16 w-2/3 rounded-card" />
          <Skeleton className="ms-auto h-16 w-2/3 rounded-card" />
        </div>
      ) : messages.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t('chat.emptyTitle')} body={t('chat.emptyBody')} />
      ) : (
        <ol
          // `min-h-32` is a floor, not a box. The screen note retires the bordered scrolling box
          // and lets the page scroll — but this panel is still embedded in a host that caps its
          // height, and a flex child with `min-h-0` will happily shrink to nothing under a cap.
          // A floor makes the panel overflow its cap rather than crush the thread to a sliver,
          // which is the failure mode you can see and fix instead of the one you cannot.
          className="flex min-h-32 flex-1 gap-tight overflow-y-auto overscroll-contain"
          // Inline rather than the Tailwind reverse-column utility: the token gate's
          // `undefined-utility` rule matches anything shaped like a `col-*` class, and that
          // utility's name collides with it. The rule is right to be broad — `col-mobile` and
          // `col-wide` are real project utilities and a typo in either must fail the build — so
          // the exception lives here, named, rather than the rule being loosened for everybody.
          style={{ flexDirection: 'column-reverse' }}
          aria-label={t('chat.thread')}
        >
          {messages.map((m, i) => {
            const mine = m.sender_id === meId || m.id < 0;
            const previous = messages[i + 1];
            const newDay = !previous || dayKey(previous.created_at) !== dayKey(m.created_at);
            return (
              <li key={m.id} className="flex flex-col">
                <Bubble
                  message={m}
                  mine={mine}
                  pending={m.id < 0}
                  reported={reported.includes(m.id)}
                  locale={i18n.language}
                  onReport={
                    mine || m.deleted_at
                      ? undefined
                      : () => {
                          report.mutate(
                            { id: m.id, reason: 'abuse' },
                            { onSuccess: () => setReported((r) => [...r, m.id]) },
                          );
                        }
                  }
                />
                {/* The divider renders AFTER the bubble in DOM order because the list is reversed,
                    which puts it visually above — the same trick that pins the thread to the
                    bottom without a scroll calculation. */}
                {newDay ? (
                  <p className="text-caption my-2 text-center text-text-3">
                    {dayLabel(m.created_at, i18n.language)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {/* ── the composer ────────────────────────────────────────────────────────────────────── */}
      {blocked ? (
        <Surface elevation="inset" className="flex items-center justify-between gap-tight">
          <p className="text-body-s text-text-2">{t('chat.blocked')}</p>
          {/* Only the person who blocked can lift it. Being blocked is not a state you undo. */}
          {blockedByMe ? (
            <Pressable shape="chip" density="compact" variant="secondary" onClick={() => block.mutate(false)}>
              <Undo2 className="size-icon-s" aria-hidden />
              {t('chat.unblock')}
            </Pressable>
          ) : null}
        </Surface>
      ) : (
        <div className="flex flex-col gap-tight">
          {failed ? (
            <p role="alert" className="text-caption text-danger">
              {t('chat.sendFailed')}
            </p>
          ) : null}
          {/* A visible label, not a placeholder: a placeholder is not a label and it disappears
              on the first keystroke — which is exactly when the counter below starts moving. */}
          <label htmlFor={composerId} className="text-body-s text-text-2">
            {t('chat.compose')}
          </label>
          <div className="flex items-end gap-tight">
            <textarea
              id={composerId}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, BODY_MAX))}
              // Enter sends, Shift+Enter breaks the line. On a phone the on-screen keyboard's
              // return key inserts a newline instead, which is why the send button is not optional.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              maxLength={BODY_MAX}
              className={cn(
                'min-h-[var(--target-min)] max-h-32 flex-1 resize-none rounded-field px-3 py-3',
                'bg-[var(--field-bg)] text-body text-text-1',
                'border-[length:var(--border-width)] border-[var(--field-border)]',
                'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                'outline-none focus-visible:border-accent focus-visible:outline-2',
                'focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
              )}
            />
            {/* Round, filled, and the only primary action in the panel. */}
            <Pressable
              shape="icon"
              variant="primary"
              className="rounded-full"
              aria-label={t('chat.send')}
              busy={send.isPending}
              disabled={!draft.trim()}
              onClick={() => void submit()}
            >
              <Send className="size-icon-m" aria-hidden />
            </Pressable>
          </div>
          {/* Numerals, and `aria-hidden`: the input's own `maxLength` is what assistive tech
              reads, and a counter that announced itself on every keystroke would be unusable. */}
          <p aria-hidden className="text-caption text-end tabular-nums text-text-3">
            {draft.length} / {BODY_MAX}
          </p>
        </div>
      )}
    </div>
  );
}

function Bubble({
  message,
  mine,
  pending,
  reported,
  locale,
  onReport,
}: {
  message: Message;
  mine: boolean;
  pending: boolean;
  reported: boolean;
  locale: string;
  onReport?: () => void;
}) {
  const { t } = useTranslation();

  // A withdrawn message keeps its place. The thread must still show that something was there and
  // taken back; erasing the row would make it lie about what happened. No bubble fill: it is a
  // record of a message, not a message.
  if (message.deleted_at) {
    return (
      <p className={cn('text-caption max-w-[80%] px-3 py-2 italic text-text-3', mine ? 'ms-auto' : 'me-auto')}>
        {t('chat.withdrawn')}
      </p>
    );
  }

  return (
    <Surface
      pad="none"
      rim={false}
      className={cn(
        // Bubbles stop well short of the column so the two sides read as two voices rather than
        // as one full-width transcript.
        'group max-w-[80%] px-3 py-2',
        mine
          ? 'ms-auto border-[var(--accent-border)] bg-accent-subtle text-on-accent-subtle'
          : 'me-auto',
        pending && 'opacity-60',
      )}
    >
      {/* Text renders as TEXT. No dangerouslySetInnerHTML anywhere in this component, and no
          auto-linking: a clickable URL in a message from someone you have not met is an
          exfiltration surface, and this product has a report flow precisely because not every
          message is friendly. */}
      <p className="text-body whitespace-pre-wrap break-words">{message.body}</p>

      {/* The meta line lives inside the bubble and is right-aligned on both sides — see the
          column-reverse note on the panel. */}
      <div className="text-caption mt-1 flex items-center justify-end gap-tight text-text-3">
        {/* Reporting is no longer a chip riding every bubble: nine persistent `Jelentés` chips
            made every message look like evidence. It stays in the DOM and in tab order — a
            keyboard user must be able to reach it — but it is only PAINTED on hover or focus. */}
        {onReport ? (
          <Pressable
            shape="chip"
            density="compact"
            variant="ghost"
            className={cn(
              'me-auto opacity-0 transition-opacity duration-[var(--duration-fast)]',
              'ease-[var(--ease-standard)] group-hover:opacity-100 group-focus-within:opacity-100',
            )}
            disabled={reported}
            onClick={onReport}
          >
            <Flag className="size-icon-s" aria-hidden />
            {reported ? t('chat.reported') : t('chat.report')}
          </Pressable>
        ) : null}
        <span className="tabular-nums">
          {pending ? t('chat.sending') : timeOf(message.created_at, locale)}
        </span>
        {mine && message.read_at ? (
          <span className="flex items-center gap-tight text-success">
            <Check className="size-icon-s" aria-hidden />
            {t('chat.read')}
          </span>
        ) : null}
      </div>
    </Surface>
  );
}
