# Skills handover

The Claude Code skills this project is built with, packaged so a second developer can pick the work
up. Copy `skills/` into your skills directory and they are live — no build step.

```bash
# macOS / Linux
cp -r handover/skills/* ~/.claude/skills/

# Windows (PowerShell)
Copy-Item -Recurse handover\skills\* $HOME\.claude\skills\
```

Restart Claude Code afterwards so it re-reads the directory.

---

## What is here — 26 skills

| Area | Skills |
|---|---|
| **This project's standards** | `webdev-standards` — the Node/Express + encrypted-SQLite-in-a-worker-pool blueprint, the auth model, the transaction-endpoint template and its 5-pass adversarial checklist. Start here: it is the one that explains why this codebase looks the way it does. |
| **Working method** | `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `dispatching-parallel-agents`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`, `using-superpowers` |
| **Review** | `requesting-code-review`, `receiving-code-review`, `finishing-a-development-branch`, `using-git-worktrees` |
| **Design & UI** | `design`, `design-system-tokens`, `ui-styling`, `ui-ux-pro-max`, `impeccable`, `emil-design-eng`, `brand`, `banner-design`, `slides` |
| **Notes** | `obsidian-markdown`, `obsidian-bases` — the vault at `docs/brain/` is written in this dialect |
| **Meta** | `writing-skills` |

---

## What is NOT here, and why

### UX Engine — 8 skills, deliberately excluded

`design-system`, `feedback-and-affordance`, `form-ux`, `information-hierarchy`,
`state-completeness`, `ux-auditor`, `ux-intent-discovery`, `visual-character`.

Its licence is explicit:

> One license covers **one individual developer**. […] You may not: Share, resell, sublicense, rent,
> or redistribute the Software. […] If three developers use it, three licenses are required.

So it is not mine to hand over. Buy a licence at <https://designmotionhq.com/ux-engine> and run its
own installer; it drops the same eight skills plus two agents (`ux-designer`, `ux-reviewer`) and four
commands (`/ux-audit`, `/ux-design`, `/ux-review`, `/restyle`).

**This matters for reading the codebase**, because the UI work in `restyle/ux-engine-2.0` was done
against it. Two artefacts it produced ARE in the repo and are yours to read — they are this
project's own output, not the vendor's software:

- `frontend/DESIGN.md` — the design system, extracted from what the code already did, one rationale
  per value
- `frontend/PATTERN-GAP.md` — the app measured against 73 UX patterns: 7 satisfied, 56 violated,
  9 not applicable, 1 unchecked, split into visual and behavioural work lists

`ux-patterns` is excluded for the same reason: it is a reference built **from** the vendor's paid
pattern pages, so it is their material in another shape.

### graphify — excluded because copying it is the wrong way to get it

It is a pip package that writes its own skill:

```bash
uv tool install "graphifyy[sql]"     # the [sql] extra matters here — see below
graphify install --platform claude
```

Copying the generated folder would hand over a snapshot that goes stale on the next release.

**Install the `[sql]` extra.** Without `tree_sitter_sql` the 28 migrations under
`backend/src/db/migrations/` contribute nothing to the graph, and in this project the migrations
carry the schema architecture — node count went 2049 → 2125 when it was added.

The graph itself is committed at `graphify-out/` (`graph.html` opens in any browser, no server).

---

## Licence provenance — what was actually checked

Only declared licences were read. `ui-styling` carries Apache; UX Engine carries the commercial
terms quoted above; the rest ship no licence file, so their terms are whatever their original source
says. Several came from public skill collections and several are this project's own.

If you redistribute this bundle further, check each one at its source rather than trusting this
paragraph — it records what was verifiable here, not a clearance.
