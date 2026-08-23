---
type: screen-spec
title: Profil szerkesztése — coach's public profile editor
route: /compose/profile
updated: 2026-08-23
tags: [ux, screen, redesign]
---

# Profil szerkesztése — coach's public profile editor

The public profile every one of the coach's posts hangs off: the face, the name, the handle, what they do, and the bio strangers will read on the marketplace. The coach comes here twice — once to create it, and then rarely, to fix one thing — so the screen is built around *seeing what you look like to a stranger*, not around filling a form.

## Anchor

A very large circular monogram (`KP`) inside a thick ring, with a camera-glyph badge riding the ring, centred in the top third. Under it the display name in the largest type on the screen, then `@kovacspeter · Szeged`, then an accent text link `Kép cseréje`.

This screen edits **a person**, so the anchor is that person. It also does the one thing a field stack cannot: it is simultaneously the subject and the first editable thing — the camera badge makes the avatar a control, and the identity line under it is a live preview of the marketplace card. There is no separate `h1`; the display name **is** the heading, which is also why editing the name field visibly rewrites the anchor.

> [!warning]
> `Kép cseréje` and the camera badge have no backend. There is no avatar upload on the coach profile today — only post covers. If the API is not extended, the anchor becomes a monogram with no camera badge and no link. And when it *is* extended: the cover-image lesson applies — the server refuses a second image, so "replace" is delete-then-upload, and the button must not promise otherwise.

## Blocks

- **Back link** — left arrow + `Vissza a pulthoz`.
- **Identity anchor** — monogram ring, camera badge, display name, `@handle · Város`, `Kép cseréje`.
- **`Megjelenített név`** — text field with a right-aligned `Kötelező` marker on the label row.
- **`Egysoros bemutatkozás`** — text field with `Nem kötelező` on the label row and the helper `Ez jelenik meg a neved alatt a piactéren.` beneath it. The helper earns its line because it names *where* the text lands.
- **Specialties card** — a bordered box: medal icon + `Szakterületek` on the left, counter `2 / 6 kiválasztva` on the right, then a wrapping grid of toggle chips (`erő`, `hipertrófia`, `erőemelés`, `mobilitás`, `táplálkozás`, `rehabilitáció`). Selected chips are accent-filled and carry a check glyph; once six are on, further taps do nothing.
- **`Bemutatkozás`** — a pencil-icon heading over a plain markdown textarea with no formatting toolbar, and a grey counter beneath: `7 812 karakter maradt`.
- **`Nyilvános profil`** — a switch row: globe icon, the label, the sub-line `A piactéren bárki megtalál.`, and the toggle on the right.
- **Button row** — primary `Mentés` (`Profil létrehozása` on create) and a secondary eye-icon `Előnézet`.
- **Bottom nav.**

## What was merged away, and why

- **The entire opened rename sub-card** — handle field, live availability line, the long retirement warning box and its two buttons — is gone from the layout. It was a second form sitting permanently inside the first, and a *listed* profile's rename retires the old handle for a year and burns a cooldown: that is not something to leave open beside a headline field, one absent-minded edit away from happening.
- **Both selects are gone.** `Város` moves into the identity line as displayed text (`· Szeged`); the specialty count moves onto the card header.
- **Fourteen specialty chips became six.** The full taxonomy in a wrapping grid was the single largest block on the screen and it read as a tag cloud, not as a choice.
- **Four inputs became two.** Handle and city left the stack, leaving only the two fields a coach actually retypes.
- **The bio dropped from six visible lines to three**, and **the rendered preview card was cut entirely** — the anchor already previews the name/handle/city card, and the bio preview is one tap away behind `Előnézet`.

What that bought: the top third is a person instead of a label-input pair, and the screen reads as *your profile* rather than *the profile table*. The cost is two operations that now need a home:

> [!warning]
> **Renaming must stay reachable.** With the sub-card gone, `@kovacspeter` in the identity line is the entry point: tapping it opens the rename disclosure — `Nyilvános név módosítása`, the handle field with its status line, the warning `A(z) kovacspeter nevet ezzel elengeded, és 365 napig senki más nem veheti fel…` for a listed profile only, and `Név módosítása` / `Mégse`. Also non-negotiable: the request carries the handle the form loaded `from`. Without it, a tab left open since a rename made elsewhere will happily revert that rename, burn both names, and show a success.

> [!warning]
> **`Város` needs an editor.** The mockup displays `Szeged` and offers no way to change it. Put it in the same disclosure as the handle, or the field comes back. Its first option means *no city* and reads `Bárhol`.

> [!important]
> The six chips are a **subset of the fourteen-key server taxonomy**, not a new hardcoded six. Render the coach's selected specialties first, then the rest, with the overflow behind a `Továbbiak` affordance. Hardcoding six here is the ninth thing that can disagree with the seeded taxonomy.

> [!important]
> `Nyilvános profil` is the *same* state as the desk's `Élő` / `Rejtve` pill. One fact, two screens: both read and write the same published flag, and unpublishing here takes the whole back catalogue dark exactly as it does from the desk.

## States

- **Create vs. edit** — on create the handle field is present in the stack with its persistent hint `3–32 karakter, kisbetű, szám és kötőjel. Később csak külön kérésre változtatható.`; on edit the handle only appears behind the identity-line disclosure. The primary button reads `Profil létrehozása` on create, `Mentés` on edit.
- **Handle availability** — a status line under the handle field that **always reserves its own row** so nothing jumps, carrying an icon plus one of `Ellenőrzés…`, `Szabad`, `Ez a név foglalt`, `Csak kisbetű, szám és kötőjel, 3–32 karakter.`, `Ez a jelenlegi neved.`, `Most nem sikerült ellenőrizni — a mentésnél kiderül.` The check is debounced, the answer is **advisory**, and it never disables the save button — the server is the authority.
- **Loading** — two skeletons matching the anchor and the field stack.
- **Saving** — the primary button shows its busy state; on success the screen returns to `/compose`.
- **Markdown refusal** — a plain red line: `A szöveg hosszabb a megengedettnél.`, `Túl sok link van a szövegben.`
- **Server conflict** — an amber-bordered, amber-tinted box: `Ez a felhasználónév nem elérhető.`, `Már van profilod.`, `Ismeretlen város: {key}`.
- **Preview** — `Előnézet` toggles a bordered card rendering the bio in the exact public typography; it re-renders on a debounce after typing stops, and shows `Írj valamit, és itt megjelenik úgy, ahogy mások látni fogják.` while the bio is empty. The button reads `Előnézet elrejtése` while open.
- **Taken down** — a profile a moderator removed is read-only here; the desk's takedown card is the explanation, not this screen.
- **Offline** — shell indicator; the availability check falls to `Most nem sikerült ellenőrizni — a mentésnél kiderül.` and save fails into the conflict box.
- **Role-gated** — coach only; the route is unreachable without the role.

## Components

Reuses `Field` (both text inputs, including the `Kötelező` / `Nem kötelező` marker on the label row), `HandleField` with its lowercase-and-hyphen coercion and debounced availability check, `Pressable` for the chips and the button row, `Switch` for `Nyilvános profil`, `Skeleton`, `DocRenderer` for the preview, `BottomNav`, and the `control` recipe for field focus rings. The `PUT`-every-field save semantics stay: an empty box means **cleared**, sent as null, so there is no absent-versus-null merge to get wrong.

Genuinely new: the **avatar ring with camera badge** (shared with the chat screen's monogram — build it once), the **specialties card shell** with its inline counter, and the **identity-line disclosure** that now carries handle and city.

## Navigation

Bottom bar present, `EDZŐ` active. Coach role: 6 tabs. The back link returns to `/compose`; a successful save navigates there too, so the desk is always the screen behind this one.

## Mockup

Dark and light. These are the design of record: where the running screen and the image
disagree, the image is the question and the sections above are the answer.

![[_mockups/sotet/09-compose-profile.webp]]
![[_mockups/vilagos/09-compose-profile.webp]]

## Related

[[Screens/0000 Index]] · [[50-UX-Concepts/UX Base Pack]] · [[00-Index/TODO Master]]
