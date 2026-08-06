import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Flag, MessageSquare, Send, Undo2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import {
  useMessages,
  useSendMessage,
  useMarkThreadRead,
  useBlockConversation,
  useReportMessage,
  type Message,
} from './useChat';

/** A day divider. Dates are the only structure a long conversation has. */
const dayOf = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const timeOf = (unix: number) =>
  new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * The conversation, per blueprint 8.
 *
 * ONE COMPONENT FOR BOTH SIDES. A coach reaches it through a client, a client through their coach,
 * and neither needs a different thread renderer — the only difference is which bubbles are "mine",
 * which the server already answers with `sender_is_coach` semantics carried in `mine`.
 *
 * THE LIST IS COLUMN-REVERSE, which is the whole trick: the browser pins a reversed flex column to
 * its bottom for free, so a new message appears without a scroll calculation, and scrolling UP to
 * read history does not fight it. The server already returns newest-first, so no reversing happens
 * in JavaScript either.
 */
export function ChatPanel({
  conversationId,
  meId,
  blocked,
  blockedByMe,
  className,
}: {
  conversationId: number;
  meId: number;
  blocked: boolean;
  blockedByMe: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const markRead = useMarkThreadRead(conversationId);
  const block = useBlockConversation(conversationId);
  const report = useReportMessage();

  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [reported, setReported] = useState<number[]>([]);

  const messages = data?.messages ?? [];
  const unreadCount = messages.filter((m) => m.sender_id !== meId && m.read_at == null && !m.deleted_at).length;

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

  if (isPending) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <Skeleton className="h-16 w-2/3 rounded-card" />
        <Skeleton className="ml-auto h-16 w-2/3 rounded-card" />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {/* ── the thread ───────────────────────────────────────────────────────────────────────── */}
      {messages.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t('chat.emptyTitle')} body={t('chat.emptyBody')} />
      ) : (
        <ol
          className="flex min-h-0 gap-1 overflow-y-auto overscroll-contain"
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
            const newDay = !previous || dayOf(previous.created_at) !== dayOf(m.created_at);
            return (
              <li key={m.id} className="flex flex-col">
                <Bubble
                  message={m}
                  mine={mine}
                  pending={m.id < 0}
                  reported={reported.includes(m.id)}
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
                  <p className="text-caption my-2 text-center text-text-3">{dayOf(m.created_at)}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {/* ── the composer ────────────────────────────────────────────────────────────────────── */}
      {blocked ? (
        <div className="flex items-center justify-between gap-2 rounded-card bg-surface-2 p-3">
          <p className="text-caption text-text-2">{t('chat.blocked')}</p>
          {/* Only the person who blocked can lift it. Being blocked is not a state you undo. */}
          {blockedByMe ? (
            <Pressable shape="chip" density="compact" variant="secondary" onClick={() => block.mutate(false)}>
              <Undo2 className="size-icon-s" aria-hidden />
              {t('chat.unblock')}
            </Pressable>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {failed ? (
            <p role="alert" className="text-caption text-danger">
              {t('chat.sendFailed')}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
              // Enter sends, Shift+Enter breaks the line. On a phone the on-screen keyboard's
              // return key inserts a newline instead, which is why the send button is not optional.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              aria-label={t('chat.compose')}
              placeholder={t('chat.compose')}
              className={cn(
                'min-h-[var(--target-min)] max-h-32 flex-1 resize-none rounded-field bg-surface-2 px-3 py-2',
                'text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--focus-ring)]',
              )}
            />
            <Pressable
              shape="icon"
              variant="primary"
              aria-label={t('chat.send')}
              busy={send.isPending}
              disabled={!draft.trim()}
              onClick={() => void submit()}
            >
              <Send className="size-icon-m" aria-hidden />
            </Pressable>
          </div>
          <div className="flex justify-end">
            <Pressable shape="chip" density="compact" variant="ghost" onClick={() => block.mutate(true)}>
              <Ban className="size-icon-s" aria-hidden />
              {t('chat.block')}
            </Pressable>
          </div>
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
  onReport,
}: {
  message: Message;
  mine: boolean;
  pending: boolean;
  reported: boolean;
  onReport?: () => void;
}) {
  const { t } = useTranslation();

  // A withdrawn message keeps its place. The thread must still show that something was there and
  // taken back; erasing the row would make it lie about what happened.
  if (message.deleted_at) {
    return (
      <div className={cn('max-w-[80%] rounded-card px-3 py-2', mine ? 'ml-auto' : 'mr-auto')}>
        <p className="text-caption italic text-text-3">{t('chat.withdrawn')}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group max-w-[80%] rounded-card px-3 py-2',
        // Per blueprint 8: the coach's side carries the accent, the client's the plain surface.
        mine ? 'ml-auto bg-accent-subtle' : 'mr-auto bg-surface-1',
        pending && 'opacity-60',
      )}
    >
      {/* Text renders as TEXT. No dangerouslySetInnerHTML anywhere in this component, and no
          auto-linking: a clickable URL in a message from someone you have not met is an
          exfiltration surface, and this product has a report flow precisely because not every
          message is friendly. */}
      <p className="text-body whitespace-pre-wrap break-words">{message.body}</p>
      <div className="text-caption mt-0.5 flex items-center gap-2 text-text-3">
        <span className="tabular-nums">{pending ? t('chat.sending') : timeOf(message.created_at)}</span>
        {mine && message.read_at ? <span>{t('chat.read')}</span> : null}
        {onReport ? (
          <Pressable
            shape="chip"
            density="compact"
            variant="ghost"
            className="ml-auto"
            disabled={reported}
            onClick={onReport}
          >
            <Flag className="size-icon-s" aria-hidden />
            {reported ? t('chat.reported') : t('chat.report')}
          </Pressable>
        ) : null}
      </div>
    </div>
  );
}
