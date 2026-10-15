import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Check, EyeOff } from 'lucide-react';
import { Field } from '../../../ui/primitives/Field';

/*
 * The inputs lane's page of the kit specimen (`/playground`, kit section) — package F12, stage 1.
 *
 * The kit host collects every file in this folder with `import.meta.glob`, so being listed costs
 * no edit to a shared file. Same two shapes as the media page: `specimens` — one entry per cell of
 * the Figma component board (a mono label, then the nodes) — and a default component that lays
 * those cells out itself, 354 wide, the way `app-components.body.js` does.
 *
 * The first cell is the board's own `inputField` cell (board y 1645-2139, `_components-2.png`):
 * the same five fields in the same order, with the board's strings where `hu.json` has them. The
 * second cell is not on the board: it shows the field the way the frames use it — the marker
 * (compose-post / compose-profile), the plain hint and a trailing control (auth-2), a leading
 * glyph (progress-3).
 *
 * States: rest, focus (the field marked `data-specimen="focus"` — the capture focuses it with the
 * keyboard, which is also the keyboard-focus specimen), error, disabled, empty. A field has no
 * pressed and no busy state: pressing a field focuses it, and an in-flight check belongs to the
 * field's caller (`FeedbackField`, stage 2).
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. The first one is the label of the Figma board, verbatim. */
  label: string;
  /** The board cell's gap between the label and the nodes and between the nodes (pt). Default 12. */
  gap?: number;
  node: ReactNode;
}

/** The board's `inputField` cell: idle (with hint) · focus · error · disabled · empty. */
function BoardFields() {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('settings.displayName')} defaultValue="Takács Dániel" hint={t('settings.displayNameHint')} />
      <Field label={t('settings.displayName')} defaultValue="Takács Dán" data-specimen="focus" />
      <Field label={t('auth.email')} defaultValue="takacs.daniel@pelda" error={t('auth.errors.emailFormat')} />
      <Field label={t('auth.email')} defaultValue="takacs.daniel@pelda.hu" disabled />
      <Field label={t('auth.password')} placeholder={t('auth.passwordPlaceholder')} type="password" />
    </>
  );
}

/** The field as the frames compose it: marker, plain hint, trailing control, leading glyph. */
function FrameFields() {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('compose.displayName')} defaultValue="Kovács Péter" marker={t('compose.required')} />
      <Field
        label={t('compose.headline')}
        defaultValue="Erőnléti edző · 12 év tapasztalat"
        marker={t('compose.optional')}
        markerTone="quiet"
        hint={t('compose.headlineHint')}
      />
      <Field
        label={t('auth.email')}
        type="email"
        defaultValue="takacs.daniel@pelda.hu"
        trailing={
          // auth-2 "Mark/format ok": a 16 pt tick in `success`, its ink on the right edge.
          <span aria-hidden className="text-success [&_svg]:size-4 [&_svg]:stroke-[2.25]">
            <Check />
          </span>
        }
      />
      <Field
        label={t('auth.password')}
        type="password"
        defaultValue="Pulse-specimen-1"
        hint={t('auth.passwordRules')}
        hintTone="plain"
        trailing={
          // auth-2 "Button/reveal": a 44 pt frame, the 20 pt glyph against the right edge. On the screen it is
          // the actions kit's icon button (`Pressable variant="link" shape="icon"` with its own aria-label);
          // here only its place on the line is shown, so it is a drawing, not a control.
          <span aria-hidden className="flex size-11 items-center justify-end text-text-2 [&_svg]:size-5 [&_svg]:stroke-[1.75]">
            <EyeOff />
          </span>
        }
      />
      <Field label={t('progress.on')} type="text" defaultValue="2026. okt. 9." leading={<CalendarDays />} />
    </>
  );
}

const Column = ({ gap, children }: { gap: 'gap-3' | 'gap-5'; children: ReactNode }) => (
  <div className={`flex w-full flex-col ${gap}`}>{children}</div>
);

export const specimens: KitSpecimen[] = [
  {
    kit: 'inputField',
    label: 'inputField · idle / focus / error / disabled / empty',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <BoardFields />
      </Column>
    ),
  },
  {
    kit: 'inputField',
    label: 'inputField · in the frames: marker required / optional · rule hint · trailing tick / reveal · leading glyph',
    gap: 20,
    node: (
      <Column gap="gap-5">
        <FrameFields />
      </Column>
    ),
  },
];

export default function InputsKit() {
  return (
    <div className="flex w-[354px] max-w-full flex-col gap-8">
      {specimens.map((specimen) => (
        <section key={specimen.label} className={`flex flex-col ${specimen.gap === 20 ? 'gap-5' : 'gap-3'}`}>
          <p className="text-micro text-text-3">{specimen.label}</p>
          {specimen.node}
        </section>
      ))}
    </div>
  );
}
