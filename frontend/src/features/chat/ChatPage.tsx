import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Ban } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useSession } from '../auth/useSession';
import { ChatPanel } from './ChatPanel';
import { useBlockConversation, useClientConversation } from './useChat';

/**
 * The conversation, on its own route — [[55-Screens/coach-chat]].
 *
 * ═══ WHY IT IS NOT A TAB ANY MORE ══════════════════════════════════════════════════════════════
 *
 * `ChatPanel` was only ever mounted as the fourth tab of the client detail screen, which meant it
 * rendered under a whole other page: a second monogram anchor, a second name, a questionnaire
 * disclosure and a tablist above it, and then a thread capped at a fraction of what was left. That
 * is the reason the previous design read as a data field with messages in it. The chat is promoted
 * to a route so it gets the whole column; the cost is one line of routing, and the two context
 * chips carry the only cross-tab jumps that mattered.
 *
 * ═══ THE BAR BELONGS TO THE PAGE, NOT TO THE PANEL ═════════════════════════════════════════════
 *
 * `ChatPanel` used to open with a half-drawn bar — an empty left half and the `Letiltás` chip on
 * the right — because a panel embedded in someone else's screen cannot own a back link. Here the
 * page draws the whole bar and passes `showBlockAction={false}`, so the panel stops half-owning
 * something it could not finish.
 *
 * The back link goes to `/coach`, NOT to the client detail screen: a coach arrives here with a
 * question already formed and leaves the moment it is answered, so the way out is the roster.
 */
export function ChatPage() {
  const { t } = useTranslation();
  const params = useParams();
  const linkId = Number.parseInt(params.id ?? '', 10);
  const { data: me } = useSession();
  const { conversation, isPending } = useClientConversation(Number.isFinite(linkId) ? linkId : null);
  const block = useBlockConversation(conversation?.id ?? null);

  const blocked = conversation?.blocked_at != null;

  return (
    <div className="col-mobile screen-x flex flex-col gap-group py-6">
      {/* One bar across the top: the way back on the left, the rare semi-irreversible act on the
          right, on one baseline. `Letiltás` is in a corner precisely so it is nowhere near the
          composer — under it, it was one mis-tap from send. */}
      <div className="flex items-center justify-between gap-tight">
        <Link
          to="/coach"
          className="text-body-s inline-flex min-h-[var(--target-min)] items-center gap-tight text-text-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {/* A resting holder, as the mockup draws it: over the aurora a bare chevron has no edge
              of its own. Circular, like every other holder that stands for a person or their
              inbox. */}
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-chip border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-2"
          >
            <ArrowLeft className="size-icon-m" />
          </span>
          {t('coaching.title')}
        </Link>

        {/* Gone once the conversation is blocked — lifting it is the panel's `Feloldás` chip, and
            only for the person who blocked. */}
        {conversation && !blocked ? (
          <Pressable shape="chip" density="compact" variant="ghost" onClick={() => block.mutate(true)}>
            <Ban className="size-icon-s" aria-hidden />
            {t('chat.block')}
          </Pressable>
        ) : null}
      </div>

      {isPending ? (
        // The anchor's geometry, not a generic block: a circle where the monogram goes, a bar for
        // the name, two bubbles at the width the real ones use.
        <div className="flex flex-col gap-section">
          <div className="flex flex-col items-center gap-tight">
            <Skeleton className="size-28 rounded-full" />
            <Skeleton className="h-7 w-40" />
          </div>
          <div className="flex flex-col gap-tight">
            <Skeleton className="h-16 w-2/3 rounded-card" />
            <Skeleton className="ms-auto h-16 w-2/3 rounded-card" />
          </div>
        </div>
      ) : !conversation ? (
        // The link was archived or the client left between the roster loading and this opening.
        <p className="text-body-s text-text-2">{t('chat.unavailable')}</p>
      ) : (
        // NO HEIGHT CAP. The page scrolls; the thread does not scroll inside a box inside a page.
        // The reversed column still pins the newest message to the bottom of the thread without a
        // scroll calculation — that behaviour comes from the flex direction, not from a cap.
        <ChatPanel
          conversationId={conversation.id}
          meId={me?.id ?? -1}
          blocked={blocked}
          blockedByMe={conversation.blocked_by === me?.id}
          showBlockAction={false}
        />
      )}
    </div>
  );
}
