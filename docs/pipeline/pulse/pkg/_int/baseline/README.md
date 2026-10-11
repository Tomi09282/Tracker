# Baseline — the tree before the redesign (commit `0860942`)

Recorded in step F0 (PLAN.md 3.2, item 6) by `../record-baseline.mjs --tree <base worktree>`.
Generated files; do not edit. Re-running on the same commit must reproduce them byte for byte.

| File | What it is |
|---|---|
| `gates/<name>.txt` | stdout of each of the 11 gates of the `build` chain, run one at a time with `node scripts/…` (no npm banner) |
| `gates.json` | per gate: command, exit code, stdout size and sha256, first line, last line |
| `independent-counts.json` | each legacy construct counted with plain `git grep` — totals, lines, files, per file |
| `independent-counts.md` | the same as a table for people |
| `build-dist.txt` | the `vite build` asset table of the base build (the "before" bundle: fonts, chunks) |

How they are used later:

- F1.0 proves that moving the gate exemption lists into `frontend/scripts/data/` changed no rule:
  the outputs of `check:i18n`, `check:elements` and `check:safe-area` equal the files here.
- F2 stage c (`check:pulse`) must reproduce the independent counts per rule, or explain each
  difference in writing (comments are stripped by the ratchet and not by `git grep`; two rules here
  are tag scans because a line grep cannot see a multi-line JSX tag).
- The progress file carries the gate lines and the count totals under `freeze.gates` and
  `freeze.independentCounts`.
