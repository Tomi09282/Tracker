import type { ReactNode } from 'react';
import { EQUIPMENT_STILL, PULSE_SLOTS, TAB_ICON_KEYS, pulseSrcSet, tabIconSlot } from '../../../assets/pulse';
import type { PulseSlot } from '../../../assets/pulse';
import { Pic } from '../../../ui/media/Pic';
import { UserPhoto } from '../../../ui/media/UserPhoto';

/*
 * The media lane's page of the kit specimen (`/playground`, kit section).
 *
 * The kit host collects every file in this folder with `import.meta.glob`, so being listed costs
 * no edit to a shared file. This one offers both shapes a host can want: `specimens` — one entry
 * per cell of the Figma component board (a mono label, then the nodes) — and a default component
 * that lays those cells out itself.
 *
 * Nothing here is interactive, so there is no pressed, disabled, busy or focus state to show. The
 * states an image HAS are shown instead: idle and lit, locked and earned, cropped and whole, in
 * colour and without.
 */

export interface KitSpecimen {
  /** The `data-kit` name of the component the cell shows. */
  kit: string;
  /** The cell's label. The first one is the label of the Figma board, verbatim. */
  label: string;
  node: ReactNode;
}

const Row = ({ gap, children }: { gap: 'gap-4' | 'gap-6' | 'gap-8'; children: ReactNode }) => (
  <div className={`flex flex-wrap items-center ${gap}`}>{children}</div>
);

/** The distinct stills, in the order the equipment table first names them. */
const STILLS = [...new Set(Object.values(EQUIPMENT_STILL).filter((slot): slot is PulseSlot => slot !== null))];

const HEROES = (Object.keys(PULSE_SLOTS) as PulseSlot[]).filter((slot) => PULSE_SLOTS[slot].family === 'hero');

/** A stand-in for an upload: the one opaque image the product ships. A real one comes from the API. */
const SAMPLE = pulseSrcSet('texture-monogram').src;

export const specimens: KitSpecimen[] = [
  {
    kit: 'pic',
    label: 'pic · glow still (LIGHTEN, no frame) / 48 pt thumbs / cutouts (fit) / the mannequin',
    node: (
      <div className="flex flex-col items-start gap-3">
        <Pic slot="hero-grip" width={216} />
        <Row gap="gap-4">
          <Pic slot="equip-barbell" width={48} />
          <Pic slot="equip-machine" width={48} />
          <Pic slot="coin" width={28} />
          <Pic slot="tab-training" width={32} lit={false} />
          <Pic slot="tab-training" width={32} lit />
        </Row>
        <Row gap="gap-8">
          <Pic slot="figure-front" width={95} />
          <Pic slot="figure-back" width={95} />
        </Row>
      </div>
    ),
  },
  {
    kit: 'pic',
    label: 'pic · tab icons, idle over lit / medal, locked and earned / coin 22 and 188',
    node: (
      <div className="flex flex-col items-start gap-3">
        <Row gap="gap-4">
          {TAB_ICON_KEYS.map((key) => (
            <Pic key={key} slot={tabIconSlot(key)} width={32} lit={false} />
          ))}
        </Row>
        <Row gap="gap-4">
          {TAB_ICON_KEYS.map((key) => (
            <Pic key={key} slot={tabIconSlot(key)} width={32} lit />
          ))}
        </Row>
        <Row gap="gap-6">
          <Pic slot="medal" width={56} lit={false} className="opacity-45" />
          <Pic slot="medal" width={56} lit />
          <Pic slot="coin" width={22} />
          <Pic slot="coin" width={188} />
        </Row>
      </div>
    ),
  },
  {
    kit: 'pic',
    label: 'pic · the equipment stills / the heroes, one per screen',
    node: (
      <div className="flex flex-col items-start gap-3">
        <Row gap="gap-4">
          {STILLS.map((slot) => (
            <Pic key={slot} slot={slot} width={48} />
          ))}
        </Row>
        {HEROES.map((slot) => (
          <Pic key={slot} slot={slot} width={PULSE_SLOTS[slot].widths[0]} />
        ))}
      </div>
    ),
  },
  {
    kit: 'userPhoto',
    label: 'userPhoto · plain rectangle, radius 2 / 16:9, 5:2, 1:1 / desaturated in lists / contain',
    node: (
      <div className="flex flex-col items-start gap-3">
        <UserPhoto src={SAMPLE} alt="" ratio={16 / 9} />
        <UserPhoto src={SAMPLE} alt="" ratio={5 / 2} />
        <Row gap="gap-4">
          <UserPhoto src={SAMPLE} alt="" ratio={1} className="w-20" />
          <UserPhoto src={SAMPLE} alt="" ratio={1} desaturate className="w-20" />
          <UserPhoto src={SAMPLE} alt="" ratio={80 / 56} fit="contain" className="w-20" />
        </Row>
      </div>
    ),
  },
];

export default function MediaKit() {
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
