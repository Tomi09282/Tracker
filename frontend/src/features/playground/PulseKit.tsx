import { useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

/*
 * PulseKit — the kit specimen host, the first section of `/playground` (PLAN.md 3.4, "KIT host").
 *
 * Every lane of the kit writes ONE file, `features/playground/kit/<lane>.tsx`, and this host
 * collects them with `import.meta.glob`, so a lane is listed without editing a shared file. A page
 * exports `specimens` (one entry per cell: the `data-kit` name, the cell's label, the nodes) and may
 * export a default component that lays its cells out itself; the host prefers `specimens`.
 *
 * Two layouts, one control:
 *
 *   list   every kit page as its own section, cells one phone content width (354) wide — the
 *          reading view, and the one that works on a phone.
 *   board  the Figma component board (`Pulse — Components`, node 80:2, built by
 *          `figma-build/app-components.body.js`): 1300 wide, 40 padding, 72 between blocks, the
 *          palette and the type ramp drawn here from the live tokens, the components in three
 *          columns of 354 in the board's own order, then the tab bar and the three demo screens.
 *          A specimen takes the board cell whose label it carries, verbatim; a cell no lane has
 *          filled yet keeps the height Figma gives it, so every cell after it still sits where the
 *          board puts it. That is what lets a capture at 1300 x H, scale 1, be laid over
 *          `_components-1..4.png` tile by tile. Specimens no board cell names are listed by
 *          name after the board, below its 5094 pt, and drawn in the list layout.
 *
 * The host draws nothing a lane owns: no pill, no row, no field. Its own marks are the block rule,
 * the labels, the swatches and the type samples — the parts of the board that are tokens, which
 * are the integrator's. It replaces `ui/TokenProof.tsx`, the old token page.
 *
 * Internal QA page: English, never translated (check-i18n exempts `features/playground/`).
 */

/** One cell of a kit page. */
export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. A cell of the Figma board carries the board's label verbatim. */
  label: string;
  node: ReactNode;
  /**
   * Optional, read by the list layout: the gap between the label and the nodes (default: the
   * board cell's, else 12) and the cell's width (default: the board cell's, else 354). On the
   * board, the board's own numbers win — they are the specification.
   */
  gap?: number;
  w?: number;
}

export type KitLayout = 'list' | 'board';

interface KitModule {
  specimens?: unknown;
  default?: unknown;
}

interface KitPage {
  /** The lane's file name without the extension: `actions`, `media`, … */
  name: string;
  specimens: KitSpecimen[] | null;
  Whole: ComponentType | null;
  problem: string | null;
}

// Eager: a kit page is a few nodes, and the whole host is its own lazy chunk (PlaygroundPage).
// Zero files is a legal state — the glob is then `{}` and both layouts say so.
const MODULES = import.meta.glob<KitModule>('./kit/*.tsx', { eager: true });

const isSpecimen = (x: unknown): x is KitSpecimen =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as { kit?: unknown }).kit === 'string' &&
  typeof (x as { label?: unknown }).label === 'string' &&
  'node' in x &&
  ['gap', 'w'].every((k) => {
    const v = (x as Record<string, unknown>)[k];
    return v === undefined || (typeof v === 'number' && v >= 0);
  });

const PAGES: KitPage[] = Object.entries(MODULES)
  .map(([file, mod]): KitPage => {
    const name = file.replace(/^\.\/kit\//, '').replace(/\.tsx$/, '');
    const list = Array.isArray(mod.specimens) ? mod.specimens : null;
    const specimens = list ? list.filter(isSpecimen) : null;
    const Whole = typeof mod.default === 'function' ? (mod.default as ComponentType) : null;
    let problem: string | null = null;
    if (list && specimens && specimens.length !== list.length) {
      problem = `${list.length - specimens.length} entries of "specimens" are not { kit, label, node } and are not shown`;
    } else if (!specimens && !Whole) {
      problem = 'exports neither "specimens" nor a default component';
    }
    return { name, specimens, Whole, problem };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/* ═══ the board ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * One cell of the Figma board: its label (verbatim from `app-components.body.js`), the space
 * between the label and the nodes, and the height of the nodes — measured in
 * `.pulse/geometry/_components.json` — which an empty cell keeps for the cells below it.
 */
interface BoardCell {
  label: string;
  gap: number;
  nodesH: number;
  /** The chip row is drawn bleeding off the edge, and the board clips it there. */
  clip?: true;
}

const COLUMNS: BoardCell[][] = [
  // column 1 · actions and selection
  [
    { label: 'btnPrimary · default / pressed / disabled / busy — ONE per screen', gap: 24, nodesH: 296 },
    { label: 'textLink · inline + chevron / standalone / destructive / off', gap: 12, nodesH: 44 },
    { label: 'iconBtn · badgeCount 2 / 99+ · bare glyphs · btnPrimary sm', gap: 12, nodesH: 44 },
    { label: 'chipRow · filter: idle / selected (lime mark) — bleeds off the edge', gap: 12, nodesH: 44, clip: true },
    { label: 'chipRow · multi-select, wrap', gap: 12, nodesH: 88 },
    { label: 'segSwitch · hug — ink mark = neutral selection', gap: 12, nodesH: 44 },
    { label: 'segSwitch · equal cells on a hairline', gap: 12, nodesH: 44 },
    { label: 'uiSwitch · on / off / disabled — as a listRow trail', gap: 12, nodesH: 178 },
    { label: 'setCheck · done (lime tick) / to do (ring)', gap: 12, nodesH: 194 },
    { label: 'pic · glow still (LIGHTEN, no frame) / 48 pt thumbs / cutouts (fit) / the mannequin', gap: 12, nodesH: 452 },
  ],
  // column 2 · input, headers, rows
  [
    { label: 'inputField · idle / focus / error / disabled / empty', gap: 20, nodesH: 442 },
    { label: 'searchField · empty / focus + clear', gap: 12, nodesH: 100 },
    { label: 'screenHead · greet / root / push', gap: 24, nodesH: 226 },
    { label: 'sect · rule + eyebrow + trailing meta / link on one baseline', gap: 12, nodesH: 208 },
    { label: 'listRow · plain / sub + tag / thumb / monogram + value / two lines / destructive', gap: 12, nodesH: 379 },
    { label: 'ledgerRow · label | note | numeral on one baseline', gap: 12, nodesH: 232 },
  ],
  // column 3 · data and states
  [
    { label: 'statBlock · fraction (giant) / numeral (num) + caption', gap: 24, nodesH: 244 },
    { label: 'segBar · week: on / half / off + today dot', gap: 12, nodesH: 40 },
    { label: 'segBar · count 4 / 7 — stepper(2, 5)', gap: 20, nodesH: 44 },
    { label: 'macroCol · on target / over (warn) / no target — progressBar', gap: 20, nodesH: 104 },
    { label: 'sparkline · with a gap / chart with a live end dot', gap: 20, nodesH: 148 },
    { label: 'monogramMark · 28 / 64 + dot / hero 176 + light + dot', gap: 12, nodesH: 141 },
    { label: 'emptyState · with the primary action / with a link', gap: 40, nodesH: 308 },
    { label: 'skel · loading rows — never a spinner', gap: 12, nodesH: 148 },
    { label: 'noticeLine · error + retry / offline (warn) / saved (ok)', gap: 0, nodesH: 132 },
    { label: 'chatMsg · theirs: left, text-1 / mine: right, text-2 — no bubbles', gap: 12, nodesH: 178 },
  ],
];

/** The tab strips: 402 wide, a 92 pt strip under the label. */
const TAB_BAR: BoardCell[] = [
  { label: '5 · member · inset 10 · cell 76.4', gap: 12, nodesH: 92 },
  { label: '6 · coach · inset 12 · cell 63.0', gap: 12, nodesH: 92 },
  { label: '7 · admin · inset 8 · cell 55.1 · icon 28', gap: 12, nodesH: 92 },
];

/** The three demo screens: 402 x 600 under the label. */
const SCREENS: BoardCell[] = [
  { label: 'root screen · showToast (before chrome) · 7 tabs', gap: 12, nodesH: 600 },
  { label: 'pushed screen · bottomSheet over the scrim (after chrome) — the one surface', gap: 12, nodesH: 600 },
  { label: 'flow screen · stepper · no tabs · dockAction (after chrome)', gap: 12, nodesH: 600 },
];

const BOARD_CELLS = [...COLUMNS.flat(), ...TAB_BAR, ...SCREENS];

/** Labels are matched with case and runs of space folded, nothing else: a cell names its board cell. */
const fold = (label: string) => label.replace(/\s+/g, ' ').trim().toLowerCase();

const BOARD_BY_LABEL = new Map(BOARD_CELLS.map((cell) => [fold(cell.label), cell]));

/** A component cell is one phone content width; a tab strip or a demo screen is the whole phone. */
const boardWidth = (cell: BoardCell) => (TAB_BAR.includes(cell) || SCREENS.includes(cell) ? 402 : 354);

interface Placed {
  page: string;
  specimen: KitSpecimen;
}

/** Each specimen to its board cell (the first one to name a cell wins it); the rest are off the board. */
function placeSpecimens(pages: KitPage[]) {
  const onBoard = new Map<string, Placed>();
  const offBoard: (Placed & { why: string })[] = [];
  for (const page of pages) {
    for (const specimen of page.specimens ?? []) {
      const key = fold(specimen.label);
      if (!BOARD_BY_LABEL.has(key)) offBoard.push({ page: page.name, specimen, why: 'no board cell carries this label' });
      else if (onBoard.has(key)) offBoard.push({ page: page.name, specimen, why: `the board cell is taken by ${onBoard.get(key)?.page}` });
      else onBoard.set(key, { page: page.name, specimen });
    }
  }
  return { onBoard, offBoard };
}

/* ═══ cells ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * The tracked mono labels break their lines where Figma breaks them. CSS counts the letter
 * spacing after the LAST glyph of a line, Figma does not: a 46-character label is 354.2 px in the
 * browser and fits Figma's 354 pt cell, so without this it wraps one word early and pushes every
 * cell under it 16 px down. The label may run one tracking (0.1em) past its box — never a glyph.
 */
const FIGMA_LINE_END = { marginRight: '-0.1em' } as const;

/** A labelled specimen: the mono label, then the nodes. An empty cell holds its Figma height. */
function Cell({
  label,
  gap,
  width,
  clip,
  reserve,
  children,
}: {
  label: string;
  gap: number;
  width: number;
  clip?: boolean;
  reserve?: number;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex shrink-0 flex-col${clip ? ' overflow-x-clip' : ''}`}
      style={{ width, maxWidth: '100%', gap }}
      data-kit-cell={label}
    >
      <p className="text-micro text-text-3" style={FIGMA_LINE_END}>
        {label}
      </p>
      {children ?? (
        <div
          className="flex items-center justify-center border border-dashed border-hair-strong"
          style={{ height: reserve }}
        >
          <span className="text-micro text-text-3">Not in the kit yet</span>
        </div>
      )}
    </div>
  );
}

function BoardSlot({ cell, placed }: { cell: BoardCell; placed: Map<string, Placed> }) {
  const hit = placed.get(fold(cell.label));
  return (
    <Cell label={cell.label} gap={cell.gap} width={boardWidth(cell)} clip={cell.clip} reserve={cell.nodesH}>
      {hit ? hit.specimen.node : undefined}
    </Cell>
  );
}

/** A board block: the section rule, the eyebrow, the items — 24 apart. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <div aria-hidden className="h-px bg-hair-strong" />
      <h2 className="text-eyebrow text-text-2">{title}</h2>
      {children}
    </section>
  );
}

/* ═══ palette and type ramp: the integrator's tokens, read from the live cascade ═══════════════ */

interface Swatch {
  role: string;
  token: string;
  use: string;
  /** Quote the contrast against the canvas, as the board does for the text and signal colours. */
  contrast?: true;
}

const SWATCHES: Swatch[] = [
  { role: 'bg', token: '--surface-0', use: 'canvas' },
  { role: 's1', token: '--surface-1', use: 'reserved' },
  { role: 's2', token: '--surface-2', use: 'sheet, skeleton, disabled pill' },
  { role: 's3', token: '--surface-3', use: 'switch off' },
  { role: 't1', token: '--text-1', use: 'text-1', contrast: true },
  { role: 't2', token: '--text-2', use: 'text-2', contrast: true },
  { role: 't3', token: '--text-3', use: 'text-3', contrast: true },
  { role: 'accent', token: '--accent', use: 'lit, primary', contrast: true },
  { role: 'accentDown', token: '--accent-pressed', use: 'pressed pill' },
  { role: 'edge', token: '--edge', use: 'field + ring edge', contrast: true },
  { role: 'danger', token: '--danger', use: 'destructive, error', contrast: true },
  { role: 'warn', token: '--warning', use: 'over target, offline', contrast: true },
  { role: 'ok', token: '--success', use: 'saved', contrast: true },
  { role: 'hair', token: '--surface-border', use: 'white 8 % row rule' },
  { role: 'hairS', token: '--surface-border-strong', use: 'white 14 % section rule' },
  { role: 'track', token: '--track', use: 'white 10 % off level' },
];

type Rgb = [number, number, number];

/**
 * Any CSS colour the browser computed — hex, rgba, `oklab()` from a `color-mix` — as the sRGB
 * pixel it paints over `under`. A canvas does the parsing and the compositing, so the quoted hex
 * of a translucent rule is the colour the eye gets on the canvas, as the board quotes it.
 */
function paintedOver(under: string, color: string): Rgb | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  for (const fill of [under, color]) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 1, 1);
  }
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

const toHex = (rgb: Rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** WCAG 2 contrast ratio of two sRGB colours, rounded to one decimal as the board quotes it. */
function contrast(a: Rgb, b: Rgb) {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10).toFixed(1);
}

function Palette() {
  const ref = useRef<HTMLDivElement>(null);
  // The hex and the contrast are READ from what the page paints, never typed: the board can only
  // quote a value the tokens really have (the rule TokenProof kept).
  const [notes, setNotes] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const canvasColor = getComputedStyle(root.closest('[data-kit-board]') ?? document.body).backgroundColor;
    const canvasRgb = paintedOver(canvasColor, canvasColor);
    const next: Record<string, string> = {};
    for (const swatch of SWATCHES) {
      const el = root.querySelector<HTMLElement>(`[data-swatch="${swatch.role}"]`);
      if (!el || !canvasRgb) continue;
      const rgb = paintedOver(canvasColor, getComputedStyle(el).backgroundColor);
      if (!rgb) continue;
      next[swatch.role] = `${toHex(rgb)} · ${swatch.use}${swatch.contrast ? ` ${contrast(rgb, canvasRgb)}:1` : ''}`;
    }
    setNotes(next);
  }, []);

  return (
    <div ref={ref} className="flex flex-wrap gap-x-6 gap-y-8">
      {SWATCHES.map((swatch) => (
        <div key={swatch.role} className="flex w-[131px] flex-col gap-1.5">
          <div
            data-swatch={swatch.role}
            className="h-10 border border-hair-strong"
            style={{ background: `var(${swatch.token})` }}
          />
          <p className="text-cap-m text-text-1">{swatch.role}</p>
          <p className="text-micro text-text-3" style={FIGMA_LINE_END}>
            {notes[swatch.role] ?? swatch.use}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The ramp as the board draws it: the spec in mono on the left, the step itself at 364. */
const TYPE_RAMP: { cls: string; spec: string; sample: string }[] = [
  { cls: 'text-giant text-text-1', spec: 'giant · Big Shoulders Black · 124/108 · -1 %', sample: '2/4 ŐŰ' },
  { cls: 'text-num text-text-1', spec: 'num · Big Shoulders Black · 48/48 · 0 %', sample: '83,1 190 ŐŰ' },
  { cls: 'text-display-xl text-text-1', spec: 'displayXL · Big Shoulders Bold · 48/48 · 1 %', sample: 'Felsőtest – húzás · Fűző' },
  { cls: 'text-display text-text-1', spec: 'display · Big Shoulders Bold · 32/34 · 1 %', sample: 'Beállítások · Erősítő gyűrű' },
  { cls: 'text-eyebrow text-text-1', spec: 'eyebrow · Big Shoulders Bold · 16/20 · 6 %', sample: 'Heti edzés · Elülső vállizom · Fűzés' },
  { cls: 'text-title text-text-1', spec: 'title · Geist SemiBold · 22/28 · -1 %', sample: 'Takács Dániel · Kezdőlap · Fűző' },
  { cls: 'text-body text-text-1', spec: 'body · Geist Regular · 16/22 · 0 %', sample: 'Felső/alsó szplit – 12 hetes blokk · Elülső vállizom · gyűrű' },
  { cls: 'text-body-m text-text-1', spec: 'bodyM · Geist Medium · 16/22 · 0 %', sample: 'Felső/alsó szplit – 12 hetes blokk · Elülső vállizom · gyűrű' },
  { cls: 'text-body-b text-text-1', spec: 'bodyB · Geist SemiBold · 16/22 · 0 %', sample: 'Felső/alsó szplit – 12 hetes blokk · Elülső vállizom · gyűrű' },
  { cls: 'text-cap text-text-2', spec: 'cap · Geist Regular · 13/18 · 0 %', sample: 'Felső/alsó szplit – 12 hetes blokk · Elülső vállizom · gyűrű' },
  { cls: 'text-cap-m text-text-1', spec: 'capM · Geist Medium · 13/18 · 0 %', sample: 'Felső/alsó szplit – 12 hetes blokk · Elülső vállizom · gyűrű' },
  { cls: 'text-tab text-text-2', spec: 'tab · Geist Medium · 11/14 · 1 %', sample: 'Kezdőlap · Edző · Fűző' },
  { cls: 'text-tab-on text-text-1', spec: 'tabOn · Geist SemiBold · 11/14 · 1 %', sample: 'Kezdőlap · Edző · Fűző' },
  { cls: 'text-data-l text-text-1', spec: 'dataL · Geist Mono Medium · 16/20 · -1 %', sample: '1840 · 83,1 kg · őű' },
  { cls: 'text-data text-text-1', spec: 'data · Geist Mono Medium · 13/18 · 0 %', sample: '18:00 · 5 gyakorlat · őű' },
  { cls: 'text-micro text-text-1', spec: 'micro · Geist Mono Medium · 11/16 · 10 %', sample: 'Tag · EN · 14:02 · őű' },
];

function TypeRamp() {
  return (
    <div className="flex flex-col gap-5">
      {TYPE_RAMP.map((step) => (
        <div key={step.spec} className="flex items-center gap-6">
          <p className="shrink-0 text-micro text-text-3" style={{ ...FIGMA_LINE_END, width: 'calc(300px + 0.1em)' }}>
            {step.spec}
          </p>
          <p className={`whitespace-nowrap ${step.cls}`}>{step.sample}</p>
        </div>
      ))}
    </div>
  );
}

/* ═══ the control and the two layouts ═════════════════════════════════════════════════════════ */

function LayoutSwitch({ layout, onChange }: { layout: KitLayout; onChange: (next: KitLayout) => void }) {
  return (
    <div role="group" aria-label="Kit layout" className="flex gap-4">
      {(['list', 'board'] as const).map((value) => {
        const on = layout === value;
        return (
          <button // token-lint-disable: the host's own two-state switch, a text link in its type; Pressable still draws the legacy looks until F6 merges, and the host must build with no lane merged
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(value)}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center text-cap-m ${
              on ? 'text-text-1 underline decoration-accent decoration-2 underline-offset-4' : 'text-text-2'
            }`}
          >
            {value === 'list' ? 'List' : 'Board'}
          </button>
        );
      })}
    </div>
  );
}

const SPECIMEN_COUNT = PAGES.reduce((n, page) => n + (page.specimens?.length ?? 0), 0);

function KitList({ onLayoutChange }: { onLayoutChange: (next: KitLayout) => void }) {
  const { onBoard } = placeSpecimens(PAGES);
  return (
    <section aria-labelledby="pulse-kit-title" className="flex flex-col gap-8 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-x-6">
        <h2 id="pulse-kit-title" className="text-display text-text-1">
          Pulse kit
        </h2>
        <LayoutSwitch layout="list" onChange={onLayoutChange} />
      </div>
      <p className="text-cap text-text-2">
        {PAGES.length} kit {PAGES.length === 1 ? 'page' : 'pages'} · {SPECIMEN_COUNT} specimens · {onBoard.size} of{' '}
        {BOARD_CELLS.length} board cells filled. The board lays them out as the Figma component board does (1300 wide).
      </p>

      {PAGES.length === 0 ? (
        <p className="text-body text-text-2">
          No kit page yet. Each lane adds <code className="text-data">features/playground/kit/&lt;lane&gt;.tsx</code>.
        </p>
      ) : (
        PAGES.map((page) => (
          <section key={page.name} className="flex flex-col gap-6" data-kit-page={page.name}>
            <div aria-hidden className="h-px bg-hair-strong" />
            <h3 className="text-eyebrow text-text-2">{page.name}</h3>
            {page.problem ? <p className="text-cap-m text-danger">{page.problem}</p> : null}
            {page.specimens ? (
              <div className="flex flex-wrap gap-x-19 gap-y-12">
                {page.specimens.map((specimen, i) => {
                  const cell = BOARD_BY_LABEL.get(fold(specimen.label));
                  return (
                    <Cell
                      key={`${specimen.label}-${i}`}
                      label={specimen.label}
                      gap={specimen.gap ?? cell?.gap ?? 12}
                      width={specimen.w ?? (cell ? boardWidth(cell) : 354)}
                      clip={cell?.clip}
                    >
                      {specimen.node}
                    </Cell>
                  );
                })}
              </div>
            ) : page.Whole ? (
              <page.Whole />
            ) : null}
          </section>
        ))
      )}
    </section>
  );
}

function KitBoard({ onLayoutChange }: { onLayoutChange: (next: KitLayout) => void }) {
  const { onBoard, offBoard } = placeSpecimens(PAGES);
  return (
    // Above the tab bar (`--z-nav`), so a capture of the board shows the board alone. At the
    // document's origin: the page renders nothing else in this layout.
    <div className="relative z-[var(--z-sheet)] flex w-[1300px] flex-col gap-18 bg-surface-0 p-10" data-kit-board>
      <div className="absolute right-10 top-10">
        <LayoutSwitch layout="board" onChange={onLayoutChange} />
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-display-xl text-text-1">Pulse · Open Field</h1>
        <p className="w-[820px] text-body text-text-2">
          The component kit (app-kit.js): every component in every state. Nothing is enclosed — type, space and
          hairlines carry the structure; the one filled lime shape on a screen is its primary action.
        </p>
      </header>

      <Block title="Palette — role · hex · use · contrast on bg">
        <Palette />
      </Block>

      <Block title="Type ramp — 7 sizes · Big Shoulders Display · Geist · Geist Mono">
        <TypeRamp />
      </Block>

      <Block title="Components — each in every state">
        <div className="flex items-start justify-between">
          {COLUMNS.map((column, i) => (
            <div key={i} className="flex w-[354px] flex-col gap-12">
              {column.map((cell) => (
                <BoardSlot key={cell.label} cell={cell} placed={onBoard} />
              ))}
            </div>
          ))}
        </div>
      </Block>

      <Block title="Tab bar — equal cells on 402 − 2 × inset · 5 tabs 76.4 pt · 6 tabs 63 pt · 7 tabs 55.1 pt (icon 28) · label 11 pt · every cell ≥ 44 pt">
        <div className="flex items-start justify-between">
          {TAB_BAR.map((cell) => (
            <BoardSlot key={cell.label} cell={cell} placed={onBoard} />
          ))}
        </div>
      </Block>

      <Block title="Screens — root + toast (7 tabs) · pushed + bottom sheet on a scrim · flow without tabs + docked action">
        <div className="flex items-start justify-between">
          {SCREENS.map((cell) => (
            <BoardSlot key={cell.label} cell={cell} placed={onBoard} />
          ))}
        </div>
      </Block>

      {offBoard.length > 0 ? (
        // Named, not drawn: below the board's 5094 pt a lazy image would never load inside the
        // capture's viewport and the page would never settle. The list layout draws them.
        <Block title="Off the board — in the list layout only">
          <ul className="flex flex-col gap-2">
            {offBoard.map(({ page, specimen, why }, i) => (
              <li key={`${page}-${specimen.label}-${i}`} className="text-micro text-text-3">
                {page} · {specimen.label} — {why}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}

/**
 * The host. The layout lives in the PAGE (PlaygroundPage), because the board replaces the whole
 * page: it has to start at the document's origin to be tiled against the Figma board.
 */
export default function PulseKit({
  layout,
  onLayoutChange,
}: {
  layout: KitLayout;
  onLayoutChange: (next: KitLayout) => void;
}) {
  return layout === 'board' ? <KitBoard onLayoutChange={onLayoutChange} /> : <KitList onLayoutChange={onLayoutChange} />;
}
