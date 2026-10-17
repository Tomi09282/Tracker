import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initialsOf, personLabel } from '../../lib/person';
import { Ban, Check, Flag, Send, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { TextArea } from '../../ui/primitives/TextArea';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Monogram, MonogramSkeleton } from '../../ui/data/Monogram';
import { Dock } from '../../ui/shell/Dock';
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


/** One calendar day of the thread, oldest message first. */
interface ThreadDay {
  key: string;
  label: string;
  messages: Message[];
}

/**
 * The API answers newest first; the thread reads oldest first, one block per calendar day. Pure
 * and UI-only: the query, its key and its order are untouched. The pending (optimistic) message
 * carries `Date.now()` and so lands in today's block, at its end.
 */
function groupByDay(messages: Message[], locale: string): ThreadDay[] {
  const days: ThreadDay[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const key = dayKey(m.created_at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.messages.push(m);
    else days.push({ key, label: dayLabel(m.created_at, locale), messages: [m] });
  }
  return days;
}

/**
 * The conversation, per [[58-Pulse/Screens/coach-chat]] and the frames `coach-chat-1` / `-2`.
 *
 * ONE COMPONENT FOR BOTH SIDES. A coach reaches it through a client, a client through their coach,
 * and neither needs a different thread renderer — the only difference is which messages are
 * "mine", which the server already answers with `sender_is_coach` semantics carried in `mine`.
 *
 * ═══ NO BUBBLES ═════════════════════════════════════════════════════════════════════════════════
 *
 * Pulse encloses nothing, so the two voices are told apart by side, ink and space alone: theirs
 * on the left in `text-1`, mine on the right in `text-2`, at most 280 wide with balanced lines,
 * one mono stamp 4 under each message. The read state is the WORD "Olvasva" with a check in the
 * same quiet ink — no green; the delivery state is the word "Kézbesítve". The only filled shape
 * is the send pill, lit only while there is something to send.
 *
 * ═══ THE DAYS ARE BLOCKS, OLDEST FIRST ═══════════════════════════════════════════════════════════
 *
 * Each calendar day is a block: its centred mono date FIRST, 12 above the day's first message,
 * 20 between messages of a day, 32 between days. The old renderer drew the date after the first
 * message of its day inside a reversed list and it read as the date of the NEXT message; now the
 * messages are grouped (`groupByDay`) and drawn in reading order.
 *
 * ═══ THE SCROLLER IS COLUMN-REVERSE ══════════════════════════════════════════════════════════════
 *
 * The scroller holds ONE child, the chronological list, in a reversed flex column: the browser
 * pins it to the bottom for free, so the newest message stands on the composer, a new one appears
 * without a scroll calculation, and older days leave through the top as the frame draws them.
 * Scrolling up to read history does not fight it.
 *
 * ═══ TWO FORMS, ONE SWITCH ═══════════════════════════════════════════════════════════════════════
 *
 * `showBlockAction` already meant "the host owns a real top bar". So it also picks the form:
 *   false  the conversation SCREEN (`ChatPage`): the page draws the header, the identity and
 *          `Letiltás`; the panel is the thread that fills the screen and the composer docked
 *          above the tab bar (`Dock`).
 *   true   EMBEDDED in someone else's page (`coaching/ChatTab`): the panel draws its corner
 *          `Letiltás`, the identity (monogram 64 + name) and keeps the composer in flow — a dock
 *          would pin it to the bottom of the client page.
 *
 * WHAT IS DELIBERATELY NOT DRAWN: a presence dot and an `Utoljára aktív` line. The messages API
 * answers `read_at` and says nothing about last-seen, so both would be invented.
 */
export function ChatPanel({
  conversationId,
  meId,
  blocked,
  blockedByMe,
  displayName,
  showBlockAction = true,
  className,
}: {
  conversationId: number;
  meId: number;
  blocked: boolean;
  blockedByMe: boolean;
  /**
   * Whether the panel draws its own `Letiltás` corner. False when the host owns a real top bar
   * — `ChatPage` does — because a panel embedded in someone else's screen can only ever draw
   * half of one: the left half of that row is a back link, and the panel has nowhere to go back
   * to. `Feloldás` is unaffected; lifting a block belongs beside the closed composer.
   *
   * It also picks the panel's FORM (see the component's note): false = the screen form, thread
   * filling the screen and the composer in a `Dock`; true = the embedded form, composer in flow.
   */
  showBlockAction?: boolean;
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
  const hintId = `${composerId}-hint`;

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

  const days = groupByDay(messages, i18n.language);
  const reportOf = (m: Message) => () => {
    report.mutate({ id: m.id, reason: 'abuse' }, { onSuccess: () => setReported((r) => [...r, m.id]) });
  };

  // ── the thread ─────────────────────────────────────────────────────────────────────────────
  // Loading: two quiet text lines on the two sides, standing on the composer like real messages.
  // Empty: the kit's text-only empty state where the thread would be (8 under the rule, as drawn).
  const thread = isPending ? (
    <div className={cn('flex min-h-0 flex-1 flex-col justify-end gap-5', showBlockAction && 'min-h-32')}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="ms-auto h-4 w-2/3" />
    </div>
  ) : messages.length === 0 ? (
    <div className="min-h-0 flex-1 pt-2">
      <EmptyState title={t('chat.emptyTitle')} body={t('chat.emptyBody')} />
    </div>
  ) : (
    <div
      // The scroller: ONE child in a reversed column, so the list is pinned to the bottom (the
      // newest message on the composer) and older days leave through the top. In the embedded
      // form the host caps the height; `min-h-32` keeps the thread from being crushed to a sliver.
      //
      // Inline rather than the Tailwind reverse-column utility: the token gate's
      // `undefined-utility` rule matches anything shaped like a `col-*` class, and that
      // utility's name collides with it. The rule is right to be broad — `col-mobile` and
      // `col-wide` are real project utilities and a typo in either must fail the build — so
      // the exception lives here, named, rather than the rule being loosened for everybody.
      style={{ flexDirection: 'column-reverse' }}
      className={cn('flex min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2', showBlockAction && 'min-h-32')}
    >
      <ol aria-label={t('chat.thread')} className="flex flex-col gap-5">
        {days.map((day, d) =>
          day.messages.map((m, i) => {
            const mine = m.sender_id === meId || m.id < 0;
            return (
              // One item per message, as before; the first message of a day carries the day's
              // date above it and stands 32 below the day before (20 + 12).
              <li key={m.id} className={cn('flex flex-col gap-3', i === 0 && d > 0 && 'mt-3')}>
                {i === 0 ? <p className="text-micro text-center text-text-2">{day.label}</p> : null}
                <ThreadMessage
                  message={m}
                  mine={mine}
                  pending={m.id < 0}
                  reported={reported.includes(m.id)}
                  locale={i18n.language}
                  onReport={mine || m.deleted_at ? undefined : reportOf(m)}
                />
              </li>
            );
          }),
        )}
      </ol>
    </div>
  );

  // ── the composer ───────────────────────────────────────────────────────────────────────────
  // The kit's field (label, the 44 line that grows by whole lines, the underline) with the send
  // pill standing on its underline 20 to the right, and under the field the hint and the counter.
  // A failed send puts the danger line above it; a blocked conversation replaces it with one
  // quiet line — and `Feloldás` only for the person who blocked. Being blocked is not undone.
  const composer = blocked ? (
    <NoticeLine
      action={
        blockedByMe ? (
          <TextLink lead={<Undo2 />} onClick={() => block.mutate(false)}>
            {t('chat.unblock')}
          </TextLink>
        ) : undefined
      }
    >
      {t('chat.blocked')}
    </NoticeLine>
  ) : (
    <div className="flex flex-col gap-2">
      {failed ? (
        <NoticeLine tone="danger" role="alert">
          {t('chat.sendFailed')}
        </NoticeLine>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2">
        {/* A visible label, not a placeholder: a placeholder is not a label and it disappears
            on the first keystroke — which is exactly when the counter below starts moving. */}
        <TextArea
          id={composerId}
          label={t('chat.compose')}
          aria-describedby={hintId}
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
          maxLength={BODY_MAX}
          maxRows={5}
        />
        {/* The screen's one lime shape, and only while there is something to send: the kit's
            small pill with the paper plane the hint below names, standing on the underline. */}
        <Pressable
          variant="primary"
          size="sm"
          className="self-end"
          aria-label={t('chat.send')}
          busy={send.isPending}
          disabled={!draft.trim()}
          onClick={() => void submit()}
        >
          <Send className="size-5" aria-hidden />
        </Pressable>
        <div className="flex items-start justify-between gap-2">
          {/* The plane-button affordance, wired to the field with `aria-describedby`. */}
          <span id={hintId} className="text-cap min-w-0 text-text-3">
            {t('chat.composeHint')}
          </span>
          {/* Numerals, and `aria-hidden`: the input's own `maxLength` is what assistive tech
              reads, and a counter that announced itself on every keystroke would be unusable. */}
          <span aria-hidden className="text-data shrink-0 text-text-3">
            {draft.length} / {BODY_MAX}
          </span>
        </div>
      </div>
    </div>
  );

  // ── the screen form: the thread fills what the page leaves it, the composer is docked ───────
  if (!showBlockAction) {
    return (
      <div className={cn('flex min-h-0 flex-col', className)}>
        {thread}
        <Dock>{composer}</Dock>
      </div>
    );
  }

  // ── the embedded form (the client detail's Üzenetek tab) ────────────────────────────────────
  return (
    <div className={cn('flex min-h-0 flex-col gap-6', className)}>
      {/* `Letiltás` in the far corner, nowhere near send. The row keeps its height when the
          link is gone (blocked), so the identity does not jump on a state change. */}
      <div className="flex min-h-11 items-start justify-end">
        {blocked ? null : (
          <TextLink lead={<Ban />} onClick={() => block.mutate(true)}>
            {t('chat.block')}
          </TextLink>
        )}
      </div>

      {/* The person as type: the monogram (no dot — beside a chat partner a dot reads as
          "online", which the product cannot know) and the name. */}
      {name ? (
        <div className="flex flex-col gap-3">
          <Monogram initials={initialsOf(name)} size={64} className="self-start" />
          <h2 className="text-title truncate text-text-1">{name}</h2>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <MonogramSkeleton size={64} className="self-start" />
          <Skeleton className="h-7 w-40" />
        </div>
      )}

      {thread}
      {composer}
    </div>
  );
}

/**
 * One message, no bubble: the text (`body`, balanced, at most 280) and 4 under it the mono stamp.
 * Theirs on the left in `text-1`; mine on the right in `text-2`. `data-kit="chatMsg"` names it
 * for the geometry probe.
 */
function ThreadMessage({
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
  const side = mine ? 'items-end text-right' : 'items-start text-left';

  // A withdrawn message keeps its place. The thread must still show that something was there and
  // taken back; erasing the row would make it lie about what happened.
  if (message.deleted_at) {
    return (
      <div data-kit="chatMsg" className={cn('flex flex-col', side)}>
        <p className="text-cap max-w-70 italic text-text-3">{t('chat.withdrawn')}</p>
      </div>
    );
  }

  const time = timeOf(message.created_at, locale);
  // Two states, not one. A sent message with no read stamp used to show a bare time, which reads
  // the same as a message that never left. `Kézbesítve` is the honest middle step. `!pending` is
  // load-bearing: the optimistic message also has a null `read_at`, and "Küldés… Kézbesítve"
  // would claim a delivery that has not happened.
  let stamp: ReactNode;
  if (pending) stamp = <span className="text-text-3">{t('chat.sending')}</span>;
  else if (mine && message.read_at)
    stamp = (
      <>
        <span className="text-text-3">{time} ·</span>
        <Check className="size-3 shrink-0 text-text-2" strokeWidth={2.5} aria-hidden />
        <span className="text-text-2">{t('chat.read')}</span>
      </>
    );
  else if (mine) stamp = <span className="text-text-3">{`${time} · ${t('chat.delivered')}`}</span>;
  else stamp = <span className="text-text-3">{time}</span>;

  return (
    <div data-kit="chatMsg" className={cn('group flex flex-col gap-1', side, pending && 'opacity-60')}>
      {/* Text renders as TEXT. No dangerouslySetInnerHTML, and no auto-linking: a clickable URL in
          a message from someone you have not met is an exfiltration surface. */}
      <p className={cn('text-body max-w-70 whitespace-pre-wrap break-words text-balance', mine ? 'text-text-2' : 'text-text-1')}>
        {message.body}
      </p>
      <div className="text-micro relative flex items-center gap-1.25">
        {stamp}
        {/* Reporting is not drawn at rest: a persistent `Jelentés` on every message makes every
            message look like evidence. It stays in the DOM and in the tab order — a keyboard user
            must reach it — and appears on pointer hover or keyboard focus. Hidden, it takes no
            tap either (`pointer-events-none`): the unpainted control used to file a report on an
            accidental touch. It stands beside the stamp, out of flow, so its 44 pt target does
            not open the 16 pt stamp row. */}
        {onReport ? (
          <TextLink
            lead={<Flag />}
            disabled={reported}
            onClick={onReport}
            className={cn(
              'pointer-events-none absolute start-full top-1/2 ms-3 -translate-y-1/2 whitespace-nowrap opacity-0',
              'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
              'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
              'group-hover:pointer-events-auto group-hover:opacity-100',
            )}
          >
            {reported ? t('chat.reported') : t('chat.report')}
          </TextLink>
        ) : null}
      </div>
    </div>
  );
}
