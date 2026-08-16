import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';
import { ThemeStudio } from './ThemeStudio';
import { CueSettings } from './CueSettings';
import { useSession, useLogout } from '../auth/useSession';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-micro uppercase text-text-3">{title}</h2>
      <div className="mt-2 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
        {children}
      </div>
    </section>
  );
}

/**
 * Settings — Bible blueprint 9. The theme studio (live preview, accent picker, gradient
 * builder) lands with J2; this is the shell it slots into.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const logout = useLogout();

  return (
    <div className="col-mobile screen-x py-6">
      <h1 className="text-title-1 text-text-1">{t('settings.title')}</h1>

      <Section title={t('settings.account')}>
        <p className="text-body text-text-1">{user?.email}</p>
        <p className="text-body-s mt-1 text-text-3">{user?.role}</p>
        <Pressable
          variant="ghost"
          className="mt-4"
          busy={logout.isPending}
          icon={<LogOut size={20} strokeWidth={2} aria-hidden />}
          onClick={() => logout.mutate()}
        >
          {t('auth.logout')}
        </Pressable>
      </Section>

      <Section title={t('settings.appearance')}>
        <ThemeStudio />
      </Section>

      <Section title={t('settings.cues.title')}>
        <CueSettings />
      </Section>

      {/* Admin lives HERE, not in the bottom bar. A coach already fills all five nav slots, so
          pushing an admin tab made six and the bar silently clamped the sixth away — an admin
          could not reach /admin from the navigation at all. It belongs in Settings on its own
          merits anyway: it is role-specific and infrequent, which is the definition of secondary
          navigation. The link is a convenience; the route and every endpoint behind it enforce the
          role on the server regardless. */}
      {user?.role === 'admin' ? (
        <Section title={t('nav.admin')}>
          <Link
            to="/admin"
            className="inline-flex min-h-[var(--target-min)] items-center gap-2 text-body text-accent transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:text-accent-hover"
          >
            <ShieldCheck className="size-icon-s" aria-hidden />
            {t('settings.openAdmin')}
          </Link>
        </Section>
      ) : null}

      <Section title={t('common.language')}>
        <LanguageToggle />
      </Section>
    </div>
  );
}
