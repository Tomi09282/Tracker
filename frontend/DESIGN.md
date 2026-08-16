# TRACKER — Design System

The per-project design system. It is **extracted from the code**, not invented for it: the token
layer in `src/ui/tokens/tokens.css` already carries 172 distinct token names across 277 declaration
sites, and almost every one of them arrived with a written reason. This file collects those reasons
in one place so the next person does not "clean up" a decision.

**Rule 0 — extract before inventing.** If a value exists here, it is already a decision. Changing it
silently discards the reasoning that produced it. Everything in §5 DECISIONS is closed; everything in
§6 GAPS is open.

**A token without a WHY is a preference, not a decision.** Every row below carries one. If you add a
token and cannot write its WHY in one line, it does not go in.

---

## 0. Where things live, and what enforces them

| Path | Role |
|---|---|
| `src/ui/tokens/tokens.css` | The **only** file in `src/` permitted a raw hex, `rgb()`, px radius, ms duration or `cubic-bezier()`. `check-tokens.mjs:193` skips it explicitly. |
| `src/index.css` | Base layer + local utilities. **Not exempt** — it is walked and linted like a feature file, and additionally *read as input* by two gates (`localUtilities`, `pinnedAnimations`, `check-safe-area`'s `GLOBAL_CSS`). It currently contains zero raw colors. |
| `src/ui/primitives/control.ts` | The control recipe. Every interactive element is built from it. |
| `src/ui/**` | Exempt from exactly one rule (`raw-button`). Color, radius, duration and spacing rules apply in full. |
| everything else in `src/` | All rules, no exemption. |

Seven gates run on `npm run build` and all must stay green:
`check-tokens` · `check-i18n` (777 keys × hu/en/de) · `check-interval` · `check-elements` ·
`check-autosave` · `check-safe-area` · `verify:outbox`, plus `tsc -b` with `noUnusedLocals`.

### The gate rules you will hit while styling

1. No raw hex, no `rgb(123…)`/`hsl(…)` literal. `rgb(var(--ink) / 0.92)` is legal — the rule matches only a digit after the paren.
2. No Tailwind stock palette anywhere (`bg-slate-800` is a build failure).
3. No raw duration — `duration-[var(--duration-base)]`, including inside `animate-[…]`.
4. No raw radius, no `cubic-bezier(` outside the token file.
5. Arbitrary spacing must sit on the 4px grid (`p-[13px]` fails, `p-[12px]` passes).
6. No interactive element below 44px.
7. No raw `<button>` outside `src/ui/` — compose `Pressable`.
8. Every `var(--x)` must be declared in `tokens.css`. **This check reads the raw line, not the comment-stripped one** — a `var(--foo)` written inside a comment still fails.
9. `animate-pulse|spin|bounce|ping` only if re-pointed in `src/index.css`. Currently pinned: `pulse`, `spin`.

Escape hatches, both requiring a written reason: `token-lint-disable` on a line (skips **all** rules
on it), and `token-lint-disable-file: <reason>` (exempts **only** hex and color-functions; radius,
duration, spacing and raw-button still apply). Exactly one file uses the latter: `src/ui/theme/palette.ts:1`.

---

## 1. Color

Semantic, never hex-by-hex at a call site. Five theme packs declare identical **token names** with
different values; a pack swap repaints the app without a single component re-render, because the
Tailwind mapping is `@theme inline` and resolves the var at use time.

### 1.1 Surfaces — elevation, never new colors

| Token | Midnight | WHY |
|---|---|---|
| `--surface-0` | `#0B0D10` | The page. Never `#000` — pure black smears on OLED (Neon, the darkest pack, still stops at `#06070A`). |
| `--surface-1` | `#12151A` | Cards. One step up from the page = "this is a thing on the page". |
| `--surface-2` | `#181C22` | Insets: field backgrounds, bar tracks, hero boxes. A step *into* the card, not another card. |
| `--surface-3` | `#20252D` | Sheets, toasts, scrollbar thumbs — anything that floats above everything else. |
| `--surface-border` | `rgb(255 255 255 / 0.07)` | The hairline. It is an ink alpha, not a color, so it works on every surface in every pack. |

**Why alphas and a four-step ladder and not more surfaces:** surfaces encode *elevation*, so any new
surface would have to answer "higher than what". Four levels cover page / card / inset / overlay,
which is every stacking relationship the product has.

### 1.2 Ink — one color, three opacities

| Token | Value | WHY |
|---|---|---|
| `--ink` | `242 245 247` (space-separated channels) | Declared as channels so the three text steps can be alphas of it. The previous build froze three opaque hexes and broke the moment text sat on anything but `surface-0`. |
| `--text-1` | `rgb(var(--ink) / 0.92)` | Primary content — the thing the user came to read. |
| `--text-2` | `rgb(var(--ink) / 0.62)` | Labels, secondary lines, field labels. |
| `--text-3` | `rgb(var(--ink) / 0.42)` | Chrome: placeholders, idle nav, timestamps. **See GAPS G2 — this step currently carries real data at 3.80:1 and fails the app's own AA constant.** |

### 1.3 Accent — exactly one, plus a derived ramp

| Token | WHY |
|---|---|
| `--accent` | The single brand color. There is no secondary or tertiary hue in this product, on purpose: one accent means "accent" always reads as "act here". |
| `--accent-fg` | Foreground on a filled accent. Recomputed against WCAG by the theme engine — do not hand-set it, you are fighting runtime code (`ThemeProvider.tsx:61`). |
| `--accent-50` … `--accent-950` | Interpolated **in OKLab**, so a user's custom accent gets the same perceptual spacing as the five built-in packs. `--accent` is step 500. |
| `--accent-hover` = 400, `--accent-pressed` = 600 | Interaction states derive from the ramp, never hand-picked per component — that is how twelve components end up with twelve hovers. |
| `--accent-subtle` | 12% wash. The "this one is selected / active / mine" signal. **See GAPS G3.** |
| `--focus-ring` = `--accent` | The ring survives a theme swap because it is the theme's own color. |
| `--gradient-brand` | `linear-gradient(135deg, accent-400 → accent-700)`. 2–3 stops, 135°, **one gradient surface per screen**, same hue family, never behind body text — and explicitly never blue→purple, the "AI-generic" combination that sank the previous build (F-04). |

**The ramp has no Tailwind utility.** `bg-accent-700` is a build failure (`undefined-color`). Reach
the ramp as `bg-[var(--accent-700)]`.

### 1.4 Semantic colors — meaning, not decoration

Each of `success` / `warning` / `danger` / `info` ships four forms:
the base, `-subtle` (12% wash), `-border` (30%), and `on-<name>` (a dark foreground for filled use).

| Color | WHY it exists as a separate hue |
|---|---|
| `--success` `#34D399` | Completion and confirmation. Never used to say "good number" — see the DECISIONS on charts. |
| `--warning` `#FBBF24` | "Look at this", not "you failed". Overshooting a macro target is a warning, never a danger; a person 300 kcal over target has had a normal Tuesday. |
| `--danger` `#F87171` | Destructive and irreversible only. **Stays red even in the monochrome pack** — color carries meaning here, so it is not the theme's to flatten. |
| `--info` `#60A5FA` | Neutral state. Currently near-dead — two uses. See GAPS G5. |

### 1.5 The Tailwind utility surface — the only 29 color names that resolve

```
surface-0  surface-1  surface-2  surface-3  border-token
text-1  text-2  text-3
accent  accent-fg  accent-hover  accent-pressed  accent-subtle
success  success-subtle  success-border  on-success
warning  warning-subtle  warning-border  on-warning
danger   danger-subtle   danger-border   on-danger
info     info-subtle     info-border     on-info
```

Traps, all of them real and all of them currently live in the codebase:

- The hairline utility is **`border-border-token`**. `border-surface-border` fails. `control.ts:53`
  works around it with `border-[var(--surface-border)]`, which is the convention to copy.
- `border-line`, `text-label`, `text-ok`, `bg-ok-subtle` name **stems the gate does not own**, so it
  skips rather than fails them, and they resolve to nothing. See GAPS G1.

---

## 2. Type

Two families, no more. Self-hosted via `@fontsource` so the strict CSP never has to allow a
third-party font origin.

| Token | WHY |
|---|---|
| `--font-display` — Space Grotesk (500/600/700) | Headings, brand, **big numbers**. Opt-in per element via `.font-display` or `h1/h2/h3` — never global, because a display face set on body copy is the fastest way to make an app look like a poster. Only three weights are imported; asking for 400 gets you a synthesized one. |
| `--font-body` — Inter Variable | Everything else. Variable, so one file covers every weight. |

### The scale — nine steps, each carrying its own line-height, weight and (where it matters) tracking

Tailwind 4 attaches all four properties to the utility, so `text-body` is complete on its own.

| Step | Size / LH / Weight / Tracking | Correct use — WHY |
|---|---|---|
| `text-display` | 34 / 40 / 700 / −0.02em | Dashboard hero numbers and brand moments. One per screen. |
| `text-timer` | 48 / 48 / 700 / −0.03em | The interval countdown, and nothing else. 48px is a lock-screen-clock size, legible from the floor at arm's length — the phone is not in the lifter's hand. Not larger: the player's hero is 193px tall at 375px wide and has to fit a phase word, this number, a bar, an info line and a 44px control row. |
| `text-title-1` | 26 / 32 / 700 / −0.01em | The screen's own title. |
| `text-title-2` | 20 / 26 / 600 | Section title inside a screen. |
| `text-title-3` | 17 / 24 / 600 | Card heading, and the value inside a stat block. The step that separates a heading from the body under it. |
| `text-body` | 15 / 22 / 400 | Default. Set on `body`, so most text needs no class at all. |
| `text-body-s` | 13 / 18 / 400 | Control labels (the `control` recipe's default density), field labels, dense secondary lines. |
| `text-caption` | 12 / 16 / 500 | Metadata under a thing: dates, counts, hints. Weight 500 because 12px at 400 disappears. |
| `text-micro` | 11 / 14 / 600 / **+0.06em** | Eyebrows and uppercase labels. **Nothing in the product goes below this.** The tracking is the reason it exists — never pair it with a hand-written `tracking-wide` (0.025em), which is an approximation of a value already decided. |

### Type rules

- **Tabular numerals on anything that counts.** `tabular-nums` (61 sites) on timers, weights, reps,
  balances, counters — numbers never jitter width while changing. `.tnum` in `index.css` does the
  same for non-Tailwind contexts.
- **`.measure { max-width: 70ch }`** on prose. Body copy never runs wider than 70ch. Not needed
  inside `col-mobile` (480px already caps the line); required in `col-wide`.
- Zero Tailwind default sizes (`text-sm`, `text-lg`, …) appear anywhere in the app. Keep it that way.

---

## 3. Space

**`--spacing: 0.25rem` is the whole scale.** `p-1`=4 … `p-12`=48 is the 4px grid of record.
Declaring a parallel scale would give the app two sources of truth, so we do not.

| Rule | WHY |
|---|---|
| `.screen-x` — `padding-inline: max(--spacing(4), env(safe-area-inset-left)) …`, 24px from 48rem up | The screen gutter. **`max()`, never addition**: the inset *replaces* the gutter when it is larger, so a safe edge never gets 16px stacked on top of a 44px cutout. A fitness app is used sideways — a phone propped against a rack is not an edge case here. `check-safe-area` reads this exact shape. |
| `--content-pad-b` = `nav-h + safe-area-inset-bottom + 16px` | **ONE** definition, because `AppLayout`'s `<main>` pads by it and the workout player subtracts it. They once disagreed by 16px and the page scrolled — and a check button that moves is a check button that records the wrong set. |
| `--content-pad-b-lg` = `nav-h + 32px` | The desktop dock does not sit on a safe-area edge. |
| `--nav-dock-offset` = 16px | The desktop dock floats 16px above the screen bottom. |
| `--col-mobile` 480px / `--col-wide` 1120px | Mobile-shaped flows (player, chat, today) stay in a phone-width column on desktop; dashboards and grids get the wide one. A 1120px-wide set list is not a set list. |
| `--card-pad` = `--spacing(4)` (16px) | Card padding. Bible allows 16–20; the old build used 24 and every card read as a page. **Currently declared and consumed by nothing — see GAPS G4.** |

**Spacing is the only axis with no gate.** `off-grid-spacing` inspects arbitrary values only
(`p-[13px]`); named steps are unpoliced. That is the structural reason it drifted: 87% of every gap
in the product is ≤12px, and there are 8 gaps in the whole app at 20px or more. See GAPS G4.

---

## 4. Radius, shadow, motion, sizing

### 4.1 Radius — structural, chosen by the theme pack

Primitive steps `--radius-0` (0) · `-1` (2) · `-2` (4) · `-3` (8) · `-4` (12, buttons) ·
`-5` (16, cards) · `-6` (20) · `-7` (24) · `-8` (28) · `--radius-full` (9999, chips).

**Components never name a raw step.** They use the five semantic aliases, which every pack
re-declares:

| Alias | Utility | WHY |
|---|---|---|
| `--radius-button` | `rounded-button` | So Mono can be square (`radius-0`) and Neon a pill (`radius-full`) without touching a component. |
| `--radius-field` | `rounded-field` | Inputs follow the button's language, not the card's. |
| `--radius-card` | `rounded-card` | 181 uses — the single most consistent thing in the app. |
| `--radius-sheet` | `rounded-sheet` | Sheets are larger surfaces and read as harder if they share the card radius. |
| `--radius-chip` | `rounded-chip` | Pill by default; Mono deliberately squares it. |

Note the gate does *not* catch `rounded-3` (a primitive step). It is still a violation of the written
rule at `tokens.css:79`.

### 4.2 Shadow — there is no shadow scale

Exactly two tokens exist, both per-pack:

| Token | WHY |
|---|---|
| `--shadow-overlay` | Overlays only: sheets, floating timers, the switch knob. Midnight `0 8px 24px rgb(0 0 0 / 0.35)`; Solar deeper; Neon a colored glow; **Mono `none`**. |
| `--shadow-glow` | Neon's declared identity ("pill + glow, no drop shadow"), `none` in the other four. Currently reaches no product screen — GAPS G6. |

**Cards separate by border OR shadow, never both.** The old build did both (F-09). In this app the
answer is border, everywhere, and shadow is reserved for things that actually float. Nothing else may
cast one — a stock `shadow-lg` is a light-mode shadow at 10% black and is invisible on these surfaces
anyway.

### 4.3 Motion — UI never exceeds 500ms

| Token | Value | WHY |
|---|---|---|
| `--duration-instant` | 100ms | State flips and press feedback. A press must answer immediately; anything slower reads as lag rather than acknowledgement. |
| `--duration-fast` | 150ms | Hover. |
| `--duration-base` | 250ms | Most transitions. |
| `--duration-slow` | 400ms | Sheets and large surfaces — bigger things are allowed to take longer, because the eye has further to follow. |
| `--duration-ambient` | 1200ms | **Loops, not transitions.** A skeleton shimmer never *arrives* anywhere; running it at 250ms is a strobe. Naming it is what stops nine screens reaching for Tailwind's 2s `animate-pulse`. |
| `--ease-standard` | `cubic-bezier(0.16, 1, 0.3, 1)` | The one curve. Fast out, long settle. |
| `--ease-linear` | `linear` | **Progress only.** An eased fill misreports how much of the hold is left. |

Rules: `animate-pulse` and `animate-spin` are **re-pointed** at `--duration-ambient` in `index.css`
rather than banned — a rule enforced by deleting the convenient thing gets worked around. Both land on
the same value because both are the same *kind* of motion. `animate-bounce` / `animate-ping` are build
failures until they too are re-pointed there.

Reduced motion **collapses durations to ~0, it does not remove the animation**: the state change still
happens and is still visible, it just does not travel. Components additionally branch on the
preference (`useMotionSafe`) so they can skip transform-based motion entirely.

### 4.4 Sizing and z

| Token | WHY |
|---|---|
| `--target-min: 44px` | The a11y floor. No interactive element renders below it, on either axis. |
| `--control-h` | Per-pack control height (Solar 48px, the rest 44). Currently consumed by nothing — GAPS G6. |
| `--icon-sm/md/lg` 16/20/24 | Three sizes, as real classes `size-icon-s/m/l` in `index.css` — because these were written as if Tailwind generated them from the tokens, and it does not; every icon silently fell back to lucide's 24px. |
| `--nav-h: 64px` | The bottom bar. |
| `--table-max-h: 60vh` | Not decoration: a sticky header sticks to its nearest *scrolling* ancestor, and an unconstrained wrapper never scrolls. The admin queue's `sticky top-0` thead had never stuck once. |
| `--table-row-h: 44px` | The floor again — every row carries interactive controls. |
| `--admin-sidebar-w: 15rem` | A **grid column** inside the 1120px content column, not a second fixed element. A fixed rail would have to know about the nav, the safe-area inset and the toast layer: three z-index decisions to get wrong instead of none. |
| `--z-sticky 20 · --z-nav 40 · --z-sheet 50 · --z-toast 60 · --z-tooltip 70` | `--z-sticky` sits **below** the nav on purpose: a table header scrolling over the bottom navigation is a header covering the way out of the screen. |

---

## 5. Component variants

### 5.1 `control` — the recipe every interactive element is built from

`src/ui/primitives/control.ts`. Why a shared recipe: the previous implementation lost the 44px floor
in twelve places (a 24px search field, nine 32px chips), because each component chose its own height.
Here the floor is not a rule anyone has to remember — it is the base layer of every variant.

**The base carries all five interaction states, once:**
`min-h/min-w-[var(--target-min)]` (no opt-out) · `active:scale-[0.97]` at `--duration-instant` ·
`focus-visible` outline on `--focus-ring` (focus is redrawn, never removed) ·
`disabled:opacity-45 + pointer-events-none` (a control that looks pressable but does nothing is worse
than one that looks disabled) · `aria-busy` keeps its size and refuses input.

**variant — when each is correct**

| Variant | Use for | WHY |
|---|---|---|
| `primary` | The **one** primary action on the screen | The only variant with a filled accent background. Two primaries on a screen means neither is. |
| `secondary` (default) | Everything ordinary | Bordered on `surface-1`, hover to `surface-2`. |
| `ghost` | Toolbar and in-row actions, dismissals | Text-only until hovered, so a row of them does not read as a wall of buttons. |
| `danger` | Destructive, irreversible | Never styled as primary and **never sits in the primary position**. |

**shape**

| Shape | Use for | WHY |
|---|---|---|
| `button` | Normal labelled action | `rounded-button px-4`. |
| `icon` | Square icon-only control | `rounded-chip px-0` — the floor already guarantees 44×44, so no width class is needed. Always give it an `aria-label`. |
| `chip` | Filters, toggles, selectable tags | `rounded-chip px-4`. |
| `field` | A control that opens something (pickers, menu triggers) | `w-full justify-start rounded-field text-left font-normal` — reads as an input, behaves as a button. |

**density — padding and type size only, never the hit area**

| Density | Type | WHY |
|---|---|---|
| `compact` | `text-body-s px-3` | A visually smaller control that still occupies 44px of tappable space — which is exactly how the old build's 32px chips should have been done. |
| `default` | `text-body-s` | |
| `large` | `text-title-3 px-5` | Screen-level primary actions. |

### 5.2 `Pressable`

The single interactive primitive — buttons, icon buttons, filter chips and menu triggers are all this
component with different variants, which is what makes the floor and the five states impossible to
forget. Raw `<button>` is rejected outside `src/ui/`, so there is no second path.

`type` defaults to `"button"` — an unspecified button inside a form submits it, which has caused more
accidental submissions than any other HTML default. `busy` drives both styling and the screen-reader
announcement from one `aria-busy`.

### 5.3 `Field`

Text input with a **visible label, always**. Two rules are structural rather than left to the caller:
the label is always rendered (placeholder-only labelling disappears the moment the user types), and
the input is at least 44px tall — the old build's 24px search field was the worst target in the audit.

- `hint` — persistent helper text at `text-caption text-text-3`. A placeholder is not a label and not a hint.
- `error` — `text-caption` on `--danger`, border swaps to `--danger`, wired through `aria-describedby`
  + `role="alert"` so a screen reader hears it when it appears, not on the next focus.
- **Errors sit directly below the field they belong to**, never collected at the top.

### 5.4 `Switch`

A real `role="switch"` with `aria-checked`, not a styled checkbox. The two look identical and read
completely differently: a screen reader says "on/off" vs "checked/unchecked", and only the first is
true of a setting that takes effect immediately with no form to submit.

**The hit area is 44px even though the track is 24px tall.** The padding is transparent and the track
is centred in it, so the graphic stays the size people expect while the target clears the floor.

### 5.5 Card — the convention (not yet a component)

The canonical card today is, verbatim:

```
rounded-card border border-[var(--surface-border)] bg-surface-1
```

with `p-4` (= `--card-pad`). Rules that hold regardless of how it is composed:

- **Border, not shadow.** Never both.
- `bg-surface-1` for a card; `bg-surface-2` is an **inset** (field, bar track, hero box), not a second
  card style; `surface-3` is sheets only.
- A tappable card gets a hover (`hover:bg-surface-2`) and the focus ring. A card with no hover and a
  click handler is a card the user cannot tell is a button.

This convention is repeated at 181 call sites and consumes none of the four card tokens. See GAPS G4.

### 5.6 Chip

`Pressable variant="secondary|ghost" shape="chip" density="compact"`. Selected state is
`bg-accent-subtle` + accent text. Chips are 44px tall in the hit area and visually smaller — never
reach for a raw height to shrink one.

### 5.7 Surfaces that are not cards

| Thing | Tokens | WHY |
|---|---|---|
| Sheet | `--sheet-bg` (surface-3) · `--sheet-radius` · `--sheet-shadow` (= overlay) | It floats, so it is the one place shadow is correct. |
| Bottom nav | `--nav-bg` (88% surface-1) · `--nav-fg-active` (accent) · `--nav-fg-idle` (text-3) | Translucent so content scrolling under it stays legible as *content*; `--z-nav` above sticky headers. |
| Toast | `--toast-bg` (surface-3) | The app's only mutation feedback channel. **See GAPS G5 — all three kinds currently render the same box.** |
| Skeleton | `--skeleton-base` (surface-2) · `--skeleton-sheen` (surface-3), swept at `--duration-ambient` | Opacity in the pulse variant stays well above 0.2 — a fading element lingering below that reads as broken rather than loading. |
| Dense table | `--table-max-h` · `--table-row-h` · `px-4 py-3` head / `px-4 py-2` cell | Admin density, paired with a sticky header that actually sticks. |
| `EmptyState` | `px-4 py-12`, `mt-5 / mt-1 / mt-5` | The only real compression-and-release block in the codebase. Copy it rather than re-deriving it. |

---

## 6. Voice

Hungarian is primary; `en` and `de` ship from the same 777 keys. **Never hardcode visible text.**
The bundle already has a consistent voice — these rules are extracted from it, with real strings.

### 6.1 Address the user directly, informally, second person singular

> `auth.loginTitle` — **„Jelentkezz be a fiókodba"**
> `onboarding.step.goal.title` — **„Mi a célod?"**
> `home.greeting` — **„Szia!"**

**WHY:** this is a training app used mid-effort. Formal address (*Ön*) would make the app a clerk;
the product is closer to a training partner. Never `magázás`, never impersonal
(*"A cél kiválasztása"*).

### 6.2 An empty state says what will appear here, not that nothing is here

> `home.emptyTitle` / `home.emptyBody` — **„Ma nincs betervezve edzés" / „Ha van aktív terved, a mai napja itt jelenik meg."**
> `coins.noHistoryTitle` / `Body` — **„Még nincs mozgás" / „Az érmék akkor jelennek meg itt, amikor kiérdemelted vagy elköltötted őket."**
> `coaching.noHistoryTitle` — **„Még nincs edzéselőzmény" / „Amint a kliens elvégzi az első edzést, itt jelenik meg."**

**WHY:** "Nincs adat" tells the user the app is broken. The pattern is *title = the current fact,
body = the condition under which it fills*. Note the recurring **„Még"** — nothing is empty, it is
*not yet*.

### 6.3 An error says what happened, what survived, and what to do

> `chat.sendFailed` — **„Az üzenetet nem sikerült elküldeni. A szöveg megmaradt."**
> `onboarding.saveError` — **„A mentés nem sikerült — a válasz megmarad, újrapróbáljuk"**
> `auth.errors.rateLimited` — **„Túl sok próbálkozás. Várj egy kicsit, aztán próbáld újra."**
> `progress.outOfRange` — **„Ez az érték kívül esik a hihető tartományon. Ellenőrizd, nem ütöttél-e el valamit."**

**WHY:** the sentence that matters after a failure is *"did I lose my work"*. Answer it in the same
string. Never a code, never a stack, never "Hiba történt."

### 6.4 Say the consequence before the irreversible action

> `coaching.archiveConfirmBody` — **„{{email}} ezután nem lesz a klienseid között, és nem látod a jövőbeli adatait. Ez visszafordítható, de a hozzáférés azonnal megszűnik."**
> `coaching.codeOnce` — **„Másold ki most. Ez az egyetlen alkalom, amikor látod — a szerver csak a hashét tárolja."**
> `progress.photoPrivacyNote` — **„A fotóidat alapból SENKI nem látja — az edződ sem, amíg te nem engeded meg."**

**WHY:** confirmation dialogs that only say "Biztos?" move the decision without informing it. State
what changes, whether it can be undone, and when it takes effect.

### 6.5 Explain why you are asking, and mark what is optional

> `onboarding.sexHint` — **„Az erőnormák és az 1RM-becslés miatt kérdezzük. Kihagyható."**
> `onboarding.bodyOptional` — **„Ez a rész opcionális. Nélküle is működik minden — a terhelésbecslés lesz pontatlanabb."**
> `onboarding.equipmentHint` — **„Csak azt jelöld, amihez tényleg hozzáférsz. A terv ehhez igazodik."**

**WHY:** every personal field the app asks for costs trust. Naming the use, and naming the cost of
skipping it, is what buys it back.

### 6.6 Numbers get their meaning, not just their value

> `progress.notEnough` — **„Még kevés adat a grafikonhoz ({{count}} nap). Három edzésnap kell hozzá — két pont még nem trend."**
> `marketplace.searchCapped` — **„A keresés egy oldalnyi találatot ad. Szűkíts a szavakkal vagy a várossal, ha nem ezt kerested."**

**WHY:** a limit the user cannot see is a limit they will assume is a bug.

### 6.7 Buttons are verbs, one or two words, no punctuation

`common.save` „Mentés" · `common.retry` „Újra" · `common.cancel` „Mégse" ·
`workout.check` „Kész" · `workout.skipRest` „Pihenő átugrása" · `coaching.mintCode` „Új kód"

In-flight states are their own key and end in an ellipsis: `chat.sending` „Küldés…",
`onboarding.saving` „Mentés…". **WHY:** a label that changes to a sentence resizes the button.

### 6.8 Never moralise about the body

> `workout.interval.work` — **„Hajrá"**
> `progress.tab.body` — **„Test"**, `nutrition.macro.*` — plain nutrient names

**WHY:** no "crush it", no praise for a low number, no green for a falling weight. The app reports;
the user decides what it means. This is the one voice rule that is also a color rule (see DECISIONS).

### 6.9 Interpolation and pluralisation

All counts go through `{{count}}` with the i18n plural machinery — Hungarian takes a singular noun
after a numeral (`„{{count}} gyakorlat"`, not *gyakorlatok*), and hardcoding either form breaks `en`
and `de`. All 777 keys must exist in all three bundles or `check-i18n` fails the build.

---

## 7. DECISIONS — do not undo

Each of these is a value with a recorded reason. Changing the value silently discards the reason.

### Typography
1. **Two families, no more; display face opt-in per element.** Self-hosted for CSP. Never add a third face, never pull a webfont, never set the display face globally.
2. **`--text-timer: 3rem` and not more.** The player's hero is 193px tall at 375px and must fit five things; 48px is a lock-screen-clock size, legible from the floor.
3. **`--text-micro: 11px` is the floor.** Nothing in the product goes below it.
4. **Every step carries line-height/weight/tracking.** Do not split them out; the utility is meant to be complete.
5. **Tabular numerals on counting text.** Numbers never jitter width.
6. **`.measure` = 70ch** on prose.

### Space & radius
7. **`--spacing` IS the scale.** Do not declare a parallel spacing scale — two sources of truth.
8. **Components never name a raw radius step.** Use the five aliases. (The gate does not catch this; you have to.)
9. **`--card-pad` = 16px.** Bible allows 16–20; the old build's 24 made every card read as a page.
10. **`@theme static` is load-bearing.** Tailwind tree-shakes `@theme` variables it sees no utility for, and half this layer is consumed through `var()` from CSS and JS. Without `static`, `--duration-base`, `--ease-standard`, `--icon-lg`, `--nav-h` and the column widths silently resolve to the empty string.
11. **`.screen-x` uses `max()`, not addition** — the inset replaces the gutter. `check-safe-area` encodes this; renaming or removing `.screen-x` blinds the gate.
12. **`--content-pad-b` has exactly one definition.** The layout and the player must agree exactly.
13. **`--z-sticky` sits below `--z-nav`.**
14. **`--table-max-h` exists so the sticky header has a scroll container.**
15. **The admin sidebar is a grid column, not a second fixed element.**

### Color & finish
16. **Surfaces are elevation, never new colors. Text is one ink at three opacities.** The previous build froze three opaque hexes and broke the moment text sat on anything but `surface-0`.
17. **The `:root` copy of Midnight is the pre-paint fallback** against an unstyled flash on a cold, storage-less boot.
18. **The accent ramp is interpolated in OKLab** so a custom accent gets built-in-pack spacing.
19. **Interaction states derive from the ramp**, never hand-picked per component.
20. **The gradient law:** 2–3 stops, 135°, one gradient surface per screen, same hue family, never behind body text, never blue→purple (F-04).
21. **Cards separate by border OR shadow, never both** (F-09).
22. **Never `#000`** — pure black smears on OLED.
23. **Destructive stays red in the monochrome pack.** Color carries meaning there.
24. **Each pack's structural identity is deliberate, not decoration.** Midnight = calm/medium radius/hairline/overlay shadow. Solar = soft: larger radii, deeper shadow, taller controls (48px). Neon = pill + glow, no drop shadow. Mono = sharp + flat: no radius, heavier border, no shadow at all. Flattening these into one look destroys the theme system.
25. **`--accent-fg` is recomputed against WCAG by the theme engine.** Hand-setting it fights runtime code.
26. **`@theme inline` for the color mapping** so a `[data-theme]` swap repaints without re-rendering.
27. **`--ease-standard` is deliberately not re-declared in `@theme inline`** — it is theme-independent; an inline self-reference with no Layer-2 backing resolves to nothing.
28. **`color-scheme: dark`** so native controls follow the app, not the OS.
29. **Leaking browser scrollbars and browser-blue underlined links are named banned patterns.**
30. **Images always reserve their box** — 20 unreserved images on one list was F-13.
31. **Charts of body data are `direction="neutral"`.** A green number is the app telling someone which direction their body should go — the easiest way for a fitness app to say something harmful to someone with a disordered relationship to food.
32. **Macro overshoot is `warning`, never `danger`.** 300 kcal over target is a normal Tuesday; the tone of a color is part of what it says.
33. **`PHASE_COLOR` in the interval stage** (prepare→warning, work→accent, rest→success, break→info) is a coded language, not decoration. Keep the mapping.
34. **A client with zero sessions in 28 days is `warning`, not grey** — the whole value of that column is that the quiet ones stand out.
35. **`checkAccent` tests accent-as-text-on-surface, not fg-on-accent.** The obvious check is vacuous: those two contrast curves cross at 4.58.

### Motion
36. **UI never exceeds 500ms.**
37. **`--duration-ambient` is separate from the transition scale** — loops are not state changes.
38. **`animate-pulse`/`animate-spin` are re-pointed in `index.css`, not banned.** A rule enforced by deleting the convenient thing gets worked around. The gate reads that file rather than carrying its own list.
39. **Skeleton opacity never lingers below 0.2.**
40. **The hold-fill is linear and its duration equals the hold timer constant.** A fill that completes early teaches the lifter to let go too soon.
41. **Reduced motion collapses durations, it does not remove the state change.**

### Controls
42. **The 44px floor is on both axes, on every variant, with no opt-out from a call site.**
43. **Press feedback runs at `--duration-instant`.**
44. **Focus is redrawn, never removed** — in `control.ts` and in `index.css`.
45. **Disabled is unmistakable AND inert.**
46. **Busy keeps its size** — no layout shift.
47. **Exactly one `primary` per screen.**
48. **`danger` is never styled as primary and never sits in the primary position.**
49. **Density changes padding and type size only, never the hit area.**
50. **`Pressable` defaults `type="button"`.**
51. **The label in `Field` is always rendered.** A placeholder is not a label.
52. **`Switch` is a real `role="switch"`, and its 24px track lives inside a 44px target.**

### Gate invariants a visual pass must not trip
53. `.screen-x` must keep its name, both `safe-area-inset-left/right`, and `max()`.
54. Any new edge-pinned `fixed top-0/bottom-0` element must reference the matching inset (or `--content-pad-b`, or a `pt-/pb-[var(--…)]`) within 400 characters, in the same file.
55. `check-safe-area`'s two exemptions are file paths: `src/ui/feedback/variants/E14E20.tsx` and `src/ui/shell/OfflineIndicator.tsx`. Renaming either fails the gate. **An exemption is a written decision — "it looked fine on my laptop" is exactly the reasoning this gate exists to replace.**
56. `catalog.ts` entries are matched by `id: 'E\d+', … live: true,` within 160 characters. Do not insert a long field between `id` and `live`.
57. `ElementStyleProvider.tsx` must keep `CATALOG.map(`; `PlaygroundPage.tsx`'s `PREVIEWABLE` set and its `case 'E..':` arms must agree exactly; no `useElementVariant('E..')` call may be deleted, and none may be added to the three dormant elements.
58. `tsc -b` runs `noUnusedLocals` — dropping the last usage of an imported variant or type while restyling is a build failure, not a warning.

---

## 8. GAPS — what the scale genuinely lacks

Ordered by cost. G1 is a defect, not a gap; the rest are missing steps.

### G1 — Four utility names resolve to nothing, and the gate cannot see them

`border-line` (49 sites, 13 files), `text-label` (35 sites, 13 files), `text-ok` / `bg-ok-subtle`
(3 files). None of `--color-line`, `--text-label`, `--color-ok` exists. `check-tokens.mjs:351` builds
`OWNED_STEMS` from `--color-*` first segments and `continue`s on any stem it does not own, so all four
pass the gate and render as nothing: those borders fall through to `currentColor` (near-white body ink
at 0.92 on a card), those headings render at inherited 15px/400 in a Space Grotesk weight that is
never imported, and a positive admin delta gets no chip at all while a negative one renders correctly
in red.

**Fix, using only tokens that already exist:**

- `border-line` → `border-[var(--surface-border)]` (the exact class 70 other sites already use).
- `text-label`, the 8 uppercase sites → `text-micro uppercase`, **dropping `tracking-wide`** —
  `--text-micro` already carries the considered 0.06em.
- `text-label`, the 27 sentence-case card headings → `text-title-3`.
- `bg-ok-subtle text-ok` → `bg-success-subtle text-success`.

**Durable fix (script, not visual):** give `check-tokens` a symmetric half — flag any
`border-*` / `text-*` whose stem is neither an owned token nor a Tailwind built-in, and build an
`OWNED_TEXT_STEMS` set from `--text-*` the way `OWNED_STEMS` is built from `--color-*`. The gate's own
header comment documents this exact failure mode twice (`--measure-form`, `size-icon-s`) and still
cannot see it in the `text-` and `border-` namespaces.

### G2 — `--text-3` is below the app's own AA constant

`ui/theme/contrast.ts:39` declares `AA_NORMAL = 4.5` and the app enforces it on the accent. `--text-3`
at 0.42 measures **3.80:1 on surface-0 and 3.67:1 on surface-3**, carries real data at 11–12px in 175
places, and is never checked. The comment at `tokens.css:310` is a citation, not a rationale — this is
not a protected decision.

**Proposed:** `--text-2: … / 0.70` and `--text-3: … / 0.52` → 8.59:1 and 5.21:1 / 4.86:1.
**WHY move both:** raising only `text-3` collapses two tiers into one; 0.92 / 0.70 / 0.52 keeps three
distinguishable steps and clears AA on every surface in every pack.

### G3 — No middle step between `--accent-subtle` (12%) and `--accent` (100%)

Every other semantic family has one (`success-border` etc. at 30%); the accent jumps straight from a
1.15:1 wash to a filled color, so a selected card has no way to state itself.

**Proposed:** `--accent-border: color-mix(in srgb, var(--accent) 30%, transparent)` + a
`--color-accent-border` entry in `@theme inline`. **WHY:** selection appears on at least four screens
and currently has to choose between invisible and shouting.

Related, same axis: `--accent-subtle` at 12% measures **1.15:1** over `surface-0` while carrying the
active nav tab, "today", the selected row, the palette cursor and the user's own chat bubble.
20% → 1.30:1, still a wash rather than a fill, but it survives an OLED phone at arm's length in a gym.

### G4 — The scale is a grid, not a rhythm; and there is no component that owns the card

Two halves of the same absence.

**Named spacing steps.** 87% of every gap in the product is ≤12px and 8 gaps in the whole app are
≥20px, so proximity carries no information — 16 vs 12 vs 8 at arm's length is one distance.

```css
--spacing-tight:   0.5rem;  /* 8px  — inside one group: icon↔text, chip↔chip, label↔value */
--spacing-group:   1rem;    /* 16px — between peers in one list; equals --card-pad on purpose */
--spacing-section: 2rem;    /* 32px — between unrelated sections */
```

**WHY 32:** it is the first step at 2× the card padding, and below a 2:1 ratio a boundary does not read
as a boundary without a rule or a divider. **WHY this is not the parallel scale the token file
forbids:** all three are steps *of* `--spacing`, named for a relationship rather than a size.

**A `Surface` primitive.** `--card-bg`, `--card-border`, `--card-radius`, `--card-pad` and
`--border-width` have **zero consumers**; the card is a 181-times-copied class string, so padding is
re-decided per call site (`p-3` beats `p-4` 121:62), Mono's `2px` border never renders, and no card has
a hover or press state even where it is clickable.

**Proposed:** `src/ui/primitives/Surface.tsx`, built like `control.ts` — a `cva` recipe with
`variant: {flat, raised, interactive}` consuming those five tokens, `interactive` carrying the hover +
focus behaviour already proven in the library list row. **WHY:** the token layer already encodes every
one of these decisions and nothing consumes them; a decision no component owns is re-made by whoever
is typing.

### G5 — Semantic families that ship and never render

- **The toast has no tone.** All three kinds render the same `--toast-bg` box; the only signal is a
  20px icon. `--info-subtle` / `--info-border` have zero uses, `--danger-subtle` and
  `--warning-subtle` near-zero. **Proposed:** drive the toast's border and background from a per-kind
  map into the eight existing `-subtle`/`-border` tokens — the pattern the offline banner and the coach
  dashboard already use. **WHY:** the toast is the app's only mutation feedback channel, and an error
  and a success are currently the same box.
- **`--info` is two uses from being dead weight.** Either cash it in above, or delete four tokens
  across five packs.

### G6 — Theme-pack identity that never reaches a screen

`--border-width`, `--control-h`, `--shadow-glow` and `--gradient-brand` are declared per pack and
consumed by no product screen (the first two by nothing at all; the last two only by the playground
and the theme preview). Solar's "taller controls", Mono's "heavier border" and Neon's "pill + glow"
are claims the app does not currently make.

**Proposed, all inside existing decisions:** `border` → `border-[length:var(--border-width)]` in the
Surface recipe and `control.ts`; `min-h-[var(--target-min)]` → `min-h-[var(--control-h)]` (every pack
declares it ≥44px, so the floor and the `tiny-target` rule both survive); `--shadow-glow` on the
`primary` variant (it is `none` in four of five packs, so it costs nothing elsewhere); and
`--gradient-brand` gets exactly one home — the workout player's hero box, which is flat today, has no
body text over it, and is the screen the product exists for.

### G7 — One missing edge step

Every pack declares a single border opacity, so an interactive surface cannot strengthen its edge on
hover without a raw value or misusing the accent on every hoverable row.

**Proposed:** `--surface-border-strong: rgb(255 255 255 / 0.14)` per pack (0.18 for Mono, which
already runs 0.12). **WHY:** the `interactive` Surface variant needs a hover edge that is not the
signature color.

### G8 — One missing type step

`text-body … font-medium` is hand-written 13 times across 10 files for the primary line of a list row —
the single most repeated text role in the product, patched at the call site because the scale has no
15/22/500 step.

**Proposed:** `--text-body-strong: 0.9375rem` with `--line-height: 1.375rem` and `--font-weight: 500`.
**WHY:** this is the only genuinely new step the type axis needs; every other gap closes with a token
that already exists.
