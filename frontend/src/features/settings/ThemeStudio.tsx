import { useTranslation } from 'react-i18next';
import { Flame, Check } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { useTheme, THEME_PACKS } from '../../ui/theme/ThemeProvider';
import { DEFAULT_GRADIENT } from '../../ui/theme/palette';
import { useThemeSync } from './useThemeSync';
import { AccentPicker } from './AccentPicker';
import { GradientBuilder } from './GradientBuilder';

/**
 * Theme studio — Bible blueprint 9: a live preview card on top, then accent swatches, the
 * gradient builder, and the theme-pack grid.
 *
 * "Live preview" is literal here. There is no isolated mock card that approximates the theme —
 * changing a value repaints the ENTIRE app, including this screen, because everything derives
 * from `--accent` and `[data-theme]` in CSS. What you see while dragging a slider is the real
 * product, not a swatch of it.
 */
export function ThemeStudio() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { save } = useThemeSync();

  const commit = (next: Partial<Parameters<typeof theme.setTheme>[0]>) => {
    theme.setTheme(next);
    const merged = { pack: theme.pack, accent: theme.accent, gradient: theme.gradient, ...next };
    save.mutate(merged);
  };

  return (
    <div>
      {/* Live preview: the same tokens every other surface uses. */}
      <div className="overflow-hidden rounded-card border border-[var(--surface-border)]">
        <div
          className="flex items-center gap-3 px-4 py-5"
          style={{ background: 'var(--gradient-brand)' }}
        >
          <Flame size={24} strokeWidth={2} className="text-accent-fg" aria-hidden />
          <span className="text-title-3 text-accent-fg">{t('settings.previewTitle')}</span>
        </div>
        <div className="bg-surface-1 p-4">
          <p className="text-body text-text-1">{t('settings.previewBody')}</p>
          <p className="text-body-s mt-1 text-text-2">{t('settings.previewSecondary')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pressable variant="primary" density="compact">
              {t('common.save')}
            </Pressable>
            <Pressable density="compact">{t('common.cancel')}</Pressable>
          </div>
        </div>
      </div>

      <h3 className="text-micro uppercase mt-6 text-text-3">{t('settings.themePacks')}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEME_PACKS.map((pack) => {
          const active = theme.pack === pack;
          return (
            // Hovering previews the pack and leaving reverts it — the fastest way to compare
            // five themes is to sweep the cursor across them, not to click each and undo.
            <Pressable
              key={pack}
              aria-pressed={active}
              onClick={() => commit({ pack })}
              onMouseEnter={() => theme.preview({ pack })}
              onMouseLeave={() => theme.cancelPreview()}
              className={[
                'w-full justify-between rounded-card border capitalize',
                active
                  ? 'border-accent bg-accent-subtle text-text-1'
                  : 'border-[var(--surface-border)] bg-surface-1 text-text-2',
              ].join(' ')}
            >
              {pack}
              {active ? <Check size={20} strokeWidth={2} aria-hidden className="text-accent" /> : null}
            </Pressable>
          );
        })}
      </div>

      <h3 className="text-micro uppercase mt-6 text-text-3">{t('settings.accent')}</h3>
      <div className="mt-2">
        <AccentPicker
          value={theme.accent}
          onPreview={(hex) => theme.preview({ accent: hex })}
          onCommit={(hex) => commit({ accent: hex })}
        />
      </div>

      <h3 className="text-micro uppercase mt-6 text-text-3">{t('settings.gradient.title')}</h3>
      <div className="mt-2">
        <GradientBuilder
          value={theme.gradient ?? DEFAULT_GRADIENT}
          onChange={(g) => {
            theme.preview({ gradient: g });
            theme.setTheme({ gradient: g });
          }}
          onClear={() => commit({ gradient: null })}
        />
        <div className="mt-3">
          <Pressable
            variant="primary"
            density="compact"
            busy={save.isPending}
            onClick={() => commit({ gradient: theme.gradient ?? DEFAULT_GRADIENT })}
          >
            {save.isPending ? t('common.saving') : t('settings.saveGradient')}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
