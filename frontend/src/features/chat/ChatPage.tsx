import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Ban } from 'lucide-react';
import { initialsOf, personLabel } from '../../lib/person';
import { TextLink } from '../../ui/primitives/TextLink';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Monogram, MonogramSkeleton } from '../../ui/data/Monogram';
import { Rule } from '../../ui/data/Rule';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
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
 * ═══ THE HEADER BELONGS TO THE PAGE, NOT TO THE PANEL ══════════════════════════════════════════
 *
 * A panel embedded in someone else's screen cannot own a back link. Here the page draws the whole
 * pushed header — the way back, `Letiltás`, the person — and passes `showBlockAction={false}`, so
 * the panel is only the thread and the docked composer (Pulse: coach-chat-1 / -2).
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
  const name = conversation ? personLabel({ email: conversation.other_email, display_name: conversation.other_display_name }) : '';

  return (
    // Exactly one viewport tall (minus the bar): the header stands, the thread scrolls inside the
    // free height, the composer is docked above the bar — coach-chat-1 / -2.
    <Screen top="push" gap="tight" fill="fixed">
      {/* The way back comes from `app/routeMeta.ts` (Klienseim → /coach, the roster: a coach arrives
          with a question and leaves the moment it is answered). `Letiltás` is the quiet link in
          the far corner, nowhere near send; it is gone while loading and once blocked — lifting a
          block is the panel's `Feloldás`, and only for the person who blocked. */}
      <ScreenHeader
        kind="push"
        className="pb-2"
        trailing={
          conversation && !blocked ? (
            <TextLink lead={<Ban />} onClick={() => block.mutate(true)}>
              {t('chat.block')}
            </TextLink>
          ) : undefined
        }
      >
        {/* WHO: the screen has no title string — the person is the heading. The monogram has no
            dot: beside a chat partner a lime dot reads as "online", which the product cannot know. */}
        {isPending ? (
          <div className="flex flex-col gap-3">
            <MonogramSkeleton size={96} className="self-start" />
            <Skeleton className="h-7 w-40" />
          </div>
        ) : conversation ? (
          <div className="flex flex-col gap-3">
            <Monogram initials={initialsOf(name)} size={96} className="self-start" />
            <h1 className="text-title truncate text-text-1">{name}</h1>
          </div>
        ) : null}
      </ScreenHeader>

      {isPending ? (
        <>
          <Rule strong />
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-5 pb-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="ms-auto h-4 w-2/3" />
          </div>
        </>
      ) : !conversation ? (
        // The link was archived or the client left between the roster loading and this opening.
        <EmptyState heading="h1" title={t('chat.unavailable')} />
      ) : (
        <>
          {/* who | what was said — the thread scrolls under this rule */}
          <Rule strong />
          <ChatPanel
            conversationId={conversation.id}
            meId={me?.id ?? -1}
            blocked={blocked}
            blockedByMe={conversation.blocked_by === me?.id}
            showBlockAction={false}
            className="flex-1"
          />
        </>
      )}
    </Screen>
  );
}
