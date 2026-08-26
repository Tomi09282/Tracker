import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Dumbbell, Mail, Lock, Eye, EyeOff, Check, AlertCircle, ChevronLeft } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { Surface } from '../../ui/primitives/Surface';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';
import { ApiError } from '../../lib/api';
import { useLogin, useRegister } from './useSession';
import { useAppName } from '../../lib/useAppName';
import { AuroraBackdrop } from '../../ui/shell/AuroraBackdrop';

const schema = z.object({
  email: z.string().trim().min(1).pipe(z.email()),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

/** The same rule the form validates with, reused for the live tick. One definition, not two. */
const emailLooksValid = (value: string) => schema.shape.email.safeParse(value ?? '').success;

/**
 * Auth screen — [[55-Screens/login]] and [[55-Screens/register]].
 *
 * One vertically centred column, capped narrow, nothing else on the page: no nav, no header, no
 * marketing. It is the first screen most people ever see of the product, so it carries a second
 * job the form does not — saying what this is — and that is what the oversized brand mark is for.
 * A bare form floating in the middle of a dark page reads as a dialog, not as a product.
 *
 * The app name comes from the server config, never from a string in this bundle.
 *
 * The two modes are ONE component because they are one form, but they are not one drawing: the
 * mockups differ on the field glyphs, on where the submit button sits and on the wordmark's ink,
 * and each of those differences is spec'd on both sides rather than being an image accident. They
 * are branched on `mode` below, each with the reason.
 */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const appName = useAppName();
  const [formError, setFormError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const login = useLogin();
  const register = useRegister();
  const busy = login.isPending || register.isPending;

  const {
    register: field,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const emailValue = watch('email');
  const emailValid = emailLooksValid(emailValue);

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

  /* One primary action, visually dominant. Declared once and placed twice: `/login` draws it as
     the last row INSIDE the card, `/register`'s mockup lifts it out to its own block below. */
  const submit = (
    <Pressable type="submit" variant="primary" busy={busy} className="w-full">
      {mode === 'login' ? t('auth.login') : t('auth.register')}
    </Pressable>
  );

  return (
    // `relative` so the back control can be pinned to the column's own top-left without joining
    // the flow — the column has to stay vertically centred whether or not that control is there.
    <main className="screen-x relative flex min-h-dvh flex-col items-center justify-center py-8">
      <AuroraBackdrop />

      {mode === 'register' ? (
        /* The one control above the hero, and the only way back that is not the switch link at
           the bottom. `left-0` is the inner edge of the screen gutter (an absolute box resolves
           against the padding box), so it lines up with the card without repeating `screen-x`;
           `safe-top` keeps it clear of the notch, which a bare `top-0` would sit under. */
        <div className="safe-top absolute left-0 top-0">
          <Pressable
            variant="ghost"
            shape="icon"
            aria-label={t('auth.backToLogin')}
            onClick={() => void navigate('/login')}
          >
            <ChevronLeft className="size-icon-m" aria-hidden />
          </Pressable>
        </div>
      ) : null}

      <div className="flex w-full max-w-[400px] flex-col gap-section">
        {/* ── the mark ──────────────────────────────────────────────────────────────────────
            One large thing where there used to be three small ones stacked tightly. The ring is
            a separate element rather than a border so it can sit OUTSIDE the disc with a gap —
            a border would eat into the fill and read as a heavy edge instead of an echo. */}
        <div className="flex flex-col items-center gap-tight">
          <span
            aria-hidden
            className="relative inline-flex size-28 items-center justify-center rounded-chip bg-[var(--accent-200)] text-[var(--surface-0)]"
          >
            <span className="absolute -inset-2 rounded-chip border border-[var(--accent-border)]" />
            <Dumbbell size={56} strokeWidth={2} />
          </span>
          {/* `min-h` holds the line before the name arrives from the server, so the column below
              does not jump when it lands.
              The ink differs by mode, and the mockups are explicit about it: sampled off the
              images, /login's wordmark is the accent tint that echoes the disc while /register's
              is plain white. On the register column the accent is spent on ONE thing — the
              submit button — and a third accent-coloured element weakens its claim. */}
          <h1
            className={
              mode === 'login'
                ? 'text-display mt-4 min-h-10 text-center text-accent'
                : 'text-display mt-4 min-h-10 text-center text-text-1'
            }
          >
            {appName}
          </h1>
          <p className="text-body text-center text-text-2">
            {mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}
          </p>
        </div>

        {/* ── the form ──────────────────────────────────────────────────────────────────────
            The `<form>` is the outer element rather than the card, because on /register the
            submit button leaves the card and still has to submit it.
            `inert` while busy, not just a disabled button: the spec's busy state is "the whole
            form is inert for the duration", and without it the inputs and the reveal toggle stay
            live under the spinner — a value edited mid-flight is not the value being sent. */}
        <form
          onSubmit={onSubmit}
          noValidate
          inert={busy || undefined}
          aria-busy={busy || undefined}
          className="flex flex-col gap-group"
        >
          {/* `finish="glass"` because this is the one panel on the page and there is nothing to
              scroll behind it — the cost that makes `veil` the default everywhere else does not
              apply to a single static card. */}
          <Surface finish="glass" className="flex flex-col gap-4">
            <Field
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              type="email"
              autoComplete="email"
              inputMode="email"
              /* Login only. The login mockup draws an envelope and a lock on the leading edge and
                 its spec names both; the register mockup draws both inputs plain, with the value
                 starting at the normal padding and the only in-field glyphs trailing. */
              leading={mode === 'login' ? <Mail className="size-icon-m" /> : undefined}
              /* The tick is a FORMAT check and must never mean more than that. If it appeared only
                 for addresses that already have accounts it would be a user-enumeration oracle —
                 the same reason the failure copy never says which of the two fields was wrong.
                 The verdict is drawn inside a filled disc, which is the defined treatment for a
                 field verdict (catalog E7 draws its own in a round badge), not a loose tick. */
              trailing={
                emailValid ? (
                  <span
                    className="flex size-[var(--target-min)] items-center justify-center"
                    title={t('auth.emailValid')}
                  >
                    <span className="flex size-6 items-center justify-center rounded-full bg-success text-on-success">
                      <Check className="size-icon-s" strokeWidth={3} aria-hidden />
                    </span>
                    <span className="sr-only">{t('auth.emailValid')}</span>
                  </span>
                ) : undefined
              }
              /* Says what to change. `auth.errors.generic` is a sentence about a failed network
                 call and belongs to the banner below; under an input it tells the user nothing.
                 The two client-side outcomes are separated because they need different actions:
                 an empty field wants a value, a malformed one wants a correction. */
              error={
                errors.email &&
                (emailValue?.trim()
                  ? t('auth.errors.emailFormat')
                  : t('auth.errors.emailRequired'))
              }
              {...field('email')}
            />

            <Field
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              type={revealed ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              hint={mode === 'register' ? t('auth.passwordRules') : undefined}
              leading={mode === 'login' ? <Lock className="size-icon-m" /> : undefined}
              /* The accessible name CHANGES with state — one fixed label would announce the wrong
                 thing half the time. `aria-pressed` says which state it is in. */
              trailing={
                <Pressable
                  variant="ghost"
                  shape="icon"
                  aria-pressed={revealed}
                  aria-label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
                  onClick={() => setRevealed((v) => !v)}
                >
                  {/* The GLYPH reports the current state (masked = crossed-out eye), which is what
                      both mockups draw; the LABEL above names the action. They are deliberately
                      answering different questions, so the two do not track each other. */}
                  {revealed ? (
                    <Eye className="size-icon-m" aria-hidden />
                  ) : (
                    <EyeOff className="size-icon-m" aria-hidden />
                  )}
                </Pressable>
              }
              error={errors.password && t('auth.errors.passwordRequired')}
              {...field('password')}
            />

            {formError ? (
              <p
                role="alert"
                className="text-body-s flex items-center gap-tight rounded-field border border-[var(--danger-border)] bg-[var(--danger-subtle)] px-3 py-2 text-text-1"
              >
                <AlertCircle className="size-icon-s shrink-0 text-[var(--danger)]" aria-hidden />
                {formError}
              </p>
            ) : null}

            {mode === 'login' ? submit : null}
          </Surface>

          {/* On /register the card ends after the fields and the button is its own block, edge to
              edge with the card rather than inset by its padding. `gap-group` is the step the
              mockup measures at — `gap-section` would open twice that. */}
          {mode === 'register' ? submit : null}
        </form>

        {/* ── the way out ───────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-body-s text-center text-text-2">
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

          <LanguageToggle />
        </div>
      </div>

      {/*
        THREE THINGS THE MOCKUP DRAWS THAT ARE NOT HERE, AND WHY.

        `Elfelejtetted a jelszavad?` — there is no `/forgot-password` route and no endpoint behind
        it. `Adatvédelem · Felhasználási feltételek` — neither document exists and neither has a
        destination. A dead link on the login screen is worse than no link: it is the first
        promise the product makes, and it breaks on the first tap. They land when the flow does.

        The password reveal toggle in the mockup IS built, because it is real: client-side only,
        no route, no endpoint, nothing to wait for.

        `/register`'s strength meter and its two live requirement rows are still missing. Both are
        new SHARED components by the spec's own reasoning (the rules have to be one definition, or
        a future password-change screen grows a second copy that drifts), so they are not this
        file's to add.
      */}
    </main>
  );
}
