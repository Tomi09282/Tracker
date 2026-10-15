import { Ban, Bell, ChevronRight, Palette, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Stepper } from '../../../ui/data/SegmentBar';
import { ToastBand } from '../../../ui/feedback/ToastHost';
import { BottomNav } from '../../../ui/nav/BottomNav';
import type { NavTab } from '../../../ui/nav/BottomNav';
import { Pressable } from '../../../ui/primitives/Pressable';
import { TextLink } from '../../../ui/primitives/TextLink';
import { Dock } from '../../../ui/shell/Dock';
import { Screen, ShellProvider } from '../../../ui/shell/Screen';
import { ScreenHeader } from '../../../ui/shell/ScreenHeader';

/*
 * The shell lane's page of the kit specimen (`/playground`, kit section): the tab bar and its
 * fade, the screen scaffold, the four headers and the docked action.
 *
 * The kit host collects every file in this folder with `import.meta.glob`. This one offers both
 * shapes a host can want: `specimens` — one entry per cell, a mono label and the nodes — and a
 * default component that lays those cells out itself.
 *
 * The first four cells ARE cells of the Figma component board (`Pulse — Components`): the three
 * tab strips of the row "Tab bar" (402 wide, the bar at the top of a 92 strip, the label 12 above
 * it) and `screenHead · greet / root / push` of column 2 (24 between the label and the first
 * header, and between headers) — label for label, word for word, so a capture can be laid over
 * `_components-3.png` / `-4.png`. The cells after them hold what the board does not draw and the
 * lane rules ask for: the pressed and keyboard-focused tab, the category header, the pushed header
 * with a trailing node and bare, the back control's states, whole screens with the chrome and the
 * docked action.
 *
 * A "phone" here is a `relative` box that stands in for the device: it sets the design's insets
 * (62 / 34) as the shell tokens that depend on them, so the inline bar, the fade, the dock and the
 * scaffold sit exactly where the frames draw them, whatever this browser reports.
 *
 * States: a tab has rest, lit, pressed and keyboard focus — there is no disabled or busy tab. The
 * back control has rest, pressed and keyboard focus. `force` holds a state that needs a finger or a
 * keyboard, with the same declarations as the real `:active` / `:focus-visible`. The scaffold, the
 * header and the dock themselves have no state: they hold what a screen gives them.
 *
 * What the header and the dock HOLD is the actions lane's (F6): the bare icon button, the text link
 * and the lime pill, used exactly as the frames use them. The count on the bell is the selection
 * lane's `BadgeCount` (F8) and is not drawn until that lane lands.
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. For a cell of the Figma board it is the board's label, verbatim. */
  label: string;
  node: ReactNode;
  /** The board's gap between the label and the first node, in pt: 12 unless the cell says 24. */
  gap?: 12 | 24;
  /** The cell's width on the board: a 354 column, or 402 for a whole strip or screen. */
  w?: 354 | 402;
}

/* ── the sample data of the board ──────────────────────────────────────────────────────────────── */

const TAB = {
  home: { to: '/', icon: 'home', label: 'Kezdőlap', end: true },
  training: { to: '/workout', icon: 'training', label: 'Edzés' },
  nutrition: { to: '/nutrition', icon: 'nutrition', label: 'Étkezés' },
  progress: { to: '/progress', icon: 'progress', label: 'Haladás' },
  coach: { to: '/coach', icon: 'coach', label: 'Edző' },
  admin: { to: '/admin', icon: 'admin', label: 'Admin' },
  profile: { to: '/settings', icon: 'profile', label: 'Profil' },
} as const satisfies Record<string, NavTab>;

const MEMBER: NavTab[] = [TAB.home, TAB.training, TAB.nutrition, TAB.progress, TAB.profile];
const COACH: NavTab[] = [TAB.home, TAB.training, TAB.nutrition, TAB.progress, TAB.coach, TAB.profile];
const ADMIN: NavTab[] = [TAB.home, TAB.training, TAB.nutrition, TAB.progress, TAB.coach, TAB.admin, TAB.profile];

/* ── the device ────────────────────────────────────────────────────────────────────────────────── */

/**
 * The design's device for one specimen: insets 62 / 34, so the bar stands 36 above the bottom
 * (y 782-838 in a 874 frame), the fade is 130, a dock ends 104 (with tabs) or 50 (without) above
 * the bottom, and a header starts at 72 (root) or 64 (pushed). The status-bar mask a `Screen`
 * mounts is pinned to the real viewport, so inside a specimen it is zero tall.
 */
const DEVICE =
  '[--tabbar-offset:36px] [--fade-h:130px] [--dock-b:104px] [--dock-b-bare:50px] [--head-top-root:72px] [--head-top-push:64px] [--status-bar-h:0px] [--band-pad-t:68px]';

/** A 402 wide strip as tall as the bar and its distance from the edge: the board's "Tab strip". */
function Strip({ children }: { children: ReactNode }) {
  return <div className={`relative h-[92px] w-[402px] overflow-hidden bg-surface-0 ${DEVICE}`}>{children}</div>;
}

/** A 402 x 600 screen, as the board's "Screens" row draws them. */
function Phone({ tabs, children }: { tabs: boolean; children: ReactNode }) {
  return (
    <ShellProvider tabs={tabs}>
      <div className={`relative h-[600px] w-[402px] overflow-hidden bg-surface-0 ${DEVICE}`}>{children}</div>
    </ShellProvider>
  );
}

/* ── what the frames put in a header row and a dock (the actions lane, F6) ──────────────────────── */

const BellButton = () => (
  <Pressable variant="link" shape="icon" aria-label="Értesítések">
    <Bell aria-hidden />
  </Pressable>
);

const SearchButton = () => (
  <Pressable variant="link" shape="icon" aria-label="Keresés">
    <Search aria-hidden />
  </Pressable>
);

const Pill = ({ children }: { children: ReactNode }) => (
  <Pressable variant="primary" size="lg" className="w-full">
    {children}
  </Pressable>
);

/* ── the cells ─────────────────────────────────────────────────────────────────────────────────── */

const Col = ({ children }: { children: ReactNode }) => <div className="flex w-[354px] flex-col gap-6">{children}</div>;

export const specimens: KitSpecimen[] = [
  {
    kit: 'tabBar',
    label: '5 · member · inset 10 · cell 76.4',
    w: 402,
    node: (
      <Strip>
        <BottomNav inline tabs={MEMBER} at="/" />
      </Strip>
    ),
  },
  {
    kit: 'tabBar',
    label: '6 · coach · inset 12 · cell 63.0',
    w: 402,
    node: (
      <Strip>
        <BottomNav inline tabs={COACH} at="/coach" />
      </Strip>
    ),
  },
  {
    kit: 'tabBar',
    label: '7 · admin · inset 8 · cell 55.1 · icon 28',
    w: 402,
    node: (
      <Strip>
        <BottomNav inline tabs={ADMIN} at="/admin" />
      </Strip>
    ),
  },
  {
    kit: 'screenHead',
    label: 'screenHead · greet / root / push',
    gap: 24,
    node: (
      <Col>
        <ScreenHeader kind="greet" title="Szia!" sub="Péntek, október 9." trailing={<BellButton />} />
        <ScreenHeader kind="root" title="Gyakorlatok" trailing={<SearchButton />} />
        <ScreenHeader kind="push" title="Fekvenyomás" back={{ to: '/library', label: 'Gyakorlatok' }} />
      </Col>
    ),
  },
  {
    kit: 'scaffold',
    label: 'root screen · showToast (before chrome) · 7 tabs',
    w: 402,
    node: (
      <Phone tabs>
        <Screen top="root">
          <ScreenHeader kind="root" title="Gyakorlatok" trailing={<SearchButton />} />
        </Screen>
        {/* The status zone's band (F13), drawn before the chrome as the board does: "Felszerelés mentve", ok. The board draws no countdown on its rule, so it is frozen at 0. */}
        <ToastBand inline toasts={[{ id: 1, kind: 'success', message: 'Felszerelés mentve' }]} onDismiss={() => {}} still={0} />
        <BottomNav inline tabs={ADMIN} at="/library" />
      </Phone>
    ),
  },
  {
    kit: 'scaffold',
    label: 'pushed screen · bottomSheet over the scrim (after chrome) — the one surface',
    w: 402,
    node: (
      <Phone tabs>
        <Screen top="push">
          <ScreenHeader kind="push" title="Beállítások" back={{ to: '/settings', label: 'Profil' }} />
        </Screen>
        <BottomNav inline tabs={MEMBER} at="/settings" />
      </Phone>
    ),
  },
  {
    kit: 'dockAction',
    label: 'flow screen · stepper · no tabs · dockAction (after chrome)',
    w: 402,
    node: (
      <Phone tabs={false}>
        <Screen top="push" gap="tight">
          <Stepper label="Kérdőív" value={2} total={5} />
          <ScreenHeader kind="push" title="Tapasztalat" back={{ to: '/onboarding', label: 'Kérdőív' }} />
        </Screen>
        <Dock inline>
          <Pill>Tovább</Pill>
        </Dock>
      </Phone>
    ),
  },
  {
    kit: 'tabBar',
    label:
      'tabBar · rest / lit (Kezdőlap) / pressed (Edzés, icon 60 %) / keyboard focus (Étkezés) — a tab has no disabled or busy state',
    w: 402,
    node: (
      <Strip>
        <BottomNav inline tabs={MEMBER} at="/" force={{ pressed: '/workout', focus: '/nutrition' }} />
      </Strip>
    ),
  },
  {
    kit: 'screenHead',
    label:
      'screenHead · section + trailing link / section, tight / push + trailing node / push, bare / back: pressed, keyboard focus',
    gap: 24,
    node: (
      <Col>
        <ScreenHeader
          kind="section"
          eyebrow="Adminisztráció"
          title="Áttekintés"
          trailing={
            <TextLink lead={<Palette aria-hidden />} trail={<ChevronRight aria-hidden />}>
              Stílus stúdió
            </TextLink>
          }
        />
        <ScreenHeader kind="section" tight eyebrow="Tervezés" title="Edzéstervek" />
        <ScreenHeader
          kind="push"
          back={{ to: '/coach', label: 'Klienseim' }}
          trailing={<TextLink lead={<Ban aria-hidden />}>Letiltás</TextLink>}
        />
        <ScreenHeader kind="push" title="Piactér" back={{ to: '/m', label: 'Vissza', bare: true }} />
        <ScreenHeader kind="push" back={{ to: '/settings', label: 'Profil', force: 'pressed' }} />
        <ScreenHeader kind="push" back={{ to: '/settings', label: 'Profil', force: 'focus' }} />
      </Col>
    ),
  },
  {
    kit: 'dockAction',
    label: 'dockAction · with tabs: the action 12 above the bar (104 above the edge), over the bar’s fade',
    w: 402,
    node: (
      <Phone tabs>
        <Screen top="push">
          <ScreenHeader kind="push" title="Takács Dániel" back={{ to: '/coach', label: 'Klienseim' }} />
        </Screen>
        <Dock inline>
          <Pill>Küldés</Pill>
        </Dock>
        <BottomNav inline tabs={COACH} at="/coach" />
      </Phone>
    ),
  },
];

export default function ShellKit() {
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
