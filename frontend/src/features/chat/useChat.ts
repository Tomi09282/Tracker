import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiWithRefresh } from '../../lib/api';

export interface Conversation {
  id: number;
  coach_client_id: number | null;
  coach_id: number | null;
  client_id: number;
  blocked_at: number | null;
  blocked_by: number | null;
  last_message_at: number | null;
  unread: number;
  last_body: string | null;
  other_email: string;
  other_display_name: string | null;
}

export interface Message {
  id: number;
  sender_id: number | null;
  body: string | null;
  created_at: number;
  read_at: number | null;
  deleted_at: number | null;
  storage_key: string | null;
  mime: string | null;
  bytes: number | null;
  duration_seconds: number | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: number | null;
  created_at: number;
}

const CONVERSATIONS = ['conversations'] as const;
const NOTIFICATIONS = ['notifications'] as const;
const UNREAD = ['notifications', 'unread'] as const;

/**
 * Polling cadence, decided once here rather than at each call site.
 *
 * `document.hidden` gates both: a phone in a pocket must not poll. `refetchInterval` accepts a
 * function precisely so this is one line instead of a visibility effect, and returning `false`
 * pauses rather than stopping — the query resumes on its own when the tab comes back.
 */
const whileVisible = (ms: number) => () => (typeof document !== 'undefined' && document.hidden ? false : ms);

/** 60 s. A badge a minute stale costs nothing; one polling every 5 s from every screen is a battery bug. */
export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD,
    queryFn: () => apiWithRefresh<{ unread: number; capped: boolean }>('/notifications/unread-count'),
    refetchInterval: whileVisible(60_000),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS,
    queryFn: () => apiWithRefresh<{ notifications: AppNotification[]; nextBefore: number | null }>('/notifications'),
    refetchInterval: whileVisible(60_000),
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) =>
      apiWithRefresh<{ read: number }>('/notifications/read', { method: 'POST', body: ids ? { ids } : {} }),
    // The badge is refetched, never decremented locally. Optimistic arithmetic on a count the
    // server owns is where badges start lying — and the count is capped server-side, so a local
    // decrement would drift the moment there were more than a hundred.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS });
      void qc.invalidateQueries({ queryKey: UNREAD });
    },
  });
}

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS,
    queryFn: () => apiWithRefresh<{ conversations: Conversation[] }>('/conversations'),
    refetchInterval: whileVisible(30_000),
  });
}

/** Open the thread for a relationship, or get the one that exists. Idempotent server-side. */
export function useOpenConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (coachClientId: number) =>
      apiWithRefresh<{ conversation: Conversation }>('/conversations', {
        method: 'POST',
        body: { coach_client_id: coachClientId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONVERSATIONS }),
  });
}

/** 5 s with the thread open. Fast enough to feel live, slow enough not to be a data bill. */
export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: conversationId != null,
    queryFn: () =>
      apiWithRefresh<{ messages: Message[]; nextBefore: number | null }>(
        `/conversations/${conversationId}/messages`,
      ),
    refetchInterval: whileVisible(5_000),
  });
}

/**
 * Send a message.
 *
 * OPTIMISTIC, because the send being instant is what makes a polling app feel live — a three
 * second round trip before your own text appears never does.
 *
 * The pending bubble carries a negative id so it cannot collide with a real one, and the rollback
 * KEEPS it rather than removing it: a message that vanishes on failure reads as a message that
 * sent. That was the T2.0.3 lesson from the set row, and it is the same mistake here.
 */
export function useSendMessage(conversationId: number | null) {
  const qc = useQueryClient();
  const key = ['messages', conversationId] as const;

  return useMutation({
    mutationFn: (body: string) =>
      apiWithRefresh<{ id: number }>(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { body },
      }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ messages: Message[]; nextBefore: number | null }>(key);
      const optimistic: Message = {
        id: -Date.now(),
        sender_id: null,
        body,
        created_at: Math.floor(Date.now() / 1000),
        read_at: null,
        deleted_at: null,
        storage_key: null,
        mime: null,
        bytes: null,
        duration_seconds: null,
      };
      qc.setQueryData(key, {
        messages: [optimistic, ...(previous?.messages ?? [])],
        nextBefore: previous?.nextBefore ?? null,
      });
      return { previous, optimisticId: optimistic.id };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: CONVERSATIONS });
    },
  });
}

export function useMarkThreadRead(conversationId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiWithRefresh<{ read: number }>(`/conversations/${conversationId}/read`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONVERSATIONS });
      void qc.invalidateQueries({ queryKey: UNREAD });
    },
  });
}

export function useBlockConversation(conversationId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blocked: boolean) =>
      apiWithRefresh(`/conversations/${conversationId}/${blocked ? 'block' : 'unblock'}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CONVERSATIONS }),
  });
}

export function useReportMessage() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiWithRefresh(`/messages/${id}/report`, { method: 'POST', body: { reason } }),
  });
}
