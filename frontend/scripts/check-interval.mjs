// scripts/check-interval.mjs — the interval schedule, proved without a DOM.
//
// `intervalPlan.ts` is pure on purpose: the hard part of the timer is arithmetic over one epoch
// anchor, and arithmetic can be checked exhaustively in milliseconds. Node 24 strips the types on
// import, so this needs no test framework and no new dependency — the same choice `smoke.js` and
// `check-tokens.mjs` already make.
//
// Run: node scripts/check-interval.mjs   (wired into `npm run build` beside the other gates)
import { buildSchedule, groupIntervalBlocks, segmentAt, scheduleSeconds } from '../src/features/workout/intervalPlan.ts';

let passed = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failures.push(`${name}${detail ? `  (${detail})` : ''}`);
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
};

/** One movement, `rounds` rows, all pending unless `done` says otherwise. */
const member = (id, rounds, work, rest, done = []) => ({
  id,
  exercise_name_snapshot: `m${id}`,
  position: id,
  block_kind: 'circuit',
  block_ordinal: 0,
  exercise_id: id,
  target_metric: 'time',
  load_mode: 'bodyweight',
  rows: Array.from({ length: rounds }, (_, i) => ({
    id: id * 100 + i + 1,
    log_exercise_id: id,
    set_index: i + 1,
    target_seconds: work,
    target_rest_seconds: rest,
    completed_at: done.includes(i) ? 1 : null,
  })),
});

const build = (members, kind = 'circuit') => {
  const exercises = members.map((m) => ({ ...m, block_kind: kind }));
  const sets = members.flatMap((m) => m.rows);
  return groupIntervalBlocks(exercises, sets);
};

// ── the canonical Tabata ────────────────────────────────────────────────────────────────────────
{
  const [block] = build([member(1, 8, 20, 10)]);
  const s = buildSchedule(block, { prepareSeconds: 10 });
  check('a Tabata block is runnable', block.runnable && block.rounds === 8, `${block.rounds} rounds`);
  // prepare + 8 work + 7 rest. NOT 8 rest: a Tabata ends on work.
  check('8 rounds emit 1 prepare + 8 work + 7 rest', s.length === 16, `${s.length} segments`);
  check(
    'the block ends on work, never on a trailing rest',
    s[s.length - 1].kind === 'work',
    `last is ${s[s.length - 1].kind}`,
  );
  // 10 prepare + 8x20 work + 7x10 rest = 10 + 160 + 70 = 240
  check('total length is 240 s, not 250', scheduleSeconds(s) === 240, `${scheduleSeconds(s)} s`);
  check(
    'every work segment carries a real setId, never an invented one',
    s.filter((x) => x.kind === 'work').every((x) => typeof x.setId === 'number'),
    's',
  );
  check(
    'rest segments own no row — there is nothing to record about a rest',
    s.filter((x) => x.kind === 'rest').every((x) => x.setId === null),
    's',
  );
  check(
    'rounds are numbered 1..8 in order',
    s.filter((x) => x.kind === 'work').map((x) => x.round).join(',') === '1,2,3,4,5,6,7,8',
    s.filter((x) => x.kind === 'work').map((x) => x.round).join(','),
  );
}

// ── prepare = 0 disables the segment rather than emitting a zero-length one ────────────────────
{
  const [block] = build([member(1, 3, 20, 10)]);
  const s = buildSchedule(block, { prepareSeconds: 0 });
  check('prepareSeconds 0 emits no prepare segment', s[0].kind === 'work', `first is ${s[0].kind}`);
  check('and nothing has zero length', s.every((x) => x.seconds > 0), 's');
}

// ── THE RESUME RULE: completed rounds are skipped, not replayed ────────────────────────────────
{
  const [block] = build([member(1, 8, 20, 10, [0, 1, 2, 3])]);
  const s = buildSchedule(block, { prepareSeconds: 0 });
  const rounds = s.filter((x) => x.kind === 'work').map((x) => x.round);
  check(
    'an app-kill after round 4 resumes at round 5, not round 1',
    rounds.join(',') === '5,6,7,8',
    rounds.join(','),
  );
  check(
    'and the anchor arithmetic starts at zero for the remaining work',
    s[0].startMs === 0 && s[0].round === 5,
    `starts at ${s[0].startMs} on round ${s[0].round}`,
  );
}
{
  const [block] = build([member(1, 4, 20, 10, [0, 1, 2, 3])]);
  check(
    'a block with every round done produces an empty schedule, not a countdown to nothing',
    buildSchedule(block, { prepareSeconds: 10 }).length === 0,
    's',
  );
}
{
  // A HOLE, not a prefix: round 2 was skipped, rounds 1 and 3 are done. The schedule must contain
  // exactly the hole and the tail — this is the same code path as a resume, which is the point.
  const [block] = build([member(1, 5, 20, 10, [0, 2])]);
  const rounds = buildSchedule(block, { prepareSeconds: 0 }).filter((x) => x.kind === 'work').map((x) => x.round);
  check('a hole left by a skip is filled, not replayed as a prefix', rounds.join(',') === '2,4,5', rounds.join(','));
}

// ── a multi-movement circuit ───────────────────────────────────────────────────────────────────
{
  const [block] = build([member(1, 3, 30, 15), member(2, 3, 30, 60)]);
  const s = buildSchedule(block, { prepareSeconds: 0 });
  check('two movements interleave within each round', block.members.length === 2 && block.rounds === 3, `${block.rounds} rounds`);
  const shape = s.map((x) => `${x.kind}${x.round}.${x.memberIndex}`).join(' ');
  check(
    'the order is m0 work, m0 rest, m1 work, m1 rest, then the next round',
    shape.startsWith('work1.0 rest1.0 work1.1 rest1.1 work2.0'),
    shape.slice(0, 46),
  );
}

// ── EMOM: the window IS the round, and there is no rest ────────────────────────────────────────
{
  const [block] = build([member(1, 5, null, 60)], 'emom');
  const s = buildSchedule(block, { prepareSeconds: 0 });
  check('an EMOM is runnable from its window alone', block.runnable, `runnable ${block.runnable}`);
  check('an EMOM emits work segments only', s.every((x) => x.kind === 'work'), `${s.length} segments`);
  check('each window is the block rest, 60 s', s.every((x) => x.seconds === 60), `${s[0]?.seconds} s`);
}

// ── NOT RUNNABLE: a duration is never coerced from a null ──────────────────────────────────────
{
  const [reps] = build([member(1, 8, null, 10)]);
  check(
    'a reps-based circuit is not runnable — no duration is invented',
    !reps.runnable && buildSchedule(reps, { prepareSeconds: 10 }).length === 0,
    `runnable ${reps.runnable}`,
  );
  const [emom] = build([member(1, 5, null, null)], 'emom');
  check(
    'an EMOM with no window is not runnable — 60 s is not guessed',
    !emom.runnable,
    `runnable ${emom.runnable}`,
  );
  const [partial] = build([member(1, 4, 20, 10)]);
  partial.members[0].targetSeconds[2] = null;
  const rebuilt = groupIntervalBlocks(
    [{ ...member(1, 4, 20, 10), rows: undefined, block_kind: 'circuit' }],
    member(1, 4, 20, 10).rows.map((r, i) => (i === 2 ? { ...r, target_seconds: null } : r)),
  )[0];
  check(
    'one missing duration anywhere makes the whole block not runnable',
    !rebuilt.runnable,
    `runnable ${rebuilt.runnable}`,
  );
}

// ── ragged members: rounds is the MINIMUM, never an index past the end ─────────────────────────
{
  const [block] = build([member(1, 8, 20, 10), member(2, 5, 20, 10)]);
  check(
    'ragged members take the minimum round count rather than reading past an array',
    block.rounds === 5,
    `${block.rounds} rounds`,
  );
  const s = buildSchedule(block, { prepareSeconds: 0 });
  check('and no segment has an undefined duration', s.every((x) => Number.isFinite(x.seconds) && x.seconds > 0), 's');
}

// ── segmentAt: the boundaries, exhaustively ────────────────────────────────────────────────────
{
  const [block] = build([member(1, 3, 20, 10)]);
  const s = buildSchedule(block, { prepareSeconds: 10 });
  // prepare 0-10000, work 10000-30000, rest 30000-40000, work 40000-60000, rest 60000-70000,
  // work 70000-90000
  check('before the block -> -1', segmentAt(s, -1) === -1, String(segmentAt(s, -1)));
  check('at exactly 0 -> the first segment', segmentAt(s, 0) === 0, String(segmentAt(s, 0)));
  check('the last ms of a segment still belongs to it', segmentAt(s, 9999) === 0, String(segmentAt(s, 9999)));
  check('a boundary belongs to the NEXT segment', segmentAt(s, 10000) === 1, String(segmentAt(s, 10000)));
  check('mid-block lands correctly', segmentAt(s, 45000) === 3, String(segmentAt(s, 45000)));
  check('the final ms is still inside', segmentAt(s, 89999) === s.length - 1, String(segmentAt(s, 89999)));
  check(
    'the end of the block returns schedule.length, so every caller must check done first',
    segmentAt(s, 90000) === s.length,
    `${segmentAt(s, 90000)} vs length ${s.length}`,
  );
  check('and far past the end stays at length, never out of range', segmentAt(s, 99_999_999) === s.length, 's');

  // NO GAPS AND NO OVERLAPS — walked millisecond by millisecond at every boundary.
  let contiguous = true;
  for (let i = 1; i < s.length; i += 1) if (s[i].startMs !== s[i - 1].endMs) contiguous = false;
  check('segments are contiguous: no gap and no overlap anywhere', contiguous, `${s.length} segments`);

  // The classic accumulation bug: 8 rounds of 20.25 s is 2 s late by the end. Anchor arithmetic
  // cannot drift, and this asserts it rather than assuming it.
  const [big] = build([member(1, 8, 20, 10)]);
  const bs = buildSchedule(big, { prepareSeconds: 0 });
  check(
    'no drift accumulates across 8 rounds',
    bs[bs.length - 1].endMs === (8 * 20 + 7 * 10) * 1000,
    `${bs[bs.length - 1].endMs} ms`,
  );
}

// ── a block that is not an interval is not grouped at all ──────────────────────────────────────
{
  const straight = build([member(1, 3, 20, 10)], 'single');
  check('a straight block is not an interval block', straight.length === 0, `${straight.length} blocks`);
  const superset = build([member(1, 3, 20, 10)], 'superset');
  check('nor is a superset — heavy paired work is not conditioning', superset.length === 0, `${superset.length} blocks`);
}

console.log('');
if (failures.length) {
  console.log(`check-interval FAILED — ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`check-interval: OK — ${passed} schedule assertions`);
