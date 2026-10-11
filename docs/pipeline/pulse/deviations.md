# Deviations — where the app knowingly differs from a frame, or a frame is silent

Every entry is a decision taken so that work never waits, written down so the owner can rule on it
afterwards (PLAN.md Q4 default: behaviour wins, the look follows the frame as far as behaviour allows).
Nothing here is final until its status says `ruled`.

How this file grows:

- the integrator adds the plan's own guesses (below);
- a package lists its deviations in `pkg/<id>/handoff.json`; the integrator copies them here at the merge;
- `pulse-i18n apply` appends every `copyQuestions` entry of a patch (a place where no string is drawn and
  none was invented — R22).

One entry = one `## DEV-<n>` block with the same five lines. Append only; never renumber.

## DEV-001 — Zero insets, and screens wider than 430 pt

- Source: PLAN.md R21 (no frame is wider than 402 pt and none is drawn with zero insets)
- Package: F11 (shell), every screen package
- The frames show: 402 pt wide, insets 62 / 34.
- What the app does: with zero insets the floors are tokens — top 12 px, bottom 8 px. Above 430 pt a
  screen with no desktop layout today is a centred 430 column. The six files that have desktop behaviour
  today (`AdminPage`, `AdminShell`, `StyleStudioPage`, `ChatPanel`, `ClientDetailPage`, `CoachDashboard`,
  plus the bar's desktop dock) keep it, in Pulse skin, proven against a 1280 px baseline. The Cmd+K
  palette is kept and minimally restyled.
- Status: open — a guess of the plan, in force until the owner rules.

## DEV-002 — The player on a small phone (360 x 640, offline line showing)

- Source: PLAN.md Q7, default (a)
- Package: S-workout
- The frames show: `workout-2` at 402 x 874; the drawn content is about 680 pt tall, the room on the
  small phone is about 560 pt.
- What the app does: the figure gives way first, then the secondary meta line. The exercise name, the
  set target, the check control and the rest line never move.
- Status: open — the default of Q7; an answer in `.pulse/owner-answers.md` replaces it.
