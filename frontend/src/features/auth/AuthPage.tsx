import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Dumbbell } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';
import { ApiError } from '../../lib/api';
import { useLogin, useRegister } from './useSession';
import { useAppName } from '../../lib/useAppName';

const schema = z.object({
  email: z.string().trim().min(1).pipe(z.email()),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

/**
 * Auth screen — Bible blueprint 1: a centred card capped at 400 px on surface-0, a subtle brand
 * mark, the app name in Display type, exactly one primary CTA, inline field errors, and no
 * marketing clutter.
 *
 * The app name comes from the server config, never from a string in this bundle.
 */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appName = useAppName();
  const [formError, setFormError] = useState<string | null>(null);

  const login = useLogin();
  const register = useRegister();
  const busy = login.isPending || register.isPending;

  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  /**
   * Map the server's stable `code` onto a translated message. Never render the server's prose
   * directly: it is English, unlocalised, and written for a log reader rather than a user.
   */
  const describe = (err: unknown) => {
    if (!(err instanceof ApiError)) return t('auth.errors.generic');
    if (err.status === 401) return t('auth.errors.invalidCredentials');
    if (err.code === 'conflict') return t('auth.errors.emailTaken');
    if (err.status === 429) return t('auth.errors.rateLimited');
    return t('auth.errors.generic');
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (mode === 'login') {
        await login.mutateAsync(values);
      } else {
        await register.mutateAsync(values);
        await login.mutateAsync(values); // straight in after signing up — no second form
      }
      void navigate('/', { replace: true });
    } catch (err) {
      setFormError(describe(err));
    }
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center screen-x py-8">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center gap-3">
          <span
            aria-hidden
            className="inline-flex size-12 items-center justify-center rounded-card bg-accent-subtle text-accent"
          >
            <Dumbbell size={24} strokeWidth={2} />
          </span>
          <h1 className="text-display text-center text-text-1">{appName}</h1>
          <p className="text-body text-center text-text-2">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="mt-6 flex flex-col gap-4 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4"
        >
          <Field
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            type="email"
            autoComplete="email"
            inputMode="email"
            error={errors.email && t('auth.errors.generic')}
            {...field('email')}
          />
          <Field
            label={t('auth.password')}
            placeholder={t('auth.passwordPlaceholder')}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            hint={mode === 'register' ? t('auth.passwordRules') : undefined}
            error={errors.password && t('auth.errors.generic')}
            {...field('password')}
          />

          {formError ? (
            <p
              role="alert"
              className="rounded-field border border-[var(--danger-border)] bg-[var(--danger-subtle)] px-3 py-2 text-body-s text-text-1"
            >
              {formError}
            </p>
          ) : null}

          {/* One primary action, visually dominant. */}
          <Pressable type="submit" variant="primary" busy={busy} className="w-full">
            {mode === 'login' ? t('auth.login') : t('auth.register')}
          </Pressable>
        </form>

        <p className="text-body-s mt-4 text-center text-text-2">
          {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
          <Link
            to={mode === 'login' ? '/register' : '/login'}
            className="inline-flex min-h-[var(--target-min)] items-center text-accent underline-offset-4 hover:underline"
          >
            {/* Its OWN keys, not the submit button's. This control navigates; it does not
                create an account. "Létrehozom a fiókom" is right on the button that does the
                thing and a promise this link cannot keep. */}
            {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </Link>
        </p>

        <div className="mt-6 flex justify-center">
          <LanguageToggle />
        </div>
      </div>
    </main>
  );
}
