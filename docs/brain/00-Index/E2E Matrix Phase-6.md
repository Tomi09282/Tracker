---
type: report
title: Webview E2E matrix — Phase 6
updated: 2026-08-09
tags: [e2e, phase-6, marketplace, public]
---

# Webview E2E matrix — Phase 6

Chromium webview at 360 × 740 and 1440 × 900, against the running dev server and a real encrypted
database. **Routes walked**, not features implied — the heading Phase 5 changed this document to
use, after a clean matrix turned out to be a statement about coverage.

## Routes walked

| # | route | signed in? | result |
|---|---|---|---|
| 1 | `/m` | **no** | ✅ feed renders, 2 posts, `h1` = Piactér, no bounce to `/login` |
| 2 | `/m/p/:publicId` | **no** | ✅ event post, `h1` = title, body rendered from the parsed doc |
| 3 | `/m/c/:handle` | **no** | ✅ profile, `h1` = display name, 2 posts listed |
| 4 | `/m/p/<unknown id>` | **no** | ✅ "not available" empty state with an `h1` and a way back |
| 5 | `/m` → post → profile | **no** | ✅ in-app router navigation between all three |
| 6 | `/m/p/pubXssProbe1` | **no** | ✅ three payloads render as **text**; `XSS_FIRED: false` |

Row 1's "no bounce" is the row that matters, and it is here because it **failed first**: the routes
shipped as children of `RequireAuth` and every anonymous visitor was redirected to `/login` while
the API served the same content to anybody. Sixteen backend assertions proving anonymous access
were all true and all unreachable. *A guarantee is only as public as its least public layer.*

## Backend paths, covered by assertion rather than by a screen

| what | evidence |
|---|---|
| anonymous access to all 7 public GETs | smoke, 16 assertions |
| signed-in and anonymous responses byte-identical | smoke, direct comparison |
| `req.user` never read in `src/public/routes.js` | `check-routes` gate, greps the source |
| 7 public routes allowlisted with a stated reason | `check-routes`, 137 routes total |
| markdown parser limits and URL safety | `verify-markdown` 50/50 |
| schema shape, triggers, indexes | `verify-021` 38/38 |
| migration ledger and ordering | `verify-migrations` 6/6 |

## Cookie state, measured

`document.cookie` on `/m` with no session: **`(none)`**. A public page that sets a cookie before
anyone has agreed to anything is the thing this row exists to catch.

## What the XSS row actually proves, and what it does not

Three payloads in a seeded post body — a `<script>`, an `onerror` image, and a `javascript:` link —
render as visible text. Measured: `0` script elements, `0` payload image elements, page title not
hijacked, and the one legitimate link is a real anchor carrying
`rel="noopener noreferrer nofollow ugc"`.

That proves **the renderer**, which never uses `dangerouslySetInnerHTML` and walks a typed node
tree. It does not prove the *parser* in isolation — that is `verify-markdown`'s 50 assertions — and
the two are deliberately separate, because a renderer that is safe only because the parser is
clean is one refactor from not being safe at all.

## Not covered

- **Real iOS/Android hardware.** Chromium in a webview only.
- **Screenshots** — the pane does not composite in this session.
- **The composer.** There are no write routes for profiles or posts yet; everything above was
  seeded through the DB facade, using the real parser rather than a hand-built tree so the screens
  cannot render a document the product is unable to produce.
- **Post media end to end.** No image has gone through upload → sniff → store → `/public/media/:key`
  in a browser; the pipeline is covered by backend assertions only.
- **A feed long enough to need its cursor.** Two posts is not pagination.
- **Search under load**, and the capped-results notice, which is stated in the UI but never seen
  because the corpus is two posts.
