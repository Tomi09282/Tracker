/*
 * G-inputs evidence harness — NOT product code. Copied by ../gi-shot.mjs into `frontend/gi.local/`
 * (git-ignored: `*.local`), built with the tree's own vite.config.ts into a scratch folder, captured,
 * then deleted. It renders the REAL components with the app's real CSS, each at the coordinates of
 * the frame it is compared with (402 wide), with the frame's own words.
 *
 * Inline styles only for placement: this folder is not scanned by Tailwind.
 */
import { StrictMode, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Check } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import '../src/index.css';
import '../src/i18n';
import { Field } from '../src/ui/primitives/Field';
import { TextArea } from '../src/ui/primitives/TextArea';
import GInputsKit, { specimens } from '../src/features/playground/kit/G-inputs';

const view = location.hash.replace('#', '') || 'wk1';

const at = (x: number, y: number, w = 354): CSSProperties => ({ position: 'absolute', left: x, top: y, width: w });
function Abs({ x, y, w, children }: { x: number; y: number; w?: number; children: ReactNode }) {
  return <div style={at(x, y, w)}>{children}</div>;
}

/** workout-1: `Set list` rows 1-4, row 1 at 24,357 (the kit page's frame specimen). */
const Wk1 = () => <Abs x={24} y={357}>{specimens[0].node}</Abs>;

/** nutrition-2: `Field/gramm` 24,699 160 x 62 — "180" + unit "g" + the valid tick. */
function Nu2() {
  const [g, setG] = useState('180');
  return (
    <Abs x={24} y={699} w={160}>
      <Field label="gramm" unit="g" inputMode="numeric" value={g} onChange={(e) => setG(e.target.value)} trailing={<Check aria-hidden size={20} strokeWidth={1.67} style={{ color: "var(--text-1)" }} />} />
    </Abs>
  );
}

/** plan-editor-1: `Field/Új terv neve` 24,124 354 x 28. */
function Pe1() {
  const [name, setName] = useState('Felső/alsó szplit – 12 hetes blokk');
  return (
    <Abs x={24} y={124}>
      <Field variant="title" label="Új terv neve" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
    </Abs>
  );
}

/** compose-post-1: `Field/Szöveg` 24,662 — label row + counter, 7 rows, underline 855. */
function Cpo1() {
  const [body, setBody] = useState('Ide jön a téli blokk leírása. Még nincs kész: hiányzik az ár és a létszám.\n\n- hat hét\n- heti négy edzés');
  return (
    <Abs x={24} y={662}>
      <TextArea label="Szöveg" minRows={7} value={body} onChange={(e) => setBody(e.target.value)} labelTrailing="19897 karakter maradt" />
    </Abs>
  );
}

const BIO =
  '## Kinek szól\n\nOlyan felnőtteknek, akik **komolyan** akarnak erősödni, de a hetük nem edzőterem köré épül.\n\n- heti 3-4 edzés, 60-75 perc\n- minden hétre írásos terv és videós visszajelzés\n- táplálkozási keret, nem diéta\n\n## Hogyan dolgozom\n\nAz első hónap felmérés és technika. Utána négyhetes blokkokban haladunk, a negyedik hét mindig könnyebb.\n\n> Aki minden héten rekordot akar dönteni, három hónap múlva sérült lesz.\n\nÍrj bátran, ha kérdésed van.';

/** compose-profile-1: the headline (singleLine) at 24,551 and the bio window at 24,940 (field at 929, -11). */
function Cpr1() {
  const [h, setH] = useState('Erőnléti edző · 12 év tapasztalat · Budapest és online');
  const [bio, setBio] = useState(BIO);
  return (
    <>
      <Abs x={24} y={551}>
        <TextArea singleLine label="Egysoros bemutatkozás" marker="Nem kötelező" markerTone="quiet" hint="Ez jelenik meg a neved alatt a piactéren." value={h} onChange={(e) => setH(e.target.value)} />
      </Abs>
      <Abs x={24} y={929}>
        <TextArea labelHidden label="Bemutatkozás" minRows={8} maxRows={8} value={bio} onChange={(e) => setBio(e.target.value)} />
      </Abs>
    </>
  );
}

const Kit = () => (
  <div style={{ padding: 24 }}>
    <GInputsKit />
  </div>
);

const VIEWS: Record<string, () => ReactNode> = { wk1: Wk1, nu2: Nu2, pe1: Pe1, cpo1: Cpo1, cpr1: Cpr1, kit: Kit };
const View = VIEWS[view] ?? Wk1;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <div style={{ position: "relative", width: 402, minHeight: view === "cpr1" ? 1416 : "100vh" }}>
        <View />
      </div>
    </MemoryRouter>
  </StrictMode>,
);
