import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Eye } from 'lucide-react';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { DocRenderer } from '../marketplace/DocRenderer';
import { useTaxonomy } from '../marketplace/usePublic';
import {
  useComposeContext,
  useComposeProfile,
  useCreateProfile,
  useSaveProfile,
  usePreview,
  conflictOf,
} from './useCompose';

/**
 * Create or edit the public profile.
 *
 * ═══ THE HANDLE IS ASKED FOR ONCE ══════════════════════════════════════════════════════════════
 *
 * It appears on the create form and nowhere else. Renaming exists as its own operation with a
 * thirty-day cooldown, because the old handle is retired for a year the moment a LISTED profile
 * changes it — that cooldown is what stops one account cycling through and locking the namespace,
 * and it is not something to bury in an edit form beside a headline.
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
        <Field
          label={t('compose.handle')}
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          hint={t('compose.handleHint')}
        />
      ) : (
        <p className="text-body-s text-text-2">
          {t('compose.handleFixed', { handle: profile?.handle })}
        </p>
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
