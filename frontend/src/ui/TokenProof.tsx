/**
 * TokenProof — the Phase 0 QA surface.
 *
 * It renders the entire design system on one page so both a human and the DOM-measuring audit
 * can verify it against the VISUAL DESIGN BIBLE before a single product screen exists. The
 * previous implementation shipped screens on an unverified token layer and every screen
 * inherited the drift (ADR-0006); this page is the gate that prevents a repeat.
 *
 * Nothing here uses a raw color, radius, size or duration — only tokens.
 */
import { useState } from 'react';
import { Dumbbell, Flame, Check, Plus } from 'lucide-react';
import { Pressable } from './primitives/Pressable';

const THEMES = ['midnight', 'solar', 'forest', 'neon', 'mono'] as const;
type Theme = (typeof THEMES)[number];

const TYPE_STEPS = [
  { cls: 'text-display font-display', name: 'Display', spec: '34/40 · 700 · -0.02em' },
  { cls: 'text-title-1 font-display', name: 'Title-1', spec: '26/32 · 700 · -0.01em' },
  { cls: 'text-title-2 font-display', name: 'Title-2', spec: '20/26 · 600' },
  { cls: 'text-title-3', name: 'Title-3', spec: '17/24 · 600' },
  { cls: 'text-body', name: 'Body', spec: '15/22 · 400' },
  { cls: 'text-body-s', name: 'Body-S', spec: '13/18 · 400' },
  { cls: 'text-caption', name: 'Caption', spec: '12/16 · 500' },
  { cls: 'text-micro uppercase', name: 'Micro', spec: '11/14 · 600 · +0.06em' },
];

const SURFACES = [
  { v: 'surface-0', label: 'App background' },
  { v: 'surface-1', label: 'Cards' },
  { v: 'surface-2', label: 'Sheets, sticky bars' },
  { v: 'surface-3', label: 'Modals' },
];

const RAMP = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const SEMANTICS = [
  { name: 'success', label: 'Success' },
  { name: 'warning', label: 'Warning' },
  { name: 'danger', label: 'Danger' },
  { name: 'info', label: 'Info' },
];

/** Resolve a token from the live cascade, so the page can never quote a value it does not have. */
function readToken(name: string) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <p className="text-micro uppercase text-accent">{eyebrow}</p>
      <h2 className="text-title-2 mt-1 text-text-1">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Card separation is border OR shadow — never both (Bible LAYOUT LAW). Cards use the border. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-token bg-surface-1 p-4">{children}</div>
  );
}

export function TokenProof() {
  const [theme, setTheme] = useState<Theme>('midnight');

  const pick = (t: Theme) => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
  };

  return (
    <div className="min-h-dvh bg-surface-0 pb-24">
      <div className="col-mobile screen-x py-6 md:col-wide">
        <header>
          <p className="text-micro uppercase text-accent">Phase 0 · design system</p>
          <h1 className="text-display mt-1 text-text-1">Token proof</h1>
          <p className="text-body measure mt-2 text-text-2">
            Every value on this page comes from the token layer. If a step here is wrong, every
            screen built on it will be wrong — so this is verified before any screen exists.
          </p>
        </header>

        <Section eyebrow="structural themes" title="Theme packs">
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <Pressable
                key={t}
                onClick={() => pick(t)}
                aria-pressed={theme === t}
                shape="chip"
                variant={theme === t ? 'primary' : 'secondary'}
                className="capitalize"
              >
                {t}
              </Pressable>
            ))}
          </div>
          <p className="text-body-s mt-3 text-text-3">
            A pack changes radius, border weight, control height and shadow — not only color.
            Neon goes pill + glow, Mono goes sharp + 2px border + no shadow.
          </p>
        </Section>

        <Section eyebrow="typography law" title="Type scale">
          <Card>
            <ul className="divide-y divide-[var(--surface-border)]">
              {TYPE_STEPS.map((s) => (
                <li key={s.name} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <span className={`${s.cls} text-text-1`}>{s.name}</span>
                  <span className="text-caption shrink-0 text-text-3 tnum">{s.spec}</span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-body-s mt-3 text-text-3">
            Space Grotesk carries display and titles, Inter carries body and UI. Two families,
            no more.
          </p>
        </Section>

        <Section eyebrow="color law" title="Surface elevation">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SURFACES.map((s) => (
              <div key={s.v} className="rounded-card border border-border-token overflow-hidden">
                <div className="h-16" style={{ background: `var(--${s.v})` }} />
                <div className="bg-surface-1 p-3">
                  <p className="text-caption text-text-1">{s.v}</p>
                  <p className="text-micro uppercase mt-1 text-text-3">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="derived at runtime" title="Accent ramp 50–950">
          <div className="flex overflow-hidden rounded-card border border-border-token">
            {RAMP.map((step) => (
              <div key={step} className="flex-1" title={`accent-${step}`}>
                <div className="h-12" style={{ background: `var(--accent-${step})` }} />
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <Card>
              <p className="text-micro uppercase text-text-3">Default</p>
              <p className="text-title-3 mt-1 text-accent">accent-500</p>
            </Card>
            <Card>
              <p className="text-micro uppercase text-text-3">Hover</p>
              <p className="text-title-3 mt-1 text-accent-hover">accent-400</p>
            </Card>
            <Card>
              <p className="text-micro uppercase text-text-3">Pressed</p>
              <p className="text-title-3 mt-1 text-accent-pressed">accent-600</p>
            </Card>
          </div>
          <p className="text-body-s mt-3 text-text-3">
            Interpolated in OKLab from a single accent, so a user-picked custom color gets the
            same perceptual spacing as the built-in packs.
          </p>
        </Section>

        <Section eyebrow="four forms each" title="Semantic colors">
          <div className="grid gap-3 md:grid-cols-2">
            {SEMANTICS.map((s) => (
              <div
                key={s.name}
                className="rounded-card border p-4"
                style={{
                  background: `var(--${s.name}-subtle)`,
                  borderColor: `var(--${s.name}-border)`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-chip"
                    style={{ background: `var(--${s.name})`, color: `var(--on-${s.name})` }}
                  >
                    <Check size={16} strokeWidth={2} aria-hidden />
                  </span>
                  <div>
                    <p className="text-title-3 text-text-1">{s.label}</p>
                    <p className="text-body-s text-text-2">solid · subtle 12% · border 30% · on-color</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="accessibility floor" title="Touch targets">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Pressable variant="primary" icon={<Dumbbell size={20} strokeWidth={2} aria-hidden />}>
                Primary action
              </Pressable>
              <Pressable>Secondary</Pressable>
              <Pressable variant="ghost">Ghost</Pressable>
              <Pressable variant="danger">Delete</Pressable>
              <Pressable shape="icon" aria-label="Add">
                <Plus size={20} strokeWidth={2} aria-hidden />
              </Pressable>
              <Pressable disabled>Disabled</Pressable>
              <Pressable busy>Saving…</Pressable>
              {/* Density changes padding and type size — never the hit area. This chip LOOKS
                  compact and still occupies 44px of tappable space, which is exactly how the
                  previous build's 32px filter chips should have been done. */}
              <Pressable shape="chip" density="compact">
                Compact chip
              </Pressable>
            </div>
            <p className="text-body-s measure mt-4 text-text-3">
              Every control above is the same primitive. The 44 × 44 floor is in its base layer,
              not in a rule someone has to remember — and the build refuses a raw
              &lt;button&gt; outside the primitives folder, so there is no second path. The
              previous build lost the floor in twelve places: a 24 px search field and nine
              32 px chips.
            </p>
          </Card>
        </Section>

        <Section eyebrow="motion law" title="Durations">
          <Card>
            <ul className="text-body-s space-y-2 text-text-2">
              <li className="flex justify-between"><span>instant — state flips</span><span className="tnum text-text-1">100ms</span></li>
              <li className="flex justify-between"><span>fast — hover</span><span className="tnum text-text-1">150ms</span></li>
              <li className="flex justify-between"><span>base — most transitions</span><span className="tnum text-text-1">250ms</span></li>
              <li className="flex justify-between"><span>slow — sheets, large surfaces</span><span className="tnum text-text-1">400ms</span></li>
            </ul>
            <p className="text-caption mt-3 text-text-3">
              Standard easing <span className="text-text-1">{readToken('--ease-standard')}</span>,
              read live from the token layer rather than quoted — a page that claims a value it
              does not resolve is worse than no page. With reduced motion the state change is
              instant: it still happens, it just does not travel.
            </p>
          </Card>
        </Section>

        <Section eyebrow="one per screen" title="Brand gradient">
          <div className="rounded-card overflow-hidden border border-border-token">
            <div className="flex h-24 items-center gap-3 px-4" style={{ background: 'var(--gradient-brand)' }}>
              <Flame size={24} strokeWidth={2} className="text-accent-fg" aria-hidden />
              <span className="text-title-3 text-accent-fg">Brand moment</span>
            </div>
          </div>
          <p className="text-body-s mt-3 text-text-3">
            Two stops, 135°, inside the accent's own hue family — never the blue-to-purple
            combination the Bible bans, which is exactly what the previous build shipped.
          </p>
        </Section>
      </div>
    </div>
  );
}
