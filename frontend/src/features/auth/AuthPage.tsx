import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Check } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Pic } from '../../ui/media/Pic';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Dock } from '../../ui/shell/Dock';
import { LanguageToggle } from '../../ui/nav/LanguageToggle';
import { ApiError } from '../../lib/api';
import { useLogin, useRegister } from './useSession';
import { useAppName } from '../../lib/useAppName';

const schema = z.object({
  email: z.string().trim().min(1).pipe(z.email()),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

/** The same rule the form validates with, reused for the live tick. One definition, not two. */
const emailLooksValid = (value: string) => schema.shape.email.safeParse(value ?? '').success;

/*
 * The geometry of the frames `auth-1` / `auth-2` (figma-build/app/auth-1.body.js), in pt.
 *
 * The footer is docked to the bottom and grows UPWARD when the alert line appears; the form hangs
 * under the wordmark. The hero stage between them is the one flexible element: it gives up exactly
 * what keeps CLEAR between the last line of the form and the first line of the footer, in 4 pt steps,
 * at most SQUEEZE_MAX. At rest (both frames) it gives up nothing.
 */
const STAGE_H = 236; // the stage under the 44 pt top row: y 108 - 344
const HERO_H = 320; // the still at rest: 250 x 320, from y 32
const HERO_RATIO = 692 / 884; // the still's width : height
const HERO_LIFT = 76; // the still starts 76 above the stage (y 32), 72 once squeezed (y 36)
const CLEAR = 20;
const SQUEEZE_STEP = 4;
const SQUEEZE_MAX = 80;

/**
 * What the hero stage gives up so the form never runs under the docked footer — the frame's own
 * `squeeze` rule, measured on the live layout. The form's end is taken at rest (its measured end
 * plus what is already given up), so the answer does not feed back into itself.
 */
function useHeroSqueeze() {
  const formRef = useRef<HTMLFormElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const current = useRef(0);
  const [squeeze, setSqueeze] = useState(0);

  const measure = useCallback(() => {
    const form = formRef.current;
    const foot = footRef.current;
    if (!form || !foot) return;
    // The footer is fixed (viewport coordinates); the form scrolls (document coordinates).
    const formEnd = form.getBoundingClientRect().bottom + window.scrollY + current.current;
    const footTop = foot.getBoundingClientRect().top;
    const need = Math.ceil((formEnd + CLEAR - footTop) / SQUEEZE_STEP) * SQUEEZE_STEP;
    const next = Math.min(SQUEEZE_MAX, Math.max(0, need));
    if (next !== current.current) {
      current.current = next;
      setSqueeze(next);
    }
  }, []);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (formRef.current) observer.observe(formRef.current);
    if (footRef.current) observer.observe(footRef.current);
    // Something above the screen can push the form down without resizing it — the app-level
    // offline strip takes room at the top — so the page's own height is watched too.
    observer.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return { formRef, footRef, squeeze };
}

/**
 * Auth screen — frames `auth-1` (Belépés) and `auth-2` (Regisztráció), inventory
 * `docs/brain/58-Pulse/Screens/auth.md`.
 *
 * ONE layout for both modes, so /login and /register feel like one place: the chalk hands glow out
 * of the black (the screen's one image), the app name is the wordmark (live text from the server,
 * never baked into artwork), two underline fields, and a footer docked to the bottom — the alert
 * line, the ONE lime pill, the switch line, the language switch. Nothing is boxed.
 *
 * In content the modes differ in five things only: the subtitle, the rule hint (register), the
 * button label, the switch line and the back control (register).
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

  const formId = useId();
  const { formRef, footRef, squeeze } = useHeroSqueeze();
  const heroH = HERO_H - squeeze;
  const heroW = Math.round(heroH * HERO_RATIO);
  const heroTop = squeeze ? HERO_LIFT - 4 : HERO_LIFT;

  return (
    <Screen as="main" top="push" gap="none">
      {/* The top row: 44 high on both modes, so the hero and the wordmark stand at the same height.
          On /register it holds the back control (icon only, its name is the action). */}
      <ScreenHeader
        kind="push"
        back={
          mode === 'register'
            ? { onClick: () => void navigate('/login'), label: t('auth.backToLogin'), bare: true }
            : undefined
        }
      />

      {/* The hero stage: the still floats in the black, centred on the screen axis, from y 32 —
          over the top row, and past the stage's own bottom by 8. It is the flexible element. */}
      <div aria-hidden className="relative" style={{ height: STAGE_H - squeeze }}>
        <span className="absolute left-1/2 block -translate-x-1/2" style={{ top: -heroTop }}>
          <Pic slot="hero-chalk" width={heroW} priority bleed className="block" />
        </span>
      </div>

      {/* The wordmark. `min-h` holds its line while the name is on its way from the server, so the
          form below never moves when it lands — and stays blank if it never arrives. */}
      <div className="flex flex-col gap-1">
        <h1 className="text-display-xl min-h-12 text-text-1">{appName}</h1>
        <p className="text-body text-text-2">{mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}</p>
      </div>

      {/* The form. `inert` while busy, not just a busy button: the whole form is inert for the
          duration — a value edited mid-flight is not the value being sent. The footer's pill
          submits it through `form`, so the switch link and the language switch stay live. */}
      <form
        ref={formRef}
        id={formId}
        onSubmit={onSubmit}
        noValidate
        inert={busy || undefined}
        aria-busy={busy || undefined}
        className="mt-8 flex flex-col gap-5"
      >
        <Field
          label={t('auth.email')}
          placeholder={t('auth.emailPlaceholder')}
          type="email"
          autoComplete="email"
          inputMode="email"
          /* A FORMAT check and never more: if it appeared only for addresses that have accounts it
             would be a user-enumeration oracle. The frame's 16 pt tick in `success`, its ink on
             the right edge; the words are for screen readers. */
          trailing={
            emailValid ? (
              <span title={t('auth.emailValid')} className="flex w-3.5 text-success [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[2.25]">
                <Check aria-hidden />
                <span className="sr-only">{t('auth.emailValid')}</span>
              </span>
            ) : undefined
          }
          /* Says what to change: an empty field wants a value, a malformed one a correction. */
          error={errors.email && (emailValue?.trim() ? t('auth.errors.emailFormat') : t('auth.errors.emailRequired'))}
          {...field('email')}
        />

        <Field
          label={t('auth.password')}
          placeholder={t('auth.passwordPlaceholder')}
          type={revealed ? 'text' : 'password'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          /* Register only, and in `text-2`: it is the only place the rule is ever stated. */
          hint={mode === 'register' ? t('auth.passwordRules') : undefined}
          hintTone="plain"
          trailing={
            <Pressable
              variant="link"
              shape="icon"
              aria-pressed={revealed}
              aria-label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
              onClick={() => setRevealed((v) => !v)}
            >
              {/* The GLYPH reports the current state (masked = crossed-out eye); the LABEL names
                  the action. They answer different questions, so they do not track each other. */}
              {revealed ? <Eye /> : <EyeOff />}
            </Pressable>
          }
          error={errors.password && t('auth.errors.passwordRequired')}
          {...field('password')}
        />
      </form>

      {/* The docked footer: [alert line, 20 above the pill] → the ONE pill → the switch line →
          the language switch. It hangs from the bottom and grows upward. */}
      <Dock as="footer">
        <div ref={footRef} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-5">
              {formError ? (
                <NoticeLine tone="danger" role="alert" compact>
                  {formError}
                </NoticeLine>
              ) : null}
              <Pressable type="submit" form={formId} variant="primary" size="lg" busy={busy} className="w-full">
                {mode === 'login' ? t('auth.login') : t('auth.register')}
              </Pressable>
            </div>
            <p className="flex items-center gap-1.5">
              <span className="text-body text-text-2">{mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}</span>
              {/* Its OWN keys, not the button's: this link navigates, it does not create an account. */}
              <TextLink text="body" to={mode === 'login' ? '/register' : '/login'}>
                {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
              </TextLink>
            </p>
          </div>
          <LanguageToggle />
        </div>
      </Dock>
    </Screen>
  );
}
