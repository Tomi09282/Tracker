import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATALOG, VARIANTS, type Variant } from '../../ui/feedback/catalog';
import { VariantOverride } from '../../ui/feedback/ElementStyleProvider';
import { Demo, PREVIEWABLE } from '../../features/playground/PlaygroundPage';
import { UnlitPills } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { ChipRow, Chip } from '../../ui/primitives/ChipRow';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { Numeral } from '../../ui/data/Numeral';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { Section, SectionHeader } from '../../ui/data/SectionHeader';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useToast } from '../../ui/feedback/ToastHost';
import { cn } from '../../lib/cn';
import { useElementStyles, useSetElementVariant } from './useElementStyles';

/**
 * The Element Style Studio (`/admin/styles`) — Pulse frames `style-studio-1` / `style-studio-2`.
 *
 * ═══ IT REUSES THE PLAYGROUND'S PREVIEW, IT DOES NOT REBUILD IT ════════════════════════════════
 *
 * `Demo` (exported by `PlaygroundPage`) renders an element under a `VariantOverride`, so what is on
 * a stage here is the real component, pressable, not a picture of it. The hero shows the active
 * variant at 150 % (the wrapper is scaled, never a second copy); each variant row shows the same
 * demo under ITS letter in a 142 pt stage that clips. Row specimens rest unlit (`UnlitPills`, the
 * frames set `effects = []`): the hero holds the one glowing control.
 *
 * ═══ THE HONEST STUDIO (owner answer Q3 a) ═════════════════════════════════════════════════════
 *
 * Under one Pulse look per element no component reads a variant any more: every catalogue entry is
 * `live: false` (`catalog.ts`, held to the call sites by `check-element-roster.mjs`). The screen
 * says so instead of pretending: the hero and the section head carry "nem használt", the
 * consequence note gives way to `studio.inertExplain` and the five commit controls are disabled.
 * The hero then shows nothing beside the letter: `studio.noPreview` ("…the components read it")
 * would contradict `inertExplain` four lines lower, so it is kept for a LIVE element without a
 * stage. Nothing of that is special-cased: it is the same `entry.live` branch the page has always
 * had, so an element that gets a consumer again lights up here without a code change.
 *
 * The lime dot after a letter marks the ACTIVE variant (the kit's `Numeral dot`, screen note "one
 * meaning of active: accent everywhere"), not liveness: the stored letter is real whether or not a
 * component reads it, so the giant letter and the active row's letter are lit as the frames draw.
 *
 * ═══ THE GRAMMAR OF THE FRAMES ═════════════════════════════════════════════════════════════════
 *
 *   header      `ScreenHeader kind="section"`: MEGJELENÉS is a category, not a way back (no chevron)
 *   hero        the element · id on the eyebrow line with the state tag on its baseline; the ACTIVE
 *               LETTER as the giant numeral and the specimen standing on its baseline; the variant
 *               name as the caption
 *   chooser     27 text options on one bleeding rail (`ChipRow`, lime mark = the subject); from
 *               1024 pt the 27-row column beside the workspace (R21), with the active letter of
 *               every live entry
 *   Változatok  strong rule, eyebrow, the note, then the five variants as ONE ruled table: letter
 *               (48 pt numeral), name (eyebrow) + tag, the stage line with the commit TEXT on the
 *               right edge — or, on the active row, a state: the lime tick and "Ez az aktív"
 *
 * Nothing is enclosed: no surface, no card, no chip outline. The commit is a text link because the
 * lime shapes on this screen are specimens, not actions.
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

  /** The accessible name of a chooser option: an element nothing reads says so in its name. */
  const optionName = (e: (typeof CATALOG)[number]) => (e.live ? undefined : `${e.id} ${e.name} — ${t('studio.inertShort')}`);

  // The state tag of the hero, on the eyebrow's baseline. Lower-case words about this one element,
  // in the mono `micro` role the frames draw ("aktív"); omitted while the styles are loading.
  const heroTag = styles.isPending ? null : !entry.live ? (
    <span className="text-micro text-text-2">{t('studio.inertShort')}</span>
  ) : active ? (
    <span className="text-micro text-text-2">{t('studio.active')}</span>
  ) : null;

  return (
    <Screen top="push" width="wide">
      <ScreenHeader kind="section" eyebrow={t('studio.eyebrow')} title={t('studio.title')}>
        <p className="text-body text-text-2">{t('studio.intro')}</p>
      </ScreenHeader>

      {/* ── the anchor and (on a phone) the chooser, 20 apart ─────────────────────────────────── */}
      <div className="flex flex-col gap-5">
        <section aria-label={`${entry.name} · ${entry.id}`} className="flex flex-col gap-2">
          <SectionHeader rule={false} title={`${entry.name} · ${entry.id}`} trailing={heroTag} />

          {/* The live-element line: the active letter on the left, the specimen standing on its
              baseline at the right edge. Both bottom-aligned, so the pill's foot is the D's. */}
          {styles.isPending || active || entry.live ? (
            <div className="flex min-h-24 items-end justify-between gap-4">
              {styles.isPending ? (
                <>
                  <Skeleton className="h-24 w-16" />
                  <Skeleton className="h-14 w-32" />
                </>
              ) : (
                <>
                  {active ? <Numeral size="giant" value={active} dot /> : null}
                  {previewable && active ? (
                    /* 112 pt of layout, drawn at 150 % from its bottom-right corner: a pill lands
                       168 x 84 on the right edge, and a demo that asks for the full width (E7's
                       field) fills 168 and never reaches the letter. */
                    <div className="flex w-28 shrink-0 origin-bottom-right scale-150 justify-end">
                      <VariantOverride styles={{ [entry.id]: active }}>
                        <Demo id={entry.id} />
                      </VariantOverride>
                    </div>
                  ) : entry.live ? (
                    <p className="text-cap min-w-0 flex-1 text-text-3">{t('studio.noPreview')}</p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {styles.isPending ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <p className="text-body-m text-text-1">{active ? entry.variants[active] : '·'}</p>
          )}
        </section>

        {/* The rail — a radiogroup: one element is open. It saves nothing. */}
        <div className="lg:hidden">
          <ChipRow label={t('studio.elementList')} role="radiogroup" scroll="bleed">
            {CATALOG.map((e) => (
              <Chip
                key={e.id}
                role="radio"
                selected={e.id === selected}
                aria-label={optionName(e)}
                onClick={() => setSelected(e.id)}
              >
                {`${e.id} ${e.name}`}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:gap-6">
        {/* Desktop (R21): the same choice as a 27-row column beside the workspace; a live entry
            also shows its active letter, the only per-element state in view up here. */}
        <RowStack
          as="div"
          role="radiogroup"
          aria-label={t('studio.elementList')}
          className="hidden lg:flex lg:w-64 lg:shrink-0 lg:self-start"
        >
          {CATALOG.map((e) => (
            <ListRow
              key={e.id}
              role="radio"
              aria-checked={e.id === selected}
              aria-label={optionName(e)}
              tone={e.id === selected ? 'default' : 'muted'}
              title={`${e.id} ${e.name}`}
              value={e.live ? (styles.data?.styles[e.id] ?? '·') : undefined}
              onClick={() => setSelected(e.id)}
            />
          ))}
        </RowStack>

        <Section
          title={t('studio.variants')}
          trailing={!entry.live ? <span className="text-micro text-text-2">{t('studio.inertShort')}</span> : undefined}
          className="min-w-0 flex-1"
        >
          {/* Say the consequence before the action — or, for an element nothing reads, why every
              action below is off. */}
          <p className="text-cap text-text-2">{entry.live ? t('studio.commitNote') : t('studio.inertExplain')}</p>

          <RowStack open close>
            {VARIANTS.map((v) => {
              const isActive = v === active;
              const saving = setVariant.isPending && setVariant.variables?.variant === v;
              return (
                <div key={v} aria-current={isActive || undefined} className="flex items-end gap-4 pt-3 pb-4">
                  <span className="flex h-11 w-12 shrink-0 items-center">
                    <Numeral size="num" value={v} tone={isActive ? 'ink' : 'pending'} dot={isActive} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex h-5 items-baseline justify-between gap-4">
                      <span className={cn('text-eyebrow min-w-0 truncate', isActive ? 'text-text-1' : 'text-text-2')}>
                        {entry.variants[v]}
                      </span>
                      {isActive ? <span className="text-micro shrink-0 text-text-2">{t('studio.active')}</span> : null}
                    </div>
                    <div className="flex h-11 items-center justify-between gap-4">
                      {styles.isPending ? (
                        <Skeleton className="h-11 flex-1" />
                      ) : (
                        <>
                          {previewable ? (
                            <div className="flex h-11 min-w-0 max-w-[142px] flex-1 items-center overflow-hidden">
                              <UnlitPills>
                                <VariantOverride styles={{ [entry.id]: v }}>
                                  <Demo id={entry.id} />
                                </VariantOverride>
                              </UnlitPills>
                            </div>
                          ) : null}
                          {isActive ? (
                            <span className="text-body-m ml-auto flex shrink-0 items-center text-text-2">
                              <CheckMark done className="-mr-1" />
                              {t('studio.isActive')}
                            </span>
                          ) : (
                            <TextLink
                              text="body"
                              className="ml-auto shrink-0"
                              disabled={!entry.live || setVariant.isPending}
                              busy={saving}
                              onClick={() => choose(v)}
                            >
                              {t('studio.makeActive')}
                            </TextLink>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </RowStack>

          {styles.isError ? <EmptyState title={t('studio.loadFailed')} body={t('studio.loadFailedBody')} /> : null}
        </Section>
      </div>
    </Screen>
  );
}
