import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Eye, EyeOff, Globe, ImagePlus, RotateCcw, Trash2 } from 'lucide-react';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { DocRenderer } from '../marketplace/DocRenderer';
import { useTaxonomy } from '../marketplace/usePublic';
import {
  useComposeContext,
  useComposePost,
  useCreatePost,
  useSavePost,
  usePostLifecycle,
  usePreview,
  useUploadCover,
  useDeleteCover,
  conflictOf,
  type ComposePost,
} from './useCompose';
import {
  useSaveShortcut,
  useUnsavedGuard,
  useComposeFeedback,
  counterTone,
  COUNTER_CLASS,
} from './useComposeFlow';

/** One key per attempt, reused across retries — that is what makes a retry a retry. */
const newIdempotencyKey = () =>
  `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function PostEditorPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { publicId } = useParams();
  const isNew = publicId === undefined || publicId === 'new';

  const ctx = useComposeContext();
  const taxonomy = useTaxonomy();
  const existing = useComposePost(isNew ? undefined : publicId);
  const create = useCreatePost();
  const save = useSavePost(isNew ? '' : (publicId as string));
  const lifecycle = usePostLifecycle(isNew ? '' : (publicId as string));
  const preview = usePreview();
  const uploadCover = useUploadCover(isNew ? '' : (publicId as string));
  const deleteCover = useDeleteCover(isNew ? '' : (publicId as string));
  const [alt, setAlt] = useState('');
  // One key per FILE CHOICE: a retry of the same upload is a retry, and choosing a different file
  // is a different attempt. Reusing one key across both is how a second image gets refused as a
  // replay of the first.
  const coverKeyRef = useRef(newIdempotencyKey());
  const feedback = useComposeFeedback();
  // `submit` is defined below the early returns, where a hook may not reach. The ref is refreshed
  // on every render, so the shortcut always calls the current closure rather than the first one.
  const submitRef = useRef<() => void>(() => {});

  const [kind, setKind] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  // Held in a ref, not state: it must survive a re-render so a retry sends the SAME key. Putting it
  // in state and regenerating on any render is how a retry quietly becomes a second post.
  const keyRef = useRef(newIdempotencyKey());

  const post: ComposePost | undefined = existing.data?.post;
  const cover = existing.data?.cover ?? null;
  // The same fact as `readOnly` below, read where a hook is still allowed to see it: hooks cannot
  // sit under the early returns, and a removed post has nothing to guard against losing.
  const readOnlyEarly = !!post && post.removedAt !== null;

  useEffect(() => {
    if (post) {
      setKind(post.kind);
      setTitle(post.title);
      setBody(post.bodySrc);
    }
  }, [post]);

  useEffect(() => {
    if (isNew && kind === '' && taxonomy.data?.kinds.length) setKind(taxonomy.data.kinds[0].key);
  }, [isNew, kind, taxonomy.data]);

  // The preview is DEBOUNCED, because it runs the real parser on the server and a keystroke is not
  // a request. It is also the only renderer on this screen: there is no client-side markdown, so
  // what is shown here is what the published page will show, by construction.
  useEffect(() => {
    if (!showPreview || body.length === 0) return undefined;
    const id = setTimeout(() => preview.mutate({ surface: 'post', body_src: body }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, showPreview]);

  const limits = ctx.data?.limits;
  const kindRow = useMemo(
    () => taxonomy.data?.kinds.find((k) => k.key === kind),
    [taxonomy.data, kind],
  );

  // What is on screen versus what the server last confirmed. Autosave was cut deliberately, so
  // this comparison is the only thing between a closed tab and lost writing.
  const dirty = post
    ? title !== post.title || body !== post.bodySrc
    : title.trim().length > 0 || body.trim().length > 0;
  useUnsavedGuard(dirty && !readOnlyEarly);
  useSaveShortcut(() => submitRef.current(), !readOnlyEarly);

  const conflict = conflictOf(create.error) ?? conflictOf(save.error) ?? conflictOf(lifecycle.error);
  const bodyError = (create.error ?? save.error) as { body?: { reason?: string } } | null;

  if (!isNew && existing.isPending) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-4">
        <Skeleton className="h-8 w-2/3 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (!isNew && (existing.isError || !post)) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-4 py-4">
        <EmptyState icon={Trash2} title={t('compose.postGoneTitle')} body={t('compose.postGoneBody')} heading="h1" />
        <Link to="/compose" className="text-body-s flex min-h-[var(--target-min)] items-center gap-1 text-accent">
          <ArrowLeft className="size-4" aria-hidden />
          {t('compose.backToDesk')}
        </Link>
      </div>
    );
  }

  const readOnly = !!post && post.removedAt !== null;

  const submit = () => {
    if (isNew) {
      create.mutate(
        {
          idempotency_key: keyRef.current,
          kind_key: kind,
          title,
          body_src: body,
          city_key: null,
          event_at: null,
          event_tz: null,
          capacity: null,
          price_minor: null,
          price_currency: null,
        },
        {
          onSuccess: (r) => {
            feedback.ok('compose.toast.draftCreated');
            navigate(`/compose/posts/${r.post.id}`);
          },
          onError: (e) => feedback.failed(t(`compose.reason.${conflictOf(e)?.reason ?? 'generic'}`, { defaultValue: t('compose.reason.generic') })),
        },
      );
    } else if (post) {
      save.mutate(
        {
        expected_row_version: post.rowVersion,
        title,
        body_src: body,
        city_key: post.city,
        event_at: post.eventAt,
        event_tz: post.eventTz,
        capacity: post.capacity,
        price_minor: post.priceMinor,
        price_currency: post.priceCurrency,
        },
        {
          onSuccess: () => feedback.ok('compose.toast.saved'),
          onError: (e) => feedback.failed(t(`compose.reason.${conflictOf(e)?.reason ?? 'generic'}`, { defaultValue: t('compose.reason.generic') })),
        },
      );
    }
  };

  submitRef.current = submit;

  return (
    <div className="col-mobile screen-x flex flex-col gap-4 py-4">
      <Link to="/compose" className="text-body-s flex min-h-[var(--target-min)] items-center gap-1 text-accent">
        <ArrowLeft className="size-4" aria-hidden />
        {t('compose.backToDesk')}
      </Link>

      <h1 className="text-title-2">{isNew ? t('compose.newPost') : t('compose.editPost')}</h1>

      {readOnly ? (
        <p className="text-body-s rounded-card border border-danger bg-danger-subtle p-3 text-text-1" role="status">
          {t('compose.postRemoved')}
        </p>
      ) : null}

      {isNew ? (
        <label className="flex flex-col gap-1">
          <span className="text-label text-text-2">{t('compose.kind')}</span>
          <select
            className="text-body min-h-[var(--target-min)] rounded-field border border-line bg-surface-2 px-3 text-text-1"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {taxonomy.data?.kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {t(`marketplace.kind.${k.key}`, { defaultValue: k.key })}
              </option>
            ))}
          </select>
          {/* The kind is FROZEN after creation, because its shape rules are enforced by a trigger
              that cannot re-validate a changed kind. Saying so here beats a 409 later. */}
          <span className="text-caption text-text-3">{t('compose.kindFrozen')}</span>
        </label>
      ) : null}

      <Field
        label={t('compose.postTitle')}
        value={title}
        maxLength={limits?.titleMax}
        disabled={readOnly}
        onChange={(e) => setTitle(e.target.value)}
        hint={limits ? t('compose.charsLeft', { n: Math.max(0, limits.titleMax - title.length) }) : undefined}
        error={limits && title.length > limits.titleMax ? t('compose.overLimit') : undefined}
      />

      <label className="flex flex-col gap-1">
        <span className="text-label text-text-2">{t('compose.body')}</span>
        <textarea
          className="text-body min-h-64 rounded-field border border-line bg-surface-2 p-3 text-text-1"
          value={body}
          disabled={readOnly}
          onChange={(e) => setBody(e.target.value)}
        />
        {/* Colour arrives before reading does, and only near the end — a counter that is loud from
            the first character is a counter people stop seeing. */}
        <span className={`text-caption ${limits ? COUNTER_CLASS[counterTone(body.length, limits.bodyMax)] : 'text-text-3'}`}>
          {limits ? t('compose.charsLeft', { n: Math.max(0, limits.bodyMax - body.length) }) : ''}
        </span>
      </label>

      {kindRow?.requiresEventAt === 1 ? (
        <p className="text-caption text-warning" role="status">
          {t('compose.needsEventTime')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Pressable
          variant="primary"
          busy={create.isPending || save.isPending}
          // Nothing to save is a real state and the button should look like it. Ctrl+S does nothing
          // here either, so the keyboard and the button agree.
          disabled={readOnly || (!isNew && !dirty)}
          onClick={submit}
        >
          {isNew ? t('compose.createDraft') : dirty ? t('compose.save') : t('compose.saved')}
        </Pressable>
        <Pressable variant="secondary" onClick={() => setShowPreview((v) => !v)}>
          <Eye className="size-4" aria-hidden />
          {showPreview ? t('compose.hidePreview') : t('compose.showPreview')}
        </Pressable>
      </div>

      {/* ── the refusals, each carrying what to do about it ─────────────────────────────────── */}
      {bodyError?.body?.reason && !conflict ? (
        <p className="text-body-s text-danger" role="alert">
          {t(`compose.markdown.${bodyError.body.reason}`, { defaultValue: t('compose.markdown.generic') })}
        </p>
      ) : null}

      {conflict ? (
        <div className="rounded-card border border-warning bg-warning-subtle p-3" role="alert">
          <p className="text-body-s text-text-1">
            {t(`compose.reason.${conflict.reason}`, {
              defaultValue: t('compose.reason.generic'),
              version: conflict.activeVersion,
              when: conflict.eligibleAt ? new Date(conflict.eligibleAt * 1000).toLocaleString(i18n.language) : '',
              used: conflict.used,
              max: conflict.max,
              next: conflict.nextSlotAt ? new Date(conflict.nextSlotAt * 1000).toLocaleString(i18n.language) : '',
              field: conflict.field,
            })}
          </p>
          {/* A stale save comes back WITH the row the server holds, so the coach can compare it
              against the text still in front of them instead of guessing which one survived. */}
          {conflict.reason === 'stale' && conflict.post ? (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-caption text-text-2">{t('compose.staleServerCopy')}</p>
              <p className="text-body-s rounded-field bg-surface-2 p-2 text-text-1">{conflict.post.title}</p>
              <Pressable
                variant="secondary"
                density="compact"
                onClick={() => {
                  setTitle(conflict.post!.title);
                  setBody(conflict.post!.bodySrc);
                  existing.refetch();
                }}
              >
                {t('compose.takeServerCopy')}
              </Pressable>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── preview ────────────────────────────────────────────────────────────────────────── */}
      {showPreview ? (
        <section className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-3">
          <h2 className="text-label text-text-2">{t('compose.preview')}</h2>
          {preview.isPending ? (
            <Skeleton className="h-24 rounded-card" />
          ) : preview.data ? (
            <DocRenderer doc={preview.data.doc} />
          ) : preview.error ? (
            <p className="text-body-s text-danger" role="alert">
              {t(`compose.markdown.${conflictOf(preview.error)?.reason ?? 'generic'}`, {
                defaultValue: t('compose.markdown.generic'),
              })}
            </p>
          ) : (
            <p className="text-caption text-text-3">{t('compose.previewEmpty')}</p>
          )}
        </section>
      ) : null}


      {/* ── the cover ─────────────────────────────────────────────────────────────────────── */}
      {post && !readOnly ? (
        <section className="flex flex-col gap-2 rounded-card border border-line bg-surface-2 p-3">
          <h2 className="text-label text-text-2">{t('compose.cover')}</h2>

          {cover ? (
            <>
              {/* Served by the AUTHOR route, not the public one. On a draft this is the only place
                  the image can be seen at all — the public serve route refuses a cover whose post
                  is not published, which is the property that route exists for. */}
              <img
                src={'/api/v1/compose/posts/' + post.id + '/cover'}
                alt={cover.alt ?? ''}
                className="max-h-48 w-full rounded-card object-cover"
              />
              <p className="text-caption text-text-3">
                {t('compose.coverMeta', { w: cover.width, h: cover.height, kb: Math.round(cover.bytes / 1024) })}
              </p>
              {/* There is NO replace: the server refuses a second cover, so changing one is delete
                  then upload. The screen says so rather than offering a button that answers 409. */}
              <Pressable
                variant="secondary"
                busy={deleteCover.isPending}
                onClick={() => deleteCover.mutate(undefined, { onSuccess: () => feedback.ok('compose.toast.coverRemoved') })}
              >
                <Trash2 className="size-4" aria-hidden />
                {t('compose.removeCover')}
              </Pressable>
              <p className="text-caption text-text-3">{t('compose.coverReplaceNote')}</p>
            </>
          ) : (
            <>
              <Field
                label={t('compose.coverAlt')}
                value={alt}
                maxLength={200}
                onChange={(e) => setAlt(e.target.value)}
                hint={t('compose.coverAltHint')}
              />
              <label className="text-body-s flex min-h-[var(--target-min)] cursor-pointer items-center gap-2 rounded-button border border-line px-4 text-text-1">
                <ImagePlus className="size-4" aria-hidden />
                {uploadCover.isPending ? t('compose.uploading') : t('compose.chooseCover')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  disabled={uploadCover.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    coverKeyRef.current = newIdempotencyKey();
                    uploadCover.mutate(
                      { file, alt, key: coverKeyRef.current },
                      { onSuccess: () => feedback.ok('compose.toast.coverAdded') },
                    );
                  }}
                />
              </label>
            </>
          )}

          {uploadCover.error || deleteCover.error ? (
            <p className="text-body-s text-danger" role="alert">
              {t(`compose.reason.${conflictOf(uploadCover.error ?? deleteCover.error)?.reason ?? 'generic'}`, {
                defaultValue: t('compose.coverFailed'),
              })}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── lifecycle ──────────────────────────────────────────────────────────────────────── */}
      {post && !readOnly ? (
        <section className="flex flex-wrap gap-2 border-t border-line pt-4">
          {post.publishedAt === null && post.deletedAt === null ? (
            <Pressable
              variant="primary"
              busy={lifecycle.isPending}
              onClick={() =>
                lifecycle.mutate('publish', {
                  onSuccess: () => feedback.ok('compose.toast.published'),
                  onError: (e) =>
                    feedback.failed(
                      t(`compose.reason.${conflictOf(e)?.reason ?? 'generic'}`, { defaultValue: t('compose.reason.generic') }),
                    ),
                })
              }
            >
              <Globe className="size-4" aria-hidden />
              {t('compose.publish')}
            </Pressable>
          ) : null}
          {/* THE UNDO IS THE POINT. Taking something down is the action people hesitate over, and a
              one-tap way back is what makes hesitating unnecessary — the restore returns the post to
              its ORIGINAL feed position and spends no quota, so the undo costs nothing at all. */}
          {post.deletedAt === null ? (
            <Pressable
              variant="secondary"
              busy={lifecycle.isPending}
              onClick={() =>
                lifecycle.mutate('withdraw', {
                  onSuccess: () => feedback.ok('compose.toast.withdrawn', () => lifecycle.mutate('restore')),
                })
              }
            >
              <EyeOff className="size-4" aria-hidden />
              {t('compose.withdraw')}
            </Pressable>
          ) : (
            <Pressable
              variant="secondary"
              busy={lifecycle.isPending}
              onClick={() =>
                lifecycle.mutate('restore', {
                  onSuccess: () => feedback.ok('compose.toast.restored'),
                  onError: (e) =>
                    feedback.failed(
                      t(`compose.reason.${conflictOf(e)?.reason ?? 'generic'}`, { defaultValue: t('compose.reason.generic') }),
                    ),
                })
              }
            >
              <RotateCcw className="size-4" aria-hidden />
              {t('compose.restore')}
            </Pressable>
          )}
          {/* Restoring returns the post to its ORIGINAL feed position and costs no quota slot —
              published_at never moves. Worth saying, because the fear it removes is the reason
              people leave things up that they would rather take down. */}
          {post.deletedAt !== null ? (
            <p className="text-caption w-full text-text-3">{t('compose.restoreKeepsPosition')}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

