import { Bell, ChevronRight, Plus, Trophy, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ListRow, ListRowSkeleton } from '../../../ui/data/ListRow';
import { Monogram, MonogramSkeleton } from '../../../ui/data/Monogram';
import { RowStack } from '../../../ui/data/RowStack';
import { Rule } from '../../../ui/data/Rule';
import { Section, SectionHeader } from '../../../ui/data/SectionHeader';
import { EmptyState } from '../../../ui/feedback/EmptyState';
import { NoticeLine } from '../../../ui/feedback/NoticeLine';
import { Skeleton } from '../../../ui/feedback/ScreenSkeleton';
import { Pic } from '../../../ui/media/Pic';
import { Pressable } from '../../../ui/primitives/Pressable';
import { Switch } from '../../../ui/primitives/Switch';
import { TextLink } from '../../../ui/primitives/TextLink';

/*
 * The structure lane's page of the kit specimen (`/playground`, kit section): the section head,
 * the two rules, the row stack and its rows, the empty state, the skeleton and the notice line —
 * the "no boxes" grammar every screen is built from.
 *
 * The kit host collects every file in this folder with `import.meta.glob`. This one offers both
 * shapes a host can want: `specimens` — one entry per cell, a mono label and the nodes — and a
 * default component that lays those cells out itself.
 *
 * The first cell of each kit name IS the cell of the Figma component board (`Pulse — Components`,
 * column 2: `sect`, `listRow`; column 3: `emptyState`, `skel`, `noticeLine`), label for label, word
 * for word, with the board's own sample data and spacing, so a capture can be laid over
 * `_components-3.png`. The cells after them hold what the board does not draw and the lane rules
 * ask for: a row that is an action in every state (rest, pressed, keyboard focus, disabled, busy),
 * a row with a control beside its action, the loading row, and the notice and section forms the
 * frames draw.
 *
 * `data-force="pressed"` / `data-force="focus"` hold a row in a state that needs a finger or a
 * keyboard, with the same declarations as the real `:active` and `:focus-visible`. Disabled and
 * busy are the real props. The pill, the text links and the icon button in these cells are the
 * actions lane's (`Pressable`, `TextLink`), placed the way a screen places them.
 *
 * Stage 2 adds the monogram: the board's `monogramMark` cell (28 / 64 + dot / hero 176 + light +
 * dot), the 28 pt monogram in the list row's lead slot, and the sizes and states the frames draw
 * beyond the board (the chat and client anchors, a day number, a dot that carries a state, a row
 * action holding a monogram in every state, the texture's ink fallback, the loading block).
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. For the first cell of a kit it is the label of the Figma board, verbatim. */
  label: string;
  node: ReactNode;
}

const noop = () => {};

/** A row whose control is labelled by the row's own title — the `titleId` contract. */
function SwitchRow({ title, sub, on, disabled }: { title: string; sub?: string; on: boolean; disabled?: boolean }) {
  const titleId = useId();
  const [checked, setChecked] = useState(on);
  return (
    <ListRow
      title={title}
      titleId={titleId}
      sub={sub}
      control={<Switch checked={checked} onChange={setChecked} labelledBy={titleId} disabled={disabled} />}
    />
  );
}

/** The board's `skel` cell: three title + caption pairs, 8 apart inside a pair, 20 between pairs. */
const SKEL = [
  ['w-55', 'w-30'],
  ['w-45', 'w-24'],
  ['w-65', 'w-35'],
] as const;

export const specimens: KitSpecimen[] = [
  {
    kit: 'sect',
    label: 'sect · rule + eyebrow + trailing meta / link on one baseline',
    node: (
      <div className="flex flex-col gap-section">
        <Section
          title="Mai edzés"
          trailing={
            <span className="text-data text-text-2">
              <span className="text-text-1">18:00</span> · 5 gyakorlat
            </span>
          }
        >
          <p className="text-display-xl text-text-1">Felsőtest – húzás</p>
        </Section>
        <Section title="Táplálkozás" trailing={<TextLink trail={<ChevronRight />}>Megnyitás</TextLink>}>
          <p className="text-body text-text-2">Felső/alsó szplit – 12 hetes blokk</p>
        </Section>
      </div>
    ),
  },
  {
    kit: 'sect',
    label: 'sect · no rule (the block under a header) / a count / a status / a small pill the head makes room for',
    node: (
      <div className="flex flex-col gap-section">
        <SectionHeader rule={false} title="Heti edzés" />
        <SectionHeader title="Névsor" trailing={<span className="text-data text-text-2">6</span>} />
        <SectionHeader title="Felszerelés" trailing={<span className="text-cap text-text-2">Felszerelés mentve</span>} />
        <SectionHeader
          title="Csatlakozási kódok"
          trailingInFlow
          trailing={
            <Pressable variant="primary" size="sm" icon={<Plus />}>
              Új kód
            </Pressable>
          }
        />
      </div>
    ),
  },
  {
    kit: 'listRow',
    label: 'listRow · plain / sub + tag / thumb / monogram + value / two lines / destructive',
    node: (
      <RowStack open close>
        <ListRow title="Felszerelés" chevron onClick={noop} />
        <ListRow
          title="Svend Press"
          sub="Kezdő · Erő"
          trailing={<span className="text-micro text-text-2">EN</span>}
          chevron
          onClick={noop}
        />
        <ListRow title="Fekvenyomás" sub="Erő" lead={<Pic slot="equip-barbell" width={48} />} chevron onClick={noop} />
        <ListRow title="Kovács Péter" sub="Erőemelő csapat" leadSlot lead={<Monogram initials="KP" />} value="5 perce" />
        <ListRow title="Közepes fogású fekvenyomás rúddal" sub="Kezdő · Erő" lines={2} chevron onClick={noop} />
        <ListRow title="Kijelentkezés" tone="danger" onClick={noop} />
      </RowStack>
    ),
  },
  {
    kit: 'listRow',
    label: 'listRow · an action: rest / pressed / keyboard focus / disabled / busy',
    node: (
      <RowStack>
        <ListRow title="Megjelenített név" value="Takács Dániel" chevron onClick={noop} />
        <ListRow title="Megjelenített név" value="Takács Dániel" chevron onClick={noop} data-force="pressed" />
        <ListRow title="Megjelenített név" value="Takács Dániel" chevron onClick={noop} data-force="focus" />
        <ListRow title="Megjelenített név" value="Takács Dániel" chevron onClick={noop} disabled />
        <ListRow title="Megjelenített név" value="Takács Dániel" chevron onClick={noop} busy />
      </RowStack>
    ),
  },
  {
    kit: 'listRow',
    label: 'listRow · a control beside the row (labelled by its title) / muted option / lead glyph + value',
    node: (
      <RowStack>
        <SwitchRow title="Beszédhang" on />
        <SwitchRow title="Rezgés" sub="Ezen az eszközön nem érhető el." on={false} disabled />
        <ListRow title="3 / 20 felhasználva" control={<TextLink tone="danger">Visszavonás</TextLink>} />
        <ListRow title="Kezdő" tone="muted" onClick={noop} />
        <ListRow title="Felszerelés frissítve" sub="Az edződ módosította az eszközeidet." lead={<Bell />} value="1 napja" />
      </RowStack>
    ),
  },
  {
    kit: 'listRow',
    label: 'listRow · loading — the row floor kept, the lead slot left empty',
    node: (
      <RowStack as="div">
        <ListRowSkeleton sub index={0} />
        <ListRowSkeleton sub leadSlot index={1} />
        <ListRowSkeleton index={2} />
      </RowStack>
    ),
  },
  {
    kit: 'rule',
    label: 'rule · section (white 14 %) / row (white 8 %)',
    node: (
      <div className="flex flex-col gap-group">
        <Rule strong />
        <Rule />
      </div>
    ),
  },
  {
    kit: 'monogramMark',
    label: 'monogramMark · 28 / 64 + dot / hero 176 + light + dot',
    node: (
      <div className="flex items-end gap-4">
        <Monogram initials="KP" />
        <Monogram initials="KP" size={64} dot />
        <Monogram initials="TD" size={176} light dot />
      </div>
    ),
  },
  {
    kit: 'monogramMark',
    label: 'monogramMark · chat anchor 96 / client anchor 124 (light) / day numbers, set and pending / a dot that carries a state',
    node: (
      <div className="flex flex-col items-start gap-6">
        <div className="flex items-end gap-4">
          <Monogram initials="KA" size={96} />
          <Monogram person={{ email: 'takacs.daniel@pelda.hu', display_name: 'Takács Dániel' }} size={124} />
        </div>
        <div className="flex items-end gap-4">
          <Monogram initials="1" />
          <Monogram initials="2" tone="pending" />
          <Monogram initials="3" />
          <Monogram initials="HG" dot="warn" dotLabel="Átadásra vár" />
          <Monogram initials="ŐÁ" />
        </div>
      </div>
    ),
  },
  {
    kit: 'monogramMark',
    label: 'monogramMark · in a row action: rest / pressed / keyboard focus / disabled / busy',
    node: (
      <RowStack>
        <ListRow title="Takács Dániel" sub="15 edzés / 28 nap" leadSlot lead={<Monogram initials="TD" />} chevron onClick={noop} />
        <ListRow title="Takács Dániel" sub="15 edzés / 28 nap" leadSlot lead={<Monogram initials="TD" />} chevron onClick={noop} data-force="pressed" />
        <ListRow title="Takács Dániel" sub="15 edzés / 28 nap" leadSlot lead={<Monogram initials="TD" />} chevron onClick={noop} data-force="focus" />
        <ListRow title="Takács Dániel" sub="15 edzés / 28 nap" leadSlot lead={<Monogram initials="TD" />} chevron onClick={noop} disabled />
        <ListRow title="Takács Dániel" sub="15 edzés / 28 nap" leadSlot lead={<Monogram initials="TD" />} chevron onClick={noop} busy />
      </RowStack>
    ),
  },
  {
    kit: 'monogramMark',
    label: 'monogramMark · the texture never arrived (ink fallback) / loading blocks 28 and 176',
    node: (
      <div className="flex flex-wrap items-end gap-4">
        <Monogram initials="TD" size={176} dot data-force="fallback" />
        <MonogramSkeleton />
        <MonogramSkeleton size={176} />
      </div>
    ),
  },
  {
    kit: 'emptyState',
    label: 'emptyState · with the primary action / with a link',
    node: (
      <div className="flex flex-col gap-10">
        <EmptyState
          title="Ma nincs betervezve edzés"
          body="Ha van aktív terved, a mai napja itt jelenik meg."
          action={
            <Pressable variant="primary" size="lg">
              Gyakorlatok böngészése
            </Pressable>
          }
        />
        <EmptyState
          title="Nincs találat"
          body="Próbálj más keresőszót vagy szűrőt."
          action={<TextLink text="body">Szűrők törlése</TextLink>}
        />
      </div>
    ),
  },
  {
    kit: 'skel',
    label: 'skel · loading rows — never a spinner',
    node: (
      <div className="flex flex-col gap-5">
        {SKEL.map(([title, sub]) => (
          <div key={title} className="flex flex-col gap-2">
            <Skeleton className={`h-4 ${title}`} />
            <Skeleton className={`h-3 ${sub}`} />
          </div>
        ))}
      </div>
    ),
  },
  {
    kit: 'noticeLine',
    label: 'noticeLine · error + retry / offline (warn) / saved (ok)',
    node: (
      <div className="flex flex-col">
        <NoticeLine tone="danger" action={<TextLink>Újra</TextLink>}>
          Nem sikerült menteni.
        </NoticeLine>
        <NoticeLine tone="warn">Nincs internetkapcsolat · 3 művelet vár feltöltésre</NoticeLine>
        <NoticeLine tone="ok">Felszerelés mentve</NoticeLine>
      </div>
    ),
  },
  {
    kit: 'noticeLine',
    label: 'noticeLine · with a detail line / a lead glyph / compact (20) / a wrapping message',
    node: (
      <div className="flex flex-col gap-group">
        <NoticeLine tone="warn" detail="Amíg nem állítanak be saját jelszót, nem tudnak belépni">
          1 fiók átadásra vár
        </NoticeLine>
        <NoticeLine
          lead={<Trophy />}
          action={
            <Pressable variant="link" shape="icon" aria-label="Bezárás">
              <X />
            </Pressable>
          }
        >
          Új rekord
        </NoticeLine>
        <NoticeLine tone="danger" compact>
          Hiányzik még: heti edzésszám
        </NoticeLine>
        <NoticeLine tone="warn">
          A(z) kovacs-peter nevet ezzel elengeded, és 365 napig senki más nem veheti fel. Új módosításra 30 nap múlva
          lesz újra lehetőséged.
        </NoticeLine>
      </div>
    ),
  },
];

export default function StructureKit() {
  return (
    <div className="flex flex-col gap-12">
      {specimens.map((specimen) => (
        <section key={specimen.label} className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}
