import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { TextLink } from '../../ui/primitives/TextLink';
import type { FocusFinishResponse } from '../../lib/lifeos-api';
import { useFocusCurrent } from './focusApi';
import { isOpen } from './focusFormat';
import { FocusSetup } from './FocusSetup';
import { FocusRunning } from './FocusRunning';
import { FocusDone } from './FocusDone';

/**
 * Fókusz, pushed from Ma's FÓKUSZ block (`/focus`, Ma stays lit) — design round B, frames
 * `lifeos/focus-1` (setup), `focus-2` (running), `focus-3` (finished); the composition is
 * `figma-build/lifeos/focus-{1,2,3}.body.js` on the kit. Built on the B-focus routes
 * (docs/pipeline/pulse/pkg/B-focus/api.md) through `focusApi.ts`.
 *
 * Which of the three the page is, is the server's answer to GET /focus/current:
 *
 *   no open block            FocusSetup   (focus-1) — "Min dolgozol?", IDŐTARTAM, ELLENŐRZÉS, the pill
 *   planned / active / ended FocusRunning (focus-2) — the countdown; a planned block counts down to
 *                                          its start, a ran-out one waits for Befejezés / Feladás
 *   just finished            FocusDone    (focus-3) — what the finish paid; it lives in this page's
 *                                          state only (a finished block is history: the next visit
 *                                          is the setup again)
 *
 * Undrawn states, in the same language: loading (skeleton lines where the header and the first
 * field will be), a failed read (the danger line with "Újra"), no time zone yet (the info line with
 * the door to "Nap és időzóna"; the start is refused by the server until it is set), a refused start
 * (the daily block limit, or any failure: one line over the pill).
 */
export function FocusPage() {
  const { t } = useTranslation();
  const current = useFocusCurrent();
  const [finished, setFinished] = useState<FocusFinishResponse | null>(null);

  if (finished) {
    return <FocusDone result={finished} rules={current.data?.rules ?? null} />;
  }

  const data = current.data;
  if (!data) {
    return (
      <Screen top="push">
        <ScreenHeader kind="push" title={t('focus.title')} />
        {current.isError ? (
          <NoticeLine
            tone="danger"
            role="alert"
            action={
              <TextLink className="min-w-11" onClick={() => void current.refetch()} busy={current.isFetching}>
                {t('common.retry')}
              </TextLink>
            }
          >
            {t('focus.failed')}
          </NoticeLine>
        ) : (
          <div role="status" aria-label={t('common.loading')} className="flex w-full flex-col gap-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-4 w-48" />
          </div>
        )}
      </Screen>
    );
  }

  if (isOpen(data.session)) {
    return <FocusRunning current={data} session={data.session} onFinished={setFinished} />;
  }
  return <FocusSetup current={data} />;
}
