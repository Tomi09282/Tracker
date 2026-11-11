# Proof — F1.0 changed where three lists live, and nothing else

F1.0 (PLAN.md 3.3, R30) moved the exemption lists of `check:i18n`, `check:elements` and `check:safe-area`
out of their scripts into `frontend/scripts/data/*.json`. The claim is "no rule changed". It was proved in
three ways, all re-runnable with the two scripts in this folder (they name the commit before the change,
`1d42ef3`, and run in the integration worktree):

1. **The data equals the literals.** `extract-gate-data.mjs write` EVALUATED the three `new Map([...])`
   literals of the scripts at `1d42ef3` and wrote the JSON from the result — nothing was re-typed.
   `extract-gate-data.mjs verify` then compares what the gates read now with those literals: same keys,
   same reasons, same order (16 + 3 + 2 entries).
2. **Green output is byte-identical**, to the pre-change run and to the baseline recorded at `0860942`
   (`../../baseline/gates/`).
3. **Red output is byte-identical too.** The same defect was planted before the change (in the script
   literal) and after it (in the data file), and stdout, stderr and the exit code were compared byte for
   byte. A list that had merely been copied correctly would pass 1 and 2; only this shows that the
   failure paths still read the list the same way.

| Gate | Case | Exit | stdout | stderr | Before = after |
|---|---|---|---|---|---|
| `check:i18n` | green | 0 | 61 B | 0 B | identical |
| `check:i18n` | exemption removed | 1 | 0 B | 308 B | identical |
| `check:i18n` | exemption for a key that does not exist | 1 | 0 B | 121 B | identical |
| `check:i18n` | exemption for a translated key | 1 | 0 B | 125 B | identical |
| `check:elements` | green | 0 | 266 B | 0 B | identical |
| `check:elements` | dormant entry removed | 1 | 466 B | 0 B | identical |
| `check:elements` | dormant entry for a live element | 1 | 358 B | 0 B | identical |
| `check:safe-area` | green | 0 | 149 B | 0 B | identical |
| `check:safe-area` | exemption removed offline indicator | 0 | 149 B | 0 B | identical |
| `check:safe-area` | exemption removed sheet | 0 | 149 B | 0 B | identical |
| `check:safe-area` | exemption for a file that does not exist | 1 | 190 B | 0 B | identical |

Hashes of every output are in `result.json`.

## Found on the way (not changed here — F1.0 changes no rule and no entry)

Under TODAY's rule both `check:safe-area` exemptions are dead: removing either one leaves the gate green
(the two "exemption removed" rows above exit 0). Neither `ui/feedback/variants/E14E20.tsx` (top) nor
`ui/shell/OfflineIndicator.tsx` (bottom) needs its entry — the file is either not matched as pinned to
that edge or already accounts for the inset. The re-pointed gate of F2 stage b fails a dead exemption
(PLAN.md 3.6) and also widens what "edge-pinned" means (`sticky` counts), so whether these two entries
are dead THERE has to be measured by F2 on its own rule, not assumed from this table.

## Also checked

- `writeGateData(name, readGateData(name))` leaves each file byte-identical, in LF and in CRLF; a real
  change keeps the line endings and the `about` text.
- `readGateData` throws on an entry with an empty reason (and on a missing or malformed file): a gate
  never runs with a list it could not read.
