---
type: screen-inventory
title: Belépés és regisztráció — screen inventory
updated: 2026-10-11
route: "/login, /register"
tags: [ux, screen, inventory, pulse]
---

# Belépés + Regisztráció — routes `/login`, `/register` · signed-out visitors (no role yet) · reached by any app route without a session, a cold start offline, "Kijelentkezés", the public marketplace's "Belépés" link, and the switch link between the two · bottom tab: NONE (outside the app shell, no tab bar)

Sources checked 2026-10-10: `frontend/src/features/auth/AuthPage.tsx` (one component, `mode` = login / register), `useSession.ts`, `app/router.tsx`, `app/RequireAuth.tsx`, `app/providers.tsx`, `ui/nav/LanguageToggle.tsx`, `lib/useAppName.ts`, `backend/src/auth/routes.js`, specs `55-Screens/login.md` + `register.md`. Status words: live = in the running code · planned = spec / TODO only · cut = deliberately removed.

## Purpose

- **Belépés:** a returning person types e-mail + password and lands on Home (`/`). It is also the first screen anyone ever sees of the product, so it has to say what this is.
- **Regisztráció:** the same two fields create an account; register and sign-in are ONE tap (no confirmation step, no e-mail verification), then Home.
- **The ONE primary action:** `auth.login` = "Belépek" on `/login` · `auth.register` = "Létrehozom a fiókom" on `/register`.

## Elements

### MUST

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| App name (the page's only h1) | live | Comes from the server (`GET /config` → backend env `APP_NAME`, default "Tracker"); never a literal in the bundle, so it can be renamed without a release. Renders EMPTY until it arrives (the line keeps its height). No action. | no key (server config) | Tracker |
| Mode subtitle | live | One static line under the name. | `auth.loginTitle` = "Jelentkezz be a fiókodba"<br>`auth.registerTitle` = "Hozz létre egy fiókot" | as copy |
| E-mail field | live | Visible label + placeholder; e-mail keyboard; autofill on. Checked on submit only: required, then format. | `auth.email` = "E-mail"<br>`auth.emailPlaceholder` = "te@pelda.hu" | takacs.daniel@pelda.hu |
| Password field | live | Visible label + placeholder; masked. Autofill "current password" on login, "new password" on register. The client checks only that it is not empty. | `auth.password` = "Jelszó"<br>`auth.passwordPlaceholder` = "A jelszavad" | 14 masked characters |
| Password reveal toggle | live | One control at the trailing end of the password field; switches masked ↔ plain text. The glyph shows the CURRENT state (masked = crossed-out eye); the accessible name is the action. Client-side only. | `auth.showPassword` = "Jelszó megjelenítése"<br>`auth.hidePassword` = "Jelszó elrejtése" (both accessible names, never visible text) | masked |
| Password rule hint — register only | live | One static sentence under the password field. Not live feedback: nothing changes while typing. Replaced by the field error when the field has one. Absent on login on purpose. | `auth.passwordRules` = "Legalább 12 karakter, kis- és nagybetűvel és számmal." | as copy |
| Primary action | live | Submits. Never disabled: validation speaks on submit. Busy = same size, label replaced by the busy indicator, the WHOLE form inert (fields and reveal toggle too). On register it runs register + sign-in behind one busy state. | `auth.login` = "Belépek"<br>`auth.register` = "Létrehozom a fiókom" | as copy |
| Submit error line | live | One line after a failed submit, between the password field and the button in both modes; announced as an alert. Icon + text. Four possible texts, mapped from the server's status, never the server's own prose. | `auth.errors.invalidCredentials` = "Hibás e-mail vagy jelszó."<br>`auth.errors.emailTaken` = "Ezzel az e-mail címmel már van fiók."<br>`auth.errors.rateLimited` = "Túl sok próbálkozás. Várj egy kicsit, aztán próbáld újra."<br>`auth.errors.generic` = "Nem sikerült a művelet. Próbáld újra." | Hibás e-mail vagy jelszó. |
| Inline field errors | live | Under the offending field after submit: danger colour AND icon AND message together. Replaces the hint. | `auth.errors.emailRequired` = "Add meg az e-mail címed."<br>`auth.errors.emailFormat` = "Ez nem tűnik érvényes e-mail címnek."<br>`auth.errors.passwordRequired` = "Add meg a jelszavad." | typed "takacs.daniel@" → Ez nem tűnik érvényes e-mail címnek. |
| Switch line | live | Muted question + one link that NAVIGATES to the other mode (it never submits). Its wording differs from the button's on purpose. | login: `auth.noAccount` = "Még nincs fiókod?" + `auth.switchToRegister` = "Regisztráció"<br>register: `auth.hasAccount` = "Van már fiókod?" + `auth.switchToLogin` = "Belépés" | as copy |

### SHOULD

| Element | Status | Data shown + action | Exact Hungarian copy | Sample data |
|---|---|---|---|---|
| E-mail format tick | live | A success mark at the trailing end of the e-mail field as soon as the typed address parses. FORMAT ONLY — it must never look like "this account exists" (that would leak who has an account). | `auth.emailValid` = "Az e-mail cím formátuma helyes" (screen-reader / tooltip text, never visible) | shown for takacs.daniel@pelda.hu |
| Language switch | live | Three options at the bottom of both modes; a tap re-labels the whole screen immediately and is remembered on the device. Hungarian is the default. Labels are NATIVE language names, never translated. The active one carries a check (selection is not colour-only). | no key — locale registry: Magyar · English · Deutsch (`common.language` = "Nyelv" exists but is NOT printed on this screen) | Magyar active |
| Back control — register only | live | One control top-left, above everything, → `/login`. Icon only. | `auth.backToLogin` = "Vissza a belépéshez" (accessible name only) | — |
| Offline strip | live (app-level, mounted above every route, these two included) | Appears above the screen when the connection is confirmed down. For a signed-out visitor it is always the ONE-line form (the second, queued-count line needs a signed-in user with unsent set checks — only possible in the "already signed in" edge below). No action. | `offline.title` = "Nincs internetkapcsolat" | as copy |
| Leading field glyphs — login only | live (old skin, decoration only) | The code draws an envelope inside the E-mail field and a lock inside the Jelszó field on `/login`; `/register` draws both fields plain. Not announced, no action, no data. Listed so nobody takes them for content: they are basic line icons and need not be carried into Pulse. | no key | — |
| Password strength meter + two live requirement rows (register) | planned (`register.md`; the code says "still missing") | Would split the rule sentence into two checkable rows and a 4-segment meter, driven by the same rule the server enforces. | no key for separate rows — only the single `auth.passwordRules` sentence exists | — |
| "E-mail already used" attached to the e-mail field | planned (`register.md`) | Today the 409 is shown in the form-level error line, not on the field. | `auth.errors.emailTaken` = "Ezzel az e-mail címmel már van fiók." | — |
| Language as ONE chip opening a sheet | planned (`register.md`) | Spec wanted globe + current language + chevron → picker sheet. Code renders the three-way switch on both modes. | no key | — |
| Send a signed-in visitor away from these screens | planned (both specs) | Not built: a signed-in person who opens `/login` sees the form. | — | — |
| Return to the page originally asked for | planned (half-wired) | The guard passes the requested path along; the form ignores it and always goes to `/`. | — | — |
| "Elfelejtetted a jelszavad?" link | cut | Drawn in the old mockup, deliberately not built: no route, no endpoint. | no key | — |
| Legal footer ("Adatvédelem · Felhasználási feltételek") | cut | Neither document exists; no destination. | no key | — |

## States

- **Pristine** — fields empty with their placeholders, no error, button enabled. There is NO loading skeleton and NO empty state: the form is drawn immediately.
- **App name pending** — the h1 line is blank for a moment, then fills in; nothing below may jump. If the server cannot be reached at all (a cold start offline — exactly when this screen and the offline strip show together) the name NEVER arrives and the line stays blank: there is no fallback literal and the answer is never cached.
- **Typing** — the e-mail tick appears once the address parses; reveal toggle flips masked / plain. Nothing is sent.
- **Client validation failed (on submit)** — inline error under the field: `auth.errors.emailRequired` = "Add meg az e-mail címed." · `auth.errors.emailFormat` = "Ez nem tűnik érvényes e-mail címnek." · `auth.errors.passwordRequired` = "Add meg a jelszavad." Before the first submit nothing is checked; AFTER a failed submit the field is re-checked on every keystroke, so its error switches (required ⇄ format) or disappears while typing. The submit error line does not behave that way: it stays until the next submit that reaches the server, so it can stand together with an inline field error.
- **Busy** — primary action busy at the same size; the whole form inert until the answer arrives.
- **Wrong credentials (login, 401)** — `auth.errors.invalidCredentials` = "Hibás e-mail vagy jelszó." Identical for a wrong password, an unknown e-mail and a disabled account; it never says which field was wrong.
- **Address taken (register, 409)** — `auth.errors.emailTaken` = "Ezzel az e-mail címmel már van fiók." The "Belépés" link below is the way out.
- **Rate limited (429)** — `auth.errors.rateLimited` = "Túl sok próbálkozás. Várj egy kicsit, aztán próbáld újra." (per 15 minutes: 10 sign-ins / 5 registrations per IP and 20 attempts per e-mail address; plus a per-account back-off from the 3rd failed sign-in, doubling up to 15 minutes). No countdown, no "locked" wording.
- **Anything else** — `auth.errors.generic` = "Nem sikerült a művelet. Próbáld újra." This covers a dead network AND a register password that breaks the rule (the client does not check the rule; the server refuses it and the screen shows only this sentence).
- **Success** — straight to Home (`/`, history replaced). No success message, no welcome screen. A brand-new account lands on Home's empty state; it is NOT sent to the questionnaire.
- **Offline** — the one-line strip above the screen; a submit then fails into the generic error line.
- **Mode variant** — in CONTENT login vs register differ in five things: subtitle · rule hint (register) · button label · switch line · back control (register). The old skin differs in three more, purely presentational ones that are not content and need not survive: envelope / lock glyphs inside the fields (login only), the app name's ink (accent on login, white on register), and where the button sits (inside the form card on login, its own block under it on register).
- **Language variant** — HU (default) / EN / DE; every string above changes, the three language names do not.
- **Already signed in** — the form is still shown (no redirect).
- **Coach-pre-generated account** — signs in here like anyone, with a temporary password. The server then refuses everything except reading the session, changing credentials and logging out, and NO screen handles that state (gap — do not draw one as existing).
- **Sheets / dialogs / toasts** — none on these screens.

## Frames to draw

No tab bar in any frame: status bar on top, home indicator at the bottom, nothing else of the shell.

### 1. `Belépés — alap` — pristine sign-in (what a signed-out phone shows on every cold start)

1. Status bar 9:41.
2. App name: **Tracker** (live text from the server; in the Pulse display face it is set in capitals).
3. Subtitle: Jelentkezz be a fiókodba
4. Field — label: E-mail · placeholder: te@pelda.hu · (no tick yet)
5. Field — label: Jelszó · placeholder: A jelszavad · trailing reveal toggle in its masked state (crossed-out eye)
6. Primary action (the screen's one lime pill): **Belépek**
7. Switch line: Még nincs fiókod? **Regisztráció**
8. Language switch: **Magyar** (active, check) · English · Deutsch
9. Home indicator.

Autofilled variant of the same frame (a returning phone with a password manager): e-mail takacs.daniel@pelda.hu with the format tick, password as 14 masked characters.

### 2. `Regisztráció — kitöltve` — register, both fields valid, before the tap

1. Status bar 9:41.
2. Back control, top-left (icon only; accessible name "Vissza a belépéshez").
3. App name: **Tracker**
4. Subtitle: Hozz létre egy fiókot
5. Field — label: E-mail · value: takacs.daniel@pelda.hu · trailing format tick (success colour, small)
6. Field — label: Jelszó · value: 14 masked characters · trailing reveal toggle (masked state) · hint under the field: Legalább 12 karakter, kis- és nagybetűvel és számmal.
7. Primary action: **Létrehozom a fiókom**
8. Switch line: Van már fiókod? **Belépés**
9. Language switch: **Magyar** (active, check) · English · Deutsch
10. Home indicator.

### 3. `Belépés — hibás adatok` — sign-in after a refused attempt

1. Status bar 9:41.
2. App name: **Tracker**
3. Subtitle: Jelentkezz be a fiókodba
4. Field — label: E-mail · value: takacs.daniel@pelda.hu · format tick (the tick stays: it only says the FORMAT is fine)
5. Field — label: Jelszó · value: 12 masked characters · reveal toggle
6. Error line (danger colour, alert icon + text): Hibás e-mail vagy jelszó.
7. Primary action: **Belépek** (enabled again)
8. Switch line: Még nincs fiókod? **Regisztráció**
9. Language switch: **Magyar** (active, check) · English · Deutsch
10. Home indicator.

Same slot, other texts (draw as swaps, not new frames): "Túl sok próbálkozás. Várj egy kicsit, aztán próbáld újra." (two lines) · "Nem sikerült a művelet. Próbáld újra." · on register "Ezzel az e-mail címmel már van fiók." · inline under a field: "Add meg az e-mail címed." / "Ez nem tűnik érvényes e-mail címnek." / "Add meg a jelszavad." · offline: the one-line strip "Nincs internetkapcsolat" pinned at the very top, pushing the whole screen down (it takes space, it does not overlay) — and on an offline cold start the app-name line under it is blank (see States).

## Images

What could help (nothing here is data, so the picture's job is identity — "am I in the right place"):

- A NEW still from the same family as the approved Home image `hero-grip` (low-key black-and-white, glowing out of the black: bar sleeve, plate edge, chalk haze) in the top third, edgeless on the black. One image, shared by both modes so `/login` ⇄ `/register` feels like one place. Not `hero-grip` itself: the asset manifest (`assets/pulse/manifest-app.json`) reserves it — "Home hero … keep it there, do not reuse it as a generic hero elsewhere". Candidate stills of this family were being generated in this run (raw files `hero-chalk`, `hero-plates`, `hero-kettlebell` under `assets/pulse/app/raw`); use only what the manifest finally lists on the shelf.
- Alternatively a single large graphite 3D object from the tab-icon family (the dumbbell). The old screen's identity was a generic line dumbbell in a disc — the owner rejected basic line icons, so a line glyph must not be the main visual here.
- The app name is the wordmark. It must stay LIVE TEXT over or beside the image (it is server-configured and arrives a moment late), never baked into artwork.

What must NOT be shown as if it existed:

- A logo or brand mark: the product has none; there is a configurable name only.
- A person's face or portrait (reads as "the member" or "the coach" — only monograms exist), coach photos, testimonials, ratings.
- App screenshots, feature tour slides, exercise photos or videos (the catalogue has zero exercise media).
- Google / Apple / Facebook marks, store badges, a Face ID glyph, a QR code.

## Do not invent

- Forgot-password / password reset in any form (link, flow, "we sent you an e-mail").
- Social sign-in (Google, Apple), magic links, one-time codes, two-factor, biometric unlock, passkeys.
- E-mail verification, "check your inbox", a pending-account state.
- "Remember me" / "stay signed in" checkbox (the session persists by itself).
- Extra register fields: name or display name, password confirmation, phone, birth date, coach invite / join code, role choice (member vs coach). Coach and admin roles are never self-service.
- Terms / privacy checkbox or links, marketing-consent checkbox, newsletter opt-in.
- A password strength meter or a live requirement checklist AS EXISTING (planned only, and no copy exists for separate rows).
- A disabled primary button waiting for valid input (it is always enabled).
- An error that names the wrong field, "no account with this e-mail", an account-locked screen, a retry countdown.
- A success / welcome / "account created" screen, confetti, a product tour, a redirect into the questionnaire.
- "Continue as guest", a "browse the marketplace" link, a "become a coach" link, help / support / FAQ, an app-version line.
- A captcha, a cookie banner, a light-mode toggle, a theme picker.
- A tab bar, a top app bar or a close (X) control.

## Notes for the designer

- **Open Field applies to forms too.** The approved field is the one on the Profile shot ("Megjelenített név": label, value, one hairline, hint beneath). Nothing is boxed: no input outlines, no card around the form, no tinted error box, no pill around the language options. The lime pill of the primary action is the only filled shape on the screen.
- **Semantic colour, not lime, for verdicts.** The format tick is `success`, errors are `danger`; lime stays reserved for the action. The field's underline needs a visible edge (about 3 : 1 against the black); focus = lime underline.
- **Error line without a box:** icon + danger text on the open field, placed directly above the pill so it is read before the retry.
- **Neutral selection for language:** active = ink text + check (or ink underline), inactive = muted text; each option still needs a 44 pt target. It must not compete with the pill.
- **Long strings:** "Túl sok próbálkozás. Várj egy kicsit, aztán próbáld újra." (57 characters) and "Legalább 12 karakter, kis- és nagybetűvel és számmal." (53) need two lines at the content width; "Ez nem tűnik érvényes e-mail címnek." fits one. German is longer still (rule hint 70 characters, rate-limit line 61, format error 55, button "Mein Konto erstellen"), so reserve two lines for the hint, the submit error line and the inline field error.
- **Two wordings for one destination, both verbatim:** button "Belépek" vs link "Belépés"; button "Létrehozom a fiókom" vs link "Regisztráció". Do not unify them.
- **The app name** is "Tracker" by default but configurable and briefly empty: design the line so a longer name (or none for a frame) does not move the form.
- **Keyboard:** this is a typing screen on a phone; both fields and the pill should stay visible with the keyboard up, so the image / name block has to be able to compress.
- **Register → Home empty state.** After "Létrehozom a fiókom" the new member sees Home with "Ma nincs betervezve edzés"; nothing sends them to the questionnaire or to a coach code. That is the real first-run today.
- **Product gap to flag, not to design around:** on register a password that breaks the rule is answered with the generic "Nem sikerült a művelet. Próbáld újra." — so the rule hint is the only place the rule is ever stated; keep it clearly readable before the tap.
- **Spec vs code:** the old specs say "no offline state" and "one language chip"; the code shows the offline strip here and the three-way switch on both modes. The code is what is live.
- **Hungarian glyph check:** "Belépés", "Jelszó", "fiókod", "Létrehozom" carry é / ó; "művelet" (generic error) carries ű and "tűnik" (format error) carries ű — verify both render natively in the chosen faces.
