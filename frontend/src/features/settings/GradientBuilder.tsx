import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { gradientCss, type Gradient } from '../../ui/theme/ThemeProvider';
import { readableOn } from '../../ui/theme/contrast';

const MAX_STOPS = 6;

/**
 * Multi-stop gradient builder (owner requirement 14).
 *
 * Two stops minimum — one stop is a solid color, not a gradient — and six maximum, which is
 * both a practical design limit and the bound the server validates against so a forged request
 * cannot store an unbounded blob.
 *
 * The gradient drives `--gradient-brand`, which the Bible restricts to brand moments only:
 * hero cards, avatar rings, streak flames. It is never applied behind body text.
 */
export function GradientBuilder({
  value,
  onChange,
  onClear,
}: {
  value: Gradient;
  onChange: (next: Gradient) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  const setStop = (index: number, patch: Partial<Gradient['stops'][number]>) => {
    const stops = value.stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...value, stops });
  };

  const addStop = () => {
    if (value.stops.length >= MAX_STOPS) return;
    const last = value.stops.at(-1)!;
    onChange({
      ...value,
      stops: [...value.stops, { color: last.color, position: Math.min(100, last.position + 10) }],
    });
  };

  const removeStop = (index: number) => {
    if (value.stops.length <= 2) return;
    onChange({ ...value, stops: value.stops.filter((_, i) => i !== index) });
  };

  return (
    <div>
      <div
        className="h-20 rounded-card border border-[var(--surface-border)]"
        style={{ background: gradientCss(value) }}
        role="img"
        aria-label={t('settings.gradientPreview')}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(['linear', 'radial'] as const).map((type) => (
          <Pressable
            key={type}
            shape="chip"
            density="compact"
            variant={value.type === type ? 'primary' : 'secondary'}
            aria-pressed={value.type === type}
            onClick={() => onChange({ ...value, type })}
          >
            {t(`settings.gradient.${type}`)}
          </Pressable>
        ))}

        {value.type === 'linear' ? (
          <label className="flex items-center gap-2">
            <span className="text-body-s text-text-2">{t('settings.gradient.angle')}</span>
            <input
              type="range"
              min={0}
              max={360}
              step={15}
              value={value.angle}
              onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })}
              className="h-[var(--target-min)] w-32 accent-[var(--accent)]"
            />
            <span className="text-body-s tabular-nums text-text-1">{value.angle}°</span>
          </label>
        ) : null}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {value.stops.map((stop, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t('settings.gradient.stopColor', { n: i + 1 })}
              value={stop.color}
              onChange={(e) => setStop(i, { color: e.target.value })}
              className="size-[var(--target-min)] shrink-0 cursor-pointer rounded-field border border-[var(--surface-border)] bg-[var(--field-bg)] p-1"
              style={{ color: readableOn(stop.color).fg }}
            />
            <input
              type="range"
              min={0}
              max={100}
              aria-label={t('settings.gradient.stopPosition', { n: i + 1 })}
              value={stop.position}
              onChange={(e) => setStop(i, { position: Number(e.target.value) })}
              className="h-[var(--target-min)] flex-1 accent-[var(--accent)]"
            />
            <span className="text-body-s w-10 shrink-0 text-right tabular-nums text-text-2">
              {stop.position}%
            </span>
            <Pressable
              shape="icon"
              variant="ghost"
              aria-label={t('settings.gradient.removeStop', { n: i + 1 })}
              disabled={value.stops.length <= 2}
              onClick={() => removeStop(i)}
            >
              <Trash2 size={20} strokeWidth={2} aria-hidden />
            </Pressable>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <Pressable
          density="compact"
          disabled={value.stops.length >= MAX_STOPS}
          icon={<Plus size={20} strokeWidth={2} aria-hidden />}
          onClick={addStop}
        >
          {t('settings.gradient.addStop')}
        </Pressable>
        <Pressable density="compact" variant="ghost" onClick={onClear}>
          {t('settings.gradient.reset')}
        </Pressable>
      </div>
    </div>
  );
}
