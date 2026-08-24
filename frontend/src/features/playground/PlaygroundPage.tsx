import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { CATALOG, VARIANTS, type Variant } from '../../ui/feedback/catalog';
import { VariantOverride, useElementVariant } from '../../ui/feedback/ElementStyleProvider';
import { useMotionSafe } from '../../ui/feedback/useMotionSafe';
import { Dumbbell } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { FeedbackButton } from '../../ui/feedback/variants/E1Button';
import { CopyButton } from '../../ui/feedback/variants/E2CopyButton';
import { Toggle } from '../../ui/feedback/variants/E4Toggle';
import { Checkbox } from '../../ui/feedback/variants/E5Checkbox';
import { IconButton } from '../../ui/feedback/variants/E3IconButton';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { FeedbackField } from '../../ui/feedback/variants/E7Field';
import { Heart, Play, Pause, Trash2, Flame } from 'lucide-react';
import { Tabs } from '../../ui/feedback/variants/E10Tabs';
import { InteractiveCard, Toast, Progress, type ToastData } from '../../ui/feedback/variants/E12E16';
import { Sheet, SwipeItem, Fab } from '../../ui/feedback/variants/E14E20';
import { Slider, SkeletonBlock, PullToRefresh } from '../../ui/feedback/variants/E17E19';
import { Select, DatePicker } from '../../ui/feedback/variants/E8E9';
import { BottomNav } from '../../ui/nav/BottomNav';

/**
 * Which elements this page can DEMONSTRATE — one entry per `case` in the switch below.
 *
 * It is a hand-written copy of that switch, and `scripts/check-element-roster.mjs` holds the two to
 * each other, because nothing else can: the switch cannot be enumerated at runtime without calling
 * a component that opens with a dozen hooks.
 *
 * ═══ PREVIEWABLE IS NOT THE SAME AS LIVE, AND THIS LIST ONLY KNOWS THE FIRST ═════════════════
 *
 * Measured: E21, E22, E25 and E26 have real components calling `useElementVariant` on them, and no
 * demo case here. The first attempt at a fix added them to this set, and the roster gate caught it
 * immediately — a preview tile with no demo behind it is an empty box labelled "implemented".
 *
 * Two different questions were being answered by one list. Whether an element SHIPS lives in
 * `catalog.ts` as `live`, beside its labels, where the gate holds it to the measured call sites.
 * This set stays what it always was: which elements this page can DEMONSTRATE.
 */
export const PREVIEWABLE = new Set([
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10',
  'E11', 'E12', 'E13', 'E14', 'E15', 'E16', 'E17', 'E18', 'E19', 'E20',
]);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One live, interactive instance of an element.
 *
 * EXPORTED, because the admin studio needs exactly this and building a second preview harness would
 * be the eleventh time this project reimplemented something it already had. The studio renders it
 * inside the same `VariantOverride` the matrix below uses, so what an admin clicks through before
 * committing a change is the component every user will get, not a picture of it.
 */
export function Demo({ id }: { id: string }) {
  const [toggled, setToggled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [seg, setSeg] = useState<'all' | 'mine'>('all');
  const [text, setText] = useState('');
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<'a' | 'b'>('a');
  const [picked, setPicked] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [pct, setPct] = useState(45);
  const [sel, setSel] = useState<string | null>('a');
  const [date, setDate] = useState<Date | null>(new Date());
  const [weight, setWeight] = useState(60);

  switch (id) {
    case 'E1':
      return (
        <FeedbackButton
          variant="primary"
          icon={<Share2 size={20} strokeWidth={2} aria-hidden />}
          onAction={() => wait(900)}
        >
          Save
        </FeedbackButton>
      );
    case 'E2':
      return <CopyButton value="tracker-demo-value" label="Copied" />;
    case 'E4':
      return <Toggle checked={toggled} onChange={(v) => { setToggled(v); return wait(700); }} label="Demo toggle" />;
    case 'E5':
      return <Checkbox checked={checked} onChange={setChecked} label="Demo checkbox" />;
    case 'E3':
      return (
        <IconButton
          aria-label="Play"
          toggled={playing}
          onClick={() => setPlaying((v) => !v)}
          // The status layer is the half of E3 a still screenshot cannot show, so the demo
          // exercises BOTH outcomes: starting playback succeeds, stopping it fails. Presses
          // therefore alternate spinner→tick and spinner→warning+shake. `playing` is read
          // pre-toggle, which is what makes it alternate without a second piece of state.
          onAction={() =>
            wait(700).then(() => {
              if (playing) throw new Error('demo failure');
            })
          }
          icon={<Play size={20} strokeWidth={2} aria-hidden />}
          altIcon={<Pause size={20} strokeWidth={2} aria-hidden />}
        />
      );
    case 'E6':
      return (
        <Segmented
          label="Demo filter"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'all', label: 'All', icon: <Heart size={16} strokeWidth={2} aria-hidden /> },
            { value: 'mine', label: 'Mine' },
          ]}
        />
      );
    case 'E7':
      return (
        <FeedbackField
          label="Demo field"
          value={text}
          valid={text.length > 2}
          error={text === 'x' ? 'Try something longer' : undefined}
          onChange={(e) => setText(e.target.value)}
          className="w-full"
        />
      );
    case 'E10':
      return (
        <Tabs
          label="Demo tabs"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'a', label: 'Plan', icon: <Flame size={16} strokeWidth={2} aria-hidden /> },
            { value: 'b', label: 'Log', badge: 3 },
          ]}
        />
      );
    case 'E12':
      return (
        <InteractiveCard selected={picked} onClick={() => setPicked((v) => !v)}>
          <span className="text-body-s text-text-1">Interactive card</span>
        </InteractiveCard>
      );
    case 'E13':
      return (
        <SwipeItem onComplete={() => undefined} onDelete={() => undefined}>
          <span className="text-body-s text-text-1">Swipe me</span>
        </SwipeItem>
      );
    case 'E14':
      return (
        <>
          <Pressable onClick={() => setSheet(true)}>Open sheet</Pressable>
          <Sheet open={sheet} onClose={() => setSheet(false)} title="Demo sheet">
            <p className="text-body-s text-text-2">Escape closes this, and focus lands inside it.</p>
          </Sheet>
        </>
      );
    case 'E15':
      return (
        <div className="w-full">
          <Pressable
            density="compact"
            onClick={() =>
              setToasts((t) => [
                ...t,
                { id: Date.now(), kind: 'success', message: 'Saved', onUndo: () => undefined },
              ])
            }
          >
            Show toast
          </Pressable>
          <div className="mt-2 flex flex-col gap-2">
            {toasts.map((t) => (
              <Toast key={t.id} toast={t} onDismiss={(id) => setToasts((cur) => cur.filter((x) => x.id !== id))} />
            ))}
          </div>
        </div>
      );
    case 'E16':
      return (
        <div className="flex w-full items-center gap-3">
          <Progress value={pct} label="Demo progress" />
          <Pressable shape="icon" aria-label="Advance" onClick={() => setPct((v) => (v >= 100 ? 0 : v + 25))}>
            <Play size={20} strokeWidth={2} aria-hidden />
          </Pressable>
        </div>
      );
    case 'E8':
      return (
        <Select
          label="Demo select"
          value={sel}
          onChange={setSel}
          options={[
            { value: 'a', label: 'Barbell' },
            { value: 'b', label: 'Dumbbell' },
            { value: 'c', label: 'Kettlebell' },
          ]}
        />
      );
    case 'E9':
      return <DatePicker label="Demo date" value={date} onChange={setDate} />;
    case 'E11':
      return (
        // Rendered inline rather than fixed, so five copies do not stack on the viewport edge.
        <div className="relative h-20 w-full overflow-hidden rounded-field">
          <BottomNav
            tabs={[
              { to: '/playground', icon: Flame, label: 'One', end: true },
              { to: '/library', icon: Dumbbell, label: 'Two', badge: 2 },
            ]}
          />
        </div>
      );
    case 'E17':
      return (
        <Slider
          label="Weight"
          value={weight}
          onChange={setWeight}
          min={0}
          max={200}
          step={2.5}
          format={(v) => `${v} kg`}
          ends={[<Flame key="a" size={16} strokeWidth={2} aria-hidden />, <Flame key="b" size={22} strokeWidth={2.5} aria-hidden />]}
        />
      );
    case 'E18':
      return (
        <div className="w-full space-y-2">
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} index={i} className={i === 0 ? 'h-4 w-2/3' : 'h-3 w-1/2'} />
          ))}
        </div>
      );
    case 'E19':
      return (
        <PullToRefresh onRefresh={() => wait(900)}>
          <span className="text-body-s block text-text-2">Pull down from the top</span>
        </PullToRefresh>
      );
    case 'E20':
      return <span className="text-body-s text-text-3">Rendered fixed to the viewport, bottom-right</span>;
    default:
      return null;
  }
}

/** Shows which variant is globally active, so the matrix is not just five equal columns. */
function ActiveBadge({ id, variant }: { id: string; variant: Variant }) {
  const active = useElementVariant(id);
  if (active !== variant) return null;
  return (
    <span className="text-micro uppercase rounded-chip bg-accent-subtle px-1.5 text-accent">
      active
    </span>
  );
}

/**
 * The feedback playground — every element against every variant, side by side.
 *
 * It doubles as the QA matrix: a variant that looks wrong, breaks under reduced motion, or
 * simply was never implemented is visible here in one screen instead of being discovered on
 * whichever product screen happens to use it.
 */
export function PlaygroundPage() {
  const motionSafe = useMotionSafe();
  /*
   * ═══ THREE GROUPS, BECAUSE THERE ARE THREE ANSWERS ════════════════════════════════════════════
   *
   * This page used to split the catalogue in two: has a demo here, or "catalogued, not yet built".
   * Measured against the actual `useElementVariant` call sites, that put FOUR SHIPPED ELEMENTS —
   * E21, E22, E25, E26 — under "not yet built". A screen whose whole job is showing what is live
   * was wrong about four live things, in the reassuring direction.
   *
   * Shipping and being demonstrable here are separate facts. `entry.live` comes from the catalogue
   * and check-element-roster holds it to the measured call sites; IMPLEMENTED is this file's own
   * list of what the switch below can draw.
   */
  const previewable = CATALOG.filter((e) => PREVIEWABLE.has(e.id));
  const liveNoDemo = CATALOG.filter((e) => e.live && !PREVIEWABLE.has(e.id));
  const inert = CATALOG.filter((e) => !e.live && !PREVIEWABLE.has(e.id));

  return (
    <div className="col-wide screen-x py-6">
      <p className="text-micro uppercase text-accent">QA matrix</p>
      <h1 className="text-title-1 mt-1 text-text-1">Feedback playground</h1>
      <p className="text-body measure mt-2 text-text-2">
        Every element against all five of its variants. The variant marked <em>active</em> is the
        one the admin setting currently applies across the whole product.
      </p>
      <p className="text-body-s mt-2 text-text-3">
        Reduced motion is currently <strong className="text-text-1">{motionSafe ? 'off' : 'on'}</strong> —
        with it on, every state change below still happens, it just does not travel.
      </p>

      {previewable.map((entry) => (
        <section key={entry.id} className="mt-8">
          <div className="flex items-baseline gap-2">
            <h2 className="text-title-3 text-text-1">{entry.name}</h2>
            <span className="text-caption tabular-nums text-text-3">{entry.id}</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VARIANTS.map((v) => (
              <div
                key={v}
                className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-micro uppercase text-text-3">
                    {v} · {entry.variants[v]}
                  </span>
                  <ActiveBadge id={entry.id} variant={v} />
                </div>
                <div className="mt-3 flex min-h-[var(--target-min)] items-center">
                  {/* The override is what makes the matrix possible: each cell renders the same
                      component forced onto a different variant. */}
                  <VariantOverride styles={{ [entry.id]: v }}>
                    <Demo id={entry.id} />
                  </VariantOverride>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <Fab
        label="Demo action"
        actions={[
          { label: 'Exercise', icon: <Dumbbell size={20} strokeWidth={2} aria-hidden />, onSelect: () => undefined },
          { label: 'Note', icon: <Trash2 size={20} strokeWidth={2} aria-hidden />, onSelect: () => undefined },
        ]}
      />

      {liveNoDemo.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-title-3 text-text-1">Shipping, with no demo on this page</h2>
          <p className="text-body-s measure mt-1 text-text-2">
            Real components read these variants, so changing them in the studio changes the product.
            They just have no tile here yet — a gap in this page, not in the app. They were listed
            under &ldquo;not yet built&rdquo; until the roster was measured against the actual call
            sites.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {liveNoDemo.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-field border border-[var(--surface-border)] bg-surface-1 px-3 py-2"
              >
                <span className="text-body-s text-text-2">
                  <span className="tabular-nums text-text-3">{e.id}</span> · {e.name}
                </span>
                <span className="text-micro uppercase rounded-chip bg-success-subtle px-1.5 text-success">live</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-title-3 text-text-1">Catalogued, and nothing reads them</h2>
        <p className="text-body-s measure mt-1 text-text-2">
          These rows exist in <code>element_style_config</code> and no component consults them, so an
          admin can pick a variant, watch it save and see it audited while the product does not
          change by a pixel. Saying so beats a card that looks finished — and the studio marks them
          the same way.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {inert.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-field border border-[var(--surface-border)] bg-surface-1 px-3 py-2"
            >
              <span className="text-body-s text-text-2">
                <span className="tabular-nums text-text-3">{e.id}</span> · {e.name}
              </span>
              <span className="text-micro uppercase text-text-3">phase {e.phase}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
