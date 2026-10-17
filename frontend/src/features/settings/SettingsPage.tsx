import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '../../ui/primitives/Field';
import { TextLink } from '../../ui/primitives/TextLink';
import { Screen } from '../../ui/shell/Screen';
import { Monogram, MonogramSkeleton } from '../../ui/data/Monogram';
import { LedgerRow } from '../../ui/data/LedgerRow';
import { Fraction } from '../../ui/data/Numeral';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Sparkline } from '../../ui/feedback/Sparkline';
import type { TrendPoint } from '../../ui/feedback/TrendChart';
import { Pic } from '../../ui/media/Pic';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';
import { CueSettings } from './CueSettings';
import { EquipmentSection } from './EquipmentSection';
import { hasRole, useSession, useLogout, useSetDisplayName, type SessionUser } from '../auth/useSession';
import { toCoins, useAchievements, useWallet } from '../coins/useCoins';
import { useMeasurements } from '../progress/useProgress';
import { isValidDisplayName, personLabel } from '../../lib/person';

/**
 * The role, in the user's own language. `SettingsPage` used to print `user.role` raw, so a
 * Hungarian member read the English word "user" on the one line of the screen that is about them.
 * A lookup rather than a template literal so a role the bundle has no label for is a type error
 * here instead of a raw key rendered on screen.
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

/** The metric the ledger's third row shows — the one the Haladás tab opens on for most people. */
const WEIGHT = 'weight';

/**
 * The trend in the weight row lands its end dot 16 pt before the figure (`settings-1.body.js`:
 * `sw = clamp(70, 120, figureInk.left - 16 - 112)`). The figure's ink cannot be measured before it
 * is drawn, so it is estimated from the glyphs of a 48 pt Big Shoulders `num` figure (no tabular
 * figures: "1" is about 13 wide, "," 10, every other digit 24). With the unit after it the figure
 * ends on x 315 of the row, so the frame's "83,1" (71) leaves 118.
 */
const GLYPH_W: Record<string, number> = { '1': 13, ',': 10, '.': 10 };
const sparkWidth = (figure: string) => {
  const ink = [...figure].reduce((sum, ch) => sum + (GLYPH_W[ch] ?? 24), 0);
  return Math.max(70, Math.min(118, 189 - ink));
};

/**
 * Profil — frames `settings-1` (the first view) and `settings-2` (the whole page).
 *
 * The page is a person first and settings second: the monogram is the screen's one hero, the
 * three facts about you are a ledger (balance, achievements, weight — every row a door), and
 * "Beállítások" is a heading half-way down, where the settings begin. Nothing is enclosed: the
 * grouping is the rules, the eyebrows and the 32 between blocks.
 *
 * There is no appearance section. Pulse is the only look (owner decision D1): the theme picker,
 * the transparency choice and the client theme engine behind them are gone, and nothing here reads
 * a stored theme or asks the server for one. The admin row stays for admins (owner answer Q4).
 *
 * A tab root: no back control and no top title — the monogram starts where the frame puts it.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: user, isPending, isError } = useSession();
  const logout = useLogout();

  // The three facts of the ledger. Each read is on its own: a failed one prints the dash in ITS
  // row (never a 0) and the other two still stand.
  const wallet = useWallet();
  const achievements = useAchievements();
  const measurements = useMeasurements();

  // THE DOT HAS TO MEAN SOMETHING. A mark permanently drawn on the monogram is a claim the
  // product makes about the account with nothing behind it. There is no `email_verified` on the
  // session, so the only true statement available is "this session is live and healthy" — which
  // is exactly what a resolved, non-null /auth/me is. A failed session read drops the dot.
  const sessionHealthy = !isPending && !isError && user != null;

  const unlocked = useMemo(() => {
    const list = achievements.data?.achievements;
    if (!list) return undefined;
    return { done: list.filter((a) => a.unlockedAt != null).length, total: list.length };
  }, [achievements.data]);

  // Weight readings, oldest first (x is time: an out-of-order row would draw the line doubling back).
  const weight = useMemo(() => {
    const rows = (measurements.data?.measurements ?? []).filter((m) => m.metric_key === WEIGHT);
    if (!rows.length) return undefined;
    const sorted = [...rows].sort((a, b) => (a.measured_on < b.measured_on ? -1 : a.measured_on > b.measured_on ? 1 : 0));
    const series: TrendPoint[] = sorted.map((m) => ({ date: m.measured_on, value: m.value }));
    const last = sorted[sorted.length - 1];
    return { series, value: last.value, unit: last.unit === 'pct' ? '%' : last.unit };
  }, [measurements.data]);

  const weightFigure = weight ? weight.value.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) : '';

  return (
    <Screen top="root">
      {/* The person and the settings' first field are one block: 36 between the two halves
          (`settings-1.body.js` "Profile" gap), 32 between every section after it (the screen's). */}
      <div className="mt-4 flex flex-col gap-9">
        <div className="flex flex-col gap-6">
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
                {/* On a failed session read the lines stay EMPTY rather than showing a
                    placeholder account — a wrong identity here is worse than a missing one.
                    This is the one screen that prints the address in full: it is your own. */}
                <div className="flex flex-col gap-1">
                  <p className="text-title text-text-1">{user ? personLabel(user) : ''}</p>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="min-w-0 truncate text-body text-text-2">{user?.email}</p>
                    {user ? <span className="shrink-0 text-micro text-text-2">{t(ROLE_LABEL[user.role])}</span> : null}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* THE WALLET'S ONLY DOOR ON A PHONE is the first ledger row: /coins has no tab, and
              the command palette that lists it is desktop-only. check-nav asserts the link and
              verify-nav-gate anchors on the literal attribute below. */}
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
            <LedgerRow
              to="/coins"
              label={t('coins.tab.achievements')}
              note={t('settings.unlockedNote')}
              // No srText: the row's note already says "feloldva", so the link reads
              // "Eredmények feloldva 4 / 7" instead of naming the word twice.
              value={unlocked ? <Fraction value={unlocked.done} of={unlocked.total} /> : undefined}
              failed={achievements.isError}
              busy={achievements.isPending}
            />
            <LedgerRow
              to="/progress"
              label={t('progress.metricName.weight')}
              note={
                weight && weight.series.length >= 3 ? (
                  <Sparkline series={weight.series} width={sparkWidth(weightFigure)} height={28} />
                ) : undefined
              }
              value={weight ? weightFigure : undefined}
              unit={weight?.unit}
              failed={measurements.isError}
              busy={measurements.isPending}
            />
          </RowStack>
        </div>

        {/* NÉZETEK — the doors to the trainer and the admin view (design round A, settings-v2-1).
            The member's bar is the same five tabs for every role, so these rows are the ONLY way
            into /coach and /admin on a phone: check-nav holds both as REQUIRED_DOORS of this file.
            A view grants nothing; each route re-checks the role on the server. */}
        {hasRole(user, 'coach') ? (
          <section aria-labelledby="settings-views" className="flex flex-col gap-group">
            <SectionHeader title={t('settings.views.title')} titleId="settings-views" />
            <RowStack>
              <ListRow
                to="/coach"
                lead={<Pic slot="tab-coach" width={32} />}
                leadSlot
                title={t('settings.views.coach')}
                chevron
              />
              {hasRole(user, 'admin') ? (
                <ListRow
                  to="/admin"
                  lead={<Pic slot="tab-admin" width={32} />}
                  leadSlot
                  title={t('settings.views.admin')}
                  chevron
                />
              ) : null}
            </RowStack>
          </section>
        ) : null}

        <div className="flex flex-col gap-4">
          <h1 className="text-display text-text-1">{t('settings.title')}</h1>
          {/* NAMING YOURSELF IS THE ONLY WAY THE NAME EVER GETS SET: `users.display_name` is NULL
              for everybody until somebody types here. */}
          {user ? <DisplayNameField user={user} /> : null}
        </div>
      </div>

      <EquipmentSection />

      <CueSettings />

      {/* Applies at once and lives on this device: the choice sits in the section head. */}
      <SectionHeader title={t('common.language')} trailing={<LanguageToggle />} />

      {/* Sign-out: one tap, no confirmation, busy while it runs. It renders even while the
          session loads, because it depends on there BEING a session, not on its contents. */}
      <RowStack open>
        <ListRow title={t('auth.logout')} tone="danger" busy={logout.isPending} onClick={() => logout.mutate()} />
      </RowStack>
    </Screen>
  );
}

/**
 * The name editor — an underline field.
 *
 * Its own component: this is the only part of the screen that owns unsaved text, and unsaved text
 * must not be lost to an unrelated re-render.
 *
 * ═══ WHY A SAVE AND NOT AN AUTOSAVE ════════════════════════════════════════════════════════════
 *
 * A single 120-character field is not the plan editor: the server rejects anything under two
 * characters, so an autosave would fire a failing request on the first keystroke of every name.
 * The save is explicit, and it only appears once something has actually changed — as a text link
 * on the field's line (the frame draws the idle field; Pulse has one pill per screen and a link is
 * the second action's look).
 */
function DisplayNameField({ user }: { user: SessionUser }) {
  const { t } = useTranslation();
  const save = useSetDisplayName();
  const [draft, setDraft] = useState(user.display_name ?? '');

  const trimmed = draft.trim();
  const current = user.display_name ?? '';
  const dirty = trimmed !== current;
  // The server's rule (code points, not UTF-16 units), so the save is disabled instead of refused.
  const valid = isValidDisplayName(draft);

  return (
    <Field
      label={t('settings.displayName')}
      hint={t('settings.displayNameHint')}
      placeholder={t('settings.displayNamePlaceholder')}
      value={draft}
      maxLength={120}
      autoComplete="name"
      onChange={(e) => setDraft(e.target.value)}
      trailing={
        dirty ? (
          // min-w-11: "Save" (en) is 30 pt of ink; the target still has to be 44 wide, and the
          // word stays on the field's end.
          <TextLink
            className="min-w-11 justify-end"
            disabled={!valid}
            busy={save.isPending}
            onClick={() => save.mutate(trimmed.length ? trimmed : null)}
          >
            {t('common.save')}
          </TextLink>
        ) : undefined
      }
    />
  );
}
