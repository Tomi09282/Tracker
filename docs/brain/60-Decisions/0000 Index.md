---
type: adr-index
title: Decisions index
tags: [adr, moc]
---

# Decisions (ADR-style)

One note per decision that future phases must not re-litigate. Status: `accepted` |
`open` | `superseded`.

```dataview
TABLE status AS Status, phase AS Phase, date AS Date
FROM "60-Decisions"
WHERE type = "adr"
SORT file.name ASC
```
