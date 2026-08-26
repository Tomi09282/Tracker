import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Camera,
  Trash2,
  Eye,
  ShieldCheck,
  Plus,
  Ruler,
  Percent,
  Scale,
  CalendarDays,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { Surface } from '../../ui/primitives/Surface';
import { SummaryTile } from '../../ui/data/SummaryTile';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { TrendChart } from '../../ui/feedback/TrendChart';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { personLabel } from '../../lib/person';
import { formatMeasure } from '../../lib/measure';
import {
  useMeasurements,
  useMetrics,
  useRecordMeasurement,
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
 * The unified progress screen — [[55-Screens/haladas]].
 *
 * ═══ THE ANCHOR IS A CHART, AND IT IS ONE CHART ════════════════════════════════════════════════
 *
 * The question this screen exists to answer is "is it moving", which is a DIRECTION OVER TIME, and
 * only a line answers that. A ring would be wrong for a specific reason: a ring implies a target,
 * and this screen does not have one — the app does not know whether someone gaining weight is
 * bulking on purpose or dieting badly.
 *
 * What changed in the redesign is the COUNT. Every metric used to get its own full chart card, so
 * a person who records five things got a vertical stack of five identical pictures and no
 * hierarchy at all. Now the selected metric gets the one large chart and every other recorded
 * metric collapses to a `SummaryTile` — its latest reading, an icon and a date. Three tiles say
 * what nine rows said, and the space it buys is what puts the record form above the fold.
 *
 * ═══ EVERY CHART HERE IS `direction="neutral"` AND THAT IS A DECISION ══════════════════════════
 *
 * The app does not know whether a person gaining 3 kg is bulking on purpose or dieting badly, and
 * a green number is the app telling them which. Only their own goal decides that and this screen
 * does not have it. Colouring weight loss green by default is also the easiest way for a fitness
 * app to say something harmful to someone with a disordered relationship to food, and it costs
 * nothing to not do.
 *
 * ═══ SHARING IS ON THIS SCREEN, NOT BURIED IN SETTINGS ═════════════════════════════════════════
 *
 * A consent control that lives three taps from the thing it governs is a consent control people
 * forget they gave. It sits under the photos, saying who can see them, with revoke in reach.
 */
export function ProgressPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'body' | 'photos' | 'sharing'>('body');

  return (
    <div className="col-mobile screen-x flex flex-col gap-group py-6">
      <h1 className="text-title-1 text-text-1">{t('progress.title')}</h1>

      {/* A TAB IS A FILTER, NOT A NEW SCREEN — the Phase 2 lesson, applied. One route, one URL,
          and no per-tab endpoint to keep in step with the others.
          It is deliberately NOT a `<nav>`: a nav landmark announces "these go somewhere", and
          these three do not. `role="tablist"` says what it actually is.

          NOT a `Surface` either, and that is a measured decision rather than laziness: a segmented
          track is a pill, and `Surface` hard-codes `rounded-[var(--card-radius)]`. `cn` is
          tailwind-merge, which does NOT treat `rounded-chip` and `rounded-[var(--card-radius)]` as
          the same group — verified — so both classes survive the merge and the CSS source order
          decides, silently, in favour of the arbitrary one. A track is not a card; it gets the two
          properties it actually needs. */}
      <div
        role="tablist"
        aria-label={t('progress.title')}
        className="flex gap-1 rounded-chip bg-surface-2 p-1"
      >
        {(['body', 'photos', 'sharing'] as const).map((key) => (
          <Pressable
            key={key}
            role="tab"
            id={`progress-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`progress-panel-${key}`}
            // The accent fill marks a SELECTED STATE, not a primary action — a segmented control
            // has no action in it at all. It is the only filled thing in the pill, which is what
            // makes "which one am I looking at" answerable at a glance.
            variant={tab === key ? 'primary' : 'ghost'}
            shape="chip"
            density="compact"
            className="flex-1"
            onClick={() => setTab(key)}
          >
            {t(`progress.tab.${key}`)}
          </Pressable>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`progress-panel-${tab}`}
        aria-labelledby={`progress-tab-${tab}`}
        className="flex flex-col gap-section"
      >
        {tab === 'body' ? <BodyTab /> : null}
        {tab === 'photos' ? <PhotosTab /> : null}
        {tab === 'sharing' ? <SharingTab /> : null}
      </div>
    </div>
  );
}

/* ── BODY ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * `pct` is a DATABASE ENUM, not a label. It reached the screen raw and rendered "18.5 pct" beside
 * "84 cm" — one of the three units written the way a person writes it and one written the way a
 * column is named. `%` needs no translation, which is why this is a formatter and not a key.
 */
const unitSymbol = (unit?: string) => (unit === 'pct' ? '%' : (unit ?? ''));

/**
 * A glyph per metric family. The icon is what makes a row of tiles scan as objects rather than as
 * a paragraph, so a tile without one is a label-and-value table with extra padding.
 */
const METRIC_ICON: Record<string, LucideIcon> = { weight: Scale, body_fat: Percent };
const iconFor = (key: string): LucideIcon => METRIC_ICON[key] ?? Ruler;

function BodyTab() {
  const { t, i18n } = useTranslation();
  const metrics = useMetrics();
  const measurements = useMeasurements();
  const record = useRecordMeasurement();
  const remove = useDeleteMeasurement();

  const [metric, setMetric] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [on, setOn] = useState(todayLocal);

  const metricList = metrics.data?.metrics ?? [];
  const rows = measurements.data?.measurements ?? [];

  // One series per metric, so the screen draws only what the user actually records — a chart frame
  // for a metric nobody has ever entered is a blank axis pretending to be data (T4.2.6).
  //
  // SORTED BY DATE, which it was not: the x axis is real time, so an out-of-order row from the API
  // drew the line doubling back on itself. The chart cannot sort for us — by the time it sees the
  // series it can no longer tell a back-dated entry from a genuine one.
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
   * ═══ WHERE THE METRIC COMES FROM ═════════════════════════════════════════════════════════════
   *
   * The redesign cut the `Mit mérsz` select out of the record form, and that cut has a cost the
   * mockup cannot show: there are FIFTEEN metrics and hard-coding the form to `Testsúly` silently
   * deletes fourteen features. A metric the user has never entered has no tile and no chart, so
   * the tiles cannot be the only way in either — you cannot switch to something that is not there.
   *
   * So the select comes back, FULL WIDTH, exactly as the code had measured it: sharing a wrapped
   * row with the value, the date and the save button squeezed it to 37px — under the 44px floor in
   * the dimension a thumb misses — and it carries the longest label in the form ("Alkar (jobb)").
   *
   * It earns its row by doing two jobs instead of one: it is the form's metric AND the chart's.
   * The anchor follows it, the unit suffix on `Érték` follows it, and the tiles below show every
   * OTHER recorded metric. One control, one selected thing, nothing on screen disagreeing with it.
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
      // FORMATTED, not raw. These rendered `37,933 cm` and `18,486 %` — three decimals of a
      // number nobody measured to three decimals — because the value went straight from the API
      // into `SummaryTile`, which prints what it is given. Passing a string also skips CountUp's
      // odometer, which is correct here: these are secondary readings, and the chart above is the
      // thing that should be moving.
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

  return (
    <>
      {/* ── the anchor ─────────────────────────────────────────────────────────────────────────
          One large chart, then the rest of the body as compact tiles. The hierarchy IS the
          redesign: at equal weight the reader has to choose what to look at, and a screen that
          asks that question of a phone at arm's length gets no answer. */}
      {measurements.isLoading ? (
        <div className="flex flex-col gap-group" role="status" aria-busy>
          {/* The skeleton is the NEW geometry, not the old one — a placeholder that does not match
              what lands causes exactly the layout shift it exists to prevent. */}
          <Skeleton className="h-44 rounded-card" />
          <div className="grid grid-cols-2 gap-group">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
          </div>
        </div>
      ) : byMetric.size === 0 ? (
        <EmptyState icon={LineChart} title={t('progress.emptyTitle')} body={t('progress.emptyBody')} />
      ) : (
        <div className="flex flex-col gap-group">
          <Surface>
            <TrendChart
              series={series}
              unit={unit}
              label={t(`progress.metricName.${selected}`)}
              // NEUTRAL. See the file header: the app does not know which way is good.
              direction="neutral"
            />
          </Surface>

          {tiles.length > 0 ? (
            <div className="grid grid-cols-2 gap-group">
              {tiles.map((tile) => (
                <SummaryTile
                  key={tile.key}
                  icon={iconFor(tile.key)}
                  // Centred, as 05-haladas.webp draws them: the chart above owns the left edge, and
                  // two tiles hanging off it read as a third and fourth column of the same block.
                  align="center"
                  value={`${tile.value} ${tile.unit}`}
                  caption={`${t(`progress.metricName.${tile.key}`)} · ${tile.date}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* ── record ─────────────────────────────────────────────────────────────────────────────
          Above the fold, which is the whole point of collapsing the other charts into tiles. */}
      <section className="flex flex-col gap-group">
        <SectionHeading icon={Plus} title={t('progress.record')} />

        <Surface className="flex flex-col gap-group">
          {/* FULL WIDTH, NOT flex-1 — see the block comment above `selected`. */}
          <label className="flex flex-col gap-tight">
            <span className="text-body-s text-text-2">{t('progress.metric')}</span>
            <select
              value={selected}
              onChange={(e) => setMetric(e.target.value)}
              className="text-body min-h-[var(--control-h)] w-full rounded-field border-[length:var(--border-width)] border-[var(--field-border)] bg-[var(--field-bg)] px-3 text-text-1"
            >
              {metricList.map((m) => (
                <option key={m.key} value={m.key}>
                  {t(`progress.metricName.${m.key}`)}
                </option>
              ))}
            </select>
          </label>

          {/* `items-start`, not `items-end`: the value field GROWS DOWNWARD when the range check
              fails, and bottom alignment would have dragged the date field and the save button
              down with the error message. */}
          <div className="flex flex-wrap items-start gap-tight">
            <Field
              label={unit ? `${t('progress.value')} (${unit})` : t('progress.value')}
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                // The error belongs to the value that produced it. Leaving it up while the user
                // fixes the typo is the app arguing with a number that is no longer there.
                if (record.isError) record.reset();
              }}
              // The trigger's range check reaches the user as a plain sentence, not a stack trace
              // and not silence (4ab). `Field` owns the whole treatment — danger border, the glyph
              // inside the leading edge, and a `role="alert"` line under it — so colour is never
              // the only carrier for the ~12% of readers with a colour-vision deficiency.
              error={record.isError ? t('progress.outOfRange') : undefined}
              leading={record.isError ? <AlertCircle className="size-icon-s" /> : undefined}
              className="min-w-[104px] flex-1"
            />
            <Field
              label={t('progress.on')}
              type="date"
              value={on}
              onChange={(e) => setOn(e.target.value)}
              leading={<CalendarDays className="size-icon-s" />}
              className="min-w-[144px] flex-1"
            />
            {/* The blank span is a LABEL-HEIGHT SPACER, not decoration: it carries the same
                type step and the same `gap-tight` as the two fields beside it, so the button's top
                edge lines up with theirs without a magic margin that a type-scale change breaks. */}
            <div className="flex shrink-0 flex-col gap-tight">
              <span aria-hidden className="text-body-s">
                &nbsp;
              </span>
              <Pressable variant="primary" busy={record.isPending} onClick={submit}>
                {t('common.save')}
              </Pressable>
            </div>
          </div>
        </Surface>
      </section>

      {/* ── entries ────────────────────────────────────────────────────────────────────────────
          ONE card with hairline dividers, not one card per row. Six bordered cards in a column is
          six boundaries drawn around things that belong to each other; the list is the object.
          No fixed height — the list runs past the bottom edge and the page scrolls. */}
      {rows.length > 0 ? (
        <section className="flex flex-col gap-group">
          <h2 className="text-title-2 text-text-1">{t('progress.entries')}</h2>
          <Surface as="ul" pad="none" className="divide-y divide-[var(--surface-border)]">
            {rows
              .slice()
              .sort((a, b) => (a.measured_on < b.measured_on ? 1 : -1))
              .slice(0, 30)
              .map((m) => (
                <li key={m.id} className="flex items-center gap-tight px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-body-strong block truncate text-text-1">
                      {t(`progress.metricName.${m.metric_key}`)}
                    </span>
                    {/* FORMATTED, like the tiles and the chart headline above it. The raw API
                        value put `18.486 %` in this row while the tile beside it said `18,5 %` —
                        one measurement, two readings, on one screen. `formatMeasure` is the one
                        rule for a body measurement, so the three sites agree by construction
                        rather than by three call sites remembering to. */}
                    <span className="text-caption tabular-nums text-text-3">
                      {m.measured_on} · {formatMeasure(m.value, i18n.language)}{' '}
                      {unitSymbol(m.unit)}
                    </span>
                  </span>
                  {/* One tap, no armed state and no confirm — the same as the food log. */}
                  <Pressable
                    variant="ghost"
                    shape="icon"
                    onClick={() => remove.mutate(m.id)}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-icon-s" aria-hidden />
                  </Pressable>
                </li>
              ))}
          </Surface>
        </section>
      ) : null}
    </>
  );
}

/* ── PHOTOS ─────────────────────────────────────────────────────────────────────────────────── */

function PhotosTab() {
  const { t } = useTranslation();
  const photos = usePhotos();
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const [on, setOn] = useState(todayLocal);

  return (
    <>
      <section className="flex flex-col gap-group">
        <h2 className="text-title-2 text-text-1">{t('progress.addPhoto')}</h2>

        <Surface className="flex flex-col gap-group">
          {/* SAID BEFORE THE UPLOAD, not after, and before any control on the card. Someone about
              to photograph their body deserves to know who can see it before they choose the file,
              and the answer is nobody by default. */}
          <p className="text-body-s text-text-2">{t('progress.photoPrivacyNote')}</p>

          <div className="flex flex-wrap items-start gap-tight">
            <Field
              label={t('progress.on')}
              type="date"
              value={on}
              onChange={(e) => setOn(e.target.value)}
              leading={<CalendarDays className="size-icon-s" />}
              className="min-w-[144px] flex-1"
            />
            {/* Same label-height spacer as the record form, for the same reason. */}
            <div className="flex shrink-0 flex-col gap-tight">
              <span aria-hidden className="text-body-s">
                &nbsp;
              </span>
              <label className="text-body-s flex min-h-[var(--control-h)] cursor-pointer items-center justify-center rounded-button border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-1 px-4 text-text-1">
                {t('progress.chooseFile')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate({ file, taken_on: on });
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {upload.isPending ? (
              <span className="text-body-s self-center text-text-3">{t('common.saving')}</span>
            ) : null}
          </div>

          {upload.isError ? (
            <p className="text-caption flex items-center gap-tight text-danger" role="alert">
              <AlertCircle className="size-icon-s shrink-0" aria-hidden />
              {t('progress.uploadFailed')}
            </p>
          ) : null}
        </Surface>
      </section>

      {photos.isLoading ? (
        <div className="grid grid-cols-3 gap-tight" role="status" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-card" />
          ))}
        </div>
      ) : (photos.data?.photos ?? []).length === 0 ? (
        <EmptyState icon={Camera} title={t('progress.noPhotosTitle')} body={t('progress.noPhotosBody')} />
      ) : (
        <ul className="grid grid-cols-3 gap-tight">
          {(photos.data?.photos ?? []).map((p) => (
            <li key={p.id} className="relative">
              <img
                // The gated route, never a static path. The key is not the permission.
                src={`/api/v1/progress-media/${p.storage_key}`}
                alt={t('progress.photoAlt', { date: p.taken_on })}
                loading="lazy"
                className="aspect-square w-full rounded-card object-cover"
              />
              {/* SOLID, not a veil: this pill sits on a photograph, and an alpha fill over an
                  unknown image is a date you can read on some of them. */}
              <span className="text-micro absolute bottom-1 left-1 rounded-chip bg-surface-0 px-2 py-1 text-text-2">
                {p.taken_on}
              </span>
              <Pressable
                variant="ghost"
                shape="icon"
                className="absolute right-0 top-0"
                onClick={() => remove.mutate(p.id)}
                aria-label={t('common.delete')}
              >
                <Trash2 className="size-icon-s" aria-hidden />
              </Pressable>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ── SHARING ────────────────────────────────────────────────────────────────────────────────── */

function SharingTab() {
  const { t } = useTranslation();
  const shares = useShares();
  const setShare = useSetShare();
  const revoke = useRevokeShare();
  const log = useAccessLog();

  const live = (s: { revoked_at: number | null; link_status: string }) =>
    s.revoked_at == null && s.link_status === 'active';

  return (
    <>
      <section className="flex flex-col gap-group">
        <SectionHeading icon={ShieldCheck} title={t('progress.whoCanSee')} />

        <Surface className="flex flex-col gap-group">
          <p className="text-body-s text-text-2">{t('progress.sharingNote')}</p>

          {(shares.data?.shares ?? []).length === 0 ? (
            <p className="text-body-s text-text-3">{t('progress.noShares')}</p>
          ) : (
            <ul className="flex flex-col gap-tight">
              {(shares.data?.shares ?? []).map((s) => (
                <Surface as="li" key={s.id} elevation="inset" rim={false} className="flex flex-col gap-tight">
                  <div className="text-body-s flex items-center justify-between gap-tight text-text-1">
                    <span className="truncate">
                      {personLabel({ email: s.coach_email, display_name: s.coach_display_name })}
                    </span>
                    {/* An archived link is shown as ENDED rather than hidden, because "I revoked
                        it" and "they left" are different facts and the client is entitled to
                        both. */}
                    {s.link_status !== 'active' ? (
                      <span className="text-micro shrink-0 rounded-chip border-[length:var(--border-width)] border-[var(--surface-border)] px-2 py-1 uppercase text-text-3">
                        {t('progress.linkEnded')}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col">
                    <Toggle
                      label={t('progress.shareMeasurements')}
                      checked={s.share_measurements === 1 && live(s)}
                      disabled={s.link_status !== 'active'}
                      onChange={(v) => setShare.mutate({ linkId: s.coach_client_id, share_measurements: v })}
                    />
                    <Toggle
                      label={t('progress.sharePhotos')}
                      checked={s.share_photos === 1 && live(s)}
                      disabled={s.link_status !== 'active'}
                      onChange={(v) => setShare.mutate({ linkId: s.coach_client_id, share_photos: v })}
                    />
                  </div>

                  {live(s) && (s.share_measurements === 1 || s.share_photos === 1) ? (
                    <Pressable
                      variant="danger"
                      density="compact"
                      className="self-start"
                      onClick={() => revoke.mutate(s.coach_client_id)}
                    >
                      {t('progress.revokeAll')}
                    </Pressable>
                  ) : null}
                </Surface>
              ))}
            </ul>
          )}
        </Surface>
      </section>

      <section className="flex flex-col gap-group">
        <SectionHeading icon={Eye} title={t('progress.whoLooked')} />

        {(log.data?.entries ?? []).length === 0 ? (
          <p className="text-body-s text-text-3">{t('progress.noLooks')}</p>
        ) : (
          <Surface as="ul" pad="none" className="divide-y divide-[var(--surface-border)]">
            {(log.data?.entries ?? []).slice(0, 50).map((e) => (
              <li key={e.id} className="px-4 py-2">
                {/* THE STORED SNAPSHOT STAYS A FULL ADDRESS; THE SCREEN DOES NOT SHOW ONE.
                    `viewer_email_snapshot` is written at access time on purpose — an audit trail
                    of who read someone's health data has to survive that person renaming
                    themselves or being deleted, so it cannot be a join. But the client reading
                    this list needs to recognise a coach, not be handed a mailbox, and the same
                    rule that took addresses off every other screen applies here (lib/person.ts).
                    `personLabel` on a record with no name yields the local part, which is exactly
                    the right amount: identifying, and not deliverable. */}
                <span className="text-body-strong block truncate text-text-1">
                  {personLabel({ email: e.viewer })}
                </span>
                <span className="text-caption tabular-nums text-text-3">
                  {t(`progress.looked.${e.kind}`, { defaultValue: e.kind })} ·{' '}
                  {new Date(e.at * 1000).toLocaleString()}
                </span>
              </li>
            ))}
          </Surface>
        )}
      </section>
    </>
  );
}

/**
 * The `h2` that opens `Mérés rögzítése`, `Ki láthatja` and `Ki nézte meg`.
 *
 * ═══ A BADGE IS NOT A PUCK ═════════════════════════════════════════════════════════════════════
 *
 * The three hand-written spans this replaces were `rounded-chip bg-accent-subtle`, and
 * `rounded-chip` is the pill radius in every pack but Mono — so on a square box it rendered as a
 * full circle with a 12% accent wash, pixel-identical to `SummaryTile`'s icon puck sitting 60px
 * above the first one. 05-haladas.webp draws two marks on purpose: the tile puck is a CIRCLE on an
 * accent wash and labels a number, the section badge is a rounded SQUARE on a neutral inset fill
 * with a hairline edge and opens a section.
 *
 * Every value below is measured off that mockup rather than felt:
 *   - `size-11` — the badge box is 69px there and the value field beside it is 69px tall, so the
 *     badge is exactly one `--control-h`. Absolute pixels do not transfer from that render (its
 *     field is 24 CSS px), the ratio does.
 *   - `rounded-field` — the corner runs 18px of that 69, 26% of the side. `rounded-field` is
 *     12/44 = 27%; `rounded-card` would be 16/44 = 36%, visibly rounder than the image. It is also
 *     what both existing section badges in this app already use.
 *   - `bg-surface-2` — the badge fill samples the same value as the date field's inset next to it,
 *     and `--field-bg` IS `--surface-2`.
 *
 * Local rather than shared, for the reason `features/library/SectionBadge.tsx` writes down: this
 * wants to be `ui/data/SectionHeader`, but that one still carries the accent wash — the half the
 * mockup contradicts — and `src/ui/` is being edited in parallel. Promoting this changes an import
 * path and nothing else.
 */
function SectionHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <h2 className="text-title-2 flex items-center gap-tight text-text-1">
      <span
        aria-hidden
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-field border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-2 text-accent"
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>
      {title}
    </h2>
  );
}

/**
 * The consent row: label left, accent checkbox right, whole row tappable.
 *
 * A CHECKBOX AND NOT `Switch`, on purpose. `Switch` exists and is the better control for most
 * settings, but swapping these two is a decision about a consent surface — the one place where
 * "did I turn that on" has to be answerable from memory — and it is not a side effect of a visual
 * redesign. It stays a checkbox until someone chooses otherwise on the record.
 */
function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="text-body-s flex min-h-[var(--target-min)] cursor-pointer items-center justify-between gap-tight text-text-1">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 accent-[var(--accent)] disabled:opacity-45"
      />
    </label>
  );
}

/** Local calendar day; `toISOString()` is UTC and would be yesterday at 01:00 in Budapest. */
function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
