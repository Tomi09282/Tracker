import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { BadgeCount } from '../../../ui/primitives/BadgeCount';
import { Pressable } from '../../../ui/primitives/Pressable';
import { Segment, Segmented } from '../../../ui/feedback/variants/E6Segmented';
import { LanguageToggle } from '../../../ui/nav/LanguageToggle';

/*
 * The selection lane's page of the kit specimen (`/playground`, kit section) — stage 1:
 * `BadgeCount`, `Segmented` in its two Pulse forms, `LanguageToggle`.
 *
 * The kit host collects every file in this folder with `import.meta.glob`, so being listed costs
 * no edit to a shared file. Same two shapes as every lane's page: `specimens` — one entry per cell
 * of the Figma component board (a mono label, then the nodes; a label that starts like a board
 * label IS that board cell) — and a default component that lays the cells out itself.
 *
 * Every interactive state is on the page at once: rest, pressed and keyboard focus (forced with
 * `data-force`, which the segment answers with the declarations of `:active` / `:focus-visible`),
 * busy and failed (the segment's own props), read-only and disabled. The live controls next to
 * them still work: arrows, clicks, and an async commit that is slow on purpose.
 *
 * The sample strings are the board's (figma-build/app-components.body.js).
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. The first ones are the labels of the Figma board, verbatim. */
  label: string;
  node: ReactNode;
}

const Row = ({ gap, children }: { gap: 'gap-4' | 'gap-6' | 'gap-8'; children: ReactNode }) => (
  <div className={`flex flex-wrap items-center ${gap}`}>{children}</div>
);

const Stack = ({ children }: { children: ReactNode }) => <div className="flex flex-col items-start gap-6">{children}</div>;

/**
 * Sets `data-force` on the n-th segment inside it once mounted — the REAL component, showing the
 * recipe's own pressed or focus declarations, not a copy of them.
 */
function Force({ at, state, children }: { at: number; state: 'pressed' | 'focus'; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelectorAll<HTMLElement>('[role="radio"], button')[at];
    if (el) el.dataset.force = state;
  }, [at, state]);
  return (
    <div ref={box} className="contents">
      {children}
    </div>
  );
}

/** The bell as the kit's `iconBtn('bell', n)` draws it: the actions lane's bare icon button, the badge inside. */
function Bell44({ children }: { children?: ReactNode }) {
  return (
    <Pressable variant="link" shape="icon" aria-label="Értesítések">
      <Bell aria-hidden />
      {children}
    </Pressable>
  );
}

const SIDES = [
  { value: 'front', label: 'Elöl' },
  { value: 'back', label: 'Hátul' },
] as const;
type Side = (typeof SIDES)[number]['value'];

const STORE = [
  { value: 'store', label: 'Bolt' },
  { value: 'results', label: 'Eredmények' },
  { value: 'statement', label: 'Kivonat' },
] as const;
type Store = (typeof STORE)[number]['value'];

const ADMIN = [
  { value: 'accounts', label: 'Fiókok' },
  { value: 'moderation', label: 'Moderáció', count: 3 },
  { value: 'market', label: 'Piactér' },
] as const;
type Admin = (typeof ADMIN)[number]['value'];

const CLIENT = [
  { value: 'plan', label: 'Terv' },
  { value: 'nutrition', label: 'Táplálkozás' },
  { value: 'progress', label: 'Haladás' },
  { value: 'messages', label: 'Üzenetek' },
] as const;
type Client = (typeof CLIENT)[number]['value'];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Hug({ start = 'front' }: { start?: Side }) {
  const [side, setSide] = useState<Side>(start);
  return <Segmented label="Nézet" options={SIDES} value={side} onChange={setSide} />;
}

function Cells() {
  const [view, setView] = useState<Store>('results');
  return <Segmented layout="cells" label="Érmék" options={STORE} value={view} onChange={setView} />;
}

/** The async layer, live: "Hátul" commits after 1.2 s, "Elöl" is refused after 1.2 s. */
function Async() {
  const [side, setSide] = useState<Side>('front');
  return (
    <Segmented
      label="Nézet"
      options={SIDES}
      value={side}
      onChange={(next) =>
        wait(1200).then(() => {
          if (next === 'front') throw new Error('demo failure');
          setSide(next);
        })
      }
    />
  );
}

function Counted() {
  const [area, setArea] = useState<Admin>('moderation');
  return <Segmented layout="cells" label="Szakaszok" options={ADMIN} value={area} onChange={setArea} />;
}

function Ruled() {
  const [view, setView] = useState<Client>('plan');
  return <Segmented rule label="Kliens nézetek" options={CLIENT} value={view} onChange={setView} />;
}

export const specimens: KitSpecimen[] = [
  {
    kit: 'badgeCount',
    label: 'badgeCount · 2 / 99+ on the bell (iconBtn) · hidden at 0 · inline',
    node: (
      <Row gap="gap-4">
        <Bell44>
          <BadgeCount count={2} />
        </Bell44>
        <Bell44>
          <BadgeCount count={120} capped />
        </Bell44>
        <Bell44>
          <BadgeCount count={0} />
        </Bell44>
        <BadgeCount count={7} placement="inline" />
      </Row>
    ),
  },
  {
    kit: 'segSwitch',
    label: 'segSwitch · hug — ink mark = neutral selection',
    node: <Hug />,
  },
  {
    kit: 'segSwitch',
    label: 'segSwitch · equal cells on a hairline',
    node: <Cells />,
  },
  {
    kit: 'segSwitch',
    label: 'segSwitch · pressed (60 %) / keyboard focus (lime ring around the 44 pt frame)',
    node: (
      <Stack>
        <Force at={1} state="pressed">
          <Hug />
        </Force>
        <Force at={0} state="focus">
          <Hug />
        </Force>
        <Force at={2} state="focus">
          <Cells />
        </Force>
      </Stack>
    ),
  },
  {
    kit: 'segSwitch',
    label: 'segSwitch · busy (three dots, the word keeps its width) / failed (danger word, the mark stays) / live: Hátul commits, Elöl is refused',
    node: (
      <Stack>
        <div data-kit="segSwitch" className="inline-flex w-fit gap-6">
          <Segment layout="hug" selected>
            Elöl
          </Segment>
          <Segment layout="hug" selected={false} busy>
            Hátul
          </Segment>
        </div>
        <div data-kit="segSwitch" className="inline-flex w-fit gap-6">
          <Segment layout="hug" selected>
            Elöl
          </Segment>
          <Segment layout="hug" selected={false} failed>
            Hátul
          </Segment>
        </div>
        <Async />
      </Stack>
    ),
  },
  {
    kit: 'segSwitch',
    label: 'segSwitch · read-only (settled, still focusable) / disabled (40 %)',
    node: (
      <Stack>
        <Segmented readOnly label="Nézet" options={SIDES} value="back" onChange={() => undefined} />
        <Segmented disabled label="Nézet" options={SIDES} value="front" onChange={() => undefined} />
        <Segmented disabled layout="cells" label="Érmék" options={STORE} value="store" onChange={() => undefined} />
      </Stack>
    ),
  },
  {
    kit: 'segSwitch',
    label: 'segSwitch · equal cells + a live count (admin) / hug on a hairline (client page)',
    node: (
      <Stack>
        <Counted />
        <Ruled />
      </Stack>
    ),
  },
  {
    kit: 'segSwitch',
    label: 'LanguageToggle · segSwitch hug, native names, aria-pressed + lang',
    node: <LanguageToggle />,
  },
];

export default function SelectionKit() {
  return (
    <div className="flex w-full max-w-[354px] flex-col gap-12">
      {specimens.map((specimen) => (
        <section key={specimen.label} className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}
