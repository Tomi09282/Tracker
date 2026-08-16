import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, EyeOff, Loader2, Palette } from 'lucide-react';
import { cn } from '../../lib/cn';
import { CATALOG, VARIANTS, type Variant } from '../../ui/feedback/catalog';
import { VariantOverride } from '../../ui/feedback/ElementStyleProvider';
import { Demo, PREVIEWABLE } from '../../features/playground/PlaygroundPage';
import { Pressable } from '../../ui/primitives/Pressable';
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
 * What is NEW here is the write, and the honesty about what a write does.
 *
 * ═══ THREE ELEMENTS CHANGE NOTHING, AND THE SCREEN SAYS SO ═════════════════════════════════════
 *
 * E23, E24 and E27 have rows in `element_style_config`, labels in the catalogue and a settable
 * endpoint — and no component anywhere calls `useElementVariant` on them. Measured, not assumed;
 * `scripts/check-element-roster.mjs` holds `catalog.live` to the actual call sites and fails the
 * build if either side moves.
 *
 * A studio that rendered all 27 identically would let an admin pick a variant, watch it save, see it
 * audited, and change nothing at all — and then wonder for an afternoon why the app looks the same.
 * So an inert element is labelled inert and its switch is disabled. The row stays visible because
 * deleting it would be worse: the setting is real, it is simply not wired to anything yet.
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
    <div className="col-wide screen-x py-6">
      <p className="text-micro uppercase text-accent">{t('studio.eyebrow')}</p>
      <h1 className="text-title-1 mt-1 text-text-1">{t('studio.title')}</h1>
      <p className="text-body measure mt-2 text-text-2">{t('studio.intro')}</p>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row">
        {/* The element list. A radiogroup, not a set of buttons: it is a single choice with one
            selected member, and screen readers should hear it that way. */}
        <nav
          className="lg:w-64 lg:shrink-0"
          aria-label={t('studio.elementList')}
        >
          <ul role="radiogroup" aria-label={t('studio.elementList')} className="flex flex-col gap-2">
            {CATALOG.map((e) => (
              <li key={e.id}>
                <Pressable
                  variant={e.id === selected ? 'secondary' : 'ghost'}
                  density="compact"
                  role="radio"
                  aria-checked={e.id === selected}
                  className="w-full justify-between"
                  onClick={() => setSelected(e.id)}
                >
                  <span className="truncate">
                    <span className="text-caption tabular-nums mr-2 text-text-3">{e.id}</span>
                    {e.name}
                  </span>
                  {e.live ? (
                    <span className="text-micro uppercase tabular-nums text-text-3">
                      {styles.data?.styles[e.id] ?? '·'}
                    </span>
                  ) : (
                    <EyeOff className="size-icon-s text-text-3" aria-label={t('studio.inertShort')} />
                  )}
                </Pressable>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          NO `aria-live` here, and it had one for an afternoon.

          Measured: the section's text content is the whole right-hand panel — the heading, all five
          variant labels, every demo's own button text and every "Make active". A polite live region
          re-announces its ENTIRE contents when they change, so picking a variant would have read
          about eighty words aloud. The result is already announced properly by the toast, which
          carries `role="status"` and says one sentence: "E1 now uses variant C".
        */}
        <section className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-title-3 text-text-1">{entry.name}</h2>
            <span className="text-caption tabular-nums text-text-3">{entry.id}</span>
            {!entry.live ? (
              <span className="text-micro uppercase rounded-chip bg-surface-2 px-1.5 text-text-3">
                {t('studio.inertShort')}
              </span>
            ) : null}
          </div>

          {!entry.live ? (
            <p className="text-body-s measure mt-4 rounded-card border border-[var(--surface-border)] bg-surface-1 p-4 text-text-2">
              {t('studio.inertExplain')}
            </p>
          ) : null}

          {styles.isPending ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {VARIANTS.map((v) => (
                <Skeleton key={v} className="h-40 rounded-card" />
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {VARIANTS.map((v) => {
                const isActive = v === active;
                return (
                  <div
                    key={v}
                    className={cn(
                      'rounded-card border bg-surface-1 p-4',
                      isActive ? 'border-accent' : 'border-[var(--surface-border)]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-micro uppercase text-text-3">
                        {v} · {entry.variants[v]}
                      </span>
                      {isActive ? (
                        <span className="text-micro uppercase rounded-chip bg-accent-subtle px-1.5 text-accent">
                          {t('studio.active')}
                        </span>
                      ) : null}
                    </div>

                    {/* The SAME override the playground uses, around the SAME component. What is
                        clicked here is what ships — not a rendering of what would ship. */}
                    <div className="mt-4 flex min-h-24 items-center justify-center">
                      {previewable ? (
                        <VariantOverride styles={{ [entry.id]: v }}>
                          <Demo id={entry.id} />
                        </VariantOverride>
                      ) : (
                        <p className="text-caption measure text-center text-text-3">
                          {t('studio.noPreview')}
                        </p>
                      )}
                    </div>

                    <Pressable
                      variant={isActive ? 'secondary' : 'primary'}
                      density="compact"
                      className="mt-4 w-full"
                      disabled={!entry.live || isActive || setVariant.isPending}
                      onClick={() => choose(v)}
                    >
                      {setVariant.isPending && setVariant.variables?.variant === v ? (
                        <Loader2 className="size-icon-s animate-spin motion-reduce:animate-none" aria-hidden />
                      ) : isActive ? (
                        <Check className="size-icon-s" aria-hidden />
                      ) : null}
                      {isActive ? t('studio.isActive') : t('studio.makeActive')}
                    </Pressable>
                  </div>
                );
              })}
            </div>
          )}

          {styles.isError ? (
            <div className="mt-4">
              <EmptyState icon={Palette} title={t('studio.loadFailed')} body={t('studio.loadFailedBody')} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
