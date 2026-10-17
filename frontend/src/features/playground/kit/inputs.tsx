import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Check, Copy, EyeOff } from 'lucide-react';
import { ListRow } from '../../../ui/data/ListRow';
import { RowStack } from '../../../ui/data/RowStack';
import { Section } from '../../../ui/data/SectionHeader';
import { ConfirmSheet, ConfirmSheetBody } from '../../../ui/feedback/ConfirmSheet';
import { FeedbackField } from '../../../ui/feedback/variants/E7Field';
import { Sheet, SheetStatic } from '../../../ui/feedback/variants/E14E20';
import { BottomNav, useNavTabs } from '../../../ui/nav/BottomNav';
import { DateTrigger } from '../../../ui/primitives/DateTrigger';
import { Field } from '../../../ui/primitives/Field';
import { FilePick } from '../../../ui/primitives/FilePick';
import { MaskedField } from '../../../ui/primitives/MaskedField';
import { NumberStepper } from '../../../ui/primitives/NumberStepper';
import { Pressable } from '../../../ui/primitives/Pressable';
import { SearchField } from '../../../ui/primitives/SearchField';
import { SelectSheet, type SelectOption } from '../../../ui/primitives/SelectSheet';
import { TextArea } from '../../../ui/primitives/TextArea';
import { TextLink } from '../../../ui/primitives/TextLink';
import { Screen, ShellProvider } from '../../../ui/shell/Screen';
import { ScreenHeader } from '../../../ui/shell/ScreenHeader';

/*
 * The inputs lane's page of the kit specimen (`/playground`, kit section) — package F12.
 *
 * The kit host collects every file in this folder with `import.meta.glob`, so being listed costs
 * no edit to a shared file. Same two shapes as the media page: `specimens` — one entry per cell (a
 * mono label, then the nodes; a label that is a cell of the Figma component board puts the cell
 * where the board draws it) — and a default component that lays those cells out itself.
 *
 * Stage 1: the board's `inputField` cell and the field as the frames compose it.
 * Stage 2: the board's `searchField` cell; the board's pushed screen with the bottom sheet over its
 * scrim (the confirmation "Kijelentkezés"); then one cell per stage-2 component in the states the
 * frames draw — rest, keyboard focus (`data-specimen="focus-…"`: a capture focuses it with the
 * keyboard), pressed, disabled, busy, error — and a live cell that opens the real sheets (focus
 * moves in, Tab is held, Escape closes, focus returns).
 *
 * A field has no pressed and no busy state of its own (pressing a field focuses it; an in-flight
 * check is `FeedbackField`'s busy mark). The controls on a field's line (clear, reveal, − / +) and
 * the triggers (`FilePick`, the inline `DateTrigger`, the sheet's close) carry pressed and focus.
 *
 * Strings: `hu.json` where it has them; the board's and the frames' own words where it does not
 * (specimen only — a screen takes every visible string from the bundles).
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. A board cell's label is the Figma board's, verbatim. */
  label: string;
  /** The board cell's gap between the label and the nodes and between the nodes (pt). Default 12. */
  gap?: number;
  /** The cell's width, when it is not one 354 content column (a whole 402 phone). */
  w?: number;
  node: ReactNode;
}

/* ── stage 1 ───────────────────────────────────────────────────────────────────────────────────── */

/** The board's `inputField` cell: idle (with hint) · focus · error · disabled · empty. */
function BoardFields() {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('settings.displayName')} defaultValue="Takács Dániel" hint={t('settings.displayNameHint')} />
      <Field label={t('settings.displayName')} defaultValue="Takács Dán" data-specimen="focus" />
      <Field label={t('auth.email')} defaultValue="takacs.daniel@pelda" error={t('auth.errors.emailFormat')} />
      <Field label={t('auth.email')} defaultValue="takacs.daniel@pelda.hu" disabled />
      <Field label={t('auth.password')} placeholder={t('auth.passwordPlaceholder')} type="password" />
    </>
  );
}

/** The field as the frames compose it: marker, plain hint, trailing control, leading glyph. */
function FrameFields() {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('compose.displayName')} defaultValue="Kovács Péter" marker={t('compose.required')} />
      <Field
        label={t('compose.headline')}
        defaultValue="Erőnléti edző · 12 év tapasztalat"
        marker={t('compose.optional')}
        markerTone="quiet"
        hint={t('compose.headlineHint')}
      />
      <Field
        label={t('auth.email')}
        type="email"
        defaultValue="takacs.daniel@pelda.hu"
        trailing={
          // auth-2 "Mark/format ok": a 16 pt tick in `success`, its ink on the right edge.
          <span aria-hidden className="text-success [&_svg]:size-4 [&_svg]:stroke-[2.25]">
            <Check />
          </span>
        }
      />
      <Field
        label={t('auth.password')}
        type="password"
        defaultValue="Pulse-specimen-1"
        hint={t('auth.passwordRules')}
        hintTone="plain"
        trailing={
          // auth-2 "Button/reveal" as a drawing; the working control is `MaskedField` (stage 2, below).
          <span aria-hidden className="flex size-11 items-center justify-end text-text-2 [&_svg]:size-5 [&_svg]:stroke-[1.75]">
            <EyeOff />
          </span>
        }
      />
      <Field label={t('progress.on')} type="text" defaultValue="2026. okt. 9." leading={<Calendar />} />
    </>
  );
}

/* ── stage 2 ───────────────────────────────────────────────────────────────────────────────────── */

const noop = () => {};

/** A specimen value that the specimen itself may change (the live controls are real controls). */
function useLocal<T>(initial: T) {
  return useState<T>(initial);
}

/** The board's `searchField` cell: empty · focus + clear. */
function BoardSearch() {
  const { t } = useTranslation();
  return (
    <>
      <SearchField label={t('library.search')} placeholder={t('library.searchPlaceholder')} />
      <SearchField label={t('library.search')} placeholder={t('library.searchPlaceholder')} defaultValue="fekveny" data-specimen="focus-search" />
    </>
  );
}

/** The search line in the frames: the marketplace placeholder, a labelled search, disabled, with a hint. */
function FrameSearch() {
  const { t } = useTranslation();
  const [q, setQ] = useLocal('guggolás');
  return (
    <>
      <SearchField label="Keresés" placeholder="Programok, események, edzők…" />
      <SearchField label="Gyakorlat keresése" labelVisible value={q} onChange={(e) => setQ(e.target.value)} />
      <SearchField label={t('adminUsers.search')} placeholder={t('adminUsers.search')} disabled />
      <SearchField label="Keresés" placeholder="Étel keresése…" defaultValue="zab" hint="Legalább két betű." />
    </>
  );
}

function TextAreas() {
  const [draft, setDraft] = useLocal('Szia Anna! Üdv a csapatban, hétfőn kezdünk.');
  return (
    <>
      <TextArea label="Írj üzenetet" value={draft} onChange={(e) => setDraft(e.target.value)} maxRows={5} data-specimen="focus-textarea" />
      <TextArea
        label="Bármi más, amit tudnunk kell"
        defaultValue="Térdsérülés után óvatosan a mély guggolásokkal."
        hint="A saját szavaiddal. Az edződ pontosan ezt fogja olvasni."
      />
      <TextArea
        label="Szöveg"
        counter="19897 karakter maradt"
        minRows={7}
        defaultValue={'Ide jön a téli blokk leírása. Még nincs kész: hiányzik az ár és a kezdés napja, a többi rendben van.\n\nHetente három edzés, mindegyik 60 perc.'}
      />
      <TextArea label="Szöveg" defaultValue="" error="Ez a mező kell a befejezéshez" />
      <TextArea label="Szöveg" defaultValue="Lezárt bejegyzés szövege." disabled />
    </>
  );
}

function Steppers() {
  const { t } = useTranslation();
  const [perWeek, setPerWeek] = useLocal<number | null>(null);
  const [minutes, setMinutes] = useLocal<number | null>(70);
  return (
    <>
      <NumberStepper
        label={t('onboarding.sessionsPerWeek')}
        value={perWeek}
        onChange={setPerWeek}
        min={1}
        max={7}
        error={perWeek === null ? 'Ez a mező kell a befejezéshez' : undefined}
      />
      <NumberStepper
        label={t('onboarding.sessionMinutes')}
        value={minutes}
        onChange={setMinutes}
        min={10}
        max={240}
        step={5}
        valid={minutes !== null && minutes >= 10 && minutes <= 240}
        hint="Nagyjából — ebből számoljuk a terv terjedelmét."
      />
      <NumberStepper label={t('onboarding.sessionsPerWeek')} value={1} onChange={noop} min={1} max={7} hint="A legkisebb érték: a − nem nyomható." />
      <NumberStepper label={t('onboarding.sessionMinutes')} value={45} onChange={noop} disabled />
    </>
  );
}

function Masked() {
  const { t } = useTranslation();
  return (
    <>
      <MaskedField label={t('auth.password')} defaultValue="Pulse-spec-14" hint={t('auth.passwordRules')} hintTone="plain" />
      <MaskedField label={t('auth.password')} defaultValue="Pulse-spec-14" revealed onRevealedChange={noop} />
      <MaskedField label={t('auth.password')} placeholder={t('auth.passwordPlaceholder')} />
      <MaskedField label={t('auth.password')} defaultValue="Pulse-spec-14" disabled />
    </>
  );
}

function Dates() {
  const { t } = useTranslation();
  const [day, setDay] = useLocal('2026-10-09');
  return (
    <>
      <DateTrigger variant="inline" label={t('nutrition.date')} value={day} onChange={setDay} />
      <DateTrigger label={t('progress.on')} value={day} onChange={setDay} />
      <DateTrigger label={t('progress.on')} value="" onChange={noop} placeholder={t('progress.date')} error="Ez a mező kell a befejezéshez" />
      <DateTrigger label={t('progress.on')} value="2026-10-09" onChange={noop} disabled />
    </>
  );
}

const METRICS: SelectOption[] = [
  { value: 'weight', label: 'Testsúly' },
  { value: 'waist', label: 'Derékbőség' },
  { value: 'bodyfat', label: 'Testzsír' },
];

function Selects() {
  const { t } = useTranslation();
  const [metric, setMetric] = useLocal<string | null>('weight');
  return (
    <>
      <SelectSheet label={t('progress.metric')} value={metric} options={METRICS} onChange={setMetric} />
      <SelectSheet label={t('progress.metric')} value={null} options={METRICS} onChange={noop} placeholder="Válassz" />
      <SelectSheet label={t('progress.metric')} value={null} options={METRICS} onChange={noop} error="Ez a mező kell a befejezéshez" />
      <SelectSheet label={t('progress.metric')} value="weight" options={METRICS} onChange={noop} disabled />
    </>
  );
}

function FilePicks() {
  const { t } = useTranslation();
  return (
    <>
      <FilePick size="lg" className="w-full" accept="image/jpeg,image/png,image/webp" onFiles={noop}>
        {t('progress.chooseFile')}
      </FilePick>
      <FilePick size="lg" className="w-full" onFiles={noop} data-force="pressed">
        {t('progress.chooseFile')}
      </FilePick>
      <FilePick size="lg" className="w-full" onFiles={noop} disabled>
        {t('progress.chooseFile')}
      </FilePick>
      <FilePick size="lg" className="w-full" onFiles={noop} busy>
        {t('progress.chooseFile')}
      </FilePick>
      <FilePick size="lg" className="w-full" onFiles={noop} data-force="focus">
        {t('progress.chooseFile')}
      </FilePick>
      <div className="flex gap-6">
        <FilePick variant="link" text="body" accept="image/*" onFiles={noop}>
          {t('compose.chooseCover')}
        </FilePick>
        <FilePick variant="link" text="body" onFiles={noop} data-force="focus">
          {t('compose.chooseCover')}
        </FilePick>
        <FilePick variant="link" text="body" onFiles={noop} disabled>
          {t('compose.chooseCover')}
        </FilePick>
      </div>
    </>
  );
}

function Feedback() {
  const { t } = useTranslation();
  return (
    <>
      <FeedbackField label="Felhasználónév" defaultValue="takacs.dani" busy />
      <FeedbackField label="Felhasználónév" defaultValue="takacs.daniel" valid />
      <FeedbackField label="Felhasználónév" defaultValue="td" error="Ez a név már foglalt." />
      <FeedbackField label={t('library.search')} labelHidden placeholder={t('library.searchPlaceholder')} />
    </>
  );
}

/* ── the sheet ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * The design's device for a 402 × H specimen (the shell lane's numbers): insets 62 / 34 — the bar
 * 36 above the bottom, a pushed header at 64 — and the sheet's own bottom pad, 16 + 34 = the drawn 50.
 */
const DEVICE =
  '[--tabbar-offset:36px] [--fade-h:130px] [--head-top-root:72px] [--head-top-push:64px] [--status-bar-h:0px] [--safe-b:34px] [--safe-t:62px]';

function Phone({ h, tabs = true, children }: { h: 600 | 874; tabs?: boolean; children: ReactNode }) {
  return (
    <ShellProvider tabs={tabs}>
      <div className={`relative w-[402px] overflow-hidden bg-surface-0 ${h === 600 ? 'h-[600px]' : 'h-[874px]'} ${DEVICE}`}>{children}</div>
    </ShellProvider>
  );
}

/** The board's pushed screen: "Beállítások" under "Profil", the "Fiók" rows, the bar, and the confirmation sheet. */
function BoardSheetScreen() {
  return (
    <Phone h={600}>
      <Screen top="push">
        <ScreenHeader kind="push" title="Beállítások" back={{ to: '/settings', label: 'Profil' }} />
        <Section title="Fiók">
          <RowStack>
            <ListRow title="Megjelenített név" value="Takács Dániel" chevron onClick={noop} />
            <ListRow title="Nyelv" value="Magyar" chevron onClick={noop} />
            <ListRow title="Kijelentkezés" tone="danger" onClick={noop} />
          </RowStack>
        </Section>
      </Screen>
      <BottomNav inline tabs={useNavTabs('user')} at="/settings" />
      <SheetStatic title="Kijelentkezés" onClose={noop}>
        <ConfirmSheetBody
          message="Biztosan kijelentkezel erről az eszközről?"
          confirmLabel="Kijelentkezés"
          onConfirm={noop}
          onCancel={noop}
        />
      </SheetStatic>
    </Phone>
  );
}

/** coach-dashboard-2: "A kód elkészült" — the one-time code under its warning. */
function CodeSheet() {
  const { t } = useTranslation();
  return (
    <SheetStatic title={t('coaching.codeReady')} onClose={noop}>
      <p className="text-body text-text-2">{t('coaching.codeOnce')}</p>
      <RowStack open close as="div">
        <div className="flex min-h-14 items-center justify-between">
          <span className="text-data-l text-text-1">K7MPX-R4TQ2-HB9WD-6NJEV</span>
          <Pressable variant="link" shape="icon" aria-label={t('common.copy')}>
            <Copy aria-hidden />
          </Pressable>
        </div>
      </RowStack>
    </SheetStatic>
  );
}

/** compose-hub-2: "Profil" — two actions as rows, the destructive one in danger words. */
function ProfileSheet() {
  const { t } = useTranslation();
  return (
    <SheetStatic title="Profil" onClose={noop}>
      <RowStack>
        <ListRow title={t('compose.editProfile')} chevron onClick={noop} />
        <ListRow title={t('compose.unpublishProfile')} tone="danger" onClick={noop} />
      </RowStack>
    </SheetStatic>
  );
}

/** The sheet's own states, in the header: busy (dots) · error (danger dot + Újra). */
function SheetStates() {
  return (
    <div className="flex flex-col gap-6">
      <div className="relative h-[220px] w-[402px] overflow-hidden bg-surface-0 [--safe-b:34px]">
        <SheetStatic title="Mentés" status="busy" onClose={noop}>
          <p className="text-body text-text-2">Felszerelés mentése folyamatban.</p>
        </SheetStatic>
      </div>
      <div className="relative h-[220px] w-[402px] overflow-hidden bg-surface-0 [--safe-b:34px]">
        <SheetStatic title="Mentés" status="error" onRetry={noop} onClose={noop}>
          <p className="text-body text-text-2">Nem sikerült menteni.</p>
        </SheetStatic>
      </div>
    </div>
  );
}

/** The real thing: opens the live `Sheet`, `ConfirmSheet` and `SelectSheet` (focus in, Tab held, Escape, focus back). */
function LiveSheets() {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<string | null>('weight');
  const timer = useRef<number | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <TextLink text="body" onClick={() => setSheet(true)}>
        Sheet megnyitása
      </TextLink>
      <TextLink text="body" tone="danger" onClick={() => setConfirm(true)}>
        {t('auth.logout')}
      </TextLink>
      <SelectSheet className="w-full" label={t('progress.metric')} value={metric} options={METRICS} onChange={setMetric} />
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('coaching.codeReady')}>
        <p className="text-body text-text-2">{t('coaching.codeOnce')}</p>
        <SearchField label={t('library.search')} placeholder={t('library.searchPlaceholder')} />
        <TextLink text="body" onClick={() => setSheet(false)}>
          {t('common.close')}
        </TextLink>
      </Sheet>
      <ConfirmSheet
        open={confirm}
        onClose={() => {
          if (timer.current) window.clearTimeout(timer.current);
          setBusy(false);
          setConfirm(false);
        }}
        title={t('auth.logout')}
        message="Biztosan kijelentkezel erről az eszközről?"
        confirmLabel={t('auth.logout')}
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          timer.current = window.setTimeout(() => {
            setBusy(false);
            setConfirm(false);
          }, 1200);
        }}
      />
    </div>
  );
}

const Column = ({ gap, children }: { gap: 'gap-3' | 'gap-5' | 'gap-6'; children: ReactNode }) => (
  <div className={`flex w-full max-w-[354px] flex-col ${gap}`}>{children}</div>
);

export const specimens: KitSpecimen[] = [
  {
    kit: 'inputField',
    label: 'inputField · idle / focus / error / disabled / empty',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <BoardFields />
      </Column>
    ),
  },
  {
    kit: 'searchField',
    label: 'searchField · empty / focus + clear',
    node: (
      <Column gap="gap-3">
        <BoardSearch />
      </Column>
    ),
  },
  {
    kit: 'bottomSheet',
    label: 'pushed screen · bottomSheet over the scrim (after chrome) — the one surface',
    w: 402,
    node: <BoardSheetScreen />,
  },
  {
    kit: 'inputField',
    label: 'inputField · in the frames: marker required / optional · rule hint · trailing tick / reveal · leading glyph',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <FrameFields />
      </Column>
    ),
  },
  {
    kit: 'searchField',
    label: 'searchField · in the frames: marketplace placeholder / labelled (plan-editor-3) / disabled / with a hint',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <FrameSearch />
      </Column>
    ),
  },
  {
    kit: 'textArea',
    label: 'textArea · composer (grows 44 → 66) / note + hint / 7 rows + counter (compose-post) / error / disabled',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <TextAreas />
      </Column>
    ),
  },
  {
    kit: 'numberStepper',
    label: 'numberStepper · empty + error / 70 + tick + hint (onboarding-3) / at the minimum / disabled',
    gap: 20,
    node: (
      <Column gap="gap-6">
        <Steppers />
      </Column>
    ),
  },
  {
    kit: 'maskedField',
    label: 'maskedField · masked + rule hint (auth-2) / revealed / empty / disabled',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <Masked />
      </Column>
    ),
  },
  {
    kit: 'dateTrigger',
    label: 'dateTrigger · inline (nutrition-1) / field (progress-1) / empty + error / disabled',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <Dates />
      </Column>
    ),
  },
  {
    kit: 'selectSheet',
    label: 'selectSheet · chosen (progress-1) / placeholder / error / disabled — a tap opens the sheet',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <Selects />
      </Column>
    ),
  },
  {
    kit: 'filePick',
    label: 'filePick · pill (progress-3): rest / pressed / disabled / busy / keyboard focus · link: rest / focus / disabled',
    gap: 24,
    node: (
      <Column gap="gap-6">
        <FilePicks />
      </Column>
    ),
  },
  {
    kit: 'feedbackField',
    label: 'feedbackField · busy (dots) / valid (tick) / error / plain',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <Feedback />
      </Column>
    ),
  },
  {
    kit: 'bottomSheet',
    label: 'bottomSheet · coach-dashboard-2 (the code, shown once)',
    w: 402,
    node: (
      <div className="relative h-[300px] w-[402px] overflow-hidden bg-surface-0 [--safe-b:34px]">
        <CodeSheet />
      </div>
    ),
  },
  {
    kit: 'bottomSheet',
    label: 'bottomSheet · compose-hub-2 (actions as rows, the destructive one in danger words)',
    w: 402,
    node: (
      <div className="relative h-[300px] w-[402px] overflow-hidden bg-surface-0 [--safe-b:34px]">
        <ProfileSheet />
      </div>
    ),
  },
  {
    kit: 'bottomSheet',
    label: 'bottomSheet · status in the header: busy (three dots) / error (danger dot + Újra)',
    w: 402,
    node: <SheetStates />,
  },
  {
    kit: 'confirmSheet',
    label: 'bottomSheet · live: Sheet / ConfirmSheet (busy 1.2 s) / SelectSheet — focus in, Tab held, Escape, focus back',
    node: <LiveSheets />,
  },
];

export default function InputsKit() {
  return (
    <div className="flex w-[402px] max-w-full flex-col gap-8">
      {specimens.map((specimen) => (
        <section key={specimen.label} className={`flex flex-col ${specimen.gap === 20 ? 'gap-5' : specimen.gap === 24 ? 'gap-6' : 'gap-3'}`}>
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}
