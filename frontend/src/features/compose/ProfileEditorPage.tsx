import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Eye, Globe, Medal, Pencil, Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { Switch } from '../../ui/primitives/Switch';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { DocRenderer } from '../marketplace/DocRenderer';
import { useTaxonomy } from '../marketplace/usePublic';
import { HandleField } from './HandleField';
import { counterTone, COUNTER_CLASS } from './useComposeFlow';
import { initialsOf } from '../../lib/person';
import {
  useComposeContext,
  useComposeProfile,
  useCreateProfile,
  useSaveProfile,
  useRenameHandle,
  useSetProfilePublished,
  usePreview,
  conflictOf,
} from './useCompose';

/**
 * The identity line's disclosure — handle and city, the two things the anchor DISPLAYS.
 *
 * ═══ IT IS FOLDED AWAY ON PURPOSE ══════════════════════════════════════════════════════════════
 *
 * A LISTED profile's rename retires the old handle for a year and spends a cooldown the coach then
 * cannot spend again for thirty days. That does not belong as an always-open box beside a headline,
 * where it is one absent-minded edit away from happening.
 *
 * ═══ AND `from` IS THE DEFENCE AGAINST THIS VERY SCREEN ════════════════════════════════════════
 *
 * `current` comes from the loaded profile, and it travels with the request. If this tab has been
 * open since before a rename made elsewhere — a second tab, a phone — the server sees a `from` that
 * no longer matches and refuses, naming the handle that is actually there. Without it, this form
 * would happily revert that rename and burn both names for a month while showing a success.
 *
 * ═══ THE CITY LIVES HERE TOO ═══════════════════════════════════════════════════════════════════
 *
 * The anchor renders `@kovacspeter · Szeged` and the mockup offers no way to change either. Both
 * editors are behind this one disclosure rather than back in the field stack, because a screen that
 * displays a value and cannot edit it is a screen that grows the field back.
 */
function IdentityDisclosure({
  current,
  listed,
  city,
  onCity,
  onClose,
}: {
  current: string;
  listed: boolean;
  city: string;
  onCity: (next: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ctx = useComposeContext();
  const taxonomy = useTaxonomy();
  const rename = useRenameHandle();
  const [next, setNext] = useState(current);

  const conflict = conflictOf(rename.error);
  const cooldownDays = Math.round((ctx.data?.handleRenameCooldownS ?? 2592000) / 86400);
  // Both numbers in the warning come from the server. The retirement window was hardcoded as "a
  // year" in three translation files while the rename window beside it was read from policy — two
  // numbers describing one rule, only one of which could be changed.
  const retireDays = Math.round((ctx.data?.handleCooldownS ?? 31536000) / 86400);

  return (
    <Surface as="section" className="flex flex-col gap-group">
      <h2 className="text-title-3 text-text-1">{t('compose.handleChangeTitle')}</h2>

      <HandleField
        label={t('compose.handle')}
        value={next}
        onChange={setNext}
        ownHandle={current}
        hint={t('compose.handleHint')}
        autoFocus
      />

      {/*
        The warning appears only for a LISTED profile, because only a listed profile pays. An
        unpublished one releases its handle immediately and has no cooldown — telling its owner
        about a thirty-day wait would be a lie that discourages a free action.
      */}
      {listed ? (
        <p className="text-caption rounded-card border-[length:var(--border-width)] border-[var(--warning-border)] bg-warning-subtle p-3 text-text-1">
          {t('compose.handleCooldownWarning', { days: cooldownDays, retireDays, handle: current })}
        </p>
      ) : null}

      {conflict ? (
        <p className="text-body-s text-danger" role="alert">
          {t(`compose.reason.${conflict.reason}`, {
            defaultValue: t('compose.reason.generic'),
            handle: (conflict as { handle?: string }).handle,
            date:
              typeof (conflict as { eligibleAt?: number }).eligibleAt === 'number'
                ? new Date((conflict as { eligibleAt: number }).eligibleAt * 1000).toLocaleDateString()
                : undefined,
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-tight">
        <Pressable
          variant="primary"
          density="compact"
          busy={rename.isPending}
          disabled={next === current || next.length === 0}
          onClick={() => rename.mutate({ from: current, to: next }, { onSuccess: onClose })}
        >
          {t('compose.handleChangeConfirm')}
        </Pressable>
        <Pressable variant="ghost" density="compact" onClick={onClose}>
          {t('common.cancel')}
        </Pressable>
      </div>

      {/* The city the anchor shows. Its first option means NO city and reads `Bárhol`. */}
      <CityPicker value={city} onChange={onCity} cities={taxonomy.data?.cities} />
    </Surface>
  );
}

/** The one city control, so create and edit cannot style or label it two ways. */
function CityPicker({
  value,
  onChange,
  cities,
}: {
  value: string;
  onChange: (next: string) => void;
  cities: { key: string; name: string }[] | undefined;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex flex-col gap-tight">
      <span className="text-body-s text-text-2">{t('compose.city')}</span>
      <select
        className="text-body min-h-[var(--control-h)] rounded-field border-[length:var(--border-width)] border-[var(--field-border)] bg-[var(--field-bg)] px-3 text-text-1 outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t('marketplace.everywhere')}</option>
        {cities?.map((c) => (
          <option key={c.key} value={c.key}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Create or edit the public profile.
 *
 * ═══ THE ANCHOR IS THE PERSON ══════════════════════════════════════════════════════════════════
 *
 * This screen edits a person, so the top third is that person: a large monogram in a thick ring,
 * the display name in the biggest type on the screen, and the handle-and-city line under it. There
 * is no separate `h1` — the display name IS the heading, which is why typing in the name field
 * visibly rewrites the anchor. It doubles as a live preview of the marketplace card, which is what
 * made the separate rendered preview card removable.
 *
 * ═══ THE HANDLE IS ASKED FOR ONCE ══════════════════════════════════════════════════════════════
 *
 * It appears on the create form, and on the edit form only behind the identity-line disclosure.
 * Renaming is its own operation with its own cooldown, because a LISTED profile's rename retires
 * the old handle against everybody else.
 *
 * `PUT`, not `PATCH`: every field is sent every time and an empty box means cleared. There is no
 * absent-versus-null merge to get wrong, which is the bug where a cleared headline comes back.
 */
export function ProfileEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ctx = useComposeContext();
  const loaded = useComposeProfile();
  const taxonomy = useTaxonomy();
  const create = useCreateProfile();
  const save = useSaveProfile();
  const setLive = useSetProfilePublished();
  const preview = usePreview();

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [allSpecialties, setAllSpecialties] = useState(false);

  const profile = loaded.data?.profile ?? null;
  const isNew = !loaded.isPending && profile === null;

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setHeadline(profile.headline ?? '');
      setBio(profile.bioSrc ?? '');
      setCity(profile.city ?? '');
      setSpecialties(loaded.data?.specialties ?? []);
    }
  }, [profile, loaded.data]);

  useEffect(() => {
    if (!showPreview || bio.length === 0) return undefined;
    const id = setTimeout(() => preview.mutate({ surface: 'bio', body_src: bio }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bio, showPreview]);

  const limits = ctx.data?.limits;
  const specialtyMax = limits?.specialtyMax ?? 6;
  const conflict = conflictOf(create.error) ?? conflictOf(save.error);
  const markdownReason = ((create.error ?? save.error) as { body?: { reason?: string } } | null)?.body?.reason;

  /*
   * The six chips are a SUBSET of the server taxonomy, never a hardcoded six.
   *
   * The coach's own specialties come first so the visible six are the ones that matter to them,
   * and the rest sit behind the overflow. Ordered from what LOADED rather than from live state:
   * re-sorting on every toggle would make the chip under the finger jump somewhere else.
   */
  const ordered = useMemo(() => {
    const all = taxonomy.data?.specialties ?? [];
    const mine = new Set(loaded.data?.specialties ?? []);
    return [...all].sort((a, b) => Number(mine.has(b.key)) - Number(mine.has(a.key)));
  }, [taxonomy.data, loaded.data]);
  const visibleSpecialties = allSpecialties ? ordered : ordered.slice(0, 6);

  if (loaded.isPending) {
    // The anchor, then the field stack — the two shapes that actually arrive.
    return (
      <div className="col-mobile screen-x flex flex-col gap-section py-6">
        <div className="flex flex-col items-center gap-tight">
          <Skeleton className="size-32 rounded-chip" />
          <Skeleton className="mt-2 h-8 w-48 rounded-card" />
          <Skeleton className="h-4 w-32 rounded-card" />
        </div>
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  const submit = () => {
    // Empty string means CLEARED, and the server takes null for that. Sending '' would fail a
    // minimum-length bound on a field the coach deliberately emptied.
    const shared = {
      display_name: displayName,
      headline: headline.trim() === '' ? null : headline,
      bio_src: bio.trim() === '' ? null : bio,
      city_key: city === '' ? null : city,
      specialties,
    };
    if (isNew) create.mutate({ ...shared, handle }, { onSuccess: () => navigate('/compose') });
    else save.mutate(shared, { onSuccess: () => navigate('/compose') });
  };

  const toggleSpecialty = (key: string) =>
    setSpecialties((cur) =>
      cur.includes(key)
        ? cur.filter((k) => k !== key)
        : cur.length < specialtyMax
          ? [...cur, key]
          : cur,
    );

  const cityName = taxonomy.data?.cities.find((c) => c.key === city)?.name ?? t('marketplace.everywhere');

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      <Link to="/compose" className="text-body-s flex min-h-[var(--target-min)] items-center gap-tight self-start text-accent">
        <ArrowLeft className="size-icon-s" aria-hidden />
        {t('compose.backToDesk')}
      </Link>

      {/* ── the anchor ───────────────────────────────────────────────────────────────────────
          No camera badge and no `Kép cseréje`: there is no avatar upload on the coach profile,
          only post covers. A control that promises an upload the API refuses is worse than a
          monogram — so the monogram is what ships until the endpoint exists. */}
      <div className="flex flex-col items-center gap-tight">
        <span
          aria-hidden
          className="relative inline-flex size-32 items-center justify-center rounded-chip border-4 border-accent bg-surface-2"
        >
          <span className="text-display font-display text-accent">{initialsOf(displayName)}</span>
        </span>

        <h1 className="text-title-1 mt-2 text-center text-text-1">
          {displayName.trim() === '' ? t('compose.createProfile') : displayName}
        </h1>

        {isNew ? null : (
          <Pressable
            variant="ghost"
            density="compact"
            aria-expanded={identityOpen}
            onClick={() => setIdentityOpen((v) => !v)}
          >
            @{profile?.handle} · {cityName}
          </Pressable>
        )}
      </div>

      {isNew ? (
        <div className="flex flex-col gap-group">
          <HandleField
            label={t('compose.handle')}
            value={handle}
            onChange={setHandle}
            hint={t('compose.handleHint')}
          />
          <CityPicker value={city} onChange={setCity} cities={taxonomy.data?.cities} />
        </div>
      ) : identityOpen ? (
        <IdentityDisclosure
          current={profile?.handle ?? ''}
          listed={profile?.listedAt !== null}
          city={city}
          onCity={setCity}
          onClose={() => setIdentityOpen(false)}
        />
      ) : null}

      {/* ── the two fields a coach actually retypes ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-group">
        <Field
          label={t('compose.displayName')}
          value={displayName}
          maxLength={limits?.displayNameMax}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <Field
          label={t('compose.headline')}
          value={headline}
          maxLength={limits?.headlineMax}
          onChange={(e) => setHeadline(e.target.value)}
          // The hint earns its line because it names WHERE the text lands.
          hint={t('compose.optional')}
        />
      </div>

      {/* ── specialties, in their own box ────────────────────────────────────────────────────── */}
      <Surface as="fieldset" className="flex w-full min-w-0 flex-col gap-group">
        <legend className="text-body-s flex items-center gap-tight text-text-2">
          <Medal className="size-icon-m shrink-0 text-accent" aria-hidden />
          {t('compose.specialties', { n: specialties.length, max: specialtyMax })}
        </legend>
        <ul className="flex flex-wrap gap-tight">
          {visibleSpecialties.map((s) => {
            const on = specialties.includes(s.key);
            return (
              <li key={s.key}>
                <Pressable
                  shape="chip"
                  density="compact"
                  variant={on ? 'primary' : 'secondary'}
                  aria-pressed={on}
                  onClick={() => toggleSpecialty(s.key)}
                  icon={on ? <Check className="size-icon-s" aria-hidden /> : undefined}
                >
                  {t(s.i18nKey, { defaultValue: s.key })}
                </Pressable>
              </li>
            );
          })}
          {allSpecialties || ordered.length <= 6 ? null : (
            <li>
              <Pressable shape="chip" density="compact" variant="ghost" onClick={() => setAllSpecialties(true)}>
                {t('common.more')}
              </Pressable>
            </li>
          )}
        </ul>
      </Surface>

      {/* ── the bio ──────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-tight">
        <label htmlFor="compose-bio" className="text-body-s flex items-center gap-tight text-text-2">
          <span
            aria-hidden
            className="inline-flex size-8 items-center justify-center rounded-chip bg-accent-subtle text-accent"
          >
            <Pencil className="size-icon-s" strokeWidth={2} />
          </span>
          {t('compose.bio')}
        </label>
        {/* Three visible lines, not six, and no formatting toolbar: the markdown is the coach's
            own and the preview is one tap away. */}
        <textarea
          id="compose-bio"
          className="text-body min-h-24 rounded-field border-[length:var(--border-width)] border-[var(--field-border)] bg-[var(--field-bg)] p-3 text-text-1 outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <span
          className={cn('text-caption', limits ? COUNTER_CLASS[counterTone(bio.length, limits.bioMax)] : 'text-text-3')}
        >
          {limits ? t('compose.charsLeft', { n: Math.max(0, limits.bioMax - bio.length) }) : ''}
        </span>
      </div>

      {/* ── one fact, two screens ────────────────────────────────────────────────────────────
          This switch and the desk's `Élő` / `Rejtve` pill read and write the SAME published flag,
          and unpublishing here takes the whole back catalogue dark exactly as it does there. It is
          hidden on create because there is nothing to publish yet. */}
      {profile ? (
        <Surface as="section" className="flex flex-col gap-tight">
          <div className="flex items-center gap-group">
            <Globe className="size-icon-m shrink-0 text-text-2" aria-hidden />
            <span className="min-w-0 flex-1">
              <span id="compose-public-label" className="text-body block text-text-1">
                {t('compose.publishProfile')}
              </span>
              <span className="text-caption block text-text-3">
                {profile.publishedAt !== null ? t('compose.live') : t('compose.hidden')}
              </span>
            </span>
            <Switch
              checked={profile.publishedAt !== null}
              disabled={setLive.isPending}
              labelledBy="compose-public-label"
              onChange={(nextOn) => setLive.mutate(nextOn)}
            />
          </div>

          {setLive.data && typeof setLive.data.postsWentDark === 'number' && setLive.data.postsWentDark > 0 ? (
            <p className="text-caption text-text-2" role="status">
              {t('compose.wentDark', { count: setLive.data.postsWentDark })}
            </p>
          ) : null}

          {conflictOf(setLive.error) ? (
            <p className="text-caption text-danger" role="alert">
              {t(`compose.reason.${conflictOf(setLive.error)?.reason}`, {
                defaultValue: t('compose.reason.generic'),
              })}
            </p>
          ) : null}
        </Surface>
      ) : null}

      <div className="flex flex-wrap gap-tight">
        <Pressable variant="primary" busy={create.isPending || save.isPending} onClick={submit}>
          {isNew ? t('compose.createProfile') : t('compose.save')}
        </Pressable>
        <Pressable variant="secondary" onClick={() => setShowPreview((v) => !v)}>
          <Eye className="size-icon-s" aria-hidden />
          {showPreview ? t('compose.hidePreview') : t('compose.showPreview')}
        </Pressable>
      </div>

      {markdownReason && !conflict ? (
        <p className="text-body-s text-danger" role="alert">
          {t(`compose.markdown.${markdownReason}`, { defaultValue: t('compose.markdown.generic') })}
        </p>
      ) : null}

      {conflict ? (
        <Surface
          as="p"
          className="text-body-s border-[var(--warning-border)] bg-warning-subtle text-text-1"
          role="alert"
        >
          {t(`compose.reason.${conflict.reason}`, {
            defaultValue: t('compose.reason.generic'),
            key: conflict.key,
          })}
        </Surface>
      ) : null}

      {showPreview ? (
        <Surface as="section" className="flex flex-col gap-group">
          <h2 className="text-title-3 text-text-1">{t('compose.preview')}</h2>
          {preview.data ? (
            <DocRenderer doc={preview.data.doc} />
          ) : (
            <p className="text-caption text-text-3">{t('compose.previewEmpty')}</p>
          )}
        </Surface>
      ) : null}
    </div>
  );
}
