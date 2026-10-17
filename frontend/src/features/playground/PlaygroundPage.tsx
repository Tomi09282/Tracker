import { Suspense, lazy, useState } from 'react';
import type { KitLayout } from './PulseKit';
import { CATALOG, VARIANTS, type Variant } from '../../ui/feedback/catalog';
import { VariantOverride, useElementVariant } from '../../ui/feedback/ElementStyleProvider';
import { useMotionSafe } from '../../ui/feedback/useMotionSafe';
import { Pressable } from '../../ui/primitives/Pressable';
import { CopyButton } from '../../ui/feedback/variants/E2CopyButton';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { FeedbackField } from '../../ui/feedback/variants/E7Field';
import { Heart } from 'lucide-react';
import { Toast, type ToastData } from '../../ui/feedback/variants/E12E16';
import { Sheet } from '../../ui/feedback/variants/E14E20';
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
export const PREVIEWABLE = new Set(['E2', 'E6', 'E7', 'E11', 'E14', 'E15']);

/*
 * The Pulse kit specimen host, the first section of this page. Its own chunk: the style studio
 * imports `Demo` from this file and must not carry every lane's specimens with it.
 */
const PulseKit = lazy(() => import('./PulseKit'));

/*
 * The kit layout is remembered on this device, never put in the URL (PLAN.md 0.1 ruling 25). It is
 * also what lets the capture tool open the board directly (`localStorage` of the `kit-board` state):
 * the feedback matrix below runs JavaScript loops that never let the list page settle, while the
 * board, which replaces the page, does.
 */
const KIT_LAYOUT_KEY = 'tracker.playground.kit-layout';

function readKitLayout(): KitLayout {
  try {
    return localStorage.getItem(KIT_LAYOUT_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

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
  const [seg, setSeg] = useState<'all' | 'mine'>('all');
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState(false);
  // The sheet's five variants differ on the way in AND on how they answer, and a demo that only
  // opens one shows exactly half of each. These two drive the panel through the states.
  const [sheetStatus, setSheetStatus] = useState<'idle' | 'busy' | 'success' | 'error'>('idle');
  const driveSheet = async (outcome: 'success' | 'error') => {
    setSheetStatus('busy');
    await wait(800);
    setSheetStatus(outcome);
  };
  const [toasts, setToasts] = useState<ToastData[]>([]);

  switch (id) {
    case 'E2':
      return <CopyButton value="tracker-demo-value" label="Copied" />;
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
    case 'E14':
      return (
        <>
          <Pressable
            variant="link"
            onClick={() => {
              setSheetStatus('idle');
              setSheet(true);
            }}
          >
            Open sheet
          </Pressable>
          <Sheet
            open={sheet}
            onClose={() => setSheet(false)}
            title="Demo sheet"
            status={sheetStatus}
            onRetry={() => void driveSheet('success')}
          >
            <p className="text-cap text-text-2">Escape closes this, and focus lands inside it.</p>
            {/* Both outcomes, one tap apart, because that is the only way to compare five
                variants' answers rather than five variants' entrances. E hands the whole panel
                over to the state; the other four keep the content and put a badge in the header,
                each settling on its own axis. */}
            <div className="mt-4 flex gap-tight">
              <Pressable variant="link" onClick={() => void driveSheet('success')}>
                Succeed
              </Pressable>
              <Pressable variant="link" onClick={() => void driveSheet('error')}>
                Fail
              </Pressable>
            </div>
          </Sheet>
        </>
      );
    case 'E15':
      return (
        <div className="w-full">
          <Pressable
            variant="link"
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
    case 'E11':
      return (
        // Rendered inline rather than fixed, so five copies do not stack on the viewport edge.
        // One Pulse look: E11 reads no letter any more, so the five columns are the same bar.
        <div className="relative h-20 w-full overflow-hidden">
          <BottomNav
            inline
            tabs={[
              { to: '/playground', icon: 'home', label: 'One', end: true },
              { to: '/library', icon: 'training', label: 'Two' },
            ]}
          />
        </div>
      );
    default:
      return null;
  }
}

/** Shows which variant is globally active, so the matrix is not just five equal columns. */
function ActiveBadge({ id, variant }: { id: string; variant: Variant }) {
  const active = useElementVariant(id);
  if (active !== variant) return null;
  return (
    <span className="text-micro text-accent">
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
  // List or board. The board replaces the whole page: it is drawn at the document's origin, 1300
  // wide, so a capture of it lines up with the Figma component board pixel for pixel.
  const [kitLayout, setKitLayoutState] = useState<KitLayout>(readKitLayout);
  const setKitLayout = (next: KitLayout) => {
    setKitLayoutState(next);
    try {
      localStorage.setItem(KIT_LAYOUT_KEY, next);
    } catch {
      /* storage refused (a private window): the choice lasts for this visit only */
    }
  };
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

  if (kitLayout === 'board') {
    return (
      <Suspense fallback={null}>
        <PulseKit layout="board" onLayoutChange={setKitLayout} />
      </Suspense>
    );
  }

  return (
    <div className="col-wide screen-x py-6">
      <Suspense fallback={null}>
        <PulseKit layout="list" onLayoutChange={setKitLayout} />
      </Suspense>
      <p className="text-micro text-accent">QA matrix</p>
      <h1 className="text-title mt-1 text-text-1">Feedback playground</h1>
      <p className="text-body measure mt-2 text-text-2">
        Every element against all five of its variants. The variant marked <em>active</em> is the
        one the admin setting currently applies across the whole product.
      </p>
      <p className="text-cap mt-2 text-text-3">
        Reduced motion is currently <strong className="text-text-1">{motionSafe ? 'off' : 'on'}</strong> —
        with it on, every state change below still happens, it just does not travel.
      </p>

      {previewable.map((entry) => (
        <section key={entry.id} className="mt-8">
          <div className="flex items-baseline gap-2">
            <h2 className="text-body-b text-text-1">{entry.name}</h2>
            <span className="text-data text-text-3">{entry.id}</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VARIANTS.map((v) => (
              <div
                key={v}
                className="border border-hair p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-micro text-text-3">
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

      {liveNoDemo.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-body-b text-text-1">Shipping, with no demo on this page</h2>
          <p className="text-cap measure mt-1 text-text-2">
            Real components read these variants, so changing them in the studio changes the product.
            They just have no tile here yet — a gap in this page, not in the app. They were listed
            under &ldquo;not yet built&rdquo; until the roster was measured against the actual call
            sites.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {liveNoDemo.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 border border-hair px-3 py-2"
              >
                <span className="text-cap text-text-2">
                  <span className="tabular-nums text-text-3">{e.id}</span> · {e.name}
                </span>
                <span className="text-micro text-success">live</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-body-b text-text-1">Catalogued, and nothing reads them</h2>
        <p className="text-cap measure mt-1 text-text-2">
          These rows exist in <code>element_style_config</code> and no component consults them, so an
          admin can pick a variant, watch it save and see it audited while the product does not
          change by a pixel. Saying so beats a card that looks finished — and the studio marks them
          the same way.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {inert.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 border border-hair px-3 py-2"
            >
              <span className="text-cap text-text-2">
                <span className="tabular-nums text-text-3">{e.id}</span> · {e.name}
              </span>
              <span className="text-micro text-text-3">phase {e.phase}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
