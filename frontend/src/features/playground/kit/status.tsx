import type { ReactNode } from 'react';
import { ToastBand } from '../../../ui/feedback/ToastHost';
import { Toast, type ToastData } from '../../../ui/feedback/variants/E12E16';
import { CommandPalette } from '../../../ui/shell/CommandPalette';
import { OfflineLine } from '../../../ui/shell/OfflineIndicator';

/*
 * The status zone's page of the kit specimen (`/playground`, kit section): the toast band, the
 * offline line and the command palette (lane SH2, package F13).
 *
 * The kit host collects every file in this folder with `import.meta.glob`; this one exports
 * `specimens`, one entry per cell. The Figma component board draws the toast inside its demo
 * screen ("root screen · showToast (before chrome) · 7 tabs", a cell of the shell lane's page); the
 * cells here hold the band on its own, in every form the frames and the contract need:
 *
 *   - the band as `style-studio-2` and the board draw it (insets 62 / 34: line 68-112, rule at 112,
 *     band 0-120), its countdown frozen at the drawn 232 of 354;
 *   - the record line of `workout-2` (the trophy in place of the dot);
 *   - the cap: three lines in one band, row rules between them, the strong rule closing it;
 *   - the actions in the states that need a finger or a keyboard (`force`, the same declarations
 *     as the real `:active` / `:focus-visible`);
 *   - the offline line: offline, offline with a queue, back online and draining;
 *   - the palette, open in place.
 *
 * States: a toast line has no disabled and no busy state (it is gone 4 s after it came, and its two
 * actions act at once); its Undo link and close button have rest, pressed and keyboard focus. The
 * offline line and the palette hold no control of their own but the palette's rows and field.
 *
 * Every countdown here is frozen (`still`) and nothing dismisses: a specimen must hold still while
 * it is photographed. The words are the frames' and the board's own.
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label (none of these is a cell of the Figma board). */
  label: string;
  node: ReactNode;
  /** The gap between the label and the nodes, in pt. */
  gap?: 12;
  /** The cell's width: a whole phone (402) for the band, the palette's own 560. */
  w?: 354 | 402 | 560;
}

const noop = () => {};

/** `style-studio-2` layer `Countdown`: 232 of 354 left at the moment it was drawn. */
const DRAWN = 232 / 354;

/**
 * The design's device for a band: insets 62 / 34, so the band pads 62 + 6 = 68 above its first
 * line (`--band-pad-t`), whatever this browser reports. 402 wide, as tall as the band.
 */
function Device({ h, children }: { h: number; children: ReactNode }) {
  return (
    <div className="relative w-[402px] overflow-hidden bg-surface-0 [--band-pad-t:68px]" style={{ height: h }}>
      {children}
    </div>
  );
}

const saved: ToastData = { id: 1, kind: 'success', message: 'Felszerelés mentve' };
const studio: ToastData = { id: 2, kind: 'success', message: 'E1 mostantól C változatot használ' };
const record: ToastData = { id: 3, kind: 'record', message: 'Új rekord' };
const failed: ToastData = { id: 4, kind: 'error', message: 'Nem sikerült menteni.' };
const deleted: ToastData = { id: 5, kind: 'info', message: 'Nap törölve', onUndo: noop };

/** One line on its own, in the 354 column, for the states of its actions. */
const Line = ({ toast, force }: { toast: ToastData; force?: Parameters<typeof Toast>[0]['force'] }) => (
  <Toast toast={toast} onDismiss={noop} still={DRAWN} force={force} />
);

export const specimens: KitSpecimen[] = [
  {
    kit: 'toastBand',
    label: 'toastBand · one line, saved (ok) + close — style-studio-2 / the board: line 68-112, rule 112, countdown 232 / 354',
    w: 402,
    node: (
      <Device h={120}>
        <ToastBand inline toasts={[studio]} onDismiss={noop} still={DRAWN} />
      </Device>
    ),
  },
  {
    kit: 'toastBand',
    label: 'toastBand · the record line (workout-2: the trophy in ink, no dot; the frame draws no countdown, so it is frozen at 0)',
    w: 402,
    node: (
      <Device h={120}>
        <ToastBand inline toasts={[record]} onDismiss={noop} still={0} />
      </Device>
    ),
  },
  {
    kit: 'toastBand',
    label: 'toastBand · the cap: three lines in one band — error, Undo, saved; row rules between, the strong rule closing',
    w: 402,
    node: (
      <Device h={210}>
        <ToastBand inline toasts={[failed, deleted, saved]} onDismiss={noop} still={DRAWN} />
      </Device>
    ),
  },
  {
    kit: 'toast',
    label: 'toast · Visszavonás: rest / pressed / keyboard focus · close: pressed / keyboard focus',
    node: (
      <div className="flex w-[354px] flex-col">
        <Line toast={deleted} />
        <Line toast={deleted} force={{ undo: 'pressed' }} />
        <Line toast={deleted} force={{ undo: 'focus' }} />
        <Line toast={saved} force={{ dismiss: 'pressed' }} />
        <Line toast={saved} force={{ dismiss: 'focus' }} />
      </div>
    ),
  },
  {
    kit: 'offlineLine',
    label: 'offlineLine · offline (warn) / offline + 3 waiting (one line, as the board) / back online, draining (ink)',
    w: 402,
    node: (
      <div className="flex w-[402px] flex-col gap-6 [--band-pad-t:0px]">
        <OfflineLine offline count={0} />
        <OfflineLine offline count={3} />
        <OfflineLine offline={false} count={3} sending />
      </div>
    ),
  },
  {
    kit: 'commandPalette',
    label: 'commandPalette · open in place (desktop only, Cmd+K): the sheet surface, the search line, rows on row rules',
    w: 560,
    node: <CommandPalette inline />,
  },
];
