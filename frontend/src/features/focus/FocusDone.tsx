import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Dock } from '../../ui/shell/Dock';
import { LedgerRow } from '../../ui/data/LedgerRow';
import { Fraction } from '../../ui/data/Numeral';
import { ProgressBar } from '../../ui/data/ProgressBar';
import { RowStack } from '../../ui/data/RowStack';
import { StatBlock } from '../../ui/data/StatBlock';
import { Pic } from '../../ui/media/Pic';
import { Pressable } from '../../ui/primitives/Pressable';
import type { FocusFinishResponse, FocusRules } from '../../lib/lifeos-api';
import { useWallet } from '../coins/useCoins';
import { readLevel } from '../coins/statement';
import { FigUnit } from '../habits/HabitRow';
import { coinsOf, endedAtClock, minutesCoins, span } from './focusFormat';

/**
 * focus-3 — the finished block (`figma-build/lifeos/focus-3.body.js`):
 *
 *   header      pushed: "‹ MA", the title "Kész fókusz"
 *   stat        the block's title as the eyebrow, the paid minutes as the one giant figure + PERC
 *               (eyebrow, 12 after the ink), "21:10 – 22:00 · feladás nélkül" (cap)
 *   ledger      a closed stack of three kit ledger rows: ÉRME "jóváírva" + the 22 pt coin, "+23" ·
 *               ELLENŐRZÉS "15 percenként", 3/3 · SZINT, the 120 pt XP bar in the note column, 4
 *   sum         "50 perc × 20 érme/óra = 17 · 3 jelzés × 2 = 6" (cap)
 *   dock        the one lime pill "Bezárás" (back to Ma)
 *
 * Every figure is the finish's answer (`paidMinutes`, `paidCheckins`, `awardedMinor`); the sum
 * line explains it with the server's rules. The daily coin cap or the daily focus limit can pay
 * less than the sum: then one more cap line says so. SZINT is the wallet's level after the finish
 * (`/coins/wallet`, refetched by the finish); while it is read, or when it fails, the row is left
 * out rather than drawn with a made-up level.
 *
 * Undrawn: a block without check-ins (no ELLENŐRZÉS row, the sum's minutes part only).
 */
export function FocusDone({ result, rules }: { result: FocusFinishResponse; rules: FocusRules | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const wallet = useWallet();
  const level = readLevel(wallet.data as Parameters<typeof readLevel>[0]);
  const s = result.session;

  const minutes = s.paidMinutes ?? s.elapsedMinutes;
  const checkins = s.paidCheckins ?? s.checkinsDone;
  const awarded = coinsOf(result.awardedMinor);
  const minutePart = rules ? minutesCoins(minutes, rules) : null;
  const checkinPart = rules ? checkins * rules.checkinPoint : null;
  const short = minutePart !== null && checkinPart !== null && awarded < minutePart + checkinPart;

  return (
    <Screen top="push">
      <ScreenHeader kind="push" title={t('focus.doneTitle')} />

      <StatBlock
        label={s.title}
        caption={t('focus.doneMeta', {
          span: span(s.startTime ?? '', endedAtClock(s), '–'),
        })}
      >
        <FigUnit value={minutes} unit={t('focus.unitMin')} size="giant" unitClass="text-eyebrow" />
      </StatBlock>

      <div className="flex w-full flex-col gap-8">
        <RowStack open close>
          <LedgerRow
            label={t('focus.coins')}
            // Nothing paid (an early finish at minute 0): no "jóváírva" and no coin, just the figure.
            note={
              awarded > 0 ? (
                <span className="inline-flex items-start gap-2 text-cap text-text-2">
                  {t('focus.credited')}
                  <Pic slot="coin" width={22} className="-my-0.75" />
                </span>
              ) : undefined
            }
            value={awarded > 0 ? `+${awarded}` : '0'}
            srText={t('focus.coinsPlus', { n: awarded })}
          />
          {s.checkinMinutes > 0 ? (
            <LedgerRow
              label={t('focus.checkin')}
              note={<span className="text-cap text-text-2">{t('focus.every', { n: s.checkinMinutes })}</span>}
              value={<Fraction value={checkins} of={s.checkinsMax} complete={checkins >= s.checkinsMax} />}
            />
          ) : null}
          {level ? (
            <LedgerRow
              label={t('focus.level')}
              note={<ProgressBar value={level.progress} className="relative -top-0.75 mb-1.25 w-30" label={t('focus.level')} />}
              value={level.level}
            />
          ) : null}
        </RowStack>

        {rules && minutePart !== null && checkinPart !== null ? (
          <div className="flex w-full flex-col gap-1">
            <p className="text-cap text-text-2">
              {s.checkinMinutes > 0
                ? t('focus.sum', {
                    min: minutes,
                    perHour: rules.pointsPerHour,
                    a: minutePart,
                    n: checkins,
                    p: rules.checkinPoint,
                    b: checkinPart,
                  })
                : t('focus.sumNoCheckin', {
                    min: minutes,
                    perHour: rules.pointsPerHour,
                    a: minutePart,
                  })}
            </p>
            {short || result.capped ? <p className="text-cap text-text-2">{t('focus.capped')}</p> : null}
          </div>
        ) : null}
      </div>

      <Dock as="footer">
        <Pressable variant="primary" size="lg" className="w-full" onClick={() => navigate('/', { replace: true })}>
          {t('common.close')}
        </Pressable>
      </Dock>
    </Screen>
  );
}
