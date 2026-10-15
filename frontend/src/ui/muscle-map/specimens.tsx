import { useState, type ReactNode } from 'react';
import { MuscleMap, type MuscleRole } from './MuscleMap';
import type { MuscleSide } from './figure';

/*
 * The mannequin lane's page of the kit specimen (`/playground`, kit section) — F15, stage 0.
 *
 * It lives beside the component because the lane owns `ui/muscle-map/**` and nothing under
 * `features/playground/`: the kit host lists it through a one-line `features/playground/kit/
 * mannequin.tsx` (`export * from` / `export { default } from` this file), the same two shapes
 * every kit file offers — `specimens`, one entry per cell, and a default component that lays the
 * cells out itself.
 *
 * What stage 0 adds is the FIXED BOX and the controlled side, so that is what the cells show: the
 * figure alone (`sideControl="none"`) at the sizes the Figma file draws it — 200 tall on the
 * component board, 195 x 411 on the selector, 189 x 400 on exercise detail, 105 x 221 in the
 * player — with the regions lit the way those frames light them. The drawing inside the box is
 * still the vector map until stage 1 swaps in the render; the box is what the screens build on.
 *
 * States: rest, selected (a region pressed) and keyboard focus on a region are the map's own.
 * It has no disabled and no busy state — neither in the code nor in the Figma kit — so none is
 * drawn. Every visible word comes from the map's existing `muscleMap.*` / `muscle.*` keys; the
 * labels here are the QA page's own, English like the rest of it.
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. */
  label: string;
  node: ReactNode;
}

const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-end gap-8">{children}</div>;

/** exercise-detail-1: "Közepes fogású fekvenyomás rúddal" — Mell primary; Oldalsó vállizom and Tricepsz (back) secondary. */
const BENCH: Record<string, MuscleRole> = { chest: 'primary', 'side-delts': 'secondary', triceps: 'secondary' };
/** workout-1: "Előredőlt evezés rúddal" on the back view — only the lats lit. */
const ROW: Record<string, MuscleRole> = { lats: 'primary' };

/** The library selector: a tap selects a region, a second tap clears it — what LibraryPage does. */
function Selector({ initial }: { initial?: string }) {
  const [muscle, setMuscle] = useState<string | undefined>(initial);
  return (
    <MuscleMap
      sideControl="none"
      side="front"
      selected={muscle}
      onSelect={(slug) => setMuscle((cur) => (cur === slug ? undefined : slug))}
      className="h-[411px]"
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
