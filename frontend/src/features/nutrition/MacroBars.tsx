import { useTranslation } from 'react-i18next';

/**
 * Logged versus target, as bars.
 *
 * ═══ THE BAR IS NOT A PERCENTAGE, AND OVERSHOOT IS DRAWN ═══════════════════════════════════════
 *
 * A progress bar that stops at 100% tells someone who ate 3200 kcal against a 2500 target exactly
 * the same thing as someone who ate 2500. That is the number they most need. So the fill clamps at
 * the bar's width — it has to — but the LABEL always carries the real figure, and past the target
 * the bar takes the warning colour so the shape and the number agree.
 *
 * ═══ NO TARGET MEANS NO BAR ════════════════════════════════════════════════════════════════════
 *
 * With `target == null` this renders the amount and nothing else. Not a bar at 0%, not a bar
 * against an invented default. The schedule rule decides whether a date has a prescribed day, and
 * on a date it does not, there is no denominator — the same reason the coach roster shows a
 * session COUNT rather than an adherence percentage.
 *
 * ═══ AND "OVER" IS NOT "BAD" ═══════════════════════════════════════════════════════════════════
 *
 * Warning-coloured, never danger-coloured, and the word is "over" rather than anything stronger.
 * A person eating 300 kcal above their target has had a normal Tuesday. This is a fitness app
 * talking to someone about food, and the tone of a colour is part of what it says.
 */
export function MacroBars({
  totals,
  targets,
}: {
  totals: { kcal: number; protein_g: number; carb_g: number; fat_g: number };
  targets: {
    kcal_target: number | null;
    protein_g_target: number | null;
    carb_g_target: number | null;
    fat_g_target: number | null;
  } | null;
}) {
  const { t } = useTranslation();

  const rows = [
    { key: 'kcal', value: totals.kcal, target: targets?.kcal_target ?? null, unit: '' },
    { key: 'protein', value: totals.protein_g, target: targets?.protein_g_target ?? null, unit: 'g' },
    { key: 'carb', value: totals.carb_g, target: targets?.carb_g_target ?? null, unit: 'g' },
    { key: 'fat', value: totals.fat_g, target: targets?.fat_g_target ?? null, unit: 'g' },
  ];

  return (
    <ul className="flex flex-col gap-group">
      {rows.map((r) => {
        const over = r.target != null && r.value > r.target;
        // Clamped for the DRAWING only. The label below is never clamped.
        const pct = r.target && r.target > 0 ? Math.min(100, (r.value / r.target) * 100) : 0;

        return (
          <li key={r.key}>
            <div className="text-caption flex items-baseline justify-between gap-2">
              <span className="text-text-2">{t(`nutrition.macro.${r.key}`)}</span>
              <span className={`tabular-nums ${over ? 'text-warning' : 'text-text-1'}`}>
                {round(r.value)}
                {r.unit}
                {r.target != null ? (
                  <span className="text-text-3">
                    {' / '}
                    {round(r.target)}
                    {r.unit}
                  </span>
                ) : null}
              </span>
            </div>

            {r.target != null ? (
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-chip bg-surface-2"
                role="progressbar"
                aria-valuenow={Math.round(r.value)}
                aria-valuemin={0}
                aria-valuemax={Math.round(r.target)}
                aria-label={t(`nutrition.macro.${r.key}`)}
              >
                <div
                  className={`h-full rounded-chip ${over ? 'bg-warning' : 'bg-accent'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
