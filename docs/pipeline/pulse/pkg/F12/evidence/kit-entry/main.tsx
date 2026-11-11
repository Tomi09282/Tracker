/*
 * F12 evidence harness — NOT product code. Copied by ../f12-shot.mjs into `frontend/f12-kit.local/`
 * (git-ignored: `*.local`), built with the tree's own vite.config.ts into a scratch folder, captured,
 * then deleted. It renders the REAL `Field` and the REAL kit specimen with the app's real CSS.
 *
 *   #board    the kit specimen page (features/playground/kit/inputs.tsx), 24 from the left
 *   #auth-1   the two fields of frame auth-1 at the frame's own coordinates (form at 24, 450, 354 wide, 20 apart)
 *   #auth-2   the same for frame auth-2 (values, the format tick, 14 masked characters, the rule hint)
 *
 * Inline styles only: this folder is git-ignored, so Tailwind does not scan it.
 */
import { StrictMode, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../src/index.css';
import '../src/i18n';
import { Field } from '../src/ui/primitives/Field';
import InputsKit from '../src/features/playground/kit/inputs';

const view = location.hash.replace('#', '') || 'board';

const form: CSSProperties = { position: 'absolute', left: 24, top: 450, width: 354, display: 'flex', flexDirection: 'column', gap: 20 };

/** auth-2 "Mark/format ok": a 14 x 16 frame, the 16 pt tick from its left edge (ink ends on x 378). */
const Tick = () => (
  <span aria-hidden style={{ display: 'flex', width: 14, height: 16, overflow: 'visible', color: 'var(--success)' }}>
    <Check width={16} height={16} strokeWidth={2.25} style={{ flexShrink: 0 }} />
  </span>
);

/** auth-1/2 "Button/reveal": 44 x 44, the 20 pt glyph at +25 / +12 (ink one point past the line's end). */
const Reveal = () => (
  <span aria-hidden style={{ position: 'relative', display: 'block', width: 44, height: 44, color: 'var(--text-2)' }}>
    <EyeOff width={20} height={20} strokeWidth={1.75} style={{ position: 'absolute', left: 25, top: 12 }} />
  </span>
);

function Auth({ filled }: { filled: boolean }) {
  const { t } = useTranslation();
  return (
    <div style={form}>
      <Field
        label={t('auth.email')}
        type="email"
        placeholder={t('auth.emailPlaceholder')}
        defaultValue={filled ? 'takacs.daniel@pelda.hu' : undefined}
        trailing={filled ? <Tick /> : undefined}
      />
      <Field
        label={t('auth.password')}
        type="password"
        placeholder={t('auth.passwordPlaceholder')}
        defaultValue={filled ? 'Tracker-pulse1' : undefined}
        hint={filled ? t('auth.passwordRules') : undefined}
        hintTone="plain"
        trailing={<Reveal />}
      />
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div style={{ position: 'relative', minHeight: '100vh' }}>{children}</div>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page>
      {view === 'board' ? (
        <div style={{ position: 'absolute', left: 24, top: 40, width: 354 }}>
          <InputsKit />
        </div>
      ) : (
        <Auth filled={view === 'auth-2'} />
      )}
    </Page>
  </StrictMode>,
);
