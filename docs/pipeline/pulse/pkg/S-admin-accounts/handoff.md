# S-admin-accounts - hand-off

Frames: admin-accounts-v2, admin-account-detail-1, -2a-name, -2b-role, -2c-disable, -2d-coins, -3a-disabled, -3b-own
(TRACKER-mockups/5-pulse/kepernyok-2x/admin-v2/). Backend: B-admin-accounts (merged), api.md in pkg/B-admin-accounts/.

## Routes (all lazy + suspended, ROUTE_META parent row, check-nav / check-nav-active green)
- `/admin/accounts` - the list: search (name and e-mail), SZEREP / ALLAPOT / RENDEZES lines, count line, `Tovabbiak n / total`
  paging with the server cursor. The whole state is in the URL (`q`, `role`, `state`, `sort`, `dir`), so list -> account -> back restores it.
- `/admin/accounts/:id` - the account page; sheets: name, role (the admin's own password only when granting admin),
  disable (reason), enable (reason - not drawn, uses the disable sheet's layout), coin adjustment, sign out everywhere,
  lift the lock-out, force a password change. Own-account and disabled states.
- `/admin/accounts/:id/coins` - the whole coin ledger of one account (GET /admin/coins/ledger?user_id=), the 'Teljes naplo' door.
- The 'Nyitott bejelentes' door goes to `/admin/marketplace?view=posts&q=<handle>` (S-admin-posts' list reads those two params).

## Shared edits (integrator files, all small)
- `frontend/src/app/router.tsx` - 3 lazy imports + 3 routes (admin/accounts, admin/accounts/:id, admin/accounts/:id/coins).
- `frontend/src/app/routeMeta.ts` - 2 rows (`/admin/accounts/:id`, `/admin/accounts/:id/coins`, parent `/admin/accounts`).
- `frontend/scripts/check-nav-active.mjs` - 2 EXPECT rows (Fiokok lights for both).
- `frontend/src/ui/data/Monogram.tsx` - size 140 (the hero) and a muted dot (disabled account).
- `frontend/src/features/admin/UserSearch.tsx` deleted (its behaviour is `accounts/AccountList.tsx`); `AdminAccountsPage.tsx` renders the list.
- i18n: `i18n.patch.json` (namespace adminUsers, made by make-i18n.mjs); `adminUsers.moreMatches` is removed.
- `docs/pipeline/pulse/work-packages.json` - the S-admin-accounts entry (pulse-i18n resolves the package from it).

## Deviations from the frames (for deviations.md / the owner)
1. NAPLO shows the actor as an e-mail and the action only: the API carries `actorEmail` and no detail, so the frame's
   "Erme-korrekcio -50", "Kovacs Peter" (a name) and "Rendszer" (system actor) lines cannot be drawn.
2. The disabled (3a) and own (3b) frames are drawn with FIOK + MUVELETEK only; the app keeps ERME, TEVEKENYSEG and NAPLO on
   those pages too (an admin looking at a disabled account needs the log that says who disabled it). One-line change if the owner wants the short pages.
3. 'Nyitott munkamenet' shows the count only, not "3 · ebbol ez" (the API does not say which session is the caller's).
4. The enable action's reason sheet is not drawn: it reuses the disable sheet (title 'Fiok engedelyezese', link 'Engedelyezes').
5. The name sheet's 'Mentes' pill is disabled until the name differs from the current one (the frame shows it lit on the unchanged name).
6. Coin sheet: the figure is the kit's NumeralField (a typed figure with its 1 pt line under it); the frame draws no line.
   The `check:pulse` raw-form ban left no other way to get a typed number between two buttons.
7. Sheet titles of 'Kijelentkeztetes mindenhonnan' and 'Jelszocsere kotelezo' are shortened ('Kijelentkeztetes', 'Jelszocsere')
   because the kit's sheet header cuts the row's longer title with an ellipsis.
8. The coin row 'Erme-korrekcio' is hidden on the own account (the server refuses it: 409 cannot_adjust_own_coins); the frame still draws it.
9. The FilterLine words are bare toggle buttons (one `token-lint-disable` with the reason): Chip draws a filled pill, Pressable's link has no mark.
