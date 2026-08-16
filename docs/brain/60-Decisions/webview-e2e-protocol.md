---
type: decision
phase: 7
task: T7.5.3
date: 2026-08-13
status: protocol ready — matrix unfilled, needs a device
---

# Webview E2E protocol

## Why this exists unfilled

T7.5.3 asks for a ✅/❌ matrix across the Capacitor webviews. The matrix cannot be filled from this
environment — it needs an emulator or a handset running the native build — and a matrix filled in
from a desktop browser is a matrix of guesses.

What is NOT blocked is the protocol. Every row below names a specific thing in this codebase that
behaves differently inside a webview, the file it lives in, and the evidence to capture. With a
device in hand this is a short session, not a design task.

**Rule for filling it in: ❌ and "not tested" are different marks.** A matrix that quietly converts
untested to ✅ is worse than no matrix, because the next person reads it as coverage.

| | iOS (WKWebView) | Android (Chrome WebView) |
|---|---|---|
| rows below | | |

---

## 1. The service worker must NOT be there

`src/lib/registerSW.ts` skips registration in the native shell and **unregisters anything it
finds**. A worker inside Capacitor caches URLs that do not change when the user installs a new
version from the store, so the app would update and appear not to.

- **Check:** in the native build, `navigator.serviceWorker.getRegistrations()` → `[]`, and
  `caches.keys()` → no `tracker-*` entries.
- **Then check the cleanup arm actually ran:** install the WEB app on the same origin first (so a
  worker exists), then open the native build. Same assertion. This is the arm that has never been
  exercised — the skip path is trivial, the unregister path is the one with something to get wrong.
- **Evidence:** both console outputs.

## 2. Haptics — the one that is silently absent on iOS

`navigator.vibrate` does not exist on iOS Safari at all. `src/lib/haptics.ts` loads
`@capacitor/haptics` dynamically and falls back to `navigator.vibrate` only for Android web.
`src/features/workout/cues.ts` documents this as "NOT a nicety".

- **Check on iOS:** start a workout, let a rest timer elapse. The phone must actually buzz.
- **Check on Android:** same, and confirm it is the Capacitor plugin rather than the fallback —
  `Capacitor.isNativePlatform()` is `true`, so the fallback branch must not be the one running.
- **Failure mode to watch for:** no buzz AND no error. This fails silently by design.

## 3. Audio cues — iOS starts every AudioContext suspended

`cues.ts` notes that iOS suspends `AudioContext` until a user gesture resumes it.

- **Check:** cold-launch the app, start a workout WITHOUT tapping anything else, and let the first
  cue fire. Does it sound?
- **The interesting case:** background the app during a rest interval and return. iOS may suspend
  the context again; the cue after the return is the one to listen for.

## 4. Speech cues

`speechSynthesis` voice availability differs per platform and per installed language.

- **Check in all three languages** (hu / en / de): does the cue speak, and in the right language?
- **Hungarian is the likely gap** — a device with no Hungarian voice may fall back to English
  pronunciation of Hungarian text or stay silent. Note WHICH, because silent is a worse failure than
  wrong-accent and the two need different fixes.

## 5. Wake lock

`src/features/workout/wakeLock.ts`. The Screen Wake Lock API is not universal, and webview support
lags the browser.

- **Check:** start a workout, put the phone down, wait past the OS screen timeout. Screen stays on?
- **And the release path:** finish the workout, wait again. The screen MUST now sleep — a wake lock
  that is never released is a battery complaint, and it is the half nobody tests.

## 6. Safe-area insets

`viewport-fit=cover` is set and `check-safe-area` holds every edge-pinned element to its inset
statically. What it cannot check is the rendered result on real hardware.

- **Check on a notched device, PORTRAIT:** bottom nav clear of the home indicator, offline banner
  clear of the notch.
- **Check LANDSCAPE**, which is why `.screen-x` was fixed in Phase 7 — a phone propped against a
  rack is how somebody reads their next set. First character of every line clear of the cutout.
- **Evidence:** screenshots, both orientations.

## 7. The offline outbox, on a real dead network

`src/lib/outbox.ts` is proved 31/31 in `verify:outbox`, but that is the logic. This is the wiring.

- **Check:** enable airplane mode mid-workout, check three sets, confirm the banner shows
  "N művelet vár feltöltésre" with the right count.
- **Force-quit the app** while still offline, relaunch, still offline. The count must survive —
  that is the localStorage persistence the whole design rests on.
- **Restore the network.** The sets go through, once each, and the count clears.
- **Then verify on the SERVER**, not in the UI: exactly three sets, no duplicates. The client showing
  "sent" is not evidence the server recorded one.

## 8. Android hardware back button

**Measured, in the source:** `@capacitor/app` is not a dependency (only `@capacitor/core` and
`@capacitor/haptics` are), and no `backButton` listener exists anywhere in `src`. So the behaviour
is whatever Capacitor's default is — **which is exactly the point: nobody in this project has
decided it.**

Not asserted here what that default does. That is a device fact and this file has no device.

- **Check:** the back button from a detail screen, from the command palette, from an open modal, and
  from the root screen. Record what each one does.
- **The row that matters:** back from mid-workout. If it leaves the player — or exits the app —
  that is data loss during the one flow the user cannot repeat.

## 9. Keyboard avoidance

- **Check:** every form the user actually types into — login, set entry, the rejection reason, chat.
  Does the focused field stay visible when the keyboard opens?
- **iOS specifically:** WKWebView resizes the visual viewport, not the layout viewport. A
  `position: fixed` bottom bar can sit under the keyboard or float above it wrongly.

## 10. Session and cookies across a cold launch

- **Check:** log in, force-quit, relaunch. Still signed in?
- The refresh cookie is `Path`-scoped to `/api/v1/auth` and `SameSite`-explicit; webviews handle
  cookie persistence differently from browsers, and this is the one failure that looks like "the app
  logged me out for no reason".

---

## What to record

For each row and each platform: ✅ / ❌ / **not tested**, plus the device and OS version. A row that
passed on iOS 17 says nothing about iOS 15, and the matrix should say which one it means.
