import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { readableOn, checkAccent } from '../../ui/theme/contrast';
import { ACCENT_PRESETS } from '../../ui/theme/palette';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FALLBACK = ACCENT_PRESETS[0];

export function AccentPicker({
  value,
  onPreview,
  onCommit,
}: {
  value: string | null;
  onPreview: (hex: string | null) => void;
  onCommit: (hex: string | null) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState<string>(value ?? FALLBACK);

  // The guard measures the accent AS TEXT on the live background, which is the constraint that
  // can actually fail — see the note in contrast.ts about why the obvious check is vacuous.
  const valid = HEX.test(draft);
  const verdict = valid ? checkAccent(draft) : null;
  const ratio = verdict?.asText ?? 0;
  const passes = verdict?.ok ?? false;

  const choose = (hex: string) => {
    setDraft(hex);
    onPreview(hex);
    if (HEX.test(hex) && checkAccent(hex).ok) onCommit(hex);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ACCENT_PRESETS.map((hex) => {
          const active = value?.toLowerCase() === hex.toLowerCase();
          return (
            // A swatch is still a control, so it is still a Pressable — it just carries its own
            // background, because here the colour IS the content rather than the styling.
            <Pressable
              key={hex}
              shape="icon"
              aria-label={hex}
              aria-pressed={active}
              onClick={() => choose(hex)}
              className={cn('border', active ? 'border-text-1' : 'border-[var(--surface-border)]')}
              style={{ background: hex, color: readableOn(hex).fg }}
            >
              {active ? <Check size={20} strokeWidth={2.5} aria-hidden /> : null}
            </Pressable>
          );
        })}

        <Pressable shape="chip" variant="ghost" onClick={() => onCommit(null)} aria-pressed={value === null}>
          {t('settings.accentDefault')}
        </Pressable>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-body-s text-text-2">
            {t('settings.accentCustom')}
          </label>
          <div className="flex items-center gap-2">
            {/* The native color input is the right control here: it is keyboard accessible,
                platform-familiar, and free. It is wrapped so it still meets the 44px floor. */}
            <input
              id={inputId}
              type="color"
              value={valid ? draft : FALLBACK}
              onChange={(e) => {
                setDraft(e.target.value);
                onPreview(e.target.value);
              }}
              className="size-[var(--target-min)] cursor-pointer rounded-field border border-[var(--surface-border)] bg-[var(--field-bg)] p-1"
            />
            <input
              value={draft}
              onChange={(e) => {
                const next = e.target.value;
                setDraft(next);
                if (HEX.test(next)) onPreview(next);
              }}
              spellCheck={false}
              aria-invalid={!valid || !passes}
              className={cn(
                'min-h-[var(--target-min)] w-32 rounded-field bg-[var(--field-bg)] px-3',
                'text-body tabular-nums text-text-1 border',
                passes ? 'border-[var(--surface-border)]' : 'border-[var(--danger)]',
                'outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
                'focus-visible:outline-[var(--focus-ring)]',
              )}
            />
          </div>
        </div>

        <Pressable variant="primary" disabled={!passes} onClick={() => onCommit(draft)}>
          {t('common.save')}
        </Pressable>
      </div>

      {/* The guard. It is not advisory: the Save button above stays disabled until the ratio
          clears, and the server re-checks it anyway because this button can be bypassed. */}
      <p
        className={cn(
          'text-caption mt-2 flex items-center gap-1.5',
          passes ? 'text-text-3' : 'text-[var(--danger)]',
        )}
        role={valid && !passes ? 'alert' : undefined}
      >
        {valid && !passes ? <AlertTriangle size={16} strokeWidth={2} aria-hidden /> : null}
        {/* PASS AND FAIL ARE DIFFERENT SENTENCES. One key served both, so a failing colour rendered
            "Kontraszt: 2,10:1 — megfelel a 4,5:1 minimumnak." in red, beside a warning triangle,
            with Save disabled — the number said no and the sentence said yes. */}
        {!valid
          ? t('settings.contrastInvalid')
          : passes
            ? t('settings.contrastRatioPass', { ratio: ratio.toFixed(2) })
            : t('settings.contrastRatioFail', { ratio: ratio.toFixed(2) })}
      </p>
    </div>
  );
}
