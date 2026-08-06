import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useSession } from '../auth/useSession';
import { ChatPanel } from '../chat/ChatPanel';
import { useConversations, useOpenConversation } from '../chat/useChat';

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
  const { data, isPending } = useConversations();
  const open = useOpenConversation();

  const conversation = (data?.conversations ?? []).find((c) => c.coach_client_id === linkId) ?? null;

  useEffect(() => {
    if (isPending || conversation || open.isPending || open.isSuccess) return;
    open.mutate(linkId);
  }, [isPending, conversation, linkId, open]);

  if (isPending || (!conversation && open.isPending)) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-2/3 rounded-card" />
        <Skeleton className="ml-auto h-16 w-2/3 rounded-card" />
      </div>
    );
  }

  if (!conversation) {
    // The link went away between the screen loading and the chat opening — archived, or the client
    // left. The tab says so rather than spinning forever.
    return <p className="text-body-s text-text-2">{t('chat.unavailable')}</p>;
  }

  return (
    <ChatPanel
      conversationId={conversation.id}
      meId={me?.id ?? -1}
      blocked={conversation.blocked_at != null}
      blockedByMe={conversation.blocked_by === me?.id}
      // The thread scrolls inside its own box, so the client detail page itself does not grow.
      className="max-h-[60vh]"
    />
  );
}
