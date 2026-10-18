// src/lifeos/reminders.js — reminders without push (plan "Reminders without push", Phase 5).
//
// There is no scheduler and no Web Push in this product (yet). A reminder becomes a notification
// in the bell the first time the user's own app asks after it is due: GET /lifeos/today and the
// bell's unread poll (GET /notifications/unread-count) call ensureReminders, which runs ONE worker
// transaction — materializeRemindersTx (src/db/tx/lifeos-events.js) — that delivers every due
// reminder once, deduplicated by reminder_deliveries. The honest limit, stated in the product: a
// reminder appears when the app is open (or next opened within 6 hours of it), not on a locked
// phone.
//
// ═══ ROUTE SIDE ONLY ═══════════════════════════════════════════════════════════════════════════
//
// This module imports the pool facade, so the worker must never import it (a worker that imports
// the facade starts a second pool inside itself). The pure planning lives in ./occurrences.js.
//
// ═══ THE PER-PROCESS MEMO ══════════════════════════════════════════════════════════════════════
//
// The unread poll runs every few seconds per open tab; a write transaction on each would be waste.
// After a run the next one waits MEMO_MS, so a reminder can arrive up to that much after its fire
// time — the window it is delivered in is six hours, so nothing is lost, only delayed. An event
// write in this process clears the memo (the new event's reminders are checked on the next poll).
// It is an optimisation only: a stale memo (another process) delays, it never duplicates — the
// dedupe is in the transaction.
import * as db from '../db/index.js';

export const MEMO_MS = 2 * 60 * 1000;
const MEMO_MAX = 50_000;
const memo = new Map(); // userId -> the earliest instant (ms) the next run may happen

export function invalidateReminders(userId) {
  memo.delete(userId);
}

/**
 * Deliver the user's due reminders. Never throws to the caller's request: a failed run is logged
 * and retried on the next request — the read that triggered it still answers.
 */
export async function ensureReminders(userId, { log = null } = {}) {
  const until = memo.get(userId);
  if (until && Date.now() < until) return;
  try {
    await db.materializeReminders({ userId });
    if (memo.size >= MEMO_MAX) memo.clear();
    memo.set(userId, Date.now() + MEMO_MS);
  } catch (err) {
    log?.error?.({ err, userId }, 'lifeos reminders failed');
  }
}
