import { useTranslation } from 'react-i18next';
import { ListRow } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Section } from '../../ui/data/SectionHeader';
import type { TodayFocus as TodayFocusData } from '../../lib/lifeos-api';
import { coinsOf } from './focusFormat';

/**
 * FÓKUSZ — Ma's focus block (frame `lifeos/ma-1`, y 1576; `figma-build/lifeos/ma.common.js`). Package
 * S-ma mounts it between NAPI DOBÁS and TÁPLÁLKOZÁS with `GET /lifeos/today`'s `focus`
 * (request R-S-focus-02):
 *
 *     ──────────────────────────────────────────────
 *     FÓKUSZ                                ma 50 perc     today's paid minutes (mono, text-2)
 *     Mélymunka – szakdolgozat                  14:00 ›    the open block: its title, and
 *     Következő blokk · 25 perc · +8 érme                  planned: "Következő blokk · N perc · +N érme", its start
 *                                                          running: "Fókuszban · 15 / 50 perc", its end
 *                                                          ran out: "15 / 50 perc", its end
 *
 * With no open block the row is the door itself: "Fókusz indítása ›". Every row opens `/focus`.
 * Nothing is drawn before the read has the field (an older server, no zone yet answers it empty).
 */
export function TodayFocus({ focus }: { focus: TodayFocusData | null | undefined }) {
  const { t } = useTranslation();
  if (!focus) return null;
  const s = focus.current;
  const [head = '', tail = ''] = t('focus.todayMinutes', { n: '\u0000' }).split('\u0000');
  const progress = s ? t('focus.progress', { done: s.elapsedMinutes, of: s.plannedMinutes }) : '';

  return (
    <Section
      title={t('focus.title')}
      trailing={
        // "ma 50 perc": the figure in ink, its words quiet (ma-1). The words come from one key, split
        // around the figure, so every language keeps its own order.
        <span className="text-data text-text-2">
          {head}
          <span className="text-text-1">{focus.todayMinutes}</span>
          {tail}
        </span>
      }
    >
      <RowStack trim>
        {s ? (
          <ListRow
            to="/focus"
            title={s.title}
            sub={
              s.status === 'planned'
                ? [t('focus.planned'), t('focus.minutes', { n: s.plannedMinutes }), t('focus.coinsPlus', { n: coinsOf(s.expectedMinor) })].join(' · ')
                : s.status === 'active'
                  ? `${t('focus.live')} · ${progress}`
                  : progress
            }
            value={(s.status === 'planned' ? s.startTime : s.endTime) ?? undefined}
            valueStep="data"
            chevron
          />
        ) : (
          <ListRow to="/focus" title={t('focus.start')} chevron />
        )}
      </RowStack>
    </Section>
  );
}
