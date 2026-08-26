import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { useTheme, THEME_PACKS, type ThemePack } from '../../ui/theme/ThemeProvider';
import { useThemeSync } from './useThemeSync';

/**
 * The appearance card — [[55-Screens/settings]] block 5.
 *
 * ═══ THIS SCREEN CARRIED THE HEAVIEST CUT IN THE REDESIGN ══════════════════════════════════════
 *
 * Gone whole: the gradient builder (preview bar, `Lineáris` / `Sugaras` chips, the `Szög` slider
 * and its readout, two to six colour-stop rows each with a colour well, a position slider and a
 * trash button, plus `Új színpont`, `Alapértelmezett` and `Gradiens mentése`) and the accent block
 * (eight preset swatches, the colour well, the hex field, its `Mentés`, the contrast caption).
 * The gradient builder alone was more controls than the entire workout player, and what it bought
 * back is that all three errands people come to Settings for now sit above the fold.
 *
 * `AccentPicker.tsx` and `GradientBuilder.tsx` are KEPT ON DISK, unimported, on purpose: the accent
 * picker's contrast maths (`ui/theme/contrast.ts`) is the gate any future colour input will need.
 *
 * ═══ WHICH IS ALSO WHY THE CONTRAST GATE COULD LEAVE ═══════════════════════════════════════════
 *
 * `settings.contrastRatioPass` / `Fail` / `contrastInvalid` and the disabled `Mentés` were the only
 * thing standing between a user and an unreadable app. With no free colour input there is nothing
 * left to fail, so the removal is safe NOW. The moment a custom accent returns anywhere in the
 * product, the caption and the gated save button return with it.
 *
 * ═══ CHIPS PREVIEW, THE BUTTON COMMITS ════════════════════════════════════════════════════════
 *
 * The old card committed and persisted on chip tap, and the design also asks for a `Téma mentése`
 * button — which together would be a save button that saves something already saved. One of the
 * two had to become true, and the spec picked this one: a tap paints the whole app so the choice
 * can be judged at full size, and nothing is written until the button is pressed.
 *
 * "Live preview" is literal. There is no mock card approximating the theme — every surface in the
 * product derives from `--accent` and `[data-theme]` in CSS, so a preview repaints the real thing,
 * this card included.
 */
export function ThemeStudio() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { save } = useThemeSync();

  // The previewed-but-not-yet-saved pack. `null` means "showing what is committed".
  const [draft, setDraft] = useState<ThemePack | null>(null);
  const shown = draft ?? theme.pack;
  const dirty = shown !== theme.pack;

  // A preview is written straight to the document root and survives re-renders, so leaving the
  // screen with one open would carry an unsaved colour into every other screen and read as the
  // save having worked. Unmount puts the committed theme back.
  const { cancelPreview } = theme;
  useEffect(() => cancelPreview, [cancelPreview]);

  /**
   * ═══ THE LOCAL COMMIT WAITS FOR THE SERVER ═══════════════════════════════════════════════════
   *
   * This used to call `setTheme` first and clear the draft unconditionally, with `save.isError`
   * read nowhere. A failed PUT was therefore pixel-identical to a successful one — draft cleared,
   * `dirty` false, button greyed — and the choice silently never left the device.
   *
   * Deferring the commit is what keeps the state, not keeping the draft: `dirty` is
   * `shown !== theme.pack`, so a synchronous `setTheme` made it false whatever the draft held.
   * Now the chip stays selected, the button stays live for a retry, and the app is already
   * painted in the new pack from the tap's own `theme.preview` — so nothing flickers while the
   * request runs, and the spec's rule holds: a failed theme save must not revert the choice,
   * because a colour that snaps back reads as the tap not registering.
   */
  const commit = () => {
    // The accent and the gradient are still part of the stored theme even though this card no
    // longer edits them — sending only the pack would blank whatever the user set before the cut.
    save.mutate(
      { pack: shown, accent: theme.accent, gradient: theme.gradient },
      {
        onSuccess: () => {
          theme.setTheme({ pack: shown });
          setDraft(null);
        },
        // No onError body on purpose: leaving `draft` and `theme.pack` untouched IS the recovery.
      },
    );
  };

  return (
    <div className="flex flex-col gap-group">
      {/* The live preview is a TILE now, not a card with a demo `Mentés` / `Mégse` pair inside it:
          two buttons that do nothing are two more things on a screen whose whole redesign was
          about having fewer.

          The holder is the SAME 44px tinted square as every other glyph on this screen — the
          section headers, the coins row, the cue rows. It was a `--gradient-brand` block, which
          made it the one saturated multi-colour object in view and the token's second consumer;
          DESIGN.md G6 gives that gradient exactly one home (the workout player's hero box), and a
          second one is how a per-pack identity stops meaning anything. The tile still demonstrates
          a repaint: `--tile-tint` is the accent at 14%, so it changes with the pack like the rest
          of the card. */}
      <div className="flex items-center gap-tight">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-field bg-[var(--tile-tint)] text-[var(--tile-tint-fg)]"
        >
          <Flame className="size-icon-m" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-strong text-text-1">{t('settings.previewTitle')}</p>
          <p className="text-caption text-text-3">{t('settings.previewBody')}</p>
        </div>
      </div>

      {/* One row of chips, scrolling rather than wrapping into a grid: the packs are a single
          choice and a grid made them read as a palette of swatches. The hairline above is the
          card's own divider, so it uses the pack-owned border width like every other one.
          `p-1` on the scroll box is not decoration: overflow clips at the PADDING edge, and two
          things hang past a chip's border box — the selected chip's badge (4px) and every chip's
          focus ring (`outline-offset-2`). Without the padding the badge is shaved off and the
          keyboard ring is clipped. `pt-3` above it makes the two add back up to the 16px the rest
          of the card is spaced on. */}
      <div className="border-t-[length:var(--border-width)] border-[var(--card-border)] pt-3">
        <div
          role="radiogroup"
          aria-label={t('settings.themePacks')}
          className="flex gap-tight overflow-x-auto p-1"
        >
          {THEME_PACKS.map((pack) => {
            const on = shown === pack;
            return (
              <Pressable
                key={pack}
                role="radio"
                aria-checked={on}
                shape="chip"
                // Every chip is `secondary`, so every chip has an edge and a fill. On `ghost` the
                // unselected packs were bare words on the card — they did not read as chips at
                // all, and "which one is on" was answered by being the only one with a border.
                // The mockup draws three equal outlined boxes where the selected one is marked by
                // the accent edge, the wash and the corner check.
                variant="secondary"
                // A tap PREVIEWS. Hover-to-compare was removed with the commit-on-tap behaviour:
                // leaving a chip reverted to the committed pack, which would have thrown away the
                // pending choice the moment the pointer moved off it.
                onClick={() => {
                  setDraft(pack);
                  theme.preview({ pack });
                }}
                className={cn(
                  // The border width comes from `secondary` and is therefore declared on BOTH
                  // states, so the chips keep their size as the selection moves — in a pack that
                  // declares a 2px edge an unselected chip would otherwise be 4px narrower than
                  // the selected one. Only the COLOUR of the edge changes here.
                  'shrink-0',
                  on && 'border-accent bg-accent-subtle text-on-accent-subtle',
                )}
              >
                {/* The pack id is a database key, not a label: `capitalize` on it rendered five
                    English words ("Midnight") in a Hungarian UI. `defaultValue` keeps a pack
                    seeded after the bundle printing its own id rather than a raw key. */}
                {t(`settings.themePack.${pack}`, { defaultValue: pack })}
                {/* The confirmation badge sits ON the chip's corner rather than inline beside the
                    word, so the chips do not change width as the selection moves — the same
                    treatment the account avatar's badge uses two blocks up. */}
                {on ? (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-success text-on-success"
                  >
                    <Check className="size-icon-s" strokeWidth={3} />
                  </span>
                ) : null}
              </Pressable>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-tight">
        <Pressable
          variant="primary"
          className="w-full"
          busy={save.isPending}
          // Nothing to commit means nothing to press. The alternative — a live button that re-saves
          // the pack already stored — is exactly the "saves something already saved" the spec warns
          // about, and it would make a successful save indistinguishable from a no-op.
          disabled={!dirty}
          onClick={commit}
        >
          {/* Its own key, not `common.save`: this button names what it saves, which is what the
              mockup draws and what tells you the chips above are a pending choice rather than a
              committed one. */}
          {save.isPending ? t('common.saving') : t('settings.saveTheme')}
        </Pressable>
        {/* Inline under the button, where the failure happened — settings.md States → Error asks
            for exactly this. `role="alert"` because it appears after the fact that caused it, so
            nothing else announces it. The copy follows DESIGN §6.3: what happened, what survived,
            what to do. */}
        {save.isError ? (
          <p role="alert" className="text-caption text-danger">
            {t('settings.themeSaveError')}
          </p>
        ) : null}
      </div>
    </div>
  );
}
