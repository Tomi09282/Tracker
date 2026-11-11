import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { SearchField } from '../../ui/primitives/SearchField';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { TextLink } from '../../ui/primitives/TextLink';
import { cn } from '../../lib/cn';
import type { DayStartHour, UserPrefs } from '../../lib/lifeos-api';
import {
  DAY_START_HOURS,
  hourLabel,
  isZoneTooSoon,
  knownZones,
  offsetLabel,
  settleLabel,
  useDayPrefs,
  useSaveDayPrefs,
  zoneCity,
  zoneLocked,
  zoneOffsetMinutes,
} from './dayPrefs';

/**
 * "Nap és időzóna", pushed from Profil — frame `lifeos/settings-day-v2` (design round B; round A's
 * `nezetek/settings-day` is the same page without the LifeOS lines).
 *
 * The user's day: WHERE it is (the time zone) and WHEN it turns (the day start). Every LifeOS day —
 * the day close, the habits, the daily cap — follows these two values (`GET / PATCH /me/prefs`).
 *
 * Composition, as `settings-day-v2.body.js`: the pushed header (64 under the inset, "‹ PROFIL" from
 * `app/routeMeta.ts`), then 32 apart:
 *
 *   IDŐZÓNA     one row: the place ("Budapest"), the limit under it ("Naponta egyszer
 *               módosítható"), the offset ("GMT+2") and the chevron. It opens the zone sheet.
 *   NAPKEZDÉS   the autosave status at the end of the head ("● Mentve"), the four day starts as a
 *               segmented switch in equal cells on the hairline, figures in mono, and ONE line under
 *               it that says what the choice means: "Új nap 04:00-kor · a tegnapi 10:00-ig még
 *               módosítható." (plan L4: a day settles 6 h after the next one starts).
 *
 * NO SAVE BUTTON (as Felszerelés): a tap on a day start is the save. The switch reads the write's
 * promise — busy dots on the word, the mark ignites when the server took it, the word turns danger
 * when it did not — and the head says "Mentve" whenever what is shown is what the server holds.
 *
 * Undrawn states, in the same language: loading (row and switch skeletons), a failed read (a
 * danger line with "Újra"), a failed write (a danger line under the explanation), a zone that may
 * not change yet (the row's action off, 40 %, its sub line is the reason), a zone not set yet (the
 * dash), and the zone sheet itself.
 */
export function DaySettingsPage() {
  const { t } = useTranslation();
  const prefs = useDayPrefs();
  const save = useSaveDayPrefs();
  const [zoneOpen, setZoneOpen] = useState(false);
  // Which write is on screen: the day start (the switch and its status) or the zone (the sheet).
  const [writing, setWriting] = useState<'start' | 'zone' | null>(null);

  const data = prefs.data;
  const startFailed = writing === 'start' && save.isError;

  const chooseStart = (hour: DayStartHour) => {
    if (!data || hour === data.dayStartHour) return undefined;
    setWriting('start');
    // The promise goes back to the switch, which draws busy / ignite / failed from it.
    return save.mutateAsync({ dayStartHour: hour });
  };

  // The head's status. Shown only when there is something true to say: the value on screen is the
  // server's ("Mentve"), or a write is on its way. A failed write says so under the explanation.
  const status =
    writing === 'start' && save.isPending
      ? { ok: false, text: t('common.saving') }
      : data && !startFailed
        ? { ok: true, text: t('settings.day.saved') }
        : null;

  return (
    <Screen top="push">
      <ScreenHeader kind="push" title={t('settings.day.title')} />

      {prefs.isError && !data ? (
        <NoticeLine
          tone="danger"
          role="alert"
          action={
            <TextLink className="min-w-11" onClick={() => void prefs.refetch()} busy={prefs.isFetching}>
              {t('common.retry')}
            </TextLink>
          }
        >
          {t('settings.day.failed')}
        </NoticeLine>
      ) : (
        <>
          <Section title={t('settings.day.zone')}>
            {data ? (
              <RowStack>
                <ZoneRow prefs={data} onOpen={() => setZoneOpen(true)} />
              </RowStack>
            ) : (
              <RowStack as="div" role="status" aria-label={t('common.loading')}>
                <ListRowSkeleton sub />
              </RowStack>
            )}
          </Section>

          <Section
            title={t('settings.day.start')}
            trailing={
              <span role="status" aria-live="polite" className="inline-flex items-baseline gap-1.5 text-cap text-text-2">
                {status ? (
                  <>
                    <span aria-hidden className={cn('size-1.5 self-center rounded-full', status.ok ? 'bg-success' : 'bg-text-2')} />
                    {status.text}
                  </>
                ) : null}
              </span>
            }
          >
            {data ? (
              <>
                <Segmented
                  layout="cells"
                  figures
                  label={t('settings.day.start')}
                  options={DAY_START_HOURS.map((h) => ({ value: String(h) as `${DayStartHour}`, label: hourLabel(h) }))}
                  value={String(data.dayStartHour) as `${DayStartHour}`}
                  onChange={(next) => chooseStart(Number(next) as DayStartHour)}
                />
                <p className="text-cap text-text-2">
                  {t('settings.day.explain', { start: hourLabel(data.dayStartHour), settle: settleLabel(data.dayStartHour) })}
                </p>
                {startFailed ? (
                  <NoticeLine tone="danger" role="alert">
                    {t('settings.day.failed')}
                  </NoticeLine>
                ) : null}
              </>
            ) : (
              <div role="status" aria-label={t('common.loading')}>
                {/* The switch's shape: four figures in equal cells over the hairline, then the line. */}
                <div aria-hidden className="relative flex h-11 items-center">
                  {DAY_START_HOURS.map((h) => (
                    <span key={h} className="flex flex-1 justify-center">
                      <Skeleton className="h-4 w-12" />
                    </span>
                  ))}
                  <span className="absolute inset-x-0 bottom-0 h-px bg-hair" />
                </div>
                <Skeleton className="mt-4 h-3 w-64" />
              </div>
            )}
          </Section>
        </>
      )}

      {data ? (
        <ZoneSheet
          open={zoneOpen}
          prefs={data}
          onClose={() => setZoneOpen(false)}
          onChoose={(zone) => {
            setWriting('zone');
            save.mutate(
              { timezone: zone },
              {
                onSuccess: () => setZoneOpen(false),
              },
            );
          }}
          busy={writing === 'zone' && save.isPending}
          failed={writing === 'zone' && save.isError ? (isZoneTooSoon(save.error) ? 'tooSoon' : 'other') : null}
          onRetry={() => {
            const last = save.variables;
            if (last) save.mutate(last, { onSuccess: () => setZoneOpen(false) });
          }}
        />
      ) : null}
    </Screen>
  );
}

/**
 * The one row of IDŐZÓNA: place, limit, offset, chevron. A zone that may not change yet (the
 * server's `timezoneChangeableAt` is ahead) keeps the row but switches its action off — 40 %, and
 * the sub line it already carries is the reason. Before any zone is stored the place is the dash.
 */
function ZoneRow({ prefs, onOpen }: { prefs: UserPrefs; onOpen: () => void }) {
  const { t } = useTranslation();
  const locked = zoneLocked(prefs);
  return (
    <ListRow
      title={prefs.timezone ? zoneCity(prefs.timezone) : '—'}
      sub={t('settings.day.zoneLimit')}
      value={prefs.utcOffsetMinutes !== null && prefs.timezone ? offsetLabel(prefs.utcOffsetMinutes) : undefined}
      chevron
      disabled={locked}
      aria-haspopup="dialog"
      aria-label={prefs.timezone ? `${t('settings.day.zone')}: ${zoneCity(prefs.timezone)}` : t('settings.day.zone')}
      onClick={onOpen}
    />
  );
}

interface ZoneOption {
  zone: string;
  city: string;
  offset: string;
  /** Lower-case, accents stripped: what the search compares with. */
  key: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The zone picker ("Pickers are sheets", kit `SelectSheet`): the kit `Sheet` titled "Időzóna", a
 * search field, and every zone the browser knows as radio rows on hairlines — place, offset, the
 * chosen one in ink with the lime tick, the others in `text-2`. A tap writes the zone; the sheet
 * closes when the server took it. While the write is on its way the header shows the busy dots; a
 * refusal keeps the sheet open with the danger dot and "Újra", and a line that says why.
 */
function ZoneSheet({
  open,
  prefs,
  onClose,
  onChoose,
  busy,
  failed,
  onRetry,
}: {
  open: boolean;
  prefs: UserPrefs;
  onClose: () => void;
  onChoose: (zone: string) => void;
  busy: boolean;
  failed: 'tooSoon' | 'other' | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const rows = useRef<(HTMLElement | null)[]>([]);
  const current = prefs.timezone;

  // Built when the sheet first opens, not on every keystroke: ~420 zones, each with its offset now.
  const all = useMemo<ZoneOption[]>(() => {
    if (!open) return [];
    const now = new Date();
    return knownZones()
      .map((zone) => {
        const minutes = zoneOffsetMinutes(zone, now);
        const city = zoneCity(zone);
        return { zone, city, offset: minutes === null ? '' : offsetLabel(minutes), key: fold(`${city} ${zone}`) };
      })
      // The zone in force first (the sheet opens on the answer, ticked), then by place name.
      .sort((a, b) => Number(b.zone === current) - Number(a.zone === current) || a.city.localeCompare(b.city));
  }, [open, current]);

  const q = fold(query.trim());
  const shown = q ? all.filter((o) => o.key.includes(q)) : all;
  const chosenIndex = shown.findIndex((o) => o.zone === prefs.timezone);

  const onRowsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const at = rows.current.findIndex((el) => el === document.activeElement);
    if (at === -1) return;
    e.preventDefault();
    const next = Math.min(shown.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)));
    rows.current[next]?.focus();
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        setQuery('');
        onClose();
      }}
      title={t('settings.day.zone')}
      status={busy ? 'busy' : failed ? 'error' : 'idle'}
      onRetry={failed === 'other' ? onRetry : undefined}
    >
      <SearchField label={t('settings.day.search')} placeholder={t('settings.day.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      {failed ? (
        <NoticeLine tone="danger" role="alert">
          {failed === 'tooSoon' ? t('settings.day.zoneLimit') : t('settings.day.failed')}
        </NoticeLine>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-cap text-text-2">{t('settings.day.noResults')}</p>
      ) : (
        <div onKeyDown={onRowsKey}>
          <RowStack as="div" role="radiogroup" aria-label={t('settings.day.zone')}>
            {shown.map((o, i) => {
              const on = o.zone === prefs.timezone;
              return (
                <ListRow
                  key={o.zone}
                  title={o.city}
                  tone={on ? 'default' : 'muted'}
                  value={o.offset || undefined}
                  role="radio"
                  aria-checked={on}
                  tabIndex={on || (chosenIndex === -1 && i === 0) ? 0 : -1}
                  busy={busy}
                  actionRef={(el) => {
                    rows.current[i] = el;
                  }}
                  onClick={() => {
                    if (on) onClose();
                    else onChoose(o.zone);
                  }}
                  // The chosen zone: the 24 pt lime tick in its 44 slot; the others keep the slot empty.
                  trailing={on ? <CheckMark done /> : <span aria-hidden className="size-11" />}
                />
              );
            })}
          </RowStack>
        </div>
      )}
    </Sheet>
  );
}
