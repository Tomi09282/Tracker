import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Fraction, Numeral } from '../../ui/data/Numeral';
import { SegmentBar } from '../../ui/data/SegmentBar';
import { StatBlock } from '../../ui/data/StatBlock';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { TextLink } from '../../ui/primitives/TextLink';
import { coins, signed, type DayCount } from './model';

/**
 * Ma's hero — frames ma-1..ma-4, `maHero` of `figma-build/lifeos/ma.common.js`:
 *
 *   MA                                    Ma eddig        StatBlock "Ma" + the giant fraction (12 apart)
 *   3/10                                  +18 ÉRME        right column, bottom-aligned: cap + num figure + micro unit
 *   ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬ ▬                                   20 under: one segment per counted item (on / half / off)
 *   3 kész · 1 félúton · 6 hátra                          20 under: the caption
 *
 * The caption is the day in words: the perfect-day line (a lime tick and "Tökéletes nap") when
 * every counted item is done (ma-2), "Ma egy tétel: az edzésed" when the workout is the only item
 * (ma-3), otherwise the mono count line (ma-1, ma-4). "Ma eddig" stands only when today has moved
 * coins (ma-3 / ma-4 draw none). A failed read prints the label and the danger line with "Újra" (never 0 / 0).
 */
export interface TodayHeroProps {
  count: DayCount | null;
  earnedMinor: number | null;
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
}

export function TodayHero({ count, earnedMinor, pending, failed, onRetry }: TodayHeroProps) {
  const { t, i18n } = useTranslation();
  const label = t('today.hero.label');

  if (pending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">{t('common.loading')}</span>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-[99px] w-[170px]" />
        </div>
        <Skeleton className="h-1.5 w-full" />
      </div>
    );
  }

  if (failed || !count) {
    return (
      // No giant figure: the display face's em dash at giant size is a solid slab that reads as a
      // loading bar. The label stays, and the danger line says what happened; "Újra" keeps its
      // 44 pt box but sets its words at the box's right edge, so they end on the gutter.
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow text-text-2" style={{ fontFamily: 'var(--font-display)' }}>
          {label}
        </p>
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11 justify-end" onClick={onRetry}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('today.failed')}
        </NoticeLine>
      </div>
    );
  }

  const left = Math.max(0, count.total - count.done - count.half);
  const earned = earnedMinor === null ? 0 : coins(earnedMinor);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <StatBlock label={label}>
          <Fraction
            size="giant"
            value={count.done}
            of={count.total}
            mode="roll"
            srText={t('today.hero.sr', { done: count.done, total: count.total })}
          />
        </StatBlock>
        {earned !== 0 ? (
          <div className="flex flex-col items-end gap-2">
            <span className="text-cap text-text-2">{t('today.hero.earned')}</span>
            <span className="-mb-1 inline-flex items-baseline gap-1">
              <Numeral size="num" value={signed(earned, i18n.language)} />
              <span className="text-micro uppercase text-text-2">{t('today.coinUnit')}</span>
            </span>
          </div>
        ) : null}
      </div>
      {count.total > 0 ? (
        <SegmentBar label={label} segments={count.segments.map((state) => ({ state }))} />
      ) : (
        <SegmentBar label={label} value={0} total={1} />
      )}
      {count.perfect ? (
        <p className="flex items-center gap-2 text-cap text-text-1">
          <Check aria-hidden className="size-4 shrink-0 text-accent" strokeWidth={2.5} />
          {t('today.hero.perfect')}
        </p>
      ) : count.onlyWorkout ? (
        <p className="text-cap text-text-2">{t('today.hero.onlyWorkout')}</p>
      ) : count.total > 0 ? (
        <p className="text-data text-text-2">
          <span className={count.done > 0 ? 'text-text-1' : undefined}>{count.done.toLocaleString(i18n.language)}</span>{' '}
          {t('today.hero.done')}
          {count.half > 0 ? ` · ${count.half.toLocaleString(i18n.language)} ${t('today.hero.half')}` : null}
          {left > 0 ? ` · ${left.toLocaleString(i18n.language)} ${t('today.hero.left')}` : null}
        </p>
      ) : null}
    </div>
  );
}
