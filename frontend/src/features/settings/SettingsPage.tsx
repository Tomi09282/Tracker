import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';
import { ThemeStudio } from './ThemeStudio';
import { CueSettings } from './CueSettings';
import { useSession, useLogout } from '../auth/useSession';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
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
      <h1 className="text-title-2 text-text-1">{t('settings.title')}</h1>

      <Section title={t('settings.account')}>
        <p className="text-body text-text-1">{user?.email}</p>
        <p className="text-body-s mt-1 text-text-3">{user?.role}</p>
        <Pressable
          variant="ghost"
          className="mt-3"
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

      <Section title={t('common.language')}>
        <LanguageToggle />
      </Section>
    </div>
  );
}
