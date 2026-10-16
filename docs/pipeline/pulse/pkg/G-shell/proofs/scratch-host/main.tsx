import { StrictMode, useEffect } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, EyeOff, Trash2, X } from 'lucide-react';
import './scratch.css';
import '@/i18n';
import GShellKit from '@/features/playground/kit/G-shell';
import { Monogram } from '@/ui/data/Monogram';
import { Pic } from '@/ui/media/Pic';
import { BottomNav, type NavTab } from '@/ui/nav/BottomNav';
import { Chip, ChipRow } from '@/ui/primitives/ChipRow';
import { Pressable } from '@/ui/primitives/Pressable';
import { TextLink } from '@/ui/primitives/TextLink';
import { Screen, ShellProvider } from '@/ui/shell/Screen';
import { ScreenHeader } from '@/ui/shell/ScreenHeader';

// G-shell scratch host — a proof tool, not product code. The lane's real files (the slot's
// frontend, the app's real CSS and fonts), each component placed where a frame's geometry export
// puts it, on a 402 pt page, so a capture at scale 2 can be laid over the frame's @2x picture.
// `?view=kit` draws the lane's whole specimen page. Every element with `data-measure` has its box
// written into `<pre id="boxes">` once the fonts are in, for `--dump-dom`.

const At = ({ x, y, w, children, m }: { x: number; y: number; w?: number; m?: string; children: ReactNode }) => (
  <div data-measure={m} style={{ position: 'absolute', left: x, top: y, width: w }}>
    {children}
  </div>
);

const BACK = ['Hátsó vállizom', 'Tricepsz', 'Alkar', 'Széles hátizom', 'Csuklyásizom', 'Alsó hát', 'Farizom', 'Combhajlító', 'Vádli', 'Nyak', 'Teljes test'];

const TABS: NavTab[] = [
  { to: '/', icon: 'home', label: 'Kezdőlap', end: true },
  { to: '/workout', icon: 'training', label: 'Edzés' },
  { to: '/nutrition', icon: 'nutrition', label: 'Étkezés' },
  { to: '/progress', icon: 'progress', label: 'Haladás' },
  { to: '/settings', icon: 'profile', label: 'Profil' },
];

const DEVICE =
  '[--tabbar-offset:36px] [--fade-h:130px] [--dock-b:104px] [--dock-b-bare:50px] [--head-top-root:72px] [--head-top-push:64px] [--status-bar-h:0px] [--viewport-h:874px] [--offline-h:0px] [--content-pad-b:92px]';

const view = new URLSearchParams(location.search).get('view') ?? 'kit';

const pages: Record<string, ReactNode> = {
  kit: (
    <div className="p-6" style={{ width: 860 }}>
      <GShellKit />
    </div>
  ),
  // workout-1 "Button/primary · Kész" 322,497 56 x 44; glyph/check 338,507 24
  'workout-1': (
    <At x={322} y={497} m="pill">
      <Pressable variant="primary" size="sm" shape="icon" aria-label="Kész">
        <Check aria-hidden />
      </Pressable>
    </At>
  ),
  // auth-1 "Button/reveal · masked" 334,550 44 x 44; glyph/eyeOff 359,562 20
  'auth-1': (
    <At x={334} y={550} m="reveal">
      <Pressable variant="link" shape="icon" glyph="field" aria-label="Jelszó megjelenítése" aria-pressed={false}>
        <EyeOff aria-hidden />
      </Pressable>
    </At>
  ),
  // nutrition-1 "Button/delete · Törlés" 334,748 44 x 44; glyph/x 362,760 20
  'nutrition-1': (
    <At x={334} y={748} m="delete">
      <Pressable variant="link" shape="icon" glyph="field" aria-label="Törlés">
        <X aria-hidden />
      </Pressable>
    </At>
  ),
  // plan-editor-2: Feljebb · disabled 218,767 · Lejjebb 262,767 · Gyakorlat eltávolítása 350,1001 (trash 60 %)
  // · Feljebb 218,1121 · Lejjebb 262,1121 · Blokk törlése 350,1121 (trash 100 %)
  'plan-editor-2': (
    <>
      <At x={218} y={767} m="up-off">
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Feljebb" disabled>
          <ArrowUp aria-hidden />
        </Pressable>
      </At>
      <At x={262} y={767} m="down">
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Lejjebb">
          <ArrowDown aria-hidden />
        </Pressable>
      </At>
      <At x={350} y={1001} m="trash-quiet">
        <Pressable variant="link" shape="icon" glyph="sm" tone="dangerQuiet" aria-label="Gyakorlat eltávolítása">
          <Trash2 aria-hidden />
        </Pressable>
      </At>
      <At x={218} y={1121} m="up">
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Feljebb">
          <ArrowUp aria-hidden />
        </Pressable>
      </At>
      <At x={262} y={1121} m="down2">
        <Pressable variant="link" shape="icon" glyph="sm" tone="faint" aria-label="Lejjebb">
          <ArrowDown aria-hidden />
        </Pressable>
      </At>
      <At x={350} y={1121} m="trash">
        <Pressable variant="link" shape="icon" glyph="sm" tone="danger" aria-label="Blokk törlése">
          <Trash2 aria-hidden />
        </Pressable>
      </At>
    </>
  ),
  // compose-profile-1 "Button/identity line · closed" 24,310 210 x 44 (Regular 16/22 #a9b09d, chevron 221,324)
  'compose-profile-1': (
    <At x={24} y={310} m="identity-closed">
      <TextLink text="body" weight="regular" tone="quiet" trail={<ChevronDown aria-hidden />} aria-expanded={false}>
        @kovacs-peter · Budapest
      </TextLink>
    </At>
  ),
  // compose-profile-2: open 24,310 (text-1, chevron-up) · "Név módosítása" SemiBold 24,644 · "Mégse" 172,644
  'compose-profile-2': (
    <>
      <At x={24} y={310} m="identity-open">
        <TextLink text="body" weight="regular" trail={<ChevronUp aria-hidden />} aria-expanded>
          @kovacs-peter · Budapest
        </TextLink>
      </At>
      <At x={24} y={644} m="strong">
        <TextLink text="body" weight="strong">
          Név módosítása
        </TextLink>
      </At>
      <At x={172} y={644} m="cancel">
        <TextLink text="body">Mégse</TextLink>
      </At>
    </>
  ),
  // coins-1 "Button/price" 323,511 55 x 44: coin 20 at 323,523, "250" Geist Mono Medium 16/20 at 349,523
  'coins-1': (
    <At x={323} y={511} m="price">
      <TextLink text="data" lead={<Pic slot="coin" width={20} loading="eager" lightsOn={false} />}>
        250
      </TextLink>
    </At>
  ),
  // compose-hub-1 "Header" 24,64 354 x 82: Identity row 44 + title at 112
  'compose-hub-1': (
    <At x={24} y={64} w={354} m="header">
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
    </At>
  ),
  // library-3: the chips at y 537, words from x 24, the line bleeding off the right edge,
  // back side, "Széles hátizom" chosen → scrolled 135.
  'library-3': (
    <At x={0} y={537} w={402} m="rail">
      <div className="overflow-x-clip px-6">
        <ChipRow label="Izomcsoport" role="radiogroup" scroll="bleed">
          {BACK.map((name) => (
            <Chip key={name} role="radio" selected={name === 'Széles hátizom'}>
              {name}
            </Chip>
          ))}
        </ChipRow>
      </div>
    </At>
  ),
  // workout-1, the one-viewport law: the column 72 → 754 (28 above the bar at 782).
  'fixed': (
    <ShellProvider tabs>
      <div className={`relative h-[874px] w-[402px] overflow-hidden bg-surface-0 ${DEVICE}`}>
        <Screen top="root" gap="none" fill="fixed" bottom="near" data-measure="scaffold" data-self="">
            <div data-measure="head" data-self="" className="h-11 shrink-0" />
            <ol data-measure="scroller" data-self="" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {Array.from({ length: 20 }, (_, i) => (
                <li key={i} className="text-body-m flex h-16 shrink-0 items-center text-text-1">
                  {i + 1}
                </li>
              ))}
            </ol>
            <div data-measure="closing" data-self="" className="h-[88px] shrink-0" />
          </Screen>
        <BottomNav inline tabs={TABS} at="/workout" />
      </div>
    </ShellProvider>
  ),
};

function Measure() {
  useEffect(() => {
    void document.fonts.ready.then(() =>
      setTimeout(() => {
        const boxes: Record<string, unknown> = {};
        document.querySelectorAll<HTMLElement>('[data-measure]').forEach((el) => {
          const target = el.hasAttribute('data-self') ? el : ((el.firstElementChild as HTMLElement | null) ?? el);
          const r = target.getBoundingClientRect();
          boxes[el.dataset.measure!] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10);
        });
        const svgs: Record<string, unknown> = {};
        document.querySelectorAll<HTMLElement>('[data-measure] svg, [data-measure] img').forEach((el, i) => {
          const r = el.getBoundingClientRect();
          svgs[`${el.closest<HTMLElement>('[data-measure]')!.dataset.measure}#${i}`] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10);
        });
        document.querySelectorAll<HTMLElement>('[data-part="identity"] > *, [data-kind="identity"] h1').forEach((el, i) => {
          const r = el.getBoundingClientRect();
          boxes[`identity#${i}:${(el.textContent ?? '').slice(0, 16)}`] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10);
        });
        const rail = document.querySelector<HTMLElement>('[data-kit="chipRow"]');
        const pre = document.createElement('pre');
        pre.id = 'boxes';
        pre.style.display = 'none';
        pre.textContent = JSON.stringify({ boxes, glyphs: svgs, railScroll: rail?.scrollLeft ?? null });
        document.body.appendChild(pre);
      }, 600),
    );
  }, []);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <div style={{ position: 'relative', width: view === 'kit' ? 860 : 402, minHeight: 874 }} className="bg-surface-0">
        {pages[view]}
      </div>
      <Measure />
    </MemoryRouter>
  </StrictMode>,
);
