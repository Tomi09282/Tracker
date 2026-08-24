import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, EyeOff, Loader2, Palette } from 'lucide-react';
import { cn } from '../../lib/cn';
import { CATALOG, VARIANTS, type Variant } from '../../ui/feedback/catalog';
import { VariantOverride } from '../../ui/feedback/ElementStyleProvider';
import { Demo, PREVIEWABLE } from '../../features/playground/PlaygroundPage';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { useElementStyles, useSetElementVariant } from './useElementStyles';

/**
 * The Element Style Studio — F9.
 *
 * ═══ IT REUSES THE PLAYGROUND'S PREVIEW, IT DOES NOT REBUILD IT ════════════════════════════════
 *
 * `PlaygroundPage` has rendered every element against every variant since Phase 1, with real
 * interactive components inside a `VariantOverride`. Writing a second preview harness here would be
 * the eleventh time this project reimplemented something it already had — and the two would drift,
 * so the thing an admin previewed would stop being the thing users get. `Demo` is exported and used
 * directly.
 *
 * ═══ THE HERO IS THE ANSWER TO THE QUESTION PEOPLE ARRIVE WITH ═════════════════════════════════
 *
 * They came to ask one thing about one element — what does this control do when you press it, and
 * can it do something better — so the screen opens with the element AS IT SHIPS RIGHT NOW, live and
 * pressable, alone on a stage. The previous design made you find that among five equal cards by
 * looking for the one with an accent border. Size is doing real work here too: these variants are
 * differences in MOTION, and a sheen sweep inside a small square is a rectangle that flickers.
 *
 * The hero is wrapped in the same `VariantOverride` the cards below use, so it is the truth rather
 * than a screenshot of it.
 *
 * ═══ THREE ELEMENTS CHANGE NOTHING, AND THE SCREEN SAYS SO ═════════════════════════════════════
 *
 * E23, E24 and E27 have rows in `element_style_config`, labels in the catalogue and a settable
 * endpoint — and no component anywhere calls `useElementVariant` on them. Measured, not assumed;
 * `scripts/check-element-roster.mjs` holds `catalog.live` to the actual call sites and fails the
 * build if either side moves.
 *
 * A studio that rendered all 27 identically would let an admin pick a variant, watch it save, see it
 * audited, and change nothing at all. So an inert element is labelled inert — on the chip AND in the
 * workspace heading — and its commit buttons are dead. The entry stays visible because deleting it
 * would be worse: the setting is real, it is simply not wired to anything yet.
 *
 * ═══ ONE MEANING OF "ACTIVE" ═══════════════════════════════════════════════════════════════════
 *
 * Accent, everywhere: the selected chip, the active card's border, the `aktív` chip on it. An
 * earlier pass had the confirmation chip in success-green while the border stayed accent, which is
 * two colours claiming the same state on one screen. Green stays what it is everywhere else in the
 * app — the colour of something that just happened — and that is the toast's job here.
 */
export function StyleStudioPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const styles = useElementStyles();
  const setVariant = useSetElementVariant();
  const [selected, setSelected] = useState<string>(CATALOG[0]?.id ?? 'E1');

  const entry = CATALOG.find((e) => e.id === selected) ?? CATALOG[0];
  const active = styles.data?.styles[entry.id];
  const previewable = PREVIEWABLE.has(entry.id);

  const choose = (variant: Variant) => {
    if (!entry.live || variant === active) return;
    setVariant.mutate(
      { elementId: entry.id, variant },
      {
        onSuccess: () => toast(t('studio.saved', { id: entry.id, variant }), 'success'),
        onError: () => toast(t('studio.failed'), 'error'),
      },
    );
  };

  return (
    <div className="col-wide screen-x flex flex-col gap-section py-6">
      <header className="flex flex-col gap-tight">
        <p className="text-micro uppercase text-accent">{t('studio.eyebrow')}</p>
        <h1 className="text-title-1 text-text-1">{t('studio.title')}</h1>
        <p className="text-body-s measure text-text-2">{t('studio.intro')}</p>
      </header>

      {/* ── the anchor ─────────────────────────────────────────────────────────────────────────
          What is live right now, at a size where a motion difference is legible. The label names
          the element, the chip names the state, the caption names the running variant. */}
      <Surface as="section" className="flex flex-col gap-group">
        <div className="flex items-start justify-between gap-tight">
          <span className="text-micro uppercase tabular-nums text-text-3">
            {entry.name} · {entry.id}
          </span>
          {/* The state chips are NOT uppercased, unlike the label to their left. `aktív` and
              `nem használt` are words about this one element, not eyebrows opening a section, and
              both mockups draw them lowercase — the caps had been making a five-letter status read
              louder than the element it describes. */}
          {!entry.live ? (
            <span className="text-micro rounded-chip bg-surface-2 px-2 py-0.5 text-text-3">
              {t('studio.inertShort')}
            </span>
          ) : active ? (
            <span className="text-micro rounded-chip bg-accent-subtle px-2 py-0.5 text-accent">
              {t('studio.active')}
            </span>
          ) : null}
        </div>

        <div className="grid min-h-32 place-items-center">
          {styles.isPending ? (
            // Control-shaped and control-sized, so the live component does not shove the caption
            // down when it arrives.
            <Skeleton className="h-11 w-32 rounded-button" />
          ) : previewable && active ? (
            <VariantOverride styles={{ [entry.id]: active }}>
              <Demo id={entry.id} />
            </VariantOverride>
          ) : (
            <p className="text-caption measure text-center text-text-3">{t('studio.noPreview')}</p>
          )}
        </div>

        {styles.isPending ? (
          <Skeleton className="mx-auto h-4 w-40" />
        ) : (
          <p className="text-body-s text-center text-text-2">
            {active ? `${active} · ${entry.variants[active]}` : '·'}
          </p>
        )}
      </Surface>

      <div className="flex flex-col gap-section lg:flex-row lg:gap-6">
        {/* ── the element chooser ───────────────────────────────────────────────────────────────
            A radiogroup, not a set of buttons: it is a single choice with one selected member, and
            screen readers should hear it that way.

            THE TWENTY-SEVEN-ROW LIST BECAME A RAIL ON A PHONE. As a column it filled the entire
            screen before any preview appeared, and the studio is opened to change ONE element —
            usually right after somebody asked about that specific control. Above lg it is the same
            vertical list it has always been; this is one control that changes shape, not two. */}
        <nav className="lg:w-64 lg:shrink-0" aria-label={t('studio.elementList')}>
          <ul
            role="radiogroup"
            aria-label={t('studio.elementList')}
            className="flex gap-tight overflow-x-auto lg:flex-col lg:overflow-visible"
          >
            {CATALOG.map((e) => {
              const on = e.id === selected;
              return (
                <li key={e.id}>
                  <Pressable
                    variant={on ? 'secondary' : 'ghost'}
                    density="compact"
                    role="radio"
                    aria-checked={on}
                    className={cn(
                      'h-auto w-28 shrink-0 flex-col gap-tight py-2 text-center',
                      'lg:w-full lg:flex-row-reverse lg:justify-between lg:text-left',
                      'border-[length:var(--border-width)]',
                      on ? 'border-accent' : 'border-[var(--surface-border)]',
                    )}
                    onClick={() => setSelected(e.id)}
                  >
                    {/* The holder carries the STATE, not a decorative glyph: the letter this
                        element currently ships with, `·` until the fetch lands, and — for the
                        three elements nothing reads — the crossed-out eye. A chip has nowhere to
                        put a separate inert marker, so the marker takes the holder. */}
                    <span
                      className={cn(
                        'text-micro inline-flex size-8 shrink-0 items-center justify-center rounded-chip uppercase tabular-nums',
                        e.live && on ? 'bg-accent-subtle text-accent' : 'bg-surface-2 text-text-3',
                      )}
                    >
                      {e.live ? (
                        (styles.data?.styles[e.id] ?? '·')
                      ) : (
                        <EyeOff className="size-icon-s" aria-label={t('studio.inertShort')} />
                      )}
                    </span>
                    <span className={cn('w-full truncate lg:flex-1', !e.live && 'text-text-3')}>
                      <span className="text-caption tabular-nums mr-1 text-text-3">{e.id}</span>
                      {e.name}
                    </span>
                  </Pressable>
                </li>
              );
            })}
          </ul>
        </nav>

        {/*
          NO `aria-live` here, and it had one for an afternoon.

          Measured: the section's text content is the whole workspace — the heading, all five
          variant labels, every demo's own button text and every "Make active". A polite live region
          re-announces its ENTIRE contents when they change, so picking a variant would have read
          about eighty words aloud. The result is already announced properly by the toast, which
          carries `role="status"` and says one sentence: "E1 now uses variant C".
        */}
        <section className="flex min-w-0 flex-1 flex-col gap-group">
          <div className="flex items-center gap-tight">
            <span
              aria-hidden
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-accent-subtle text-accent"
            >
              <Palette className="size-icon-m" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-title-3 truncate text-text-1">{entry.name}</h2>
              <p className="text-caption tabular-nums text-text-3">{entry.id}</p>
            </div>
            {!entry.live ? (
              <span className="text-micro shrink-0 rounded-chip bg-surface-2 px-2 py-0.5 text-text-3">
                {t('studio.inertShort')}
              </span>
            ) : null}
          </div>

          {!entry.live ? (
            <Surface>
              <p className="text-body-s measure text-text-2">{t('studio.inertExplain')}</p>
            </Surface>
          ) : null}

          <ul className="flex flex-col gap-group">
            {VARIANTS.map((v) => {
              if (styles.isPending) {
                return (
                  <li key={v}>
                    <Skeleton className="h-28 w-full rounded-card" />
                  </li>
                );
              }
              const isActive = v === active;
              const saving = setVariant.isPending && setVariant.variables?.variant === v;
              return (
                <li key={v}>
                  <Surface
                    as="article"
                    className={cn(
                      'flex items-stretch gap-group',
                      isActive && 'border-accent bg-accent-subtle',
                    )}
                  >
                    {/* The stage. The SAME override the playground uses, around the SAME
                        component: what is pressed here is what ships, not a rendering of it.
                        It clips, deliberately — a wide demo cropped by the stage edge still shows
                        the motion, and letting it set the row height would make five rows of five
                        different heights. */}
                    <Surface
                      elevation="inset"
                      rim={false}
                      pad="none"
                      className="grid w-2/5 shrink-0 place-items-center overflow-hidden p-2"
                    >
                      {previewable ? (
                        <VariantOverride styles={{ [entry.id]: v }}>
                          <Demo id={entry.id} />
                        </VariantOverride>
                      ) : (
                        // The full "no live preview" sentence is on the hero, where there is room
                        // for it. Repeating it five times in a 100px stage would be five walls of
                        // text nobody reads.
                        <span className="text-micro uppercase tabular-nums text-text-3">{v}</span>
                      )}
                    </Surface>

                    <div className="flex min-w-0 flex-1 flex-col gap-tight lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 flex-col gap-tight">
                        <div className="flex flex-wrap items-center gap-tight">
                          <span className="text-micro uppercase text-text-3">
                            {v} · {entry.variants[v]}
                          </span>
                          {isActive ? (
                            <span className="text-micro inline-flex items-center gap-1 rounded-chip bg-accent-subtle px-2 py-0.5 text-accent">
                              <Check className="size-icon-s" aria-hidden />
                              {t('studio.active')}
                            </span>
                          ) : null}
                        </div>
                        {/* The rule runs the width of the text block, as the mockup draws it. At
                            32px it was a stub hanging off the label rather than a division of the
                            card — and it is the line the one-sentence description sits under once
                            the catalogue carries one (see the handover note). */}
                        <span aria-hidden className="h-px w-full rounded-chip bg-border-token" />
                      </div>

                      <Pressable
                        variant={isActive ? 'secondary' : 'primary'}
                        density="compact"
                        className="self-start lg:self-auto"
                        disabled={!entry.live || isActive || setVariant.isPending}
                        onClick={() => choose(v)}
                      >
                        {saving ? (
                          <Loader2 className="size-icon-s animate-spin motion-reduce:animate-none" aria-hidden />
                        ) : isActive ? (
                          <Check className="size-icon-s" aria-hidden />
                        ) : null}
                        {isActive ? t('studio.isActive') : t('studio.makeActive')}
                      </Pressable>
                    </div>
                  </Surface>
                </li>
              );
            })}
          </ul>

          {styles.isError ? (
            <EmptyState icon={Palette} title={t('studio.loadFailed')} body={t('studio.loadFailedBody')} />
          ) : null}
        </section>
      </div>
    </div>
  );
}
