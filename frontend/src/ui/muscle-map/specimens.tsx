import { useState, type ReactNode } from 'react';
import { MuscleMap, type MuscleRole } from './MuscleMap';
import { REGIONS } from './regions';
import type { MuscleSide } from './figure';

/*
 * The mannequin lane's page of the kit specimen (`/playground`, kit section) — F15.
 *
 * It lives beside the component because the lane owns `ui/muscle-map/**` and nothing under
 * `features/playground/`: the kit host lists it through the one-line `features/playground/kit/
 * mannequin.tsx`, and takes the two shapes every kit file offers — `specimens`, one entry per
 * cell, and a default component that lays the cells out itself.
 *
 * The first four cells are the kit's: the figure alone (`sideControl="none"`) at the sizes the
 * Figma file draws it — 200 tall on the component board, 195 x 411 on the selector, 189 x 400 on
 * exercise detail, 105 x 221 in the player — and the controlled side. The `proof ·` cells after
 * them are stage 1's evidence: each puts the figure in exactly the box a frame gives it, lit the
 * way that frame lights it, inside a hairline drawn 4 px OUTSIDE the box (`--danger`), so a capture
 * can be cropped to the box and laid beside the same crop of the frame. The last one lights every
 * region of both renders one by one — the contact sheet the plan asks for.
 *
 * States: rest, selected (a region pressed) and keyboard focus on a region are the map's own.
 * It has no disabled and no busy state — neither in the code nor in the Figma kit — so none is
 * drawn. Every visible word of the map comes from its `muscleMap.*` / `muscle.*` keys; the labels
 * here are the QA page's own, English like the rest of it.
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. */
  label: string;
  node: ReactNode;
  /** List layout: the cell's width (default 354). */
  w?: number;
}

const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-end gap-8">{children}</div>;

/** The capture frame: a hairline 4 px outside the figure's box, nothing inside it. */
const Proof = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="flex flex-col items-start gap-3">
    <p className="text-micro text-text-3">{name}</p>
    <div className="outline outline-1 outline-offset-4 outline-[var(--danger)]">{children}</div>
  </div>
);

/** exercise-detail-1: "Közepes fogású fekvenyomás rúddal" — Mell primary; Oldalsó vállizom and Tricepsz (back) secondary. */
const BENCH: Record<string, MuscleRole> = { chest: 'primary', 'side-delts': 'secondary', triceps: 'secondary' };
/** The same, with the whole shoulder cap secondary — the lit render the frame was made from lights both delts. */
const BENCH_CAP: Record<string, MuscleRole> = { ...BENCH, 'front-delts': 'secondary' };
/** workout-1 / -2: "Előredőlt evezés rúddal" on the back view — only the lats lit. */
const ROW: Record<string, MuscleRole> = { lats: 'primary' };
/** exercise-detail-2: "Húzódzkodás" — Széles hátizom primary, Bicepsz (front) secondary. */
const PULLUPS: Record<string, MuscleRole> = { lats: 'primary', biceps: 'secondary' };
/** Several at once, both roles, both sides. */
const MANY: Record<string, MuscleRole> = {
  chest: 'primary',
  abs: 'primary',
  quads: 'primary',
  'front-delts': 'secondary',
  biceps: 'secondary',
  obliques: 'secondary',
  traps: 'primary',
  'rear-delts': 'primary',
  glutes: 'primary',
  hamstrings: 'secondary',
  calves: 'secondary',
};

/** The library selector: a tap selects a region, a second tap clears it — what LibraryPage does. */
function Selector({ initial, side = 'front', className = 'h-[411px]' }: { initial?: string; side?: MuscleSide; className?: string }) {
  const [muscle, setMuscle] = useState<string | undefined>(initial);
  return (
    <MuscleMap
      sideControl="none"
      side={side}
      selected={muscle}
      onSelect={(slug) => setMuscle((cur) => (cur === slug ? undefined : slug))}
      className={className}
    />
  );
}

/**
 * The controlled side: ONE state drives two maps. The upper one draws the map's own (legacy)
 * control and only ASKS through `onSideChange`; the lower one has no control and simply follows.
 */
function Controlled() {
  const [side, setSide] = useState<MuscleSide>('back');
  return (
    <Row>
      <MuscleMap sideControl="segmented" side={side} onSideChange={setSide} highlights={ROW} legend={false} className="w-[220px]" />
      <MuscleMap sideControl="none" side={side} highlights={ROW} className="h-[221px]" />
    </Row>
  );
}

const PROOF_W = 1220;

export const specimens: KitSpecimen[] = [
  {
    kit: 'pic',
    label: 'pic · the mannequin — MuscleMap sideControl="none": the figure alone in the 597 : 1261 box / front, back / 200 tall',
    node: (
      <Row>
        <MuscleMap sideControl="none" side="front" className="h-[200px]" />
        <MuscleMap sideControl="none" side="back" className="h-[200px]" />
      </Row>
    ),
  },
  {
    kit: 'pic',
    label: 'MuscleMap · selector 195 x 411 (library) / rest / selected: Mell / keyboard focus: Tab into a region',
    node: (
      <Row>
        <Selector />
        <Selector initial="chest" />
      </Row>
    ),
  },
  {
    kit: 'pic',
    label: 'MuscleMap · read-only / 189 x 400 front, primary + secondary (exercise detail) / 105 x 221 back, lats (player)',
    node: (
      <Row>
        <MuscleMap sideControl="none" side="front" highlights={BENCH} className="h-[400px]" />
        <MuscleMap sideControl="none" side="back" highlights={ROW} className="h-[221px]" />
      </Row>
    ),
  },
  {
    kit: 'pic',
    label: 'MuscleMap · side / onSideChange — one state, the map control asks, the boxed figure follows',
    node: <Controlled />,
  },
  {
    kit: 'pic',
    label: 'proof · the frames\' boxes — rest (library-1) / Mell selected (library-2) / Széles hátizom selected (library-3) / 195 x 411',
    w: PROOF_W,
    node: (
      <Row>
        <Proof name="rest front">
          <MuscleMap sideControl="none" side="front" className="w-[195px]" />
        </Proof>
        <Proof name="rest back">
          <MuscleMap sideControl="none" side="back" className="w-[195px]" />
        </Proof>
        <Proof name="library-2">
          <Selector initial="chest" className="w-[195px]" />
        </Proof>
        <Proof name="library-3">
          <Selector initial="lats" side="back" className="w-[195px]" />
        </Proof>
      </Row>
    ),
  },
  {
    kit: 'pic',
    label: 'proof · read-only — exercise-detail-1 (189 x 400; side delts only = the data, both delts: either lights the whole cap) / exercise-detail-2 (189 x 400) / workout-1, workout-2 (105 x 221)',
    w: PROOF_W,
    node: (
      <Row>
        <Proof name="exercise-detail-1">
          <MuscleMap sideControl="none" side="front" highlights={BENCH} className="w-[189px]" />
        </Proof>
        <Proof name="exercise-detail-1 cap">
          <MuscleMap sideControl="none" side="front" highlights={BENCH_CAP} className="w-[189px]" />
        </Proof>
        <Proof name="exercise-detail-2">
          <MuscleMap sideControl="none" side="back" highlights={PULLUPS} className="w-[189px]" />
        </Proof>
        <Proof name="workout-1">
          <MuscleMap sideControl="none" side="back" highlights={ROW} className="w-[105px]" />
        </Proof>
        <Proof name="workout-2">
          <MuscleMap sideControl="none" side="back" highlights={ROW} className="w-[105px]" />
        </Proof>
      </Row>
    ),
  },
  {
    kit: 'pic',
    label: 'proof · several at once, both roles — front / back / 195 x 411',
    w: PROOF_W,
    node: (
      <Row>
        <Proof name="many front">
          <MuscleMap sideControl="none" side="front" highlights={MANY} className="w-[195px]" />
        </Proof>
        <Proof name="many back">
          <MuscleMap sideControl="none" side="back" highlights={MANY} className="w-[195px]" />
        </Proof>
      </Row>
    ),
  },
  {
    kit: 'pic',
    label: 'proof · contact sheet — every region of both renders lit alone (primary), 120 x 253',
    w: PROOF_W,
    node: (
      <div className="flex flex-wrap gap-x-4 gap-y-6">
        {(['front', 'back'] as const).flatMap((side) =>
          REGIONS[side].map((r) => (
            <Proof key={`${side}-${r.slug}`} name={`${side} ${r.slug}`}>
              <MuscleMap sideControl="none" side={side} highlights={{ [r.slug]: 'primary' }} className="w-[120px]" />
            </Proof>
          )),
        )}
      </div>
    ),
  },
];

export default function MannequinKit() {
  return (
    <div className="flex flex-col gap-8">
      {specimens.map((specimen) => (
        <section key={specimen.label} className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}
