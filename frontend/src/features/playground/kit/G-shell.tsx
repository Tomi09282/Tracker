import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Eye, EyeOff, Trash2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Monogram } from '../../../ui/data/Monogram';
import { Pic } from '../../../ui/media/Pic';
import { BottomNav, useNavTabs } from '../../../ui/nav/BottomNav';
import { Chip, ChipRow } from '../../../ui/primitives/ChipRow';
import { Pressable, PressableLink, UnlitPills } from '../../../ui/primitives/Pressable';
import { TextLink } from '../../../ui/primitives/TextLink';
import { Screen, ShellProvider } from '../../../ui/shell/Screen';
import { ScreenHeader } from '../../../ui/shell/ScreenHeader';

/*
 * The G-shell gap lane's page of the kit specimen (`/playground`, kit section): the additions to the
 * actions (`control()`, `Pressable`, `TextLink`), the shell (`Screen fill="fixed"`, `bottom`,
 * `ScreenHeader kind="identity"`) and the selection (`ChipRow scroll`) — reference
 * `docs/pipeline/pulse/kit/G-shell.md`.
 *
 * The Figma component board has no cell for any of these (they are the frames' own uses), so every
 * cell is listed after the board, and each one is drawn as the FRAME draws it, with the frame's
 * words, so a capture can be laid over the frame's crop: the check pill of workout-1, the reveal of
 * auth-1, the delete cross of nutrition-1, the glyph cluster of plan-editor-1 / -2, the identity
 * line of compose-profile-1 / -2, the price of coins-1, the identity header of compose-hub-1 and the
 * rail of library-3.
 *
 * States: rest, pressed and keyboard focus are held with `data-force` (the recipe answers to it
 * with the same declarations as `:active` / `:focus-visible`); disabled and busy are the real props.
 * The scaffold, the header and the rail hold what a screen gives them and have no state of their
 * own beyond the rail's scroll.
 *
 * Internal QA page: never translated (check-i18n exempts `features/playground/`).
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. */
  label: string;
  node: ReactNode;
  gap?: 12 | 24;
  w?: 354 | 402;
}

const Row = ({ children, gap = 'gap-4' }: { children: ReactNode; gap?: 'gap-4' | 'gap-5' | 'gap-6' }) => (
  <div className={`flex flex-wrap items-center ${gap}`}>{children}</div>
);

const Col = ({ children }: { children: ReactNode }) => <div className="flex w-[354px] flex-col gap-6">{children}</div>;

/** A 354 line with a hairline under it, standing in for the field / row a trailing glyph ends. */
const FieldLine = ({ children, value }: { children: ReactNode; value: string }) => (
  <div className="flex h-11 w-[354px] items-center justify-between border-b border-[var(--surface-border)]">
    <span className="text-body text-text-1">{value}</span>
    {children}
  </div>
);

/* ── the rail: library-3 (back side, "Széles hátizom" chosen) ─────────────────────────────────── */

const BACK = ['Hátsó vállizom', 'Tricepsz', 'Alkar', 'Széles hátizom', 'Csuklyásizom', 'Alsó hát', 'Farizom', 'Combhajlító', 'Vádli', 'Nyak', 'Teljes test'];

function Rail({ initial }: { initial: string | null }) {
  const [chosen, setChosen] = useState<string | null>(initial);
  return (
    <div className="w-[402px] overflow-x-clip px-6">
      <ChipRow label="Izomcsoport" role="radiogroup" scroll="bleed">
        {BACK.map((name) => (
          <Chip key={name} role="radio" selected={chosen === name} onClick={() => setChosen((cur) => (cur === name ? null : name))}>
            {name}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}

/* ── the fixed scaffold: a whole 402 x 874 device ──────────────────────────────────────────────── */

const DEVICE =
  '[--tabbar-offset:36px] [--fade-h:130px] [--dock-b:104px] [--dock-b-bare:50px] [--head-top-root:72px] [--head-top-push:64px] [--status-bar-h:0px] [--viewport-h:874px] [--offline-h:0px] [--content-pad-b:92px]';

/** The column of a one-viewport screen: a header, ONE inner scroller, a closing block on the bar. */
function FixedPhone() {
  return (
    <ShellProvider tabs>
      <div className={`relative h-[874px] w-[402px] overflow-hidden bg-surface-0 ${DEVICE}`}>
        <Screen top="root" gap="none" fill="fixed" bottom="near">
          <ScreenHeader kind="root" title="Edzés" />
          <ol data-part="scroller" className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto border-y border-[var(--surface-border)]">
            {Array.from({ length: 14 }, (_, i) => (
              <li key={i} className="text-body-m flex h-16 shrink-0 items-center border-b border-[var(--surface-border)] text-text-1">
                {i + 1}. sorozat
              </li>
            ))}
          </ol>
          <div data-part="closing" className="text-cap flex h-[88px] shrink-0 items-end text-text-2">
            az utolsó blokk: 28 pt-tal a sáv fölött
          </div>
        </Screen>
        <BottomNav inline tabs={useNavTabs('user')} at="/workout" />
      </div>
    </ShellProvider>
  );
}

/* ── the cells ─────────────────────────────────────────────────────────────────────────────────── */

export const specimens: KitSpecimen[] = [
  {
    kit: 'btnPrimary',
    label: 'G-shell · icon pill sm (workout-1 "Kész") · rest / pressed / disabled / busy / keyboard focus · lg',
    node: (
      <Row>
        <Pressable variant="primary" size="sm" shape="icon" aria-label="Kész">
          <Check aria-hidden />
        </Pressable>
        <Pressable variant="primary" size="sm" shape="icon" aria-label="Kész" data-force="pressed">
          <Check aria-hidden />
        </Pressable>
        <Pressable variant="primary" size="sm" shape="icon" aria-label="Kész" disabled>
          <Check aria-hidden />
        </Pressable>
        <Pressable variant="primary" size="sm" shape="icon" aria-label="Kész" busy>
          <Check aria-hidden />
        </Pressable>
        <Pressable variant="primary" size="sm" shape="icon" aria-label="Kész" data-force="focus">
          <Check aria-hidden />
        </Pressable>
        <Pressable variant="primary" size="lg" shape="icon" aria-label="Kész">
          <Check aria-hidden />
        </Pressable>
      </Row>
    ),
  },
  {
    kit: 'btnPrimary',
    label: 'G-shell · unlit pill (lit={false}, UnlitPills) · rest / pressed / disabled / keyboard focus — PressableLink pill · rest / disabled / keyboard focus',
    gap: 24,
    node: (
      <div className="flex flex-col gap-6">
        <Row>
          <Pressable variant="primary" size="sm" lit={false}>
            Save
          </Pressable>
          <Pressable variant="primary" size="sm" lit={false} data-force="pressed">
            Save
          </Pressable>
          <Pressable variant="primary" size="sm" lit={false} disabled>
            Save
          </Pressable>
          <UnlitPills>
            <Pressable variant="primary" size="sm" data-force="focus">
              Save
            </Pressable>
          </UnlitPills>
        </Row>
        <Row>
          <PressableLink to="/login" variant="primary" size="lg">
            Belépés
          </PressableLink>
          <PressableLink to="/login" variant="primary" size="sm" disabled>
            Belépés
          </PressableLink>
          <PressableLink to="/login" variant="primary" size="sm" data-force="focus">
            Belépés
          </PressableLink>
        </Row>
      </div>
    ),
  },
  {
    kit: 'iconBtn',
    label: 'G-shell · glyph="field" (auth-1 reveal, nutrition-1 delete) · masked / revealed / pressed / disabled / keyboard focus / danger',
    node: (
      <Col>
        <FieldLine value="••••••••">
          <Pressable variant="link" shape="icon" glyph="field" aria-label="Jelszó megjelenítése" aria-pressed={false}>
            <EyeOff aria-hidden />
          </Pressable>
        </FieldLine>
        <FieldLine value="titok123">
          <Pressable variant="link" shape="icon" glyph="field" aria-label="Jelszó elrejtése" aria-pressed>
            <Eye aria-hidden />
          </Pressable>
        </FieldLine>
        <FieldLine value="Zabpehely · 80 g">
          <Pressable variant="link" shape="icon" glyph="field" aria-label="Törlés" data-force="pressed">
            <X aria-hidden />
          </Pressable>
        </FieldLine>
        <FieldLine value="Zabpehely · 80 g">
          <Pressable variant="link" shape="icon" glyph="field" aria-label="Törlés" disabled>
            <X aria-hidden />
          </Pressable>
        </FieldLine>
        <FieldLine value="Zabpehely · 80 g">
          <Pressable variant="link" shape="icon" glyph="field" aria-label="Törlés" data-force="focus">
            <X aria-hidden />
          </Pressable>
        </FieldLine>
        <FieldLine value="Zabpehely · 80 g">
          <Pressable variant="link" shape="icon" glyph="field" tone="danger" aria-label="Törlés">
            <Trash2 aria-hidden />
          </Pressable>
        </FieldLine>
      </Col>
    ),
  },
  {
    kit: 'iconBtn',
    label: 'G-shell · glyph="sm" (plan-editor-2) · faint up / down / up disabled / danger trash / dangerQuiet trash / pressed / keyboard focus',
    node: (
      <Row gap="gap-4">
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Feljebb">
          <ArrowUp aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Lejjebb">
          <ArrowDown aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Feljebb" disabled>
          <ArrowUp aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" glyph="sm" tone="danger" aria-label="Blokk törlése">
          <Trash2 aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" glyph="sm" tone="dangerQuiet" aria-label="Gyakorlat eltávolítása">
          <Trash2 aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Lejjebb" data-force="pressed">
          <ArrowDown aria-hidden />
        </Pressable>
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Lejjebb" data-force="focus">
          <ArrowDown aria-hidden />
        </Pressable>
      </Row>
    ),
  },
  {
    kit: 'textLink',
    label: 'G-shell · textLink: identity line closed (quiet, regular) / open / strong / data + coin · pressed / disabled / busy / keyboard focus',
    node: (
      <div className="flex flex-col gap-5">
        <TextLink text="body" weight="regular" tone="quiet" trail={<ChevronDown aria-hidden />} aria-expanded={false}>
          @kovacs-peter · Budapest
        </TextLink>
        <TextLink text="body" weight="regular" trail={<ChevronUp aria-hidden />} aria-expanded>
          @kovacs-peter · Budapest
        </TextLink>
        <Row gap="gap-6">
          <TextLink text="body" weight="strong">
            Név módosítása
          </TextLink>
          <TextLink text="body">Mégse</TextLink>
        </Row>
        <Row gap="gap-6">
          <TextLink text="data" lead={<Pic slot="coin" width={20} />}>
            250
          </TextLink>
          <TextLink text="data" lead={<Pic slot="coin" width={20} />} data-force="pressed">
            250
          </TextLink>
          <TextLink text="data" lead={<Pic slot="coin" width={20} />} disabled>
            250
          </TextLink>
          <TextLink text="data" lead={<Pic slot="coin" width={20} />} busy>
            250
          </TextLink>
          <TextLink text="data" lead={<Pic slot="coin" width={20} />} data-force="focus">
            250
          </TextLink>
        </Row>
      </div>
    ),
  },
  {
    kit: 'screenHead',
    label: 'G-shell · screenHead identity (compose-hub-1) · with status trailing / without lead and handle',
    gap: 24,
    node: (
      <Col>
        <ScreenHeader
          kind="identity"
          lead={<Monogram initials="KP" size={28} />}
          name="Kovács Péter"
          handle="@kovacs-peter"
          title="Piactéri pult"
          trailing={
            <TextLink lead={<i aria-hidden className="block size-1.5 rounded-full bg-accent" />} trail={<ChevronDown aria-hidden />}>
              Élő
            </TextLink>
          }
        />
        <ScreenHeader kind="identity" name="Kovács Péter" title="Piactéri pult" />
      </Col>
    ),
  },
  {
    kit: 'chipRow',
    label: 'G-shell · chipRow scroll="bleed" (library-3) · "Széles hátizom" chosen on open: the line scrolls 135, "Tricepsz" on the gutter',
    w: 402,
    node: <Rail initial="Széles hátizom" />,
  },
  {
    kit: 'chipRow',
    label: 'G-shell · chipRow scroll="bleed" · nothing chosen (no scroll)',
    w: 402,
    node: <Rail initial={null} />,
  },
  {
    kit: 'scaffold',
    label: 'G-shell · scaffold fill="fixed" bottom="near" · 402 x 874: the column is 782, one inner scroller, the last block ends at 754',
    w: 402,
    node: <FixedPhone />,
  },
];

export default function GShellKit() {
  return (
    <div className="flex flex-wrap items-start gap-x-[7px] gap-y-12">
      {specimens.map((specimen) => (
        <section
          key={specimen.label}
          className={`flex flex-col ${specimen.gap === 24 ? 'gap-6' : 'gap-3'} ${specimen.w === 402 ? 'w-[402px]' : 'w-[354px]'}`}
        >
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}
