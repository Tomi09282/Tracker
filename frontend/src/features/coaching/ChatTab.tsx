import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { TextLink } from '../../ui/primitives/TextLink';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useSession } from '../auth/useSession';
import { ChatPanel } from '../chat/ChatPanel';
import { useClientConversation } from '../chat/useChat';

/**
 * The coach's chat, on the client detail screen.
 *
 * IT LIVES HERE RATHER THAN IN A NAV TAB, and that is the decision that kept Phase 3 from needing
 * a sixth bottom-bar slot the bar does not have. A coach's chat is always ABOUT a client, so
 * reaching it through the client is the shorter path — and it inherits the link's ownership
 * predicate for free, because the screen already proved the link is theirs to see.
 *
 * The conversation is opened lazily and idempotently: `conversations.coach_client_id` is UNIQUE,
 * so a coach and a client tapping chat at the same moment both land on the same thread.
 */
export function ChatTab({ linkId }: { linkId: number }) {
  const { t } = useTranslation();
  const { data: me } = useSession();
  // The resolver moved into `useChat` when the chat route was written: two callers, one mapping
  // from a link to a thread.
  const { conversation, isPending } = useClientConversation(linkId);

  if (isPending) {
    return (
      <div className="flex min-h-32 flex-col justify-end gap-5 pt-2" role="status" aria-label={t('common.loading')}>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="ms-auto h-4 w-2/3" />
      </div>
    );
  }

  if (!conversation) {
    // The link went away between the screen loading and the chat opening — archived, or the client
    // left. The tab says so rather than spinning forever.
    return (
      <NoticeLine tone="info" role="status">
        {t('chat.unavailable')}
      </NoticeLine>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* THE DOOR TO THE FULL SCREEN, and it is what makes that route reachable at all.
          `coach-chat` is its own screen — a thread inside a tab inside a scrolling page is a
          scrolling box in a scrolling box, which is the one shape a conversation must not have.
          The standalone route was written and mounted with nothing linking to it, and `check-nav`
          refused the build for exactly that: on a phone the command palette that lists it is
          hidden below 1024px, so a route with no link is a screen nobody can open.
          The tab keeps the panel, because reading the last few messages beside the client's plan
          is the common case; this is the way OUT of the tab and into the conversation. */}
      <TextLink to={`/coach/clients/${linkId}/chat`} text="body" className="self-start" trail={<ChevronRight />}>
        {t('chat.openFull')}
      </TextLink>
      <ChatPanel
        conversationId={conversation.id}
        meId={me?.id ?? -1}
        blocked={conversation.blocked_at != null}
        blockedByMe={conversation.blocked_by === me?.id}
        // The thread scrolls inside its own box, so the client detail page itself does not grow.
        className="max-h-[60vh]"
      />
    </div>
  );
}
