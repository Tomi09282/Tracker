import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  EyeOff,
  Globe,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Field } from '../../ui/primitives/Field';
import { Pressable } from '../../ui/primitives/Pressable';
import { Surface } from '../../ui/primitives/Surface';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { useTaxonomy } from '../marketplace/usePublic';
import { kindIcon } from './kindIcons';
import {
  useComposeContext,
  useComposePost,
  useCreatePost,
  useSavePost,
  usePostLifecycle,
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
import { useAutosave } from './useAutosave';

/** One key per attempt, reused across retries — that is what makes a retry a retry. */
const newIdempotencyKey = () =>
  `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Where a coach writes one marketplace item.
 *
 * ═══ THE COVER IS THE ANCHOR ═══════════════════════════════════════════════════════════════════
 *
 * The cover is the one element a stranger sees before they read a word, so it fills the top third
 * at full width — and that IS the preview, which is why the separate rendered-preview card is gone
 * from this screen. It also makes a missing cover impossible to overlook.
 *
 * ═══ AND THE SAVE BUTTON SURVIVED THE REDESIGN ═════════════════════════════════════════════════
 *
 * The action row lost its save/preview pair, which is the single biggest reason this stopped
 * reading as a form. But autosave is deliberately disabled until there is a title, so a draft
 * holding a body and no title would otherwise have NO way to be saved at all. The save moved into
 * the header rather than away: `Piszkozat létrehozása` on a new post, `Mentés` when dirty, a
 * disabled `Mentve` when clean — plus Ctrl/Cmd+S and the unsaved-changes guard, both untouched.
 */
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
  // It RETURNS A PROMISE, and that is what lets autosave share it. A callback-style save cannot be
  // awaited, so the hook could not know when a flight ended — and knowing that is the whole of the
  // single-flight rule.
  const submitRef = useRef<() => Promise<void>>(async () => {});

  const [kind, setKind] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // Held in a ref, not state: it must survive a re-render so a retry sends the SAME key. Putting it
  // in state and regenerating on any render is how a retry quietly becomes a second post.
  const keyRef = useRef(newIdempotencyKey());

  /**
   * Everything a save would send, as one string.
   *
   * The hook compares this against what the last successful save carried, so "dirty" is a fact
   * about the payload rather than about which fields somebody has focused. A field added to the
   * save and not to this serialisation would autosave once and then never again, which is the
   * quietest possible way to lose work — so both live in this file, next to each other.
   */
  const serialiseDraft = () => JSON.stringify([kind, title, body]);

  const post: ComposePost | undefined = existing.data?.post;
  const cover = existing.data?.cover ?? null;
  // The same fact as `readOnly` below, read where a hook is still allowed to see it: hooks cannot
  // sit under the early returns, and a removed post has nothing to guard against losing.
  const readOnlyEarly = !!post && post.removedAt !== null;

  /**
   * ═══ THE EDITOR IS SEEDED ONCE, NOT ON EVERY REFETCH ═════════════════════════════════════════
   *
   * This used to run whenever `post` changed identity — which is every refetch, and every autosave
   * causes one. So the server's copy was written over the editor's, continuously, while somebody
   * was typing into it. With a manual save that was rare enough to look like a glitch; with
   * autosave it is the last step of RACE-7: create replays, the URL changes, the post arrives, and
   * this effect erases everything typed since the request left.
   *
   * Seeded once per post, tracked by id. A change made in ANOTHER tab therefore does not appear
   * here — correctly: `expected_row_version` refuses the save and says so, which is a conversation
   * with the coach rather than a silent overwrite of their draft.
   */
  const seededFor = useRef<string | null>(null);

  /*
   * Autosave runs `submit`, the SAME path the save button uses — one save, two triggers.
   *
   * A second implementation here would have to make its own decision about create-versus-update,
   * about which idempotency key to send, and about row versions, and it would get one of them wrong
   * on a Tuesday. The hook owns the timing and the single-flight rule; `submit` owns what a save is.
   *
   * Declared HERE, below everything it reads. It first sat above `title` and `readOnlyEarly` and
   * referenced both — which TypeScript catches, and which is the ordinary cost of adding a hook to
   * a component by pasting it near the other hooks.
   */
  const autosave = useAutosave({
    // A title is the floor. Autosaving an empty draft creates a post nobody asked for, and the
    // create endpoint would refuse it anyway — repeatedly, on a timer.
    enabled: !readOnlyEarly && !existing.isPending && title.trim().length > 0,
    serialise: serialiseDraft,
    save: () => submitRef.current(),
  });

  useEffect(() => {
    if (!post || seededFor.current === post.id) return;
    seededFor.current = post.id;
    setKind(post.kind);
    setTitle(post.title);
    setBody(post.bodySrc);
    /*
     * ═══ AND THE AUTOSAVE SNAPSHOT IS SEEDED WITH IT ═══════════════════════════════════════════
     *
     * Without this, opening any existing post fired an unrequested PUT 1.5 seconds later.
     * `savedSnapshot` starts as null, the editor fills with the server's text, and the hook
     * correctly concludes that what is on screen differs from what it last saved — because it has
     * never saved anything. So it saved, on a post nobody had touched.
     *
     * Built from `post` rather than from `serialiseDraft()`: the three setState calls above have
     * not flushed yet, so reading component state here returns the PREVIOUS post's fields and the
     * snapshot would describe the wrong document.
     *
     * The seed effect sits BELOW the hook for this one line. It read better above, next to the
     * state it fills — and it cannot be there, because it needs the hook that is declared here.
     */
    autosave.adopt(JSON.stringify([post.kind, post.title, post.bodySrc]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);

  useEffect(() => {
    if (isNew && kind === '' && taxonomy.data?.kinds.length) setKind(taxonomy.data.kinds[0].key);
  }, [isNew, kind, taxonomy.data]);

  const limits = ctx.data?.limits;

  /*
   * What is on screen versus what the server last confirmed.
   *
   * Still computed against the SERVER's copy rather than reading `autosave.hasUnsaved`, and the
   * difference matters at exactly one moment: autosave is disabled until there is a title, so a
   * draft with a body and no title reports `hasUnsaved: false` while holding real writing. The
   * guard has to fire for that, which is the case somebody actually loses work in.
   */
  const dirty = post
    ? title !== post.title || body !== post.bodySrc
    : title.trim().length > 0 || body.trim().length > 0;
  useUnsavedGuard(dirty && !readOnlyEarly);
  useSaveShortcut(() => submitRef.current(), !readOnlyEarly);

  const conflict = conflictOf(create.error) ?? conflictOf(save.error) ?? conflictOf(lifecycle.error);
  const bodyError = (create.error ?? save.error) as { body?: { reason?: string } } | null;

  if (!isNew && existing.isPending) {
    // Heading, then the body block — the two shapes that actually arrive.
    return (
      <div className="col-mobile screen-x flex flex-col gap-section py-6">
        <Skeleton className="h-8 w-2/3 rounded-card" />
        <Skeleton className="aspect-[16/9] w-full rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (!isNew && (existing.isError || !post)) {
    return (
      <div className="col-mobile screen-x flex flex-col gap-group py-6">
        <EmptyState icon={Trash2} title={t('compose.postGoneTitle')} body={t('compose.postGoneBody')} heading="h1" />
        <Link to="/compose" className="text-body-s flex min-h-[var(--target-min)] items-center gap-tight self-center text-accent">
          <ArrowLeft className="size-icon-s" aria-hidden />
          {t('compose.backToDesk')}
        </Link>
      </div>
    );
  }

  const readOnly = !!post && post.removedAt !== null;
  // A stale save comes back WITH the row the server holds. It is a rare state, so it arrives as a
  // sheet rather than as a panel occupying permanent vertical space — and `reset()` closing it
  // means the sheet needs no second piece of state that could disagree with the error.
  const staleOpen = conflict?.reason === 'stale' && !!conflict.post;

  const submit = async () => {
    if (isNew) {
      /*
       * ═══ THE SNAPSHOT IS TAKEN BEFORE THE REQUEST LEAVES ═══════════════════════════════════
       *
       * `sent` is what this create actually carries. Handing it to `autosave.adopt` on success is
       * what makes the follow-up correct: the hook then knows the server holds EXACTLY this, so if
       * the coach typed while the request was in flight it sees a difference and issues an UPDATE.
       *
       * Reading the snapshot from the response instead would be the bug — a replayed create answers
       * with the ORIGINAL post, and adopting that would tell the hook the newest keystrokes were
       * already saved.
       */
      const sent = serialiseDraft();
      try {
        const r = await create.mutateAsync({
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
        });
        autosave.adopt(sent);
        // The post is about to arrive from the server. Marking it seeded keeps the effect above
        // from writing the created body over an editor that has moved on.
        seededFor.current = r.post.id;
        feedback.ok('compose.toast.draftCreated');
        // `replace`, so Back does not return to a /new route whose draft now exists.
        navigate(`/compose/posts/${r.post.id}`, { replace: true });
      } catch (e) {
        feedback.failed(t(`compose.reason.${conflictOf(e)?.reason ?? 'generic'}`, { defaultValue: t('compose.reason.generic') }));
        throw e;
      }
    } else if (post) {
      const sent = serialiseDraft();
      try {
        await save.mutateAsync({
        expected_row_version: post.rowVersion,
        title,
        body_src: body,
        city_key: post.city,
        event_at: post.eventAt,
        event_tz: post.eventTz,
        capacity: post.capacity,
        price_minor: post.priceMinor,
        price_currency: post.priceCurrency,
        });
        autosave.adopt(sent);
        feedback.ok('compose.toast.saved');
      } catch (e) {
        feedback.failed(t(`compose.reason.${conflictOf(e)?.reason ?? 'generic'}`, { defaultValue: t('compose.reason.generic') }));
        throw e;
      }
    }
  };

  submitRef.current = submit;

  const FrozenKindIcon = kindIcon(kind);

  return (
    <div className="col-mobile screen-x flex flex-col gap-section py-6">
      <Link to="/compose" className="text-body-s flex min-h-[var(--target-min)] items-center gap-tight self-start text-accent">
        <ArrowLeft className="size-icon-s" aria-hidden />
        {t('compose.backToDesk')}
      </Link>

      {/* The save lives HERE now, not in the action row — see the docblock. It is secondary on an
          existing post because `Közzététel` below is that screen's one primary action. */}
      <div className="flex items-start gap-group">
        <h1 className="text-title-1 min-w-0 flex-1">{isNew ? t('compose.newPost') : t('compose.editPost')}</h1>
        <Pressable
          variant={isNew ? 'primary' : 'secondary'}
          density="compact"
          className="shrink-0"
          busy={create.isPending || save.isPending}
          // Nothing to save is a real state and the button should look like it. Ctrl+S does nothing
          // here either, so the keyboard and the button agree.
          disabled={readOnly || (!isNew && !dirty)}
          onClick={submit}
        >
          {isNew ? t('compose.createDraft') : dirty ? t('compose.save') : t('compose.saved')}
        </Pressable>
      </div>

      {readOnly ? (
        <Surface
          as="p"
          className="text-body-s border-[var(--danger-border)] bg-danger-subtle text-text-1"
          role="status"
        >
          {t('compose.postRemoved')}
        </Surface>
      ) : null}

      {/* ── the anchor: the cover, at full width ─────────────────────────────────────────────
          On create there is no cover section at all — the post has to exist before an image can
          hang off it. */}
      {post && !readOnly ? (
        <Surface as="section" pad="none" className="overflow-hidden">
          {cover ? (
            <>
              {/* Served by the AUTHOR route, not the public one. On a draft this is the only place
                  the image can be seen at all — the public serve route refuses a cover whose post
                  is not published, which is the property that route exists for. */}
              <img
                src={'/api/v1/compose/posts/' + post.id + '/cover'}
                alt={cover.alt ?? ''}
                className="aspect-[16/9] w-full object-cover"
              />
              {/* The metadata line, the alt field, the removal button and the swap caption all
                  collapse into this one row. It reads `Kép eltávolítása` and not `Csere` because
                  there IS no replace: the server refuses a second cover, so changing one is delete
                  then upload, and a button that answers 409 is worse than one that says what it
                  does. */}
              <div className="flex items-center gap-group p-4">
                <span
                  aria-hidden
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-chip bg-accent-subtle text-accent"
                >
                  <ImageIcon className="size-icon-m" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-body-s block text-accent">{t('compose.cover')}</span>
                  {/* This slot holds the image's OWN description, so its empty case gets its own
                      string. Falling back to the upload field's hint printed a question addressed
                      to the coach where a description belongs, and hid the fact that this cover has
                      no alt text at all. `||` and not `??`, so an empty-string alt is caught too. */}
                  <span className="text-caption block truncate text-text-3">
                    {cover.alt || t('compose.coverAltMissing')}
                  </span>
                </span>
                <Pressable
                  variant="ghost"
                  density="compact"
                  className="shrink-0"
                  busy={deleteCover.isPending}
                  onClick={() =>
                    deleteCover.mutate(undefined, { onSuccess: () => feedback.ok('compose.toast.coverRemoved') })
                  }
                >
                  {t('compose.removeCover')}
                </Pressable>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-group p-4">
              {/* Alt text stays EDITABLE in the upload flow. Display-only in the caption row above
                  is fine; display-only everywhere would mean every cover shipping without one. */}
              <Field
                label={t('compose.coverAlt')}
                value={alt}
                maxLength={200}
                onChange={(e) => setAlt(e.target.value)}
                hint={t('compose.coverAltHint')}
              />
              <label className="text-body-s flex min-h-[var(--target-min)] cursor-pointer items-center justify-center gap-tight rounded-button border-[length:var(--border-width)] border-[var(--surface-border)] bg-surface-1 px-4 text-text-1 transition-[transform,background-color,border-color,color] duration-[var(--duration-instant)] ease-[var(--ease-standard)] hover:bg-surface-2 active:scale-[0.97]">
                <ImagePlus className="size-icon-s" aria-hidden />
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
            </div>
          )}

          {uploadCover.error || deleteCover.error ? (
            <p className="text-body-s px-4 pb-4 text-danger" role="alert">
              {t(`compose.reason.${conflictOf(uploadCover.error ?? deleteCover.error)?.reason ?? 'generic'}`, {
                defaultValue: t('compose.coverFailed'),
              })}
            </p>
          ) : null}
        </Surface>
      ) : null}

      {/* ── type ─────────────────────────────────────────────────────────────────────────────
          Live on create, and a plain statement afterwards. The kind is FROZEN once the post
          exists — its shape rules are enforced by a trigger that cannot re-validate a changed
          kind — so a control that merely LOOKS disabled would still be a control that lies. */}
      <div className="flex flex-col gap-tight">
        <span className="text-body-s text-text-2">{t('compose.kind')}</span>
        {isNew ? (
          <Segmented
            label={t('compose.kind')}
            value={kind}
            onChange={setKind}
            options={(taxonomy.data?.kinds ?? []).map((k) => {
              const Icon = kindIcon(k.key);
              return {
                value: k.key,
                label: t(`marketplace.kind.${k.key}`, { defaultValue: k.key }),
                icon: <Icon className="size-icon-s" aria-hidden />,
              };
            })}
          />
        ) : (
          <>
            <p className="text-body flex items-center gap-tight text-text-1">
              <FrozenKindIcon className="size-icon-m shrink-0 text-accent" aria-hidden />
              {t(`marketplace.kind.${kind}`, { defaultValue: kind })}
            </p>
            <p className="text-caption text-text-3">{t('compose.kindFrozen')}</p>
          </>
        )}
      </div>

      {/* A title is this form's floor — autosave stays off until there is one — so the control says
          so both ways: `aria-required` for a screen reader, and the `Kötelező` marker the mockup
          draws on the label row for everyone else. */}
      <Field
        label={t('compose.postTitle')}
        aria-required
        marker={t('compose.required')}
        value={title}
        maxLength={limits?.titleMax}
        disabled={readOnly}
        onChange={(e) => setTitle(e.target.value)}
        hint={limits ? t('compose.charsLeft', { n: Math.max(0, limits.titleMax - title.length) }) : undefined}
        error={limits && title.length > limits.titleMax ? t('compose.overLimit') : undefined}
      />

      {/* ── the body ─────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-tight">
        <label htmlFor="compose-body" className="text-body-s flex items-center gap-tight text-text-2">
          {/* `size-11`, matching the cover caption's image tile above. Two accent tiles on one
              screen at two sizes read as two different kinds of thing; at 32px this one also sat
              smaller than the label beside it, where the mockup draws it at field height. */}
          <span
            aria-hidden
            className="inline-flex size-11 items-center justify-center rounded-chip bg-accent-subtle text-accent"
          >
            <Pencil className="size-icon-m" strokeWidth={2} />
          </span>
          {t('compose.body')}
        </label>
        <textarea
          id="compose-body"
          className="text-body min-h-32 rounded-field border-[length:var(--border-width)] border-[var(--field-border)] bg-[var(--field-bg)] p-3 text-text-1 outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-45"
          value={body}
          disabled={readOnly}
          onChange={(e) => setBody(e.target.value)}
        />
        {/* Colour arrives before reading does, and only near the end — a counter that is loud from
            the first character is a counter people stop seeing.

            `self-end` because the mockup deliberately splits the two counters: the title's sits
            flush left under its input (it is `Field`'s hint slot), the body's sits against the
            textarea's trailing edge. `self-end` and not `text-right` — it shrinks the box to the
            text instead of letting a muted line span the column. */}
        <span
          className={cn('text-caption self-end', limits ? COUNTER_CLASS[counterTone(body.length, limits.bodyMax)] : 'text-text-3')}
        >
          {limits ? t('compose.charsLeft', { n: Math.max(0, limits.bodyMax - body.length) }) : ''}
        </span>
      </div>

      {/* ── the markdown refusal, one red line under the body ─────────────────────────────────── */}
      {bodyError?.body?.reason && !conflict ? (
        <p className="text-body-s text-danger" role="alert">
          {t(`compose.markdown.${bodyError.body.reason}`, { defaultValue: t('compose.markdown.generic') })}
        </p>
      ) : null}

      {/* Everything that is not `stale` still answers inline — those refusals name a fix that
          applies to the form the coach is looking at. */}
      {conflict && !staleOpen ? (
        <Surface
          as="p"
          className="text-body-s border-[var(--warning-border)] bg-warning-subtle text-text-1"
          role="alert"
        >
          {t(`compose.reason.${conflict.reason}`, {
            defaultValue: t('compose.reason.generic'),
            version: conflict.activeVersion,
            when: conflict.eligibleAt ? new Date(conflict.eligibleAt * 1000).toLocaleString(i18n.language) : '',
            used: conflict.used,
            max: conflict.max,
            next: conflict.nextSlotAt ? new Date(conflict.nextSlotAt * 1000).toLocaleString(i18n.language) : '',
            field: conflict.field,
          })}
        </Surface>
      ) : null}

      {/* ── the autosave line, on its own row above the rule ──────────────────────────────────
          `aria-live="polite"` on a region that only ever holds four short words. It matters here
          because the whole promise of autosave is that somebody can stop paying attention, and a
          promise nobody can hear is one only sighted users get.

          `failed` is deliberately loud and does not go away on its own. Everything else fades to
          nothing when there is nothing to say. The region is always rendered so a change inside it
          is announced — one created at the moment it has something to say often is not. */}
      <p
        className={cn(
          'text-caption flex min-h-5 items-center gap-tight',
          autosave.state === 'failed' ? 'text-danger' : 'text-text-3',
        )}
        aria-live="polite"
      >
        {autosave.state === 'saving' ? (
          <>
            <Loader2 className="size-icon-s animate-spin motion-reduce:animate-none" aria-hidden />
            {t('compose.autosave.saving')}
          </>
        ) : autosave.state === 'failed' ? (
          <>
            <AlertCircle className="size-icon-s shrink-0" aria-hidden />
            {t('compose.autosave.failed')}
          </>
        ) : autosave.state === 'saved' && !autosave.hasUnsaved && autosave.savedAt !== null ? (
          <>
            <Check className="size-icon-s text-success" aria-hidden />
            {/* THE LEADING PHRASE IS WHAT EXPLAINS THE MISSING SAVE BUTTON. `Mentve 14:07` alone is
                a timestamp; `Automatikus mentés · Mentve 14:07` is the reason there is nothing to
                press. Its own key rather than folding it into the state word, so the state stays
                last and the `.tnum` time keeps sitting next to `Mentve`. */}
            {t('compose.autosave.label')}
            <span aria-hidden>·</span>
            {t('compose.autosave.saved')}
            {/* THE CLOCK TIME, because "Mentve" alone reads the same a second after the save and
                an hour after it — and this line is the only receipt a screen with no save button
                has. `.tnum` so the minute digits do not jitter the row as they tick. Same locale
                formatting as the chat transcript. */}
            <span className="tnum">
              {new Date(autosave.savedAt).toLocaleTimeString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </>
        ) : null}
      </p>

      {/* ── lifecycle ────────────────────────────────────────────────────────────────────────── */}
      {post && !readOnly ? (
        <section className="flex flex-col gap-tight border-t-[length:var(--border-width)] border-[var(--surface-border)] pt-4">
          <div className="flex flex-wrap gap-tight">
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
                <Globe className="size-icon-s" aria-hidden />
                {t('compose.publish')}
              </Pressable>
            ) : null}
            {/* THE UNDO IS THE POINT. Taking something down is the action people hesitate over, and
                a one-tap way back is what makes hesitating unnecessary — the restore returns the
                post to its ORIGINAL feed position and spends no quota, so the undo costs nothing. */}
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
                <EyeOff className="size-icon-s" aria-hidden />
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
                <RotateCcw className="size-icon-s" aria-hidden />
                {t('compose.restore')}
              </Pressable>
            )}
          </div>
          {/* Restoring returns the post to its ORIGINAL feed position and costs no quota slot —
              published_at never moves. Worth saying, because the fear it removes is the reason
              people leave things up that they would rather take down. */}
          {/* Exactly one caption in either state. The published/draft branch is the sentence that
              makes taking a post down feel safe — without it the button row was followed by
              nothing, and hesitation is what leaves things up that a coach would rather remove. */}
          {post.deletedAt !== null ? (
            <p className="text-caption text-text-3">{t('compose.restoreKeepsPosition')}</p>
          ) : (
            <p className="text-caption text-text-3">{t('compose.withdrawUndoable')}</p>
          )}
        </section>
      ) : null}

      {/* ── the stale conflict, as a conversation rather than a merge ─────────────────────────── */}
      <Sheet open={staleOpen} onClose={() => save.reset()} title={t('compose.reason.stale')}>
        <div className="flex flex-col gap-tight">
          <p className="text-caption text-text-2">{t('compose.staleServerCopy')}</p>
          <p className="text-body-s rounded-field bg-[var(--field-bg)] p-3 text-text-1">
            {conflict?.post?.title}
          </p>
          <Pressable
            variant="primary"
            className="w-full"
            onClick={() => {
              const server = conflict?.post;
              if (!server) return;
              setTitle(server.title);
              setBody(server.bodySrc);
              save.reset();
              existing.refetch();
            }}
          >
            {t('compose.takeServerCopy')}
          </Pressable>
        </div>
      </Sheet>
    </div>
  );
}
