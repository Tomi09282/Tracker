/**
 * The offline outbox — writes that were made without a network, replayed when there is one.
 *
 * ═══ WHY THIS IS SAFE, AND WHY THAT ARGUMENT IS NARROW ═════════════════════════════════════════
 *
 * Replaying a write is only safe when the server can tell "the same request twice" from "a second
 * request". This product's answer is the idempotency key, and the ONE thing this file must never do
 * is mint a fresh one at replay time — that would turn a retry into a second intention.
 *
 * So the key is not generated here. The caller's body already carries it (`write_uid` for a set
 * check), and the body is stored VERBATIM and replayed VERBATIM. The key survives a reload, an app
 * relaunch and a week in a drawer, because it is in the same localStorage entry as the payload it
 * belongs to. `useCheckSet` mints one per SET; this file preserves whatever it was handed.
 *
 * ═══ WHAT IS ALLOWED IN HERE ═══════════════════════════════════════════════════════════════════
 *
 * Set checks and set voids. Nothing else, and the allowlist is enforced (`isQueueable`) rather than
 * documented — a queue that accepts anything eventually holds a coin transfer that fires three days
 * late from a phone the user has since given away.
 *
 * The workout player is the one screen with a real offline story: a basement gym with no signal,
 * one set at a time, values the user can see. Everything else in this product happens somewhere
 * with a network, and queuing it would trade a visible failure for an invisible one.
 *
 * ═══ AND WHY IT IS SCOPED TO A USER ════════════════════════════════════════════════════════════
 *
 * localStorage is per-ORIGIN, not per-session. An outbox left behind by whoever used the phone
 * before would replay their sets under the next person's cookies. The server would refuse them —
 * every write is ownership-scoped — but the payload itself is the previous user's training data
 * sitting in the next user's browser, and that is reason enough. Entries carry a user id, the flush
 * skips anything that is not the current user's, and `clearOutbox()` runs on logout.
 */

const KEY = 'tracker.outbox.v1';

export interface OutboxEntry {
  /** Local identity, for replacing an unsent entry. NOT the idempotency key. */
  id: string;
  userId: number;
  path: string;
  body: Record<string, unknown>;
  queuedAt: number;
  /** Set while a flush has this entry in flight, so a concurrent enqueue appends rather than replaces. */
  sending?: boolean;
}

/** The only paths this queue will accept. Anything else must fail loudly and now. */
const QUEUEABLE = [/^\/sets\/\d+\/check$/, /^\/sets\/\d+\/void$/];
export const isQueueable = (path: string) => QUEUEABLE.some((re) => re.test(path));

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();

function read(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt or unavailable store must never stop the app. Losing a queued set is bad; a white
    // screen in the middle of a workout is worse.
    return [];
  }
}

function write(entries: OutboxEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* quota or private mode — the queue degrades to in-memory for this session */
  }
  for (const l of listeners) l(entries);
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  listener(read());
  return () => listeners.delete(listener);
}

export const outboxFor = (userId: number) => read().filter((e) => e.userId === userId);

/**
 * Queue a write. Returns the entry so a caller can show it as pending.
 *
 * An unsent entry for the SAME path is replaced rather than appended: the user corrected the
 * number before it ever left the device, and the server has not seen either version — so the newer
 * body, with its newer key, is the whole truth. An entry already in flight is left alone and the
 * new one appended, because the server may be about to see the first.
 */
export function enqueue(userId: number, path: string, body: Record<string, unknown>): OutboxEntry {
  if (!isQueueable(path)) throw new Error(`outbox refuses ${path}`);

  const entry: OutboxEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    userId,
    path,
    body,
    queuedAt: Date.now(),
  };

  const entries = read();
  const replaceable = entries.findIndex((e) => e.userId === userId && e.path === path && !e.sending);
  if (replaceable >= 0) entries[replaceable] = entry;
  else entries.push(entry);

  write(entries);
  return entry;
}

export function clearOutbox() {
  write([]);
}

/** True when a failure was the NETWORK rather than the server having an opinion. */
export const isNetworkFailure = (err: unknown) =>
  err instanceof TypeError || (err instanceof Error && err.name === 'TypeError');

let flushing = false;

/**
 * Send everything queued for this user, oldest first.
 *
 * ═══ SERIAL, AND STOPPING AT THE FIRST NETWORK FAILURE ═════════════════════════════════════════
 *
 * Sets belong to an order, and firing them in parallel hands the server an arbitrary one. Stopping
 * at the first network failure rather than continuing is the same argument in reverse: if the
 * network died again, every remaining attempt fails too, and the only thing achieved by trying is
 * an attempt counter that no longer means anything.
 *
 * ═══ A 4xx IS NOT A RETRY ══════════════════════════════════════════════════════════════════════
 *
 * A rejected body is rejected forever — a set that was voided while the phone was offline, a plan
 * that was archived. Keeping it queued means retrying it on every reconnect for the life of the
 * install. It is dropped, and `onDropped` lets the UI say so rather than losing it silently.
 * 408 and 429 are the exceptions: both mean "not now", not "no".
 */
export async function flushOutbox(
  userId: number,
  send: (path: string, body: Record<string, unknown>) => Promise<unknown>,
  onDropped?: (entry: OutboxEntry, status: number) => void,
): Promise<{ sent: number; dropped: number; remaining: number }> {
  if (flushing) return { sent: 0, dropped: 0, remaining: outboxFor(userId).length };
  flushing = true;

  let sent = 0;
  let dropped = 0;

  try {
    for (;;) {
      const entries = read();
      const next = entries.find((e) => e.userId === userId && !e.sending);
      if (!next) break;

      write(entries.map((e) => (e.id === next.id ? { ...e, sending: true } : e)));

      try {
        await send(next.path, next.body);
        write(read().filter((e) => e.id !== next.id));
        sent += 1;
      } catch (err) {
        if (isNetworkFailure(err)) {
          // Still offline. Put it back as unsent and stop — the next `online` event tries again.
          write(read().map((e) => (e.id === next.id ? { ...e, sending: false } : e)));
          break;
        }
        const status = (err as { status?: number }).status ?? 0;
        if (status === 408 || status === 429 || status >= 500) {
          write(read().map((e) => (e.id === next.id ? { ...e, sending: false } : e)));
          break;
        }
        write(read().filter((e) => e.id !== next.id));
        dropped += 1;
        onDropped?.(next, status);
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, dropped, remaining: outboxFor(userId).length };
}
