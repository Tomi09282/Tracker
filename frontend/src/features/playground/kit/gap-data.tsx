import { Check, MessageCircle, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { pulseSrcSet } from '../../../assets/pulse';
import { Dot } from '../../../ui/data/Dot';
import { FigureUnit } from '../../../ui/data/FigureUnit';
import { LedgerRow } from '../../../ui/data/LedgerRow';
import { ListRow } from '../../../ui/data/ListRow';
import { MacroColumns } from '../../../ui/data/MacroColumns';
import { Monogram } from '../../../ui/data/Monogram';
import { Numeral } from '../../../ui/data/Numeral';
import { RoleKey } from '../../../ui/data/RoleKey';
import { RowStack } from '../../../ui/data/RowStack';
import { SegmentBar } from '../../../ui/data/SegmentBar';
import type { SegmentSlot } from '../../../ui/data/SegmentBar';
import { SplitBar, SplitLegend } from '../../../ui/data/SplitBar';
import { StatusLine } from '../../../ui/data/StatusLine';
import { StatBlock } from '../../../ui/data/StatBlock';
import { EmptyState } from '../../../ui/feedback/EmptyState';
import { UserPhoto } from '../../../ui/media/UserPhoto';

/*
 * The data-gap lane's page of the kit specimen (`/playground`, kit section; kit gap lane G-data).
 * Internal QA page, English labels.
 *
 * None of these cells is on the Figma component board: every gap was drawn in a FRAME, not on the
 * board, so each cell is the frame's own composition, with the frame's sample data, at the frame's
 * width (354). The label names the frame it reproduces; the pair pictures in
 * `.pulse/pairs/G-data/` put each cell next to that frame's crop.
 *
 * Interactive pieces show rest, pressed, keyboard focus, disabled and busy (`data-force` holds a
 * state for the capture, with the same declarations as the real `:active` / `:focus-visible`):
 * the feed row, the plan row and the cycle-strip slot. Everything else takes no focus.
 */

export interface KitSpecimen {
  kit: string;
  label: string;
  node: ReactNode;
  gap?: number;
  w?: number;
}

const Caption = ({ children }: { children: ReactNode }) => <span className="text-micro text-text-3">{children}</span>;
const noop = () => undefined;

/** plan-editor-1 "7 napos ciklus": training days half, rest days off. */
const CYCLE: readonly SegmentSlot[] = [1, 2, 3, 4, 5, 6, 7].map((n) => {
  const rest = n === 2 || n === 4 || n === 7;
  return { state: rest ? 'off' : 'half', label: n, onPress: noop, pressed: false, srText: `${n}` } as const;
});

/** plan-editor-2: day 5 open (lime), and the specimen's held states on 1-4 and 6. */
const CYCLE_STATES: readonly SegmentSlot[] = CYCLE.map((slot, index) => {
  if (index === 0) return { ...slot, force: 'pressed' };
  if (index === 1) return { ...slot, force: 'focus' };
  if (index === 2) return { ...slot, disabled: true };
  if (index === 3) return { ...slot, busy: true };
  if (index === 4) return { ...slot, state: 'on', pressed: true };
  if (index === 6) return { state: 'off', label: <Plus aria-hidden />, onPress: noop, srText: 'add' };
  return slot;
});

const SAMPLE = pulseSrcSet('texture-monogram').src;

export const specimens: KitSpecimen[] = [
  {
    kit: 'dot',
    label: 'dot · live / secondary / half / off / ink / ok / warn / danger — 6 and 8',
    node: (
      <div className="flex flex-col gap-3">
        {([6, 8] as const).map((size) => (
          <div key={size} className="flex items-center gap-4">
            {(['live', 'secondary', 'half', 'off', 'ink', 'ok', 'warn', 'danger'] as const).map((tone) => (
              <Dot key={tone} tone={tone} size={size} />
            ))}
          </div>
        ))}
      </div>
    ),
  },
  {
    kit: 'roleKey',
    label: 'roleKey · stack 8 (exercise-detail-1) / inline 8 (admin-2) / legend 6 (workout-1)',
    node: (
      <div className="flex flex-col gap-6">
        <RoleKey
          items={[
            { role: 'primary', label: 'Mell' },
            { role: 'secondary', label: 'Oldalsó vállizom' },
            { role: 'secondary', label: 'Tricepsz' },
          ]}
        />
        <RoleKey
          layout="inline"
          items={[
            { role: 'primary', label: 'Négyfejű combizom' },
            { role: 'secondary', label: 'Farizom' },
          ]}
        />
        <RoleKey
          size={6}
          items={[
            { role: 'primary', label: 'Fő célizom' },
            { role: 'secondary', label: 'Segédizom' },
          ]}
        />
      </div>
    ),
  },
  {
    kit: 'statusLine',
    label: 'statusLine · live (client-detail-1) / warn / no colour (a draft)',
    node: (
      <div className="flex flex-col gap-3">
        <StatusLine tone="live" word="Aktív" meta="7 nap · 7 napos ciklus · 2026-07-13" />
        <StatusLine tone="warn" word="Szünetel" meta="7 nap · 7 napos ciklus" />
        <StatusLine word="Piszkozat" meta="6 nap · 7 napos ciklus" />
      </div>
    ),
  },
  {
    kit: 'splitBar',
    label: 'splitBar · team split (coach-dashboard-1) / status bar (coach-plans-1) / role split (admin-1) / one part',
    node: (
      <div className="flex flex-col gap-8">
        <SplitBar
          parts={[
            { label: 'Erőemelő csapat', count: 2 },
            { label: 'Reggeli csoport', count: 2 },
            { label: 'Online kliensek', count: 1 },
            { label: 'Csapat nélkül', count: 1 },
          ]}
        />
        <SplitBar
          legend="inline"
          parts={[
            { label: 'Aktív', count: 4, tone: 'live' },
            { label: 'Piszkozat', count: 1, tone: 'half' },
            { label: 'Szünetel', count: 0, tone: 'warn' },
            { label: 'Lezárva', count: 1, tone: 'off' },
          ]}
        />
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <StatBlock label="Felhasználó">
              <Numeral size="giant" value="19" />
            </StatBlock>
            <SplitLegend
              layout="stack"
              className="h-[110px] w-30"
              parts={[
                { label: 'Tagok', count: 15 },
                { label: 'Edzők', count: 3 },
                { label: 'Adminok', count: 1 },
              ]}
            />
          </div>
          <SplitBar
            legend="none"
            parts={[
              { label: 'Tagok', count: 15 },
              { label: 'Edzők', count: 3 },
              { label: 'Adminok', count: 1 },
            ]}
          />
        </div>
        <SplitBar parts={[{ label: 'Csapat nélkül', count: 6 }]} />
      </div>
    ),
  },
  {
    kit: 'listRow',
    label: 'listRow · kicker + byline + price on the sub line (marketplace-1) — rest / pressed / focus / disabled / busy',
    node: (
      <RowStack close>
        <ListRow
          to="#"
          pad="loose"
          kickerLead="Közlemény" kicker="Budapest · 2026. 10. 05."
          title="Novembertől két új időpont"
          sub="Kovács Péter"
        />
        <ListRow
          to="#"
          pad="loose"
          kickerLead="Esemény" kicker="Budapest · 2026. 10. 30."
          title="Guggolás-technika műhely – október 30."
          sub="Kovács Péter"
          value="12 000 Ft"
          valueOn="sub"
          data-force="pressed"
        />
        <ListRow
          to="#"
          pad="loose"
          kickerLead="Program" kicker="Budapest · 2026. 09. 18."
          title="Őszi erőblokk – 8 hetes csoportos program"
          sub="Kovács Péter"
          value="69 000 Ft"
          valueOn="sub"
          data-force="focus"
        />
        <ListRow
          to="#"
          pad="loose"
          kickerLead="Program" kicker="Szeged · 2026. 09. 09."
          title="Félmaraton 12 hét alatt – kezdőknek"
          sub="Szilágyi Réka"
          value="32 000 Ft"
          valueOn="sub"
          disabled
        />
        <ListRow
          to="#"
          pad="loose"
          kickerLead="Közlemény" kicker="Online · 2026. 08. 25."
          title="Ingyenes kalisztenika bemelegítő sorozat"
          sub="Fehér Tamás"
          busy
        />
      </RowStack>
    ),
  },
  {
    kit: 'listRow',
    label: 'listRow · title 22 / 28 + mono meta + lime tick, trimmed stack (coach-plans-1 "Sablonok")',
    node: (
      <RowStack trim>
        <ListRow to="#" chevron pad="loose" titleSize="title" lines={2} subFace="data" title="Push / Pull / Láb – 6 nap" sub="Piszkozat · 6 nap · 7 napos ciklus" />
        <ListRow
          to="#"
          chevron
          pad="loose"
          titleSize="title"
          lines={2}
          subFace="data"
          subInk="ink"
          subLead={<Check />}
          title="Felső/alsó szplit – 12 hetes blokk"
          sub="Aktív · 7 nap · 7 napos ciklus"
        />
        <ListRow
          to="#"
          chevron
          pad="loose"
          titleSize="title"
          lines={2}
          subFace="data"
          subInk="ink"
          subLead={<Check />}
          title="Kezdő teljes test – 8 hét"
          sub="Aktív · 7 nap · 7 napos ciklus"
        />
      </RowStack>
    ),
  },
  {
    kit: 'listRow',
    label: 'listRow · figure + unit value (client-detail-3 "Rekordok") / status line in the sub (client-detail-1)',
    node: (
      <RowStack>
        <ListRow title="Bench Press" sub="becsült 1RM · 2026-10-07" value="108" valueUnit="kg" />
        <ListRow title="Barbell Squat" sub="becsült 1RM · 2026-10-05" value="131,3" valueUnit="kg" />
        <ListRow to="#" chevron lines={2} title="Felső/alsó szplit – 12 hetes blokk" sub={<StatusLine tone="live" word="Aktív" meta="7 nap · 7 napos ciklus · 2026-07-13" />} />
        <ListRow
          to="#"
          lead={<MessageCircle />}
          title="kovacs.peter"
          trailing={
            <span className="flex items-center gap-2">
              <Dot />
              <FigureUnit step="data" tone="ink" value="5 perce" />
            </span>
          }
        />
      </RowStack>
    ),
  },
  {
    kit: 'ledgerRow',
    label: 'ledgerRow · two label + figure pairs on one baseline (admin-1)',
    node: (
      <RowStack open close>
        <LedgerRow label="Gyakorlat" value={1656} pair={{ label: 'Médiafájl', value: 3 }} />
        <LedgerRow label="Gyakorlat" value={null} pair={{ label: 'Médiafájl', value: null }} />
      </RowStack>
    ),
  },
  {
    kit: 'monogramMark',
    label: 'monogramMark · 96 (coach-chat-1) / 124 + lime dot / 124 + warn dot (client-detail-1)',
    node: (
      <div className="flex flex-wrap items-end gap-8">
        <Monogram initials="KP" size={96} />
        <Monogram initials="TD" size={124} dot dotLabel="owns the account" />
        <Monogram initials="TD" size={124} dot="warn" dotLabel="handover pending" />
      </div>
    ),
  },
  {
    kit: 'numeral',
    label: 'numeral · dot — giant "D" (style-studio-1 hero) / num "D" (the variant rail) / pending without the dot',
    node: (
      <div className="flex items-end gap-8">
        <Numeral size="giant" value="D" dot />
        <Numeral value="D" dot />
        <Numeral value="C" tone="pending" />
        <Numeral value="7" dot="warn" />
      </div>
    ),
  },
  {
    kit: 'segBar',
    label: 'segBar · slots: the cycle strip (plan-editor-1) / pressed, focus, disabled, busy, open (lime), empty slot',
    node: (
      <div className="flex flex-col gap-6">
        <SegmentBar label="7 napos ciklus" slots={CYCLE} />
        <SegmentBar label="7 napos ciklus" slots={CYCLE_STATES} />
        <div className="flex flex-col gap-2">
          <SegmentBar label="14 napos ciklus" slots={[...CYCLE, ...CYCLE].map((slot, index) => ({ ...slot, label: index + 1 }))} />
          <Caption>14 slots: the pitch stays, the strip scrolls</Caption>
        </div>
      </div>
    ),
  },
  {
    kit: 'macroColumns',
    label: 'macroColumns · tracks 4: a short last row keeps the column width (progress-1)',
    node: (
      <div className="flex flex-col gap-6">
        <MacroColumns
          tracks={4}
          columns={[
            { name: 'Mell', value: '102', unit: 'cm', caption: '2026-10-01' },
            { name: 'Derék', value: '84', unit: 'cm', caption: '2026-10-01' },
            { name: 'Csípő', value: '98', unit: 'cm', caption: '2026-10-01' },
            { name: 'Kar', value: '36,5', unit: 'cm', caption: '2026-10-01' },
          ]}
        />
        <MacroColumns
          tracks={4}
          columns={[
            { name: 'Comb', value: '58', unit: 'cm', caption: '2026-10-01' },
            { name: 'Vádli', value: '38', unit: 'cm', caption: '2026-10-01' },
          ]}
        />
      </div>
    ),
  },
  {
    kit: 'emptyState',
    label: 'emptyState · measure narrow: the body breaks at 312 (notifications-2)',
    node: <EmptyState measure="narrow" title="Nincs értesítés" body="Ha üzenetet kapsz vagy változik a terved, itt jelenik meg." />,
  },
  {
    kit: 'userPhoto',
    label: 'userPhoto · feather (post-detail-1 cover) / plain 2 pt radius',
    node: (
      <div className="flex flex-col gap-6">
        <UserPhoto src={SAMPLE} alt="" ratio={4 / 3} feather />
        <UserPhoto src={SAMPLE} alt="" ratio={16 / 9} className="w-40" />
      </div>
    ),
  },
];
