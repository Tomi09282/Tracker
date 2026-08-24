import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Globe,
  LogOut,
  Palette,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';
import { ThemeStudio } from './ThemeStudio';
import { CueSettings } from './CueSettings';
import { useSession, useLogout, type SessionUser } from '../auth/useSession';

/**
 * The role, in the user's own language. `SettingsPage` used to print `user.role` raw, so a
 * Hungarian member read the English word "user" on the one line of the screen that is about them.
 * A lookup rather than a template literal so a role the bundle has no label for is a type error
 * here instead of a raw key rendered on screen.
 */
const ROLE_LABEL: Record<SessionUser['role'], string> = {
  user: 'admin.role.user',
  coach: 'admin.role.coach',
  admin: 'admin.role.admin',
};

/**
 * A section's title, with its glyph in a tinted holder.
 *
 * The holder is the repeated element of this redesign: a 20px glyph on its own has too little
 * visual mass to open a section, and the 44px tinted square is what makes four sections scan as
 * four objects rather than as four lines of small caps.
 */
function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-tight">
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-subtle text-accent"
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>
      <h2 className="text-micro uppercase text-text-3">{title}</h2>
    </div>
  );
}

/**
 * Settings — [[55-Screens/settings]].
 *
 * Almost every visit is one of three errands: sign out, silence the voice, change the theme. The
 * screen is ordered so all three are reachable without a decision, which is what the redesign
 * bought by deleting the colour laboratory that used to fill it (the gradient builder alone was
 * more controls than the entire workout player).
 *
 * THE ANCHOR IS A PERSON, not a chart. This screen is about an account and a device, and the
 * identity is the one thing that has to be unambiguous before anything below it is touched:
 * signing out of the wrong account is the only irreversible act here.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { data: user, isPending, isError } = useSession();
  const logout = useLogout();

  // THE BADGE HAS TO MEAN SOMETHING. A check permanently drawn on an avatar is a claim the
  // product makes about the account with nothing behind it. There is no `email_verified` on the
  // session, so the only true statement available is "this session is live and healthy" — which
  // is exactly what a resolved, non-null /auth/me is. A failed session read drops the badge with
  // the email, rather than decorating an account we could not confirm.
  const sessionHealthy = !isPending && !isError && user != null;
  const monogram = user?.email?.[0]?.toUpperCase() ?? '';

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      <div className="flex flex-col gap-group">
        <header className="relative flex min-h-[var(--target-min)] items-center justify-center">
          <Pressable
            shape="icon"
            variant="ghost"
            aria-label={t('common.back')}
            onClick={() => history.back()}
            className="absolute left-0"
          >
            <ChevronLeft className="size-icon-l" strokeWidth={2} aria-hidden />
          </Pressable>
          <h1 className="text-title-1 text-text-1">{t('settings.title')}</h1>
        </header>

        {/* The account block lost its visible `Fiók` heading in the redesign — the identity IS
            the heading now. It keeps the word as an ACCESSIBLE name, because a screen-reader user
            otherwise meets an unlabelled cluster of three controls between the h1 and the first
            section, and `Fiók` is exactly what that cluster is. */}
        <section aria-label={t('settings.account')} className="flex flex-col gap-group">
          <div className="flex flex-col items-center gap-tight">
            {isPending ? (
              // The skeleton carries the REAL geometry — 80px ring, one body line, one chip — so
              // the swap when the session lands moves nothing.
              <>
                <Skeleton className="size-20 rounded-full" />
                <Skeleton className="h-[22px] w-52" />
                <Skeleton className="h-7 w-16 rounded-chip" />
              </>
            ) : (
              <>
                <div className="relative">
                  {/* `rounded-full`, not `rounded-chip`: a pack is allowed to re-shape CONTROLS,
                      and Mono squares every chip. An avatar is not a control, and a square
                      monogram is not the same element. */}
                  <div className="grid size-20 place-items-center rounded-full border-4 border-accent bg-surface-2">
                    <span aria-hidden className="font-display text-title-1 text-text-1">
                      {monogram}
                    </span>
                  </div>
                  {sessionHealthy ? (
                    <span
                      aria-hidden
                      className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-surface-0 bg-success text-on-success"
                    >
                      <Check className="size-icon-s" strokeWidth={3} />
                    </span>
                  ) : null}
                </div>

                {/* On a failed session read the email slot stays EMPTY rather than showing a
                    placeholder account — a wrong identity here is worse than a missing one. */}
                <p className="text-body text-text-1">{user?.email}</p>

                {user ? (
                  <span className="text-caption rounded-chip border border-[var(--surface-border)] px-3 py-1 text-text-2">
                    {t(ROLE_LABEL[user.role])}
                  </span>
                ) : null}
              </>
            )}
          </div>

          {/* No section card around it, and no confirmation dialog: one tap, busy while it runs.
              It renders even while the session is still loading, because it depends on there
              BEING a session, not on the session's contents. */}
          <Pressable
            variant="secondary"
            className="w-full"
            busy={logout.isPending}
            icon={<LogOut className="size-icon-m" strokeWidth={2} aria-hidden />}
            onClick={() => logout.mutate()}
          >
            {t('auth.logout')}
          </Pressable>

          {/* THE WALLET'S ONLY DOOR ON A PHONE.
              /coins was found by the Phase 8 audit with no inbound link at all — wallet, ledger,
              store and achievements, all finished, all unreachable below 1024px because the
              command palette that listed them is `hidden lg:flex`. It has no bottom-bar tab in
              the approved design either, so this row IS the path. It stays inside the account
              block rather than getting its own section because a balance is an account fact, not
              a setting — and it sits AFTER the sign-out because the screen spec anchors the
              sign-out directly under the identity.
              check-nav.mjs asserts this link exists. */}
          <Surface
            as={Link}
            to="/coins"
            interactive
            className="flex min-h-[var(--target-min)] items-center gap-tight"
          >
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-subtle text-accent"
            >
              <Coins className="size-icon-m" strokeWidth={2} />
            </span>
            <span className="text-body flex-1 text-text-1">{t('nav.coins')}</span>
            <ChevronRight className="size-icon-m shrink-0 text-text-3" strokeWidth={2} aria-hidden />
          </Surface>
        </section>
      </div>

      <section className="flex flex-col gap-group">
        <SectionHeader icon={Palette} title={t('settings.appearance')} />
        <Surface>
          <ThemeStudio />
        </Surface>
      </section>

      <section className="flex flex-col gap-group">
        <SectionHeader icon={Volume2} title={t('settings.cues.title')} />
        <CueSettings />
      </section>

      {/* Admin lives HERE, not in the bottom bar. A coach already fills all five nav slots, so
          pushing an admin tab made six and the bar silently clamped the sixth away — an admin
          could not reach /admin from the navigation at all. It belongs in Settings on its own
          merits anyway: it is role-specific and infrequent, which is the definition of secondary
          navigation. The link is a convenience; the route and every endpoint behind it enforce the
          role on the server regardless. */}
      {user?.role === 'admin' ? (
        <section className="flex flex-col gap-group">
          <SectionHeader icon={ShieldCheck} title={t('nav.admin')} />
          <Surface
            as={Link}
            to="/admin"
            interactive
            className="text-body flex min-h-[var(--target-min)] items-center gap-tight text-accent"
          >
            <span className="flex-1">{t('settings.openAdmin')}</span>
            <ChevronRight className="size-icon-m shrink-0" strokeWidth={2} aria-hidden />
          </Surface>
        </section>
      ) : null}

      <section className="flex flex-col gap-group">
        <SectionHeader icon={Globe} title={t('common.language')} />
        <LanguageToggle />
      </section>
    </div>
  );
}
