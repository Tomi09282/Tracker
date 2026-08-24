/**
 * A body measurement, written the way the reader writes it.
 *
 * ═══ WHY THIS IS NOT THE `round` THE MACRO CARDS USE ═══════════════════════════════════════════
 *
 * There are four copies of `const round = v => Math.abs(v) >= 10 ? Math.round(v) : ...` in this
 * codebase, and the rule is right for three of them: a macro is grams, and `128 g` is what a
 * person writes, not `128,4 g`. It is wrong for a body measurement, and it was wrong on screen —
 * a weight of 82.4 rendered as `82 kg` in the trend chart's headline while the entries row beside
 * it showed `82,4 kg`. One measurement, two answers, on one screen.
 *
 * Precision belongs to the METRIC, not to the magnitude. A bodyweight wants its tenth at 8 kg and
 * at 180 kg alike; a circumference in whole centimetres has no tenth to lose. So: keep at most one
 * decimal and drop it when the data has none. `Math.round(v * 10) / 10` gives 82.4 and 84, which
 * is right for both.
 *
 * Deliberately NOT merged with the macro helper. They look identical and encode different domain
 * rules; collapsing them would invite the next person to "fix" one of the two behaviours away.
 *
 * ═══ AND IT HAS TO ROUND AT ALL ════════════════════════════════════════════════════════════════
 *
 * The progress tiles passed `last.value` straight through and rendered `37,933 cm`, `18,486 %`,
 * `105,067 cm` — three decimals of a number nobody measured to three decimals, from a seed that
 * generated them with float arithmetic. Found by looking at the screen, not by reading the code:
 * every one of those tiles is a `SummaryTile` doing exactly what it was told.
 *
 * ═══ AND THE SEPARATOR IS A COMMA IN TWO OF THE THREE LANGUAGES ════════════════════════════════
 *
 * A raw number renders `82.4` in every locale. Hungarian and German both write `82,4`, and the
 * approved mockups say so.
 */
export function formatMeasure(value: number, locale: string): string {
  return (Math.round(value * 10) / 10).toLocaleString(locale, { maximumFractionDigits: 1 });
}
