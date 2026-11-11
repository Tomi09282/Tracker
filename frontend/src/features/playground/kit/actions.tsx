import { Bell, ChevronRight, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { BadgeCount } from '../../../ui/primitives/BadgeCount';
import { Pressable } from '../../../ui/primitives/Pressable';
import { TextLink } from '../../../ui/primitives/TextLink';

/*
 * The actions lane's page of the kit specimen (`/playground`, kit section): the lime pill, the
 * text link and the bare icon button — `control()`, `Pressable`, `TextLink`.
 *
 * The kit host collects every file in this folder with `import.meta.glob`. This one offers both
 * shapes a host can want: `specimens` — one entry per cell, a mono label and the nodes — and a
 * default component that lays those cells out itself.
 *
 * The first three cells ARE the three cells of the Figma component board (`Pulse — Components`,
 * column 1: `btnPrimary`, `textLink`, `iconBtn`), label for label, word for word, in the board's
 * own order and spacing, so a capture can be laid over `_components-2.png`: a cell is a 354 wide
 * column, its mono label 12 above the nodes (24 in the pill cell, whose pills also stand 24 apart),
 * 20 between links, 16 between icon buttons, 48 between cells (`app-components.body.js` 15-22,
 * 50-52; measured in `_components.json`). The three cells after them hold what the board
 * does not draw and the lane rules ask for: keyboard focus on every look, the pressed link and
 * icon button, the small pill in every state.
 *
 * `data-force="pressed"` / `data-force="focus"` hold a control in a state that needs a finger or
 * a keyboard — the recipe answers to them with the same declarations as the real `:active` and
 * `:focus-visible` (see `control.ts`). Disabled and busy are the real props.
 *
 * The words are the board's sample data, as drawn. The two bells carry the board's counts, 2 and
 * 99+, through `BadgeCount`, the selection lane's component (handed in by F8).
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. For the first cell of a kit it is the label of the Figma board, verbatim. */
  label: string;
  node: ReactNode;
  /**
   * The board's gap between the label and the first node, in pt — the `gap` of the board's
   * `cell()`: 12 unless the cell says otherwise (the pill cell: 24). A host that lays the cells out
   * as the board does reads it; absent = 12.
   */
  gap?: 12 | 24;
}

const Stack = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-6">{children}</div>;

const Row = ({ gap, children }: { gap: 'gap-4' | 'gap-5'; children: ReactNode }) => (
  <div className={`flex flex-wrap items-center ${gap}`}>{children}</div>
);

export const specimens: KitSpecimen[] = [
  {
    kit: 'btnPrimary',
    label: 'btnPrimary · default / pressed / disabled / busy — ONE per screen',
    gap: 24,
    node: (
      <Stack>
        <Pressable variant="primary" size="lg" className="w-full">
          Indítás
        </Pressable>
        <Pressable variant="primary" size="lg" className="w-full" data-force="pressed">
          Indítás
        </Pressable>
        <Pressable variant="primary" size="lg" className="w-full" disabled>
          Indítás
        </Pressable>
        <Pressable variant="primary" size="lg" className="w-full" busy>
          Indítás
        </Pressable>
      </Stack>
    ),
  },
  {
    kit: 'textLink',
    label: 'textLink · inline + chevron / standalone / destructive / off',
    node: (
      <Row gap="gap-5">
        <TextLink trail={<ChevronRight aria-hidden />}>Megnyitás</TextLink>
        <TextLink text="body">Kihagyás</TextLink>
        <TextLink text="body" tone="danger">
          Kijelentkezés
        </TextLink>
        <TextLink disabled>Újra</TextLink>
      </Row>
    ),
  },
  {
    kit: 'iconBtn',
    label: 'iconBtn · badgeCount 2 / 99+ · bare glyphs · btnPrimary sm',
    node: (
      <Row gap="gap-4">
        <Pressable variant="link" shape="icon" aria-label="Értesítések">
          <Bell aria-hidden />
          <BadgeCount count={2} />
        </Pressable>
        <Pressable variant="link" shape="icon" aria-label="Értesítések">
          <Bell aria-hidden />
          <BadgeCount count={120} capped />
        </Pressable>
        <Pressable variant="link" shape="icon" aria-label="Bezárás">
          <X aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" aria-label="Hozzáadás">
          <Plus aria-hidden />
        </Pressable>
        <Pressable variant="primary" size="sm">
          Küldés
        </Pressable>
      </Row>
    ),
  },
  {
    kit: 'btnPrimary',
    label: 'btnPrimary · keyboard focus / content width / sm: default, pressed, disabled, busy, keyboard focus',
    gap: 24,
    node: (
      <Stack>
        <Pressable variant="primary" size="lg" className="w-full" data-force="focus">
          Indítás
        </Pressable>
        <Pressable variant="primary" size="lg" className="self-start">
          Indítás
        </Pressable>
        <Row gap="gap-4">
          <Pressable variant="primary" size="sm">
            Küldés
          </Pressable>
          <Pressable variant="primary" size="sm" data-force="pressed">
            Küldés
          </Pressable>
          <Pressable variant="primary" size="sm" disabled>
            Küldés
          </Pressable>
        </Row>
        <Row gap="gap-4">
          <Pressable variant="primary" size="sm" busy>
            Küldés
          </Pressable>
          <Pressable variant="primary" size="sm" data-force="focus">
            Küldés
          </Pressable>
        </Row>
      </Stack>
    ),
  },
  {
    kit: 'textLink',
    label: 'textLink · pressed / keyboard focus / busy / lead glyph / destructive: lead, off / as a route link',
    node: (
      <div className="flex flex-col">
        <Row gap="gap-5">
          <TextLink text="body" data-force="pressed">
            Kihagyás
          </TextLink>
          <TextLink text="body" data-force="focus">
            Kihagyás
          </TextLink>
          <TextLink text="body" busy>
            Kihagyás
          </TextLink>
        </Row>
        <Row gap="gap-5">
          <TextLink lead={<X aria-hidden />}>Szűrők törlése</TextLink>
          <TextLink text="body" tone="danger" lead={<X aria-hidden />}>
            Kijelentkezés
          </TextLink>
          <TextLink text="body" tone="danger" disabled>
            Kijelentkezés
          </TextLink>
        </Row>
        <Row gap="gap-5">
          <TextLink to="/playground" trail={<ChevronRight aria-hidden />}>
            Megnyitás
          </TextLink>
          <TextLink to="/playground" trail={<ChevronRight aria-hidden />} data-force="focus">
            Megnyitás
          </TextLink>
          <TextLink to="/playground" trail={<ChevronRight aria-hidden />} disabled>
            Megnyitás
          </TextLink>
        </Row>
      </div>
    ),
  },
  {
    kit: 'iconBtn',
    label: 'iconBtn · pressed / disabled / keyboard focus / busy',
    node: (
      <Row gap="gap-4">
        <Pressable variant="link" shape="icon" aria-label="Bezárás" data-force="pressed">
          <X aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" aria-label="Bezárás" disabled>
          <X aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" aria-label="Bezárás" data-force="focus">
          <X aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" aria-label="Bezárás" busy>
          <X aria-hidden />
        </Pressable>
      </Row>
    ),
  },
];

export default function ActionsKit() {
  return (
    <div className="flex flex-col gap-12">
      {specimens.map((specimen) => (
        <section key={specimen.label} className={`flex flex-col ${specimen.gap === 24 ? 'gap-6' : 'gap-3'}`} data-kit-cell={specimen.kit}>
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}
