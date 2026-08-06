import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Camera, Trash2, Eye, ShieldCheck } from 'lucide-react';
import { Pressable } from '../../ui/primitives/Pressable';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { TrendChart } from '../../ui/feedback/TrendChart';
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
 * The unified progress screen (T4.2.5).
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
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-title-2">{t('progress.title')}</h1>

      {/* A TAB IS A FILTER, NOT A NEW SCREEN — the Phase 2 lesson, applied. One route, one URL,
          and no per-tab endpoint to keep in step with the others. */}
      <nav className="flex gap-1 rounded-card bg-surface-2 p-1" role="tablist">
        {(['body', 'photos', 'sharing'] as const).map((key) => (
          <Pressable
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? 'secondary' : 'ghost'}
            density="compact"
            className="flex-1"
            onClick={() => setTab(key)}
          >
            {t(`progress.tab.${key}`)}
          </Pressable>
        ))}
      </nav>

      {tab === 'body' ? <BodyTab /> : null}
      {tab === 'photos' ? <PhotosTab /> : null}
      {tab === 'sharing' ? <SharingTab /> : null}
    </div>
  );
}

/* ── BODY ───────────────────────────────────────────────────────────────────────────────────── */

function BodyTab() {
  const { t } = useTranslation();
  const metrics = useMetrics();
  const measurements = useMeasurements();
  const record = useRecordMeasurement();
  const remove = useDeleteMeasurement();

  const [metric, setMetric] = useState('weight');
  const [value, setValue] = useState('');
  const [on, setOn] = useState(todayLocal);

  // One series per metric, so the screen draws only what the user actually records — a chart frame
  // for a metric nobody has ever entered is a blank axis pretending to be data (T4.2.6).
  const byMetric = useMemo(() => {
    const out = new Map<string, { date: string; value: number }[]>();
    for (const m of measurements.data?.measurements ?? []) {
      const bucket = out.get(m.metric_key) ?? [];
      bucket.push({ date: m.measured_on, value: m.value });
      out.set(m.metric_key, bucket);
    }
    return out;
  }, [measurements.data]);

  const chosen = (metrics.data?.metrics ?? []).find((m) => m.key === metric);

  const submit = async () => {
    const v = Number(value.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    await record.mutateAsync({ metric_key: metric, measured_on: on, value: v });
    setValue('');
  };

  return (
    <>
      <section className="rounded-card border border-line bg-surface-2 p-4">
        <h2 className="text-label mb-3 text-text-2">{t('progress.record')}</h2>
        <div className="flex flex-wrap items-end gap-2">
          {/* FULL WIDTH, NOT flex-1. Measured at 360: sharing a wrapped row with the value, the
              date and the save button squeezed the select to 37 px — under the 44 px floor in one
              dimension, which is the dimension a thumb misses. It is also the longest label in the
              form ("Forearm (right)"), so it was never going to fit beside three other controls. */}
          <label className="flex w-full flex-col">
            <span className="text-caption text-text-3">{t('progress.metric')}</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="text-body min-h-[var(--target-min)] w-full rounded-card border border-line bg-surface-3 px-2 text-text-1"
            >
              {(metrics.data?.metrics ?? []).map((m) => (
                <option key={m.key} value={m.key}>
                  {t(`progress.metricName.${m.key}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col">
            <span className="text-caption text-text-3">
              {t('progress.value')} {chosen ? `(${chosen.unit})` : ''}
            </span>
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="text-body min-h-[var(--target-min)] w-24 rounded-card border border-line bg-surface-3 px-2 text-right tabular-nums text-text-1"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-caption text-text-3">{t('progress.on')}</span>
            <input
              type="date"
              value={on}
              onChange={(e) => setOn(e.target.value)}
              className="text-body-s min-h-[var(--target-min)] rounded-card border border-line bg-surface-3 px-2 text-text-1"
            />
          </label>
          <Pressable variant="primary" busy={record.isPending} onClick={submit}>
            {t('common.save')}
          </Pressable>
        </div>
        {record.isError ? (
          // The trigger's range check reaches the user as a plain sentence, not a stack trace and
          // not silence — the failure path is the one nobody walks (4ab).
          <p className="text-caption mt-2 text-danger" role="alert">
            {t('progress.outOfRange')}
          </p>
        ) : null}
      </section>

      {measurements.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      ) : byMetric.size === 0 ? (
        <EmptyState icon={LineChart} title={t('progress.emptyTitle')} body={t('progress.emptyBody')} />
      ) : (
        <div className="flex flex-col gap-4">
          {[...byMetric.entries()].map(([key, series]) => {
            const meta = (metrics.data?.metrics ?? []).find((m) => m.key === key);
            return (
              <section key={key} className="rounded-card border border-line bg-surface-2 p-4">
                <TrendChart
                  series={series}
                  unit={meta?.unit ?? ''}
                  label={t(`progress.metricName.${key}`)}
                  // NEUTRAL. See the file header: the app does not know which way is good.
                  direction="neutral"
                />
              </section>
            );
          })}
        </div>
      )}

      {(measurements.data?.measurements ?? []).length > 0 ? (
        <section>
          <h2 className="text-label mb-2 text-text-2">{t('progress.entries')}</h2>
          <ul className="flex flex-col gap-1">
            {(measurements.data?.measurements ?? [])
              .slice()
              .sort((a, b) => (a.measured_on < b.measured_on ? 1 : -1))
              .slice(0, 30)
              .map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-card border border-line bg-surface-2 px-3"
                >
                  <span className="min-w-0 flex-1 py-2">
                    <span className="text-body block truncate text-text-1">
                      {t(`progress.metricName.${m.metric_key}`)}
                    </span>
                    <span className="text-caption tabular-nums text-text-3">
                      {m.measured_on} · {m.value} {m.unit}
                    </span>
                  </span>
                  <Pressable
                    variant="ghost"
                    shape="icon"
                    onClick={() => remove.mutate(m.id)}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Pressable>
                </li>
              ))}
          </ul>
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
      <section className="rounded-card border border-line bg-surface-2 p-4">
        <h2 className="text-label mb-1 text-text-2">{t('progress.addPhoto')}</h2>
        {/* SAID BEFORE THE UPLOAD, not after. Someone about to photograph their body deserves to
            know who can see it before they choose the file, and the answer is nobody by default. */}
        <p className="text-caption mb-3 text-text-3">{t('progress.photoPrivacyNote')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col">
            <span className="text-caption text-text-3">{t('progress.on')}</span>
            <input
              type="date"
              value={on}
              onChange={(e) => setOn(e.target.value)}
              className="text-body-s min-h-[var(--target-min)] rounded-card border border-line bg-surface-3 px-2 text-text-1"
            />
          </label>
          <label className="text-body-s flex min-h-[var(--target-min)] cursor-pointer items-center rounded-card border border-line bg-surface-3 px-3 text-text-1">
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
          {upload.isPending ? <span className="text-caption text-text-3">{t('common.saving')}</span> : null}
        </div>
        {upload.isError ? (
          <p className="text-caption mt-2 text-danger" role="alert">
            {t('progress.uploadFailed')}
          </p>
        ) : null}
      </section>

      {photos.isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      ) : (photos.data?.photos ?? []).length === 0 ? (
        <EmptyState icon={Camera} title={t('progress.noPhotosTitle')} body={t('progress.noPhotosBody')} />
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {(photos.data?.photos ?? []).map((p) => (
            <li key={p.id} className="relative">
              <img
                // The gated route, never a static path. The key is not the permission.
                src={`/api/v1/progress-media/${p.storage_key}`}
                alt={t('progress.photoAlt', { date: p.taken_on })}
                loading="lazy"
                className="aspect-square w-full rounded-card object-cover"
              />
              <span className="text-micro absolute bottom-1 left-1 rounded-chip bg-surface-1/80 px-1.5 text-text-2">
                {p.taken_on}
              </span>
              <Pressable
                variant="ghost"
                shape="icon"
                className="absolute right-0 top-0"
                onClick={() => remove.mutate(p.id)}
                aria-label={t('common.delete')}
              >
                <Trash2 className="size-4" aria-hidden />
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
      <section className="rounded-card border border-line bg-surface-2 p-4">
        <h2 className="text-label mb-1 flex items-center gap-2 text-text-2">
          <ShieldCheck className="size-4" aria-hidden />
          {t('progress.whoCanSee')}
        </h2>
        <p className="text-caption mb-3 text-text-3">{t('progress.sharingNote')}</p>

        {(shares.data?.shares ?? []).length === 0 ? (
          <p className="text-caption text-text-3">{t('progress.noShares')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(shares.data?.shares ?? []).map((s) => (
              <li key={s.id} className="rounded-card bg-surface-3 p-3">
                <div className="text-body-s mb-2 flex items-center justify-between gap-2 text-text-1">
                  <span className="truncate">{s.coach_email}</span>
                  {/* An archived link is shown as ENDED rather than hidden, because "I revoked it"
                      and "they left" are different facts and the client is entitled to both. */}
                  {s.link_status !== 'active' ? (
                    <span className="text-micro uppercase rounded-chip bg-surface-2 px-1.5 text-text-3">
                      {t('progress.linkEnded')}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
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
                    className="mt-2"
                    onClick={() => revoke.mutate(s.coach_client_id)}
                  >
                    {t('progress.revokeAll')}
                  </Pressable>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-label mb-2 flex items-center gap-2 text-text-2">
          <Eye className="size-4" aria-hidden />
          {t('progress.whoLooked')}
        </h2>
        {(log.data?.entries ?? []).length === 0 ? (
          <p className="text-caption text-text-3">{t('progress.noLooks')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(log.data?.entries ?? []).slice(0, 50).map((e) => (
              <li key={e.id} className="rounded-card border border-line bg-surface-2 px-3 py-2">
                <span className="text-body-s block truncate text-text-1">{e.viewer}</span>
                <span className="text-caption text-text-3">
                  {t(`progress.looked.${e.kind}`, { defaultValue: e.kind })} ·{' '}
                  {new Date(e.at * 1000).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

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
    <label className="text-body-s flex min-h-[var(--target-min)] items-center justify-between gap-3 text-text-1">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 accent-[var(--accent)]"
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
