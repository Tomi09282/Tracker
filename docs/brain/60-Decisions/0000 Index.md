---
type: adr-index
title: Decisions index
tags: [adr, moc]
---

# Decisions (ADR-style)

One note per decision that future phases must not re-litigate. Status: `accepted` |
`open` | `superseded`.

> [!warning] This index listed 7 of 18 notes until 2026-08-16
> The filter was `type = "adr"`, and the folder holds three spellings: 7 notes are `adr`, 8 are
> `decision`, and 3 carry no `type` at all. **Eleven decisions were invisible in their own index** —
> including the payment-processor choice and every phase-lessons note.
>
> Found by the graphify pass, which read the query and the frontmatter as two things that must
> agree and noticed they did not. That is this project's own recurring defect class, and it had
> quietly eaten the index that exists to stop decisions being re-litigated.
>
> The filter now matches on the FOLDER rather than on a type string, so a note cannot fall out of
> the index by being labelled differently. `type` stays as a label, not as the thing membership
> depends on.

```dataview
TABLE status AS Status, type AS Kind, phase AS Phase, date AS Date
FROM "60-Decisions"
WHERE file.name != "0000 Index"
SORT file.name ASC
```
