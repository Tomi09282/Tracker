#!/usr/bin/env node
/**
 * verify-autosave — RACE-7, driven at the hook's own rules rather than through a browser.
 *
 * ═══ WHY NOT A BROWSER WALK ════════════════════════════════════════════════════════════════════
 *
 * The defect is a timing window: a save is in flight, the content changes, a second trigger fires.
 * Reproducing that by typing into a real editor means winning a race on purpose, and a test that
 * only fails when the timing happens to land is a test that reports green on the day it matters.
 *
 * So the three rules the hook exists to enforce are exercised directly, with a save function whose
 * completion this script controls to the millisecond:
 *
 *   1. SINGLE FLIGHT      — a second trigger during a save must not start a second save
 *   2. COALESCED FOLLOW-UP— content that moved during a save gets exactly ONE more save, not none
 *                           and not one per keystroke
 *   3. THE PAYLOAD IS THE ONE THAT WAS OUTSTANDING, not the one that was in flight
 *
 * The hook is plain TypeScript with no DOM beyond one `document` listener, so it runs here with a
 * five-line stand-in for React's `useRef`/`useState`/`useCallback`/`useEffect`. That stand-in is
 * the risk this file carries, and it is why rule 3 asserts on the CONTENT each save carried rather
 * than on call counts alone — a fake that mis-sequenced would show up as the wrong payload.
 *
 * Run: node scripts/verify-autosave.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  ok ? (passed += 1) : (failed += 1);
};

/*
 * ═══ THE TRANSCRIPTION IS HELD TO THE SOURCE ═══════════════════════════════════════════════════
 *
 * An audit must not carry its own copy of what it audits — and this file does, because running the
 * real hook would mean pulling React in to drive one state machine. So the copy is chained to the
 * original: every line below is a control-flow decision the transcription mirrors, and if any of
 * them changes in useAutosave.ts, this goes red and both have to move together.
 *
 * Without this the probe would keep passing about a hook that no longer exists, which is worse than
 * having no probe: it is a green line asserting something untrue.
 */
{
  const src = fs.readFileSync(
    path.resolve(import.meta.dirname, '../src/features/compose/useAutosave.ts'),
    'utf8',
  );
  const mirrored = [
    ['single flight raises a flag rather than queueing', 'if (inFlight.current) {'],
    ['and returns without sending', '      again.current = true;'],
    ['nothing outstanding means nothing sent', 'if (sending === savedSnapshot.current) return;'],
    ['the snapshot recorded is what was SENT', 'savedSnapshot.current = sending;'],
    ['"saved" only when nothing moved underneath', "setState(serialiseRef.current() === sending ? 'saved' : 'dirty');"],
    ['exactly one coalesced follow-up', '      if (again.current) {'],
    ['and only when the content really moved', 'if (serialiseRef.current() !== savedSnapshot.current) void run();'],
    ['adopt sets the snapshot without saving', 'const adopt = useCallback((snapshot: string) => {'],
  ];
  for (const [what, line] of mirrored) {
    check(`the hook still ${what}`, src.includes(line), line.trim().slice(0, 52));
  }
  console.log('');
}

/*
 * The hook's core, transcribed. NOT imported: the file is TSX-adjacent and pulling React in to run
 * one state machine would be a bigger fake than this is. It is transcribed rather than reimagined —
 * every branch below maps to a line in useAutosave.ts, and if the two drift, this file is measuring
 * something that no longer ships. That is the honest limit of this probe and it is stated here
 * rather than discovered later.
 */
function makeAutosave({ serialise, save }) {
  // save() takes NO argument, exactly as the hook calls it. The transcription used to pass the
  // payload, so the probe was exercising a signature that does not ship — the drift this file
  // warns about, in this file.
  let inFlight = false;
  let again = false;
  let savedSnapshot = null;
  let state = 'idle';

  async function run() {
    if (inFlight) {
      again = true;
      return;
    }
    const sending = serialise();
    if (sending === savedSnapshot) return;

    inFlight = true;
    state = 'saving';
    try {
      await save();
      savedSnapshot = sending;
      state = serialise() === sending ? 'saved' : 'dirty';
    } catch {
      state = 'failed';
    } finally {
      inFlight = false;
      if (again) {
        again = false;
        if (serialise() !== savedSnapshot) void run();
      }
    }
  }

  return { run, get state() { return state; }, adopt: (s) => { savedSnapshot = s; } };
}

/* ── 1 & 2 & 3: the race itself ──────────────────────────────────────────────────────────────── */

{
  let content = 'draft one';
  const sent = [];
  let release;
  const gate = () => new Promise((r) => { release = r; });

  let pending = null;
  const auto = makeAutosave({
    serialise: () => content,
    // Records what the editor HOLDS at the moment the save runs — which is what the real submit()
    // does, because it reads title and body out of component state rather than from an argument.
    save: async () => {
      sent.push(content);
      pending = gate();
      await pending;
    },
  });

  // The timer fires: a save leaves carrying "draft one".
  const first = auto.run();
  await Promise.resolve();
  check('the first save left', sent.length === 1 && sent[0] === 'draft one', JSON.stringify(sent));

  // The coach keeps typing while it is in flight.
  content = 'draft one and one more thing';

  // Blur fires a second trigger — the exact shape of RACE-7.
  const second = auto.run();
  await Promise.resolve();
  check(
    'the blur did NOT start a second save while one was in flight',
    sent.length === 1,
    `${sent.length} request(s)`,
  );

  // The first save lands. In the old world this is where the replay answered and the URL changed.
  release();
  await first;
  await second;
  await new Promise((r) => setTimeout(r, 0));

  check(
    'exactly one follow-up ran — not none, which loses the keystrokes',
    sent.length === 2,
    `${sent.length} request(s)`,
  );
  check(
    'and it carried the NEWEST content, not the payload that was in flight',
    sent[1] === 'draft one and one more thing',
    JSON.stringify(sent[1]),
  );

  release();
  await new Promise((r) => setTimeout(r, 0));
  check('and then it stopped — no save loop', sent.length === 2, `${sent.length} request(s)`);
}

/* ── a save with nothing outstanding does nothing ────────────────────────────────────────────── */

{
  const sent = [];
  const auto = makeAutosave({ serialise: () => 'unchanged', save: async () => { sent.push('unchanged'); } });
  await auto.run();
  await auto.run();
  await auto.run();
  check('three triggers with no edits produce ONE save', sent.length === 1, `${sent.length}`);
}

/* ── adopt: what makes the follow-up after a CREATE an update rather than a lost delta ────────── */

{
  const sent = [];
  let content = 'created body';
  const auto = makeAutosave({ serialise: () => content, save: async () => { sent.push(content); } });

  // The route creates, then adopts the snapshot it actually SENT — not the server's response, which
  // on a replay is the original post and would tell the hook the newest text was already saved.
  auto.adopt('created body');
  await auto.run();
  check('adopting the sent snapshot means no redundant save', sent.length === 0, `${sent.length}`);

  content = 'created body, edited during the flight';
  await auto.run();
  check(
    'but a delta typed during the create IS saved afterwards',
    sent.length === 1 && sent[0] === 'created body, edited during the flight',
    JSON.stringify(sent),
  );
}

/* ── opening a post nobody touched must not save it ──────────────────────────────────────────── */

{
  /*
   * ═══ THE CASE THIS PROBE DID NOT HAVE, AND THE DEFECT IT LET THROUGH ═══════════════════════════
   *
   * `savedSnapshot` starts as null. The editor then fills with the server's text, so the hook sees
   * a difference between what is on screen and what it last saved — because it has never saved
   * anything — and 1.5 seconds later it PUTs a post nobody had touched.
   *
   * Found by the Phase 7 regression sweep, not by this file, which had eight assertions about the
   * race and none about the moment before it. A probe is a statement about coverage first.
   *
   * The fix is one line in the editor: seed the snapshot from the loaded post at the same moment
   * the fields are seeded. This asserts the SHAPE of that fix rather than the editor's own wiring —
   * with a snapshot adopted, an untouched document saves nothing.
   */
  const sent = [];
  const loaded = JSON.stringify(['kind', 'A title from the server', 'A body from the server']);
  let content = loaded;
  const auto = makeAutosave({ serialise: () => content, save: async () => { sent.push(content); } });

  auto.adopt(loaded);
  await auto.run();
  check('opening an existing post and touching nothing sends NOTHING', sent.length === 0, `${sent.length} request(s)`);

  content = JSON.stringify(['kind', 'A title from the server', 'A body the coach then edited']);
  await auto.run();
  check('and the first real edit still saves', sent.length === 1, `${sent.length} request(s)`);
}

{
  // The same document WITHOUT the seed — the state the editor was in before the fix. This is the
  // control: if it did not save here, the assertion above would prove nothing.
  const sent = [];
  const content = JSON.stringify(['kind', 'A title from the server', 'A body from the server']);
  const auto = makeAutosave({ serialise: () => content, save: async () => { sent.push(content); } });
  await auto.run();
  check(
    'CONTROL: with no seeded snapshot the same untouched document DOES save — which is the defect',
    sent.length === 1,
    `${sent.length} request(s)`,
  );
}

/* ── a failure does not silently claim success ───────────────────────────────────────────────── */

{
  let content = 'will fail';
  const auto = makeAutosave({
    serialise: () => content,
    save: async () => { throw new Error('offline'); },
  });
  await auto.run();
  check('a failed save reports failed', auto.state === 'failed', auto.state);

  content = 'will fail, retried';
  const sent = [];
  const auto2 = makeAutosave({ serialise: () => content, save: async () => { sent.push(content); } });
  await auto2.run();
  check('and the content is still there to retry with', sent[0] === 'will fail, retried', JSON.stringify(sent));
}

console.log(`\nverify-autosave: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
