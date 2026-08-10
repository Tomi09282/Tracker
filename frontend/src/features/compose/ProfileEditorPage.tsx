import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Eye } from 'lucide-react';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { DocRenderer } from '../marketplace/DocRenderer';
import { useTaxonomy } from '../marketplace/usePublic';
import { HandleField } from './HandleField';
import {
  useComposeContext,
  useComposeProfile,
  useCreateProfile,
  useSaveProfile,
  useRenameHandle,
  usePreview,
  conflictOf,
} from './useCompose';

/**
 * Renaming, behind a disclosure.
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
 */
function HandleRename({ current, listed }: { current: string; listed: boolean }) {
  const { t } = useTranslation();
  const ctx = useComposeContext();
  const rename = useRenameHandle();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState('');

  const conflict = conflictOf(rename.error);
  const cooldownDays = Math.round((ctx.data?.handleRenameCooldownS ?? 2592000) / 86400);
  // Both numbers in the warning come from the server. The retirement window was hardcoded as "a
  // year" in three translation files while the rename window beside it was read from policy — two
  // numbers describing one rule, only one of which could be changed.
  const retireDays = Math.round((ctx.data?.handleCooldownS ?? 31536000) / 86400);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body-s text-text-2">{t('compose.handleFixed', { handle: current })}</p>
        <Pressable
          variant="ghost"
          density="compact"
          onClick={() => {
            setNext(current);
            setOpen(true);
          }}
        >
          {t('compose.handleChange')}
        </Pressable>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-3">
      <h2 className="text-label text-text-2">{t('compose.handleChangeTitle')}</h2>

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
        <p className="text-caption rounded-card border border-warning bg-warning-subtle p-2 text-text-1">
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

      <div className="flex flex-wrap gap-2">
        <Pressable
          variant="primary"
          density="compact"
          busy={rename.isPending}
          disabled={next === current || next.length === 0}
          onClick={() =>
            rename.mutate(
              { from: current, to: next },
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            )
          }
        >
          {t('compose.handleChangeConfirm')}
        </Pressable>
        <Pressable variant="ghost" density="compact" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Pressable>
      </div>
    </section>
  );
}

/**
 * Create or edit the public profile.
 *
 * ═══ THE HANDLE IS ASKED FOR ONCE ══════════════════════════════════════════════════════════════
 *
 * It appears on the create form, and on the edit form only behind the disclosure above. Renaming is
 * its own operation with its own cooldown, because a LISTED profile's rename retires the old handle
 * against everybody else — that is what stops one account cycling through and locking the
 * namespace, and it is not something to leave open beside a headline field.
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
  const preview = usePreview();

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

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
  const conflict = conflictOf(create.error) ?? conflictOf(save.error);
  const markdownReason = ((create.error ?? save.error) as { body?: { reason?: string } } | null)?.body?.reason;

  if (loaded.isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-4">
        <Skeleton className="h-8 w-1/2 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
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
        : cur.length < (limits?.specialtyMax ?? 6)
          ? [...cur, key]
          : cur,
    );

  return (
    <div className="col-mobile screen-x flex flex-col gap-4 py-4">
      <Link to="/compose" className="text-body-s flex min-h-[var(--target-min)] items-center gap-1 text-accent">
        <ArrowLeft className="size-4" aria-hidden />
        {t('compose.backToDesk')}
      </Link>

      <h1 className="text-title-2">{isNew ? t('compose.createProfile') : t('compose.editProfile')}</h1>

      {isNew ? (
        <HandleField
          label={t('compose.handle')}
          value={handle}
          onChange={setHandle}
          hint={t('compose.handleHint')}
        />
      ) : (
        <HandleRename current={profile?.handle ?? ''} listed={profile?.listedAt !== null} />
      )}

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
        hint={t('compose.optional')}
      />

      <label className="flex flex-col gap-1">
        <span className="text-label text-text-2">{t('compose.city')}</span>
        <select
          className="text-body min-h-[var(--target-min)] rounded-field border border-line bg-surface-2 px-3 text-text-1"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          <option value="">{t('marketplace.everywhere')}</option>
          {taxonomy.data?.cities.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label text-text-2">
          {t('compose.specialties', { n: specialties.length, max: limits?.specialtyMax ?? 6 })}
        </legend>
        <ul className="flex flex-wrap gap-1">
          {taxonomy.data?.specialties.map((s) => (
            <li key={s.key}>
              <Pressable
                variant={specialties.includes(s.key) ? 'primary' : 'secondary'}
                density="compact"
                aria-pressed={specialties.includes(s.key)}
                onClick={() => toggleSpecialty(s.key)}
              >
                {t(s.i18nKey, { defaultValue: s.key })}
              </Pressable>
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-label text-text-2">{t('compose.bio')}</span>
        <textarea
          className="text-body min-h-40 rounded-field border border-line bg-surface-2 p-3 text-text-1"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <span className="text-caption text-text-3">
          {limits ? t('compose.charsLeft', { n: Math.max(0, limits.bioMax - bio.length) }) : ''}
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Pressable variant="primary" busy={create.isPending || save.isPending} onClick={submit}>
          {isNew ? t('compose.createProfile') : t('compose.save')}
        </Pressable>
        <Pressable variant="secondary" onClick={() => setShowPreview((v) => !v)}>
          <Eye className="size-4" aria-hidden />
          {showPreview ? t('compose.hidePreview') : t('compose.showPreview')}
        </Pressable>
      </div>

      {markdownReason && !conflict ? (
        <p className="text-body-s text-danger" role="alert">
          {t(`compose.markdown.${markdownReason}`, { defaultValue: t('compose.markdown.generic') })}
        </p>
      ) : null}

      {conflict ? (
        <p className="text-body-s rounded-card border border-warning bg-warning-subtle p-3 text-text-1" role="alert">
          {t(`compose.reason.${conflict.reason}`, {
            defaultValue: t('compose.reason.generic'),
            key: conflict.key,
          })}
        </p>
      ) : null}

      {showPreview ? (
        <section className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-3">
          <h2 className="text-label text-text-2">{t('compose.preview')}</h2>
          {preview.data ? (
            <DocRenderer doc={preview.data.doc} />
          ) : (
            <p className="text-caption text-text-3">{t('compose.previewEmpty')}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
