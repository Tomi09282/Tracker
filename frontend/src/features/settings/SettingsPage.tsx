import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { Screen } from '../../ui/shell/Screen';
import { Monogram, MonogramSkeleton } from '../../ui/data/Monogram';
import { LedgerRow } from '../../ui/data/LedgerRow';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { Pic } from '../../ui/media/Pic';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';
import { CueSettings, useCueSummary } from './CueSettings';
import { hasRole, rolesOf, useSession, useLogout, useSetDisplayName, type SessionUser } from '../auth/useSession';
import { toCoins, useWallet } from '../coins/useCoins';
import { readLevel, type WalletRead } from '../coins/statement';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { useOnboarding } from '../onboarding/useOnboarding';
import { hourLabel, useDayPrefs, zoneCity } from './dayPrefs';
import { useRewards } from '../rewards/rewardsApi';
import { RewardsLedgerRow } from '../rewards/RewardsLedgerRow';
import { isValidDisplayName, personLabel } from '../../lib/person';

/**
 * The role, in the user's own language. A lookup rather than a template literal so a role the
 * bundle has no label for is a type error here instead of a raw key rendered on screen.
 *
 * Settings-owned keys, not `adminUsers.role.*`: that group is the ADMIN TABLE's vocabulary, where
 * `user` is the row's role column and reads `Felhasználó`. On your own account the word is `Tag` —
 * you are a member of the product, not a row in a staff table.
 */
const ROLE_LABEL: Record<SessionUser['role'], string> = {
  user: 'settings.role.user',
  coach: 'settings.role.coach',
  admin: 'settings.role.admin',
};

/**
 * Profil v2 — design round A, frames `settings-v2-1` (coach + admin, first view), `settings-v2-2`
 * (the whole page), `settings-v2-member` (a plain member) and `sheets` (the NameSheet).
 *
 * Rows that open things instead of a page of fields (plan "Profile v2"):
 *
 *   1  the identity hero: the 176 monogram, the NAME LINE (name + chevron, the only target that
 *      opens the NameSheet), the address and ONE micro line of the roles the account holds;
 *   2  the ledger, closed by a rule: ÉRMÉK (→ /coins). SZINT (Phase 2, shown once the wallet carries a level) and JUTALMAK (Phase 4)
 *      join it only when their data exists — never a fake figure;
 *   3  NÉZETEK (coach / admin only): the doors into the trainer and the admin view;
 *   4  BEÁLLÍTÁSOK as one-line rows: Nap és időzóna (→ /settings/day, LifeOS Phase 2),
 *      Felszerelés (→ /settings/equipment), Edzés közbeni jelzések (→ the CueSheet), Nyelv
 *      (switches inline);
 *   5  Kijelentkezés.
 *
 * The closed ledger's rule opens the next section, so the first section after it draws no rule of
 * its own (`afterLedger` of the round-A common script). Sections stand 32 apart (the screen's gap).
 *
 * There is no appearance section (owner decision D1). A tab root: no back control, no top title.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { data: user, isPending, isError } = useSession();
  const logout = useLogout();
  const wallet = useWallet();
  // SZINT (LifeOS Phase 2): read from the wallet's 031 fields; null on a server that sends no level.
  const level = readLevel(wallet.data as WalletRead | undefined);
  // JUTALMAK (LifeOS Phase 4): "N elérhető" is GET /rewards' redeemableCount; a server without the
  // shop (no migration 033) answers 404 and the row is not drawn.
  const rewards = useRewards();
  const onboarding = useOnboarding();
  const cueSummary = useCueSummary();
  // "Budapest · 04:00": the zone's place and the day start (GET /me/prefs). Until a zone is stored,
  // or while the read is out or failed, the row names nothing — it still opens the page.
  const dayPrefs = useDayPrefs().data;
  const [nameOpen, setNameOpen] = useState(false);
  const [cuesOpen, setCuesOpen] = useState(false);

  // THE DOT HAS TO MEAN SOMETHING: "this session is live and healthy" — a resolved, non-null
  // /auth/me. A failed session read drops the dot.
  const sessionHealthy = !isPending && !isError && user != null;
  const isCoach = hasRole(user, 'coach');
  const equipment = onboarding.data?.profile?.equipment;

  return (
    <Screen top="root">
      {/* "Me": the identity and the ledger, 24 apart (round-A `profileTop`). */}
      <div className="mt-4 flex flex-col gap-6">
        {/* The account block keeps `Fiók` as an ACCESSIBLE name: the identity is its visible
            heading, and a screen-reader user otherwise meets an unnamed cluster. */}
        <section aria-label={t('settings.account')} className="flex flex-col gap-7">
          {isPending ? (
            <>
              <MonogramSkeleton size={176} className="self-start" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </>
          ) : (
            <>
              {user ? <Monogram person={user} size={176} dot={sessionHealthy} className="self-start" /> : null}
              {/* On a failed session read the lines stay EMPTY rather than showing a placeholder
                  account. This is the one screen that prints the address in full: it is your own. */}
              <div className="flex flex-col gap-1">
                {user ? (
                  // THE NAME LINE IS THE ONLY TARGET (round-A review finding 13): hug width, 44
                  // tall by its padding, while it takes the title's 28 in the column (-my-2).
                  <Pressable
                    variant="link"
                    aria-haspopup="dialog"
                    aria-label={`${t('settings.displayName')}: ${personLabel(user)}`}
                    onClick={() => setNameOpen(true)}
                    className="-my-2 max-w-full gap-1.5 self-start py-2"
                  >
                    <span className="min-w-0 truncate text-title text-text-1">{personLabel(user)}</span>
                    <ChevronRight aria-hidden className="text-text-3" />
                  </Pressable>
                ) : (
                  <p aria-hidden className="h-7" />
                )}
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 truncate text-body text-text-2">{user?.email}</p>
                  {user ? (
                    <span className="shrink-0 text-micro text-text-2">
                      {rolesOf(user)
                        .map((role) => t(ROLE_LABEL[role]))
                        .join(' · ')}
                    </span>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </section>

        {/* THE WALLET'S ONLY DOOR ON A PHONE is the first ledger row: /coins has no tab. check-nav
            asserts the link and verify-nav-gate anchors on the literal attribute below. */}
        <RowStack open close>
          <LedgerRow
            to="/coins"
            label={t('nav.coins')}
            labelTrail={<Pic slot="coin" width={22} />}
            note={t('coins.balanceCaption')}
            value={wallet.data ? toCoins(wallet.data.balanceMinor) : undefined}
            failed={wallet.isError}
            busy={wallet.isPending}
          />
          {/* SZINT (LifeOS Phase 2, settings-v2-member): the level and a 120 pt bar of the way to the
              next one in the middle column. Only when the wallet carries a level - an older server
              sends none, and a level that is not known is not drawn (never a fake figure). */}
          {level ? (
            <LedgerRow
              to="/coins"
              label={t('coins.level.label')}
              note={<ProgressBar value={level.progress} label={t('coins.level.xp', { xp: level.xp, next: level.next })} className="mb-0.5 w-30" />}
              value={level.level}
            />
          ) : null}
          {rewards.data ? (
            <RewardsLedgerRow count={rewards.data.redeemableCount} />
          ) : null}
        </RowStack>
      </div>

      {/* NÉZETEK — the doors to the trainer and the admin view. The member's bar is the same five
          tabs for every role, so these rows are the ONLY way into /coach and /admin on a phone:
          check-nav holds both as REQUIRED_DOORS of this file. A view grants nothing; each route
          re-checks the role on the server. */}
      {isCoach ? (
        <section aria-labelledby="settings-views" className="flex flex-col gap-group">
          <SectionHeader title={t('settings.views.title')} titleId="settings-views" rule={false} />
          <RowStack>
            <ListRow to="/coach" lead={<ViewIcon slot="tab-coach" />} leadSlot title={t('settings.views.coach')} chevron />
            {hasRole(user, 'admin') ? (
              <ListRow to="/admin" lead={<ViewIcon slot="tab-admin" />} leadSlot title={t('settings.views.admin')} chevron />
            ) : null}
          </RowStack>
        </section>
      ) : null}

      <section aria-labelledby="settings-settings" className="flex flex-col gap-group">
        {/* Right after the ledger (a member) the ledger's closing rule already opens it. */}
        <SectionHeader title={t('settings.title')} titleId="settings-settings" rule={isCoach} />
        <RowStack>
          <ListRow
            to="/settings/day"
            title={t('settings.day.title')}
            value={dayPrefs?.timezone ? `${zoneCity(dayPrefs.timezone)} · ${hourLabel(dayPrefs.dayStartHour)}` : undefined}
            chevron
          />
          <ListRow
            to="/settings/equipment"
            title={t('settings.equipment')}
            value={equipment ? t('settings.equipmentCount', { count: equipment.length }) : undefined}
            chevron
          />
          <ListRow
            onClick={() => setCuesOpen(true)}
            aria-haspopup="dialog"
            title={t('settings.cues.row')}
            value={cueSummary || undefined}
            chevron
          />
          {/* Applies at once and lives on this device. */}
          <ListRow title={t('common.language')} control={<LanguageToggle />} />
        </RowStack>
      </section>

      {/* Sign-out: one tap, no confirmation, busy while it runs. It renders even while the session
          loads, because it depends on there BEING a session, not on its contents. */}
      <RowStack open>
        <ListRow title={t('auth.logout')} tone="danger" busy={logout.isPending} onClick={() => logout.mutate()} />
      </RowStack>

      {user ? <NameSheet user={user} open={nameOpen} onClose={() => setNameOpen(false)} /> : null}
      <Sheet open={cuesOpen} onClose={() => setCuesOpen(false)} title={t('settings.cues.row')}>
        <CueSettings />
      </Sheet>
    </Screen>
  );
}

/**
 * A NÉZETEK row's raster: 32 pt, CENTRED in the row's 48 pt lead slot (round-A `viewRow`: "Icon
 * slot" 48 x 44, centre-aligned), so its ink starts 8 pt in and the title stays on the slot grid.
 */
function ViewIcon({ slot }: { slot: 'tab-coach' | 'tab-admin' }) {
  return (
    <span className="flex w-full justify-center">
      <Pic slot={slot} width={32} />
    </span>
  );
}

/**
 * The NameSheet — frame `sheets`: "Megjelenített név", the underline field focused on the name,
 * its hint, and the sheet's one lime pill "Mentés" (the page under the scrim has none).
 *
 * The logic is the old `DisplayNameField`'s: an explicit save (the server rejects anything under
 * two characters, so an autosave would fire a failing request on the first keystroke), enabled
 * only when the text changed and is valid by the server's rule (code points, not UTF-16 units).
 * A success closes the sheet; a refusal keeps it open with the error dot in its header. The draft
 * starts from the stored name every time the sheet opens, so a cancelled edit never lingers.
 */
function NameSheet({ user, open, onClose }: { user: SessionUser; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSetDisplayName();
  const [draft, setDraft] = useState(user.display_name ?? '');
  const input = useRef<HTMLInputElement>(null);
  const reset = save.reset;

  useEffect(() => {
    if (!open) return;
    setDraft(user.display_name ?? '');
    reset();
    // The sheet takes the focus for itself when it opens; the field takes it one frame later, as
    // the frame draws it (caret, lime line).
    const id = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [open, user.display_name, reset]);

  const trimmed = draft.trim();
  const dirty = trimmed !== (user.display_name ?? '');
  const valid = isValidDisplayName(draft);

  return (
    <Sheet open={open} onClose={onClose} title={t('settings.displayName')} status={save.isError ? 'error' : 'idle'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty || !valid) return;
          save.mutate(trimmed.length ? trimmed : null, { onSuccess: onClose });
        }}
      >
        <Field
          ref={input}
          label={t('settings.displayName')}
          labelHidden
          hint={t('settings.displayNameHint')}
          placeholder={t('settings.displayNamePlaceholder')}
          value={draft}
          maxLength={120}
          autoComplete="name"
          onChange={(e) => setDraft(e.target.value)}
        />
        <Pressable type="submit" variant="primary" size="lg" className="w-full" busy={save.isPending} disabled={!dirty || !valid}>
          {t('common.save')}
        </Pressable>
      </form>
    </Sheet>
  );
}
