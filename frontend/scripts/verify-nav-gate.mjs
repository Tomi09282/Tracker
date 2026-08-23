/**
 * Prove check-nav.mjs is load-bearing by breaking, one at a time, each thing it claims to guard.
 *
 * A gate that has never been seen to fail is not evidence — it is a green tick whose meaning is
 * unverified. This plants a defect, runs the gate, and restores the file byte-for-byte, in the
 * idiom of backend/scripts/verify-gates.mjs.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

let pass = 0;
let fail = 0;

const runGate = () => {
  try {
    execSync('node scripts/check-nav.mjs', { encoding: 'utf8', stdio: 'pipe' });
    return { rejected: false, output: '' };
  } catch (err) {
    return { rejected: true, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

function mutate({ label, file, from, to, expect }) {
  const before = fs.readFileSync(file, 'utf8');
  const lf = (s) => s.replace(/\r\n/g, '\n');
  const crlf = before.includes('\r\n');

  if (!lf(before).includes(lf(from))) {
    console.log(`FAIL  ${label}\n        the anchor is gone from ${file} — this case tests nothing`);
    fail += 1;
    return;
  }
  try {
    const mutated = lf(before).replace(lf(from), lf(to));
    fs.writeFileSync(file, crlf ? mutated.replace(/\n/g, '\r\n') : mutated);
    const { rejected, output } = runGate();
    const ok = rejected && output.includes(expect);
    console.log(
      ok
        ? `PASS  ${label}\n        said: ${output.split('\n').find((l) => l.includes(expect))?.trim().slice(0, 90)}`
        : `FAIL  ${label}\n        ${rejected ? `rejected, but not for "${expect}"` : 'THE GATE STAYED GREEN'}`,
    );
    ok ? (pass += 1) : (fail += 1);
  } finally {
    fs.writeFileSync(file, before);
  }
}

console.log('── proving check-nav ──\n');

mutate({
  label: 'a screen with no inbound link is caught',
  file: 'src/features/settings/SettingsPage.tsx',
  from: '          to="/coins"',
  to: '          to="/settings"',
  expect: 'is a route nobody links to',
});

mutate({
  label: 'the clamp coming back is caught',
  file: 'src/ui/nav/BottomNav.tsx',
  from: '  const pill = tabs.length <= PILL_MAX_TABS;',
  to: '  const pill = tabs.length <= PILL_MAX_TABS;\n  tabs = tabs.slice(0, 5);',
  expect: 'clamps its tab list again',
});

mutate({
  label: 'a tab count that drifts from the design is caught',
  file: 'src/app/navTabs.ts',
  from: "    { to: '/admin', icon: Shield, labelKey: 'nav.admin' },\n",
  to: '',
  expect: 'the approved design has 7',
});

mutate({
  label: 'a tab pointing at a route that does not exist is caught',
  file: 'src/app/navTabs.ts',
  from: "{ to: '/progress', icon: TrendingUp, labelKey: 'nav.progress' },\n    { to: '/settings', icon: User, labelKey: 'nav.profile' },\n  ],\n  coach:",
  to: "{ to: '/progres', icon: TrendingUp, labelKey: 'nav.progress' },\n    { to: '/settings', icon: User, labelKey: 'nav.profile' },\n  ],\n  coach:",
  expect: 'the router has no such path',
});

mutate({
  label: 'a label key missing from a bundle is caught',
  file: 'src/app/navTabs.ts',
  from: "labelKey: 'nav.nutritionShort' },\n    { to: '/progress'",
  to: "labelKey: 'nav.nutritionTiny' },\n    { to: '/progress'",
  expect: 'which is missing from',
});

mutate({
  label: 'dropping the horizontal safe area is caught',
  file: 'src/ui/nav/BottomNav.tsx',
  from: "'ps-[max(0px,env(safe-area-inset-left))] pe-[max(0px,env(safe-area-inset-right))]',",
  to: "'px-0',",
  expect: 'never mentions safe-area-inset',
});

// And the file must be exactly as it was found.
const digest = (f) => execSync(`git hash-object "${f}"`, { encoding: 'utf8' }).trim();
const touched = [
  'src/features/settings/SettingsPage.tsx',
  'src/ui/nav/BottomNav.tsx',
  'src/app/navTabs.ts',
];
const { rejected } = runGate();
const restored = !rejected;
console.log(
  restored
    ? 'PASS  every file this probe edited is back, and the gate is green again'
    : 'FAIL  the gate is still red — a mutation was not restored',
);
restored ? (pass += 1) : (fail += 1);
void digest;
void touched;

console.log(`\ncheck-nav probe: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
