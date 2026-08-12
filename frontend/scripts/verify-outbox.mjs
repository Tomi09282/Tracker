/**
 * The offline outbox, exercised.
 *
 * ═══ IT IMPORTS THE REAL FILE ══════════════════════════════════════════════════════════════════
 *
 * `src/lib/outbox.ts`, not a transcription of it. An audit that carries its own copy of what it
 * audits eventually disagrees with it — `verify-autosave` proved that the hard way earlier in this
 * phase, by testing a `save(payload)` signature the hook had never had.
 *
 * localStorage is the only browser API the module touches, and it is shimmed here in six lines
 * rather than by pulling in jsdom. The shim is deliberately dumb: a Map behind the four methods the
 * module actually calls, so nothing about the test can pass that the browser would fail.
 *
 * Run: npm run verify:outbox
 */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { enqueue, flushOutbox, outboxFor, clearOutbox, isQueueable, isNetworkFailure } = await import(
  '../src/lib/outbox.ts'
);

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (pass += 1) : (fail += 1);
};

const ME = 7;
const OTHER = 8;
const netFail = () => Promise.reject(new TypeError('Failed to fetch'));
const httpFail = (status) => () => Promise.reject(Object.assign(new Error('http'), { status }));

/* ── the allowlist is enforced, not documented ───────────────────────────────────────────────── */

check('a set check is queueable', isQueueable('/sets/42/check'));
check('a set void is queueable', isQueueable('/sets/42/void'));
check('a coin transfer is NOT', !isQueueable('/coins/transfer'));
check('and neither is a post', !isQueueable('/compose/posts'));
{
  let threw = false;
  try {
    enqueue(ME, '/coins/transfer', { amount: 5000 });
  } catch {
    threw = true;
  }
  check('enqueueing something off the list THROWS rather than quietly accepting it', threw);
}

/* ── the idempotency key survives, which is the whole safety argument ─────────────────────────── */

clearOutbox();
{
  const entry = enqueue(ME, '/sets/42/check', { write_uid: 's42-abc', reps: 8 });
  const roundTripped = JSON.parse(store.get('tracker.outbox.v1'))[0];
  check(
    'the write_uid is written to storage with the payload, not regenerated later',
    roundTripped.body.write_uid === 's42-abc',
    roundTripped.body.write_uid,
  );
  check('and the entry id is NOT the idempotency key', entry.id !== 's42-abc');

  const sent = [];
  await flushOutbox(ME, async (path, body) => {
    sent.push({ path, uid: body.write_uid });
  });
  check(
    'the flush replays the stored key verbatim',
    sent.length === 1 && sent[0].uid === 's42-abc',
    JSON.stringify(sent),
  );
  check('and the entry is gone once it lands', outboxFor(ME).length === 0);
}

/* ── a correction before it ever left the device replaces, it does not double ─────────────────── */

clearOutbox();
{
  enqueue(ME, '/sets/42/check', { write_uid: 's42-first', reps: 8 });
  enqueue(ME, '/sets/42/check', { write_uid: 's42-second', reps: 10 });
  check('two attempts at the same set leave ONE entry', outboxFor(ME).length === 1, `${outboxFor(ME).length}`);
  check('and it is the corrected one', outboxFor(ME)[0].body.reps === 10, `reps=${outboxFor(ME)[0].body.reps}`);

  enqueue(ME, '/sets/43/check', { write_uid: 's43-a', reps: 5 });
  check('a different set is its own entry', outboxFor(ME).length === 2);
}

/* ── still offline: nothing is lost, and the flush stops rather than churning ─────────────────── */

{
  const attempts = [];
  const result = await flushOutbox(ME, async (path) => {
    attempts.push(path);
    return netFail();
  });
  check(
    'a network failure keeps everything queued',
    outboxFor(ME).length === 2,
    `${outboxFor(ME).length} left`,
  );
  check(
    'and it stops at the first one rather than failing through the whole queue',
    attempts.length === 1,
    `${attempts.length} attempt(s)`,
  );
  check('the result says nothing was sent', result.sent === 0 && result.remaining === 2);

  // The entry it tried must not be stuck as `sending` — if it were, it would never be retried.
  check('nothing is left marked in-flight', outboxFor(ME).every((e) => !e.sending));
}

/* ── back online: everything goes, oldest first ──────────────────────────────────────────────── */

{
  const order = [];
  const result = await flushOutbox(ME, async (path) => {
    order.push(path);
  });
  check('both go through', result.sent === 2, `sent ${result.sent}`);
  check(
    'oldest first — sets belong to an order',
    JSON.stringify(order) === JSON.stringify(['/sets/42/check', '/sets/43/check']),
    JSON.stringify(order),
  );
  check('the queue is empty', outboxFor(ME).length === 0);
}

/* ── a server opinion is not a retry ──────────────────────────────────────────────────────────── */

clearOutbox();
{
  enqueue(ME, '/sets/44/check', { write_uid: 's44', reps: 1 });
  const dropped = [];
  const result = await flushOutbox(ME, httpFail(409), (entry, status) => dropped.push([entry.path, status]));
  check('a 409 drops the entry instead of retrying it forever', outboxFor(ME).length === 0);
  check('and it is REPORTED, not lost silently', dropped.length === 1 && dropped[0][1] === 409, JSON.stringify(dropped));
  check('the result counts it as dropped, not sent', result.dropped === 1 && result.sent === 0);
}

clearOutbox();
{
  enqueue(ME, '/sets/45/check', { write_uid: 's45', reps: 1 });
  await flushOutbox(ME, httpFail(429));
  check('a 429 is "not now", so the entry stays', outboxFor(ME).length === 1);
  await flushOutbox(ME, httpFail(503));
  check('and so is a 503', outboxFor(ME).length === 1);
  await flushOutbox(ME, httpFail(422));
  check('a 422 does not', outboxFor(ME).length === 0);
}

/* ── one user's queue is not another's ────────────────────────────────────────────────────────── */

clearOutbox();
{
  enqueue(OTHER, '/sets/50/check', { write_uid: 'other-50', reps: 3 });
  enqueue(ME, '/sets/51/check', { write_uid: 'mine-51', reps: 3 });

  check("the other user's entry is invisible to me", outboxFor(ME).length === 1, `${outboxFor(ME).length}`);

  const sent = [];
  await flushOutbox(ME, async (path, body) => {
    sent.push(body.write_uid);
  });
  check(
    "a flush as me never sends the previous user's set",
    sent.length === 1 && sent[0] === 'mine-51',
    JSON.stringify(sent),
  );
  check("and theirs is still sitting there untouched", outboxFor(OTHER).length === 1);

  // Which is exactly why logout empties the whole store rather than just the current user's rows.
  clearOutbox();
  check('clearOutbox takes EVERY user with it, which is what logout needs', outboxFor(OTHER).length === 0);
}

/* ── the network-failure test itself ──────────────────────────────────────────────────────────── */

check('a TypeError reads as a network failure', isNetworkFailure(new TypeError('Failed to fetch')));
check('an ApiError-shaped object does not', !isNetworkFailure(Object.assign(new Error('x'), { status: 409 })));

console.log(`\noutbox: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
