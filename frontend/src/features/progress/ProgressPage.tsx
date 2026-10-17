import { type CSSProperties, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { Switch } from '../../ui/primitives/Switch';
import { SelectSheet } from '../../ui/primitives/SelectSheet';
import { DateTrigger } from '../../ui/primitives/DateTrigger';
import { FilePick } from '../../ui/primitives/FilePick';
import { Section, SectionHeader } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { StatBlock } from '../../ui/data/StatBlock';
import { Numeral } from '../../ui/data/Numeral';
import { MacroColumns } from '../../ui/data/MacroColumns';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { TrendChart } from '../../ui/feedback/TrendChart';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { ConfirmSheet } from '../../ui/feedback/ConfirmSheet';
import { useToast } from '../../ui/feedback/ToastHost';
import { Pic } from '../../ui/media/Pic';
import { UserPhoto } from '../../ui/media/UserPhoto';
import { personLabel } from '../../lib/person';
import { formatMeasure } from '../../lib/measure';
import {
  useMeasurements,
  useMetrics,
  useRecordMeasurement,
  type PhotoRow,
  useDeleteMeasurement,
  usePhotos,
  useUploadPhoto,
  useDeletePhoto,
  useShares,
  useSetShare,
  useRevokeShare,
  useAccessLog,
} from './useProgress';

/**
 * The unified progress screen — frames `progress-1` (Test), `progress-2` (Megosztás) and
 * `progress-3` (Fotók, empty). Composition follows `figma-build/app/progress-*.body.js`:
 *
 *   Header + switch    `ScreenHeader kind="root"` (y 72) and, 8 under it, the page tabs as a
 *                      `Segmented layout="cells"` (y 128). One block.
 *   Test               the hero (eyebrow, giant value + unit, the tape glowing out of the black),
 *                      12 under it the stage chart; the other metrics as bare macro columns under
 *                      a strong rule; "Mérés rögzítése"; "Bejegyzések".
 *   Fotók              the subject line + sentence while there is no photo; "Fotó hozzáadása".
 *   Megosztás          "Ki láthatja" (the coach as the subject line, the two switches, revoke);
 *                      "Ki nézte meg".
 *
 * ═══ EVERY CHART HERE IS `direction="neutral"` AND THAT IS A DECISION ══════════════════════════
 *
 * The app does not know whether a person gaining 3 kg is bulking on purpose or dieting badly, and
 * a green number is the app telling them which. Only their own goal decides that and this screen
 * does not have it. Colouring weight loss green by default is also the easiest way for a fitness
 * app to say something harmful to someone with a disordered relationship to food.
 *
 * ═══ SHARING IS ON THIS SCREEN, NOT BURIED IN SETTINGS ═════════════════════════════════════════
 *
 * A consent control that lives three taps from the thing it governs is a consent control people
 * forget they gave.
 */
export function ProgressPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'body' | 'photos' | 'sharing'>('body');

  return (
    <Screen top="root">
      <div className="flex flex-col gap-2">
        <ScreenHeader kind="root" title={t('progress.title')} />
        {/* A TAB IS A FILTER, NOT A NEW SCREEN: one route, one URL, local state (R20). */}
        <Segmented
          layout="cells"
          label={t('progress.title')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'body', label: t('progress.tab.body') },
            { value: 'photos', label: t('progress.tab.photos') },
            { value: 'sharing', label: t('progress.tab.sharing') },
          ]}
        />
      </div>

      <section aria-label={t(`progress.tab.${tab}`)} className="flex flex-col gap-section">
        {tab === 'body' ? <BodyTab /> : null}
        {tab === 'photos' ? <PhotosTab /> : null}
        {tab === 'sharing' ? <SharingTab /> : null}
      </section>
    </Screen>
  );
}

/* ── BODY ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * `pct` is a DATABASE ENUM, not a label. `%` needs no translation, which is why this is a
 * formatter and not a key.
 */
const unitSymbol = (unit?: string) => (unit === 'pct' ? '%' : (unit ?? ''));

/** The frame draws the other metrics four to a row (4 x 76.5 on 354). */
const COLUMNS_PER_ROW = 4;

function BodyTab() {
  const { t, i18n } = useTranslation();
  const metrics = useMetrics();
  const measurements = useMeasurements();
  const record = useRecordMeasurement();
  const remove = useDeleteMeasurement();
  const { toast } = useToast();

  const [metric, setMetric] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [on, setOn] = useState(todayLocal);

  const metricList = metrics.data?.metrics ?? [];
  const rows = measurements.data?.measurements ?? [];

  // One series per metric, SORTED BY DATE: the x axis is real time, so an out-of-order row from
  // the API would draw the line doubling back on itself.
  const byMetric = useMemo(() => {
    const out = new Map<string, { date: string; value: number }[]>();
    for (const m of rows) {
      const bucket = out.get(m.metric_key) ?? [];
      bucket.push({ date: m.measured_on, value: m.value });
      out.set(m.metric_key, bucket);
    }
    for (const bucket of out.values()) bucket.sort((a, b) => (a.date < b.date ? -1 : 1));
    return out;
  }, [rows]);

  /** The most-recorded metric is the one the chart opens on: the one they actually track. */
  const mostRecorded = useMemo(() => {
    let best: string | null = null;
    let n = -1;
    for (const [key, series] of byMetric) {
      if (series.length > n) {
        best = key;
        n = series.length;
      }
    }
    return best;
  }, [byMetric]);

  /*
   * The "Mit mérsz" control is the form's metric AND the chart's: there are fifteen metrics, and a
   * metric the user has never entered has no column and no chart, so the columns cannot be the
   * only way in. The hero, the chart, the unit on "Érték" and the columns all follow it.
   */
  const selected = metric ?? mostRecorded ?? 'weight';
  const meta = metricList.find((m) => m.key === selected);
  const unit = unitSymbol(meta?.unit);
  const series = byMetric.get(selected) ?? [];

  /** Latest reading of every metric that is not the one in the chart. */
  const tiles = useMemo(() => {
    const out: { key: string; value: string; unit: string; date: string }[] = [];
    for (const [key, bucket] of byMetric) {
      if (key === selected) continue;
      const last = bucket[bucket.length - 1];
      const row = rows.find((r) => r.metric_key === key);
      // FORMATTED, not raw: the API value is not rounded (`37,933 cm`).
      out.push({
        key,
        value: formatMeasure(last.value, i18n.language),
        unit: unitSymbol(row?.unit),
        date: last.date,
      });
    }
    return out;
  }, [byMetric, rows, selected]);

  const submit = async () => {
    const v = Number(value.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    await record.mutateAsync({ metric_key: selected, measured_on: on, value: v });
    setValue('');
  };

  const metricName = (key: string) => t(`progress.metricName.${key}`);
  const latest = series[series.length - 1];
  const columnRows: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += COLUMNS_PER_ROW) columnRows.push(tiles.slice(i, i + COLUMNS_PER_ROW));
  const entries = rows
    .slice()
    .sort((a, b) => (a.measured_on < b.measured_on ? 1 : -1))
    .slice(0, 30);

  return (
    <>
      {measurements.isLoading ? (
        // Blocks where the text will be — the eyebrow, the numeral at its cap height, the plot.
        // The tape is withheld: a skeleton never draws a picture.
        <div role="status" aria-busy className="flex flex-col gap-3">
          <span className="sr-only">{t('common.loading')}</span>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-[99px] w-44" />
          </div>
          <Skeleton className="h-[185px] w-full" />
        </div>
      ) : byMetric.size === 0 ? (
        // No reading at all (and today also a failed read: the two are one state, product gap).
        <EmptyState title={t('progress.emptyTitle')} body={t('progress.emptyBody')} />
      ) : (
        <>
          {/* ── the hero + the stage chart: one block, the chart 12 under the figure ── */}
          <div className="flex flex-col gap-3">
            {latest ? (
              <HeroFigure label={metricName(selected)} value={formatMeasure(latest.value, i18n.language)} unit={unit} />
            ) : null}
            <TrendChart
              variant="stage"
              series={series}
              unit={unit}
              label={metricName(selected)}
              // NEUTRAL. See the file header: the app does not know which way is good.
              direction="neutral"
            />
          </div>

          {/* ── the other metrics: a strong rule, no eyebrow (none is drawn), bare columns ── */}
          {columnRows.length > 0 ? (
            <div className="flex flex-col gap-4">
              <Rule strong />
              {columnRows.map((chunk) => (
                <MacroColumns
                  key={chunk[0].key}
                  columns={chunk.map((tile) => ({
                    name: metricName(tile.key),
                    value: tile.value,
                    unit: tile.unit,
                    caption: tile.date,
                  }))}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      {/* ── record ── */}
      <Section title={t('progress.record')}>
        <div className="flex flex-col gap-5">
          <SelectSheet
            label={t('progress.metric')}
            value={selected}
            onChange={setMetric}
            options={metricList.map((m) => ({ value: m.key, label: metricName(m.key) }))}
          />
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label={unit ? `${t('progress.value')} (${unit})` : t('progress.value')}
                inputMode="decimal"
                value={value}
                aria-invalid={record.isError || undefined}
                onChange={(e) => {
                  setValue(e.target.value);
                  // The error belongs to the value that produced it.
                  if (record.isError) record.reset();
                }}
              />
              <DateTrigger label={t('progress.on')} value={on} onChange={setOn} />
            </div>
            {/* Full width under the pair: in the 169 pt column the sentence would wrap to five lines. */}
            {record.isError ? (
              <NoticeLine tone="danger" role="alert">
                {t('progress.outOfRange')}
              </NoticeLine>
            ) : null}
          </div>
          <Pressable variant="primary" size="lg" className="w-full" busy={record.isPending} onClick={submit}>
            {t('common.save')}
          </Pressable>
        </div>
      </Section>

      {/* ── entries: newest first, at most 30 ── */}
      {entries.length > 0 ? (
        <Section title={t('progress.entries')}>
          <RowStack>
            {entries.map((m) => (
              <ListRow
                key={m.id}
                title={metricName(m.metric_key)}
                sub={m.measured_on}
                control={
                  <span className="flex items-center gap-5">
                    <span className="flex items-baseline gap-1">
                      <span className="text-data-l text-text-1">{formatMeasure(m.value, i18n.language)}</span>
                      <span className="text-cap text-text-2">{unitSymbol(m.unit)}</span>
                    </span>
                    {/* One tap and no confirm — UNDOABLE instead: every field the record mutation
                        wants is in this row, so the toast puts the measurement back exactly. */}
                    <Pressable
                      variant="link"
                      shape="icon"
                      className="-mr-4"
                      aria-label={t('common.delete')}
                      onClick={() =>
                        remove.mutate(m.id, {
                          onSuccess: () =>
                            toast(t('progress.measurementDeleted'), 'info', {
                              onUndo: () =>
                                record.mutate({
                                  metric_key: m.metric_key,
                                  measured_on: m.measured_on,
                                  value: m.value,
                                  note: m.note,
                                }),
                            }),
                        })
                      }
                    >
                      <X aria-hidden />
                    </Pressable>
                  </span>
                }
              />
            ))}
          </RowStack>
        </Section>
      ) : null}
    </>
  );
}

/** progress-1 "Image/hero-tape": 201 wide, flush with the screen's right edge (x 201 on the 402 frame). */
const TAPE_WIDTH = 201;
const TAPE_LEFT = 177;
const TAPE_GUTTER = 24;

/**
 * The hero: eyebrow, the giant reading with its unit, and the tape glowing out of the black on the
 * right, its top 1 above the eyebrow, "kg" in its black corner. The frame's "83,1" ends exactly where
 * the tape begins; a wider reading ("105,1" chest, "100,3" weight) would run into the coil, so the
 * tape starts no earlier than the digits' ink ends and slides out past the screen edge instead
 * (the scaffold clips it). Measured on the laid-out figure, so it holds at 360 / 402 / 430 too.
 */
function HeroFigure({ label, value, unit }: { label: string; value: string; unit: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(TAPE_LEFT);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const digits = box?.querySelector<HTMLElement>('[data-kit="numeral"] > span');
    if (!box || !digits) return;
    const measure = () => {
      const inkEnd = digits.getBoundingClientRect().right - box.getBoundingClientRect().left;
      // flush with the screen's right edge, whatever the gutter (24, or 16 below 376 pt)
      const flush = document.documentElement.clientWidth - box.getBoundingClientRect().left - TAPE_WIDTH;
      // ...but never past the column's own gutter on a desktop-wide window
      const column = box.clientWidth + TAPE_GUTTER - TAPE_WIDTH;
      setLeft(Math.round(Math.max(Math.min(flush, column), inkEnd)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [value, unit]);

  return (
    <div ref={boxRef} className="relative">
      <span aria-hidden className="absolute -top-px left-[var(--tape-x)]" style={{ '--tape-x': `${left}px` } as CSSProperties}>
        <Pic slot="hero-tape" width={TAPE_WIDTH} priority bleed />
      </span>
      <StatBlock label={label} className="relative">
        <Numeral size="giant" value={value} unit={unit} />
      </StatBlock>
    </div>
  );
}

/* ── PHOTOS ─────────────────────────────────────────────────────────────────────────────────── */

function PhotosTab() {
  const { t } = useTranslation();
  const photos = usePhotos();
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const [on, setOn] = useState(todayLocal);
  /*
   * A CONFIRM RATHER THAN AN UNDO, and the choice is forced: `useUploadPhoto` takes a `File`, and
   * once the row is deleted the browser no longer holds the original, so there is nothing to
   * replay. A photograph of your body on a particular day cannot be retaken either.
   */
  const [confirmPhoto, setConfirmPhoto] = useState<PhotoRow | null>(null);

  const list = photos.data?.photos ?? [];
  const empty = !photos.isLoading && list.length === 0;

  return (
    <>
      {/* progress-3: the subject line and its sentence FIRST, then the add section. */}
      {empty ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-display-xl text-text-1">{t('progress.noPhotosTitle')}</h2>
          <p className="text-body text-text-2">{t('progress.noPhotosBody')}</p>
        </div>
      ) : null}

      <Section title={t('progress.addPhoto')} rule={empty}>
        <div className="flex flex-col gap-5">
          {/* SAID BEFORE THE UPLOAD, before any control: who can see it is nobody by default. */}
          <p className="text-body text-text-1">{t('progress.photoPrivacyNote')}</p>
          <DateTrigger label={t('progress.on')} value={on} onChange={setOn} />
          <div className="flex flex-col gap-2">
            {/* Choosing a file uploads it at once — there is no save step. */}
            <FilePick
              size="lg"
              className="w-full"
              accept="image/jpeg,image/png,image/webp"
              busy={upload.isPending}
              onFiles={([file]) => {
                if (file) upload.mutate({ file, taken_on: on });
              }}
            >
              {t('progress.chooseFile')}
            </FilePick>
            {upload.isPending ? (
              <NoticeLine role="status">{t('common.saving')}</NoticeLine>
            ) : upload.isError ? (
              <NoticeLine tone="danger" role="alert">
                {t('progress.uploadFailed')}
              </NoticeLine>
            ) : null}
          </div>
        </div>
      </Section>

      {photos.isLoading ? (
        <div role="status" aria-busy className="grid grid-cols-3 gap-2">
          <span className="sr-only">{t('common.loading')}</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : list.length > 0 ? (
        <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
          {list.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-col gap-1">
              {/* The gated route, never a static path: the key is not the permission. The
                  member's own photos keep their colour. Nothing is laid over the picture. */}
              <UserPhoto
                src={`/api/v1/progress-media/${p.storage_key}`}
                alt={t('progress.photoAlt', { date: p.taken_on })}
                ratio={1}
              />
              <span className="text-data text-text-2">{p.taken_on}</span>
              <TextLink tone="danger" className="self-start" onClick={() => setConfirmPhoto(p)}>
                {t('common.delete')}
              </TextLink>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmSheet
        open={confirmPhoto !== null}
        onClose={() => setConfirmPhoto(null)}
        title={t('progress.deletePhotoTitle')}
        message={t('progress.deletePhotoBody')}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (confirmPhoto) remove.mutate(confirmPhoto.id);
          setConfirmPhoto(null);
        }}
      />
    </>
  );
}

/* ── SHARING ────────────────────────────────────────────────────────────────────────────────── */

function SharingTab() {
  const { t, i18n } = useTranslation();
  const shares = useShares();
  const setShare = useSetShare();
  const revoke = useRevokeShare();
  const log = useAccessLog();
  const baseId = useId();

  const live = (s: { revoked_at: number | null; link_status: string }) =>
    s.revoked_at == null && s.link_status === 'active';

  const list = shares.data?.shares ?? [];
  const entries = (log.data?.entries ?? []).slice(0, 50);
  // At most one 48 pt subject line per screen: with several coaches every name takes `display`.
  const nameClass = list.length === 1 ? 'text-display-xl' : 'text-display';

  return (
    <>
      <div className="flex flex-col gap-4">
        <SectionHeader rule={false} title={t('progress.whoCanSee')} />
        {list.length === 0 ? (
          <p className="text-body text-text-2">{t('progress.noShares')}</p>
        ) : (
          list.map((s, i) => {
            const measId = `${baseId}-m-${s.id}`;
            const photoId = `${baseId}-p-${s.id}`;
            return (
              <div key={s.id} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <h3 className={`${nameClass} break-words text-text-1`}>
                    {personLabel({ email: s.coach_email, display_name: s.coach_display_name })}
                    {/* An archived link is shown as ENDED rather than hidden: "I revoked it" and
                        "they left" are different facts. */}
                    {s.link_status !== 'active' ? (
                      <span className="ml-2 align-middle text-micro text-text-3">{t('progress.linkEnded')}</span>
                    ) : null}
                  </h3>
                  {i === 0 ? <p className="text-body text-text-2">{t('progress.sharingNote')}</p> : null}
                </div>
                <RowStack open as="div" role="group" aria-label={t('progress.whoCanSee')}>
                  <ListRow
                    title={t('progress.shareMeasurements')}
                    titleId={measId}
                    control={
                      <Switch
                        checked={s.share_measurements === 1 && live(s)}
                        disabled={s.link_status !== 'active'}
                        labelledBy={measId}
                        onChange={(v) => setShare.mutate({ linkId: s.coach_client_id, share_measurements: v })}
                      />
                    }
                  />
                  <ListRow
                    title={t('progress.sharePhotos')}
                    titleId={photoId}
                    control={
                      <Switch
                        checked={s.share_photos === 1 && live(s)}
                        disabled={s.link_status !== 'active'}
                        labelledBy={photoId}
                        onChange={(v) => setShare.mutate({ linkId: s.coach_client_id, share_photos: v })}
                      />
                    }
                  />
                  {live(s) && (s.share_measurements === 1 || s.share_photos === 1) ? (
                    <ListRow tone="danger" title={t('progress.revokeAll')} onClick={() => revoke.mutate(s.coach_client_id)} />
                  ) : null}
                </RowStack>
              </div>
            );
          })
        )}
      </div>

      <Section title={t('progress.whoLooked')}>
        {entries.length === 0 ? (
          <p className="text-body text-text-2">{t('progress.noLooks')}</p>
        ) : (
          <RowStack>
            {entries.map((e) => {
              const at = new Date(e.at * 1000);
              return (
                <ListRow
                  key={e.id}
                  // The stored snapshot is a full address; the screen shows the local part —
                  // identifying, and not deliverable (lib/person.ts).
                  title={personLabel({ email: e.viewer })}
                  sub={t(`progress.looked.${e.kind}`, { defaultValue: e.kind })}
                  trailing={
                    <span className="flex flex-col items-end gap-0.5 text-data">
                      <span className="text-text-2">{at.toLocaleDateString(i18n.language)}</span>
                      <span className="text-text-3">{at.toLocaleTimeString(i18n.language)}</span>
                    </span>
                  }
                />
              );
            })}
          </RowStack>
        )}
      </Section>
    </>
  );
}

/** Local calendar day; `toISOString()` is UTC and would be yesterday at 01:00 in Budapest. */
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
