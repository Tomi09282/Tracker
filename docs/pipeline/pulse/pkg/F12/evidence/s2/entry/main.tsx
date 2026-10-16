/*
 * F12 stage-2 evidence harness — NOT product code. Copied by ../s2-shot.mjs into
 * `frontend/f12-s2.local/` (git-ignored: `*.local`), built with the tree's own vite.config.ts into a
 * scratch folder, captured, then deleted. It renders the REAL stage-2 components with the app's real
 * CSS, each at the coordinates of the frame it is compared with (402 wide; insets 62 / 34 as tokens).
 *
 * Inline styles only for placement: this folder is not scanned by Tailwind.
 */
import { StrictMode, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import '../src/index.css';
import '../src/i18n';
import { ListRow } from '../src/ui/data/ListRow';
import { RowStack } from '../src/ui/data/RowStack';
import { Sheet } from '../src/ui/feedback/variants/E14E20';
import { DateTrigger } from '../src/ui/primitives/DateTrigger';
import { Field } from '../src/ui/primitives/Field';
import { FilePick } from '../src/ui/primitives/FilePick';
import { MaskedField } from '../src/ui/primitives/MaskedField';
import { NumberStepper } from '../src/ui/primitives/NumberStepper';
import { Pressable } from '../src/ui/primitives/Pressable';
import { SearchField } from '../src/ui/primitives/SearchField';
import { SelectSheet } from '../src/ui/primitives/SelectSheet';
import { TextArea } from '../src/ui/primitives/TextArea';
import InputsKit from '../src/features/playground/kit/inputs';

const view = location.hash.replace('#', '') || 'cd2';
const noop = () => {};

// The frames' insets, as the tokens a device would publish (headless Chrome reports none).
document.documentElement.style.setProperty('--safe-b', '34px');
document.documentElement.style.setProperty('--safe-t', '62px');

const at = (x: number, y: number, w = 354): CSSProperties => ({ position: 'absolute', left: x, top: y, width: w });

function Abs({ x, y, w, children }: { x: number; y: number; w?: number; children: ReactNode }) {
  return <div style={at(x, y, w)}>{children}</div>;
}

/** coach-dashboard-2: the code sheet, the REAL Sheet, open. */
function Cd2() {
  const { t } = useTranslation();
  return (
    <Sheet open onClose={noop} title={t('coaching.codeReady')}>
      <p className="text-body text-text-2">{t('coaching.codeOnce')}</p>
      <RowStack open close as="div">
        <div className="flex min-h-14 items-center justify-between">
          <span className="text-data-l text-text-1">K7MPX-R4TQ2-HB9WD-6NJEV</span>
          <Pressable variant="link" shape="icon" aria-label={t('common.copy')}>
            <Copy aria-hidden />
          </Pressable>
        </div>
      </RowStack>
    </Sheet>
  );
}

/** compose-hub-2: the profile sheet, the REAL Sheet, open. */
function Ch2() {
  const { t } = useTranslation();
  return (
    <Sheet open onClose={noop} title="Profil">
      <RowStack>
        <ListRow title={t('compose.editProfile')} chevron onClick={noop} />
        <ListRow title={t('compose.unpublishProfile')} tone="danger" onClick={noop} />
      </RowStack>
    </Sheet>
  );
}

/** onboarding-3: the two number lines. */
function Ob3() {
  const { t } = useTranslation();
  return (
    <>
      <Abs x={24} y={755}>
        <NumberStepper label={t('onboarding.sessionsPerWeek')} value={null} onChange={noop} min={1} max={7} error={t('onboarding.requiredField')} />
      </Abs>
      <Abs x={24} y={887}>
        <NumberStepper
          label={t('onboarding.sessionMinutes')}
          value={70}
          onChange={noop}
          min={10}
          max={240}
          step={5}
          valid
          hint="Nagyjából — ebből számoljuk a terv terjedelmét."
        />
      </Abs>
    </>
  );
}

/** compose-post-1: the title field and the 7-row body with its counter. */
function Cp1() {
  const { t } = useTranslation();
  return (
    <>
      <Abs x={24} y={550}>
        <Field label="Cím" defaultValue="Téli tömegelő – piszkozat" marker={t('compose.required')} hint={t('compose.charsLeft', { n: 115 })} />
      </Abs>
      <Abs x={24} y={662}>
        <TextArea
          label={t('compose.body')}
          counter={t('compose.charsLeft', { n: 19897 })}
          minRows={7}
          defaultValue={'Ide jön a téli blokk leírása. Még nincs kész: hiányzik az ár és a létszám.\n\n- hat hét\n- heti négy edzés'}
        />
      </Abs>
    </>
  );
}

/** coach-chat-2: the composer, grown to two rows, and the small send pill. */
function Cc2() {
  const { t } = useTranslation();
  const [v, setV] = useState('Szia Anna! Üdv a csapatban, hétfőn kezdünk.');
  return (
    <div style={{ position: 'absolute', left: 24, top: 660, width: 354, display: 'flex', alignItems: 'flex-end', gap: 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextArea label={t('chat.compose')} value={v} onChange={(e) => setV(e.target.value)} maxRows={5} />
      </div>
      <Pressable variant="primary" size="sm" aria-label="Küldés">
        <Send aria-hidden />
      </Pressable>
    </div>
  );
}

/** onboarding-1: the free-text note with its hint. */
function Ob1() {
  return (
    <Abs x={24} y={925}>
      <TextArea
        label="Bármi más, amit tudnunk kell"
        defaultValue="Térdsérülés után óvatosan a mély guggolásokkal."
        hint="A saját szavaiddal. Az edződ pontosan ezt fogja olvasni."
      />
    </Abs>
  );
}

/** nutrition-1: the header's date control and the food search. */
function Nu1() {
  const { t } = useTranslation();
  return (
    <>
      <Abs x={24} y={103} w={200}>
        <DateTrigger variant="inline" label={t('nutrition.date')} value="2026-10-09" onChange={noop} />
      </Abs>
      <Abs x={24} y={591}>
        <SearchField label={t('library.search')} placeholder="Étel keresése…" />
      </Abs>
    </>
  );
}

/** progress-1: what is measured (a sheet picker), the value, and the day. */
function Pr1() {
  const { t } = useTranslation();
  return (
    <>
      <Abs x={24} y={803}>
        <SelectSheet
          label={t('progress.metric')}
          value="weight"
          options={[
            { value: 'weight', label: t('progress.metricName.weight') },
            { value: 'waist', label: 'Derékbőség' },
          ]}
          onChange={noop}
        />
      </Abs>
      <Abs x={24} y={885} w={169}>
        <Field label="Érték (kg)" inputMode="decimal" />
      </Abs>
      <Abs x={209} y={885} w={169}>
        <DateTrigger label={t('progress.on')} value="2026-10-09" onChange={noop} />
      </Abs>
    </>
  );
}

/** progress-3: the day and the photo pick (the pill). */
function Pr3() {
  const { t } = useTranslation();
  return (
    <>
      <Abs x={24} y={453}>
        <DateTrigger label={t('progress.on')} value="2026-10-09" onChange={noop} />
      </Abs>
      <Abs x={24} y={535}>
        <FilePick size="lg" className="w-full" accept="image/jpeg,image/png,image/webp" onFiles={noop}>
          {t('progress.chooseFile')}
        </FilePick>
      </Abs>
    </>
  );
}

/** marketplace-1: the search line. */
function Mk1() {
  const { t } = useTranslation();
  return (
    <Abs x={24} y={528}>
      <SearchField label={t('library.search')} placeholder="Programok, események, edzők…" />
    </Abs>
  );
}

/** auth-2: the password line, masked, 14 characters, the rule hint. */
function Auth2() {
  const { t } = useTranslation();
  return (
    <Abs x={24} y={532}>
      <MaskedField label={t('auth.password')} defaultValue="Tracker-pulse1" hint={t('auth.passwordRules')} hintTone="plain" />
    </Abs>
  );
}

/** auth-1: the password line, empty, the placeholder and the struck eye. */
function Auth1() {
  const { t } = useTranslation();
  return (
    <Abs x={24} y={532}>
      <MaskedField label={t('auth.password')} placeholder={t('auth.passwordPlaceholder')} />
    </Abs>
  );
}

/** The kit page itself (the specimens of every stage-2 component), 24 from the left. */
function Kit() {
  return (
    <div style={{ position: 'absolute', left: 0, top: 40, width: 402 }}>
      <InputsKit />
    </div>
  );
}

const VIEWS: Record<string, () => ReactNode> = { cd2: Cd2, ch2: Ch2, ob3: Ob3, cp1: Cp1, cc2: Cc2, ob1: Ob1, nu1: Nu1, pr1: Pr1, pr3: Pr3, mk1: Mk1, auth1: Auth1, auth2: Auth2, kit: Kit };
const View = VIEWS[view] ?? Cd2;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <div style={{ position: 'relative', minHeight: '100vh' }}>
        <View />
      </div>
    </MemoryRouter>
  </StrictMode>,
);
