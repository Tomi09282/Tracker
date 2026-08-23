---
type: screen-spec
title: Bejegyzés szerkesztése — marketplace post editor
route: /compose/posts/:publicId
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Bejegyzés szerkesztése — marketplace post editor

Where a coach writes one marketplace item — a programme, an event or an announcement — attaches its cover, and decides whether it is public. The coach is here to write, so everything that is not writing has to earn its place, and the screen's job between visits is to make sure nothing typed is ever lost.

## Anchor

The cover photograph itself, promoted to a wide landscape hero tile filling the column across the top third, with one quiet caption row beneath it: an image icon, the accent label `Borítókép`, the alt text (`Súlyzós terem reggeli fényben`) in grey under it, and a right-aligned `Csere`.

Nothing else on this screen deserves the top third. The cover is the one element a stranger sees before they read a word, so showing it at full width *is* the preview — it makes the previous design's separate rendered preview card largely redundant, and it makes a missing cover impossible to overlook. A ring or a chart would be inventing a number where the subject is a document.

> [!warning]
> `Csere` contradicts the server. There is no replace: the API refuses a second cover, so changing one is **delete then upload**. Either the chip runs both calls behind one label — and reports honestly when the delete succeeds and the upload does not, because the coach is then left with no cover — or it reads `Kép eltávolítása` and the file picker returns underneath. A button that answers 409 is worse than a button that says what it does.

## Blocks

- **Back link** — left arrow + `Vissza a pulthoz`.
- **`h1`** — `Bejegyzés szerkesztése`, or `Új bejegyzés` in create mode.
- **Cover hero** — the anchor: image, then the caption row described above.
- **`Típus`** — a segmented control, `Program` / `Esemény` / `Közlemény`, each with its kind icon.
- **`Cím`** — text field with `Kötelező` on the label row and the countdown counter `128 karakter maradt` beneath it.
- **`Szöveg`** — a pencil-icon tile beside the label, then a tall plain markdown textarea with no toolbar, and a counter beneath: `19 431 karakter maradt`. The counter is grey while calm, amber near the cap, red past it. Colour arrives only near the end — a counter that is loud from the first character is a counter people stop seeing.
- **`Címkék`** — a wrapping chip row of the post's tags plus a dashed `+ Új címke` chip.
- **Autosave line** — a check glyph and `Automatikus mentés · Mentve 14:07`, on its own row above the rule.
- **Rule, then the lifecycle row** — primary globe button `Közzététel` on the left, secondary eye-off `Levétel` beside it, and a caption beneath: `A levétel bármikor visszavonható.`
- **Bottom nav.**

## What was merged away, and why

- **The outlined save/preview pair is gone from the action row.** The save button was the loudest control on a screen that already saves itself; replacing it with the autosave line is the single biggest reason this design stopped reading as a form. See the warning below for what has to survive.
- **The whole stale-conflict panel** — the conflict sentence, the read-only server-side title in a boxed field, and the takeover button — was cut from the layout. It is a rare state occupying permanent vertical space.
- **The rendered preview card** was cut: the cover hero previews the part that sells the post, and the body is markdown the coach is looking at.
- **The event-date field** went, along with the amber `Ehhez a típushoz esemény-időpont is kell.` line.
- **The image metadata line (`1200×675 · 184 kB`), the alt-text field with its helper, the removal button and the swap caption** all collapsed into the single caption row under the hero.
- **The quota information line** left the screen; the cap belongs where it bites, at publish time.
- The body dropped from six visible lines to four and the tag row from five chips to four, so the lifecycle row is reachable without a second scroll.

> [!warning]
> Removing the visible save button leaves **autosave as the only save path**, and autosave is deliberately disabled until there is a title — a draft holding a body and no title would then have no way to be saved at all. Keep the save action: `Piszkozat létrehozása` on a new post, `Mentés` when dirty, disabled `Mentve` when clean, plus the Ctrl/Cmd+S shortcut and the unsaved-changes guard on tab close. It can live in the header rather than the action row, but it cannot be absent.

> [!warning]
> The mockup shows the `Típus` segmented control **on an existing post**, with `Esemény` selected. The kind is **frozen after creation** — its shape rules are enforced by a trigger that cannot re-validate a changed kind. On edit the control must be non-interactive and carry `A típus a létrehozás után már nem változtatható.`; only create mode lets it be touched.

> [!important]
> `Címkék` do not exist in the compose API. This is genuinely new — schema, validation, and a public-side filter — or the row comes out. Do not ship it reading from nothing.

> [!important]
> Alt text is now **display-only** in the caption row. `Képleírás` (with its hint `Mit ábrázol a kép? Aki nem látja, ezt fogja hallani.`) must still be editable — in the upload flow, or by tapping the caption — or every cover ships without alt text.

## States

- **Create** — `h1` `Új bejegyzés`, the `Típus` control live, no cover section (the post must exist before an image can hang off it), no lifecycle row. The primary action reads `Piszkozat létrehozása`, and it carries an idempotency key held across retries so a retry stays a retry rather than becoming a second post.
- **Autosave** — the caption reads `Mentés…`, then `Mentve`, and on failure the loud, non-fading red `A mentés nem sikerült — a szöveged megvan, próbáld újra.` It is announced politely to assistive tech, because the whole promise of autosave is that someone can stop paying attention.
- **Stale conflict** — returns as a sheet rather than an inline panel: `Ez a bejegyzés közben megváltozott.`, the caption `Közben máshol is mentettél. A szerveren ez van:`, the server's own title in a boxed field, and `A szerveren lévő átvétele`. The editor's text is never overwritten silently — the refusal is a conversation, not a merge.
- **Markdown refusal** — one red line under the body.
- **Quota refusal** — `Mára elfogyott a keret (10/10). Következő hely: 2026. 08. 24. 09:14.` Since the quota line left the screen, this arrives as a toast on the failed `Közzététel`.
- **Takedown** — a danger-tinted banner, `Ezt a bejegyzést egy moderátor eltávolította. Csak olvasható.`, with every field below it disabled and the cover and lifecycle sections hidden.
- **Withdrawn** — `Levétel` becomes `Visszaállítás` (rotate icon) and the caption changes to `A visszaállítás az eredeti helyére teszi vissza, és nem használ el napi keretet.` The withdraw toast carries a one-tap `Visszavonás`; the undo is the point, because restore returns the post to its original feed position and spends no quota.
- **Gone** — `EmptyState` with a trash icon: `Ez a bejegyzés nem érhető el` / `Lehet, hogy törölted, vagy sosem létezett.`, then the back link.
- **Loading** — two skeletons at the heading and body geometry.
- **Cover upload** — the picker button reads `Feltöltés…` while busy; failure is `A kép feltöltése nem sikerült.` Each file choice gets its own idempotency key, so choosing a different file is a different attempt rather than a rejected replay.
- **Offline** — shell indicator; autosave enters its failed state and stays there, which is exactly the behaviour that keeps the text on screen.
- **Role-gated** — coach only.
- **Toasts** — bottom-centre on a phone, clear of the nav bar: `Piszkozat létrehozva`, `Mentve`, `Közzétéve`, `Levéve` (with `Visszavonás`), `Visszaállítva`, `Borítókép feltöltve`, `Borítókép eltávolítva`.

## Components

Reuses `Field` (title, and the alt-text field wherever it lands), `Pressable` for the lifecycle and picker buttons, `Segmented` (E6 — a real radiogroup with arrow-key movement, which the native select it replaces was not), `Skeleton`, `EmptyState`, `DocRenderer` if the preview returns behind a toggle, `Sheet` (E14) for the stale conflict, `ToastHost` (E15, `Undo-flip`) for the withdraw undo, and the whole `useAutosave` / `useComposeFlow` layer unchanged — single-flight saving, the payload-serialisation dirty check, `useSaveShortcut` and `useUnsavedGuard` all survive.

Genuinely new: the **cover hero with its caption row** (today the image is a plain bounded picture inside a bordered section), the **tag chip row**, and the **autosave line with a timestamp** — the current caption says only `Mentve` and would need the last-saved time to render `Mentve 14:07`.

## Navigation

Bottom bar present, `EDZŐ` active. Coach role: 6 tabs. The back link and every successful create/save keep `/compose` as the screen behind this one; a create replaces the `/new` entry so Back never returns to a route whose draft now exists.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/10-compose-post-editor.webp]]
![[_mockups/vilagos/10-compose-post-editor.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
