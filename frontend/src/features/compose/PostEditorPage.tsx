import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { X } from 'lucide-react';
import { Field } from '../../ui/primitives/Field';
import { TextArea } from '../../ui/primitives/TextArea';
import { FilePick } from '../../ui/primitives/FilePick';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Chip, ChipRow } from '../../ui/primitives/ChipRow';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { ListRow } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { UserPhoto } from '../../ui/media/UserPhoto';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { useTaxonomy } from '../marketplace/usePublic';
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
 * Where a coach writes one marketplace item — Pulse frames `compose-post-1` (an existing draft with
 * its cover) and `compose-post-2` (a new post, just opened).
 *
 * ═══ THE COVER IS THE ANCHOR ═══════════════════════════════════════════════════════════════════
 *
 * The cover is the one element a stranger sees before they read a word, so it fills the column at
 * full width as an honest 16:9 rectangle, with ONE caption pair under it: the slot's name with the
 * remove action on its baseline, then the picture's own description. That IS the preview; there is
 * no separate rendered-preview card. Everything else is a quiet underline form, and the screen's
 * one lime pill is the last thing on the page (`Közzététel`, or `Piszkozat létrehozása`).
 *
 * ═══ AND THE SAVE CONTROL SURVIVED THE REDESIGN ═════════════════════════════════════════════════
 *
 * Autosave is deliberately disabled until there is a title, so a draft holding a body and no title
 * would otherwise have NO way to be saved at all. On an existing post the save is the quiet trailing
 * word of the push header's back row — `Mentés` when dirty, a disabled `Mentve` when clean — and on
 * a new post it is the lime pill at the end of the form. Ctrl/Cmd+S and the unsaved-changes guard
 * are untouched.
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
    // The mode is known, so the header is the real one. Then blocks where the text will arrive —
    // the type statement, the title, the text — at their final rhythm. No block for the cover:
    // images are withheld until they arrive, and a grey rectangle would draw the box Pulse forbids.
    return (
      <Screen top="push">
        <ScreenHeader kind="push" title={t('compose.editPost')} />
        <div role="status" aria-busy="true" className="flex flex-col gap-6">
          <span className="sr-only">{t('common.loading')}</span>
          <div className="flex flex-col gap-4">
            <Rule strong />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </Screen>
    );
  }
  if (!isNew && (existing.isError || !post)) {
    // Unknown id, somebody else's post, or the read failed. The message is the page's h1; the way
    // back is the header's own "Vissza a pulthoz" row, so there is no second link.
    return (
      <Screen top="push">
        <ScreenHeader kind="push" />
        <EmptyState heading="h1" title={t('compose.postGoneTitle')} body={t('compose.postGoneBody')} />
      </Screen>
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

  const kinds = taxonomy.data?.kinds ?? [];
  const kindLabel = (key: string) => t(`marketplace.kind.${key}`, { defaultValue: key });

  /*
   * The kind words are a radio group: one of a set, chosen with a tap, and with the arrow keys as
   * the old segmented control allowed. Only the chosen word is in the tab order (roving tabindex);
   * an arrow chooses the next word and focus follows it.
   */
  const onKindKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (dir === 0 || kinds.length === 0) return;
    e.preventDefault();
    const to = (index + dir + kinds.length) % kinds.length;
    setKind(kinds[to].key);
    const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[to]?.focus();
  };

  const publish = () =>
    lifecycle.mutate('publish', {
      onSuccess: () => feedback.ok('compose.toast.published'),
      onError: (e) =>
        feedback.failed(t(`compose.reason.${conflictOf(e)?.reason ?? 'generic'}`, { defaultValue: t('compose.reason.generic') })),
    });
  /* THE UNDO IS THE POINT. Taking something down is the action people hesitate over, and a one-tap
     way back is what makes hesitating unnecessary — the restore returns the post to its ORIGINAL
     feed position and spends no quota, so the undo costs nothing. */
  const withdraw = () =>
    lifecycle.mutate('withdraw', {
      onSuccess: () => feedback.ok('compose.toast.withdrawn', () => lifecycle.mutate('restore')),
    });
  const restore = () =>
    lifecycle.mutate('restore', {
      onSuccess: () => feedback.ok('compose.toast.restored'),
      onError: (e) =>
        feedback.failed(t(`compose.reason.${conflictOf(e)?.reason ?? 'generic'}`, { defaultValue: t('compose.reason.generic') })),
    });

  return (
    <Screen top="push">
      {/* ── the header: the back row (parent from routeMeta), on an existing post the save as the
          row's quiet trailing word, then the display title on its own line ──────────────────── */}
      <ScreenHeader
        kind="push"
        title={isNew ? t('compose.newPost') : t('compose.editPost')}
        trailing={
          isNew ? undefined : (
            // Nothing to save is a real state and the word looks like it. Ctrl+S does nothing here
            // either, so the keyboard and the word agree.
            <TextLink busy={save.isPending} disabled={readOnly || !dirty} onClick={submit}>
              {dirty ? t('compose.save') : t('compose.saved')}
            </TextLink>
          )
        }
      />

      {readOnly ? (
        <NoticeLine tone="danger" role="status">
          {t('compose.postRemoved')}
        </NoticeLine>
      ) : null}

      {/* ── the anchor: the cover, at full width ───────────────────────────────────────────────
          On create there is no cover block at all — the post has to exist before an image can
          hang off it. */}
      {post && !readOnly ? (
        <section aria-label={t('compose.cover')} className="flex flex-col gap-4">
          {cover ? (
            <>
              {/* Served by the AUTHOR route, not the public one. On a draft this is the only place
                  the image can be seen at all — the public serve route refuses a cover whose post
                  is not published, which is the property that route exists for.
                  Feathered, as the visitor meets it on the post page and in the feed (kit gap
                  G-data 11): the picture glows out of the black the way compose-post-1 draws it,
                  instead of standing as a grey-edged rectangle. Drawn WHOLE at its own shape
                  inside the 16:9 slot, never cropped to it — see `coverPlacement`. */}
              {(() => {
                const at = coverPlacement(cover.width, cover.height);
                return (
                  <div className="relative w-full" style={{ aspectRatio: SLOT_RATIO }}>
                    <div className="absolute" style={{ left: at.left, top: at.top, width: at.width }}>
                      <UserPhoto
                        src={'/api/v1/compose/posts/' + post.id + '/cover'}
                        alt={cover.alt ?? ''}
                        ratio={at.ratio}
                        priority
                        feather
                      />
                    </div>
                  </div>
                );
              })()}
              {/* `relative`: a picture taller than the slot runs 23 pt under it (the frame's
                  split), and the caption has to paint over that faded edge, not under it. */}
              <div className="relative flex flex-col gap-1">
                {/* `Kép eltávolítása` and not `Csere`: there IS no replace. The server refuses a
                    second cover, so changing one is delete then upload. */}
                <SectionHeader
                  rule={false}
                  title={t('compose.cover')}
                  trailing={
                    <TextLink
                      lead={<X aria-hidden />}
                      busy={deleteCover.isPending}
                      onClick={() =>
                        deleteCover.mutate(undefined, { onSuccess: () => feedback.ok('compose.toast.coverRemoved') })
                      }
                    >
                      {t('compose.removeCover')}
                    </TextLink>
                  }
                />
                {/* The image's OWN description, so its empty case gets its own string. `||` and
                    not `??`, so an empty-string alt is caught too. */}
                <p className="text-cap truncate text-text-2">{cover.alt || t('compose.coverAltMissing')}</p>
              </div>
            </>
          ) : (
            <>
              {/* Alt text stays EDITABLE in the upload flow: display-only everywhere would mean
                  every cover shipping without one. */}
              <Field
                label={t('compose.coverAlt')}
                value={alt}
                maxLength={200}
                onChange={(e) => setAlt(e.target.value)}
                hint={t('compose.coverAltHint')}
              />
              {/* A text link, not a pill: the screen's one lime pill is `Közzététel`. One key per
                  FILE CHOICE (see `coverKeyRef`). */}
              <FilePick
                variant="link"
                text="body"
                className="self-start"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={uploadCover.isPending}
                busy={uploadCover.isPending}
                onFiles={([file]) => {
                  if (!file) return;
                  coverKeyRef.current = newIdempotencyKey();
                  uploadCover.mutate(
                    { file, alt, key: coverKeyRef.current },
                    { onSuccess: () => feedback.ok('compose.toast.coverAdded') },
                  );
                }}
              >
                {uploadCover.isPending ? t('compose.uploading') : t('compose.chooseCover')}
              </FilePick>
            </>
          )}

          {uploadCover.error || deleteCover.error ? (
            <NoticeLine tone="danger" role="alert">
              {t(`compose.reason.${conflictOf(uploadCover.error ?? deleteCover.error)?.reason ?? 'generic'}`, {
                defaultValue: t('compose.coverFailed'),
              })}
            </NoticeLine>
          ) : null}
        </section>
      ) : null}

      {/* ── the editor: type -> title -> text, 24 apart ──────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {/* The type. Live on create: three words, the lime mark under the chosen one. Afterwards a
            STATEMENT, not a control: the kind is FROZEN once the post exists (its shape rules are
            enforced by a trigger that cannot re-validate a changed kind), so a control that merely
            LOOKS disabled would still be a control that lies. */}
        {isNew ? (
          <div className="flex flex-col gap-1">
            <SectionHeader rule={false} title={t('compose.kind')} />
            <ChipRow role="radiogroup" label={t('compose.kind')}>
              {kinds.map((k, i) => (
                <Chip
                  key={k.key}
                  role="radio"
                  selected={kind === k.key}
                  tabIndex={kind === k.key || (kind === '' && i === 0) ? 0 : -1}
                  onClick={() => setKind(k.key)}
                  onKeyDown={(e) => onKindKey(e, i)}
                >
                  {kindLabel(k.key)}
                </Chip>
              ))}
            </ChipRow>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <SectionHeader
              title={t('compose.kind')}
              trailing={<span className="text-cap-m text-text-1">{kindLabel(kind)}</span>}
            />
            <p className="text-cap text-text-3">{t('compose.kindFrozen')}</p>
          </div>
        )}

        {/* A title is this form's floor — autosave stays off until there is one — so the control says
            so both ways: `aria-required` for a screen reader, and the `Kötelező` marker on the
            label row for everyone else. */}
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

        <div className="flex flex-col gap-2">
          {/* The text: the field grown to seven rows, the markdown source in the UI face, one
              underline closing it. The counter sits on the label row's trailing edge; colour
              arrives only near the end — a counter that is loud from the first character is a
              counter people stop seeing. */}
          <TextArea
            label={t('compose.body')}
            minRows={7}
            value={body}
            disabled={readOnly}
            onChange={(e) => setBody(e.target.value)}
            labelTrailing={
              <span className={limits ? COUNTER_CLASS[counterTone(body.length, limits.bodyMax)] : 'text-text-3'}>
                {limits ? t('compose.charsLeft', { n: Math.max(0, limits.bodyMax - body.length) }) : ''}
              </span>
            }
          />

          {/* The markdown refusal, one line under the text. */}
          {bodyError?.body?.reason && !conflict ? (
            <NoticeLine tone="danger" role="alert" compact>
              {t(`compose.markdown.${bodyError.body.reason}`, { defaultValue: t('compose.markdown.generic') })}
            </NoticeLine>
          ) : null}

          {/* Everything that is not `stale` still answers inline — those refusals name a fix that
              applies to the form the coach is looking at. */}
          {conflict && !staleOpen ? (
            <NoticeLine tone="warn" role="alert">
              {t(`compose.reason.${conflict.reason}`, {
                defaultValue: t('compose.reason.generic'),
                version: conflict.activeVersion,
                when: conflict.eligibleAt ? new Date(conflict.eligibleAt * 1000).toLocaleString(i18n.language) : '',
                used: conflict.used,
                max: conflict.max,
                next: conflict.nextSlotAt ? new Date(conflict.nextSlotAt * 1000).toLocaleString(i18n.language) : '',
                field: conflict.field,
              })}
            </NoticeLine>
          ) : null}

          {/* ── the autosave receipt ─────────────────────────────────────────────────────────
              Always rendered (a 44 pt row, empty until there is something to say) so a change
              inside it is announced and nothing below it jumps. `failed` is loud and stays until
              the next success; the others fade to nothing when there is nothing to say. */}
          <div className="min-h-11" aria-live="polite">
            {autosave.state === 'saving' ? (
              <NoticeLine>{t('compose.autosave.saving')}</NoticeLine>
            ) : autosave.state === 'failed' ? (
              <NoticeLine tone="danger">{t('compose.autosave.failed')}</NoticeLine>
            ) : autosave.state === 'saved' && !autosave.hasUnsaved && autosave.savedAt !== null ? (
              <NoticeLine tone="ok">
                {/* THE LEADING PHRASE IS WHAT EXPLAINS THE MISSING SAVE BUTTON, and the clock time
                    is the receipt: "Mentve" alone reads the same a second after the save and an
                    hour after it. */}
                {t('compose.autosave.label')} <span aria-hidden>·</span> {t('compose.autosave.saved')}{' '}
                <span className="tnum">
                  {new Date(autosave.savedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </NoticeLine>
            ) : null}
          </div>
        </div>

        {/* ── the action ───────────────────────────────────────────────────────────────────────
            New: the one lime pill creates the draft. Existing: a rule, then publish (the one lime
            pill) while it is a draft, and the quiet take-down / restore row with its reassurance as
            the sub line. */}
        {isNew ? (
          <Pressable variant="primary" size="lg" className="w-full" busy={create.isPending} onClick={submit}>
            {t('compose.createDraft')}
          </Pressable>
        ) : post && !readOnly ? (
          <div className="flex flex-col gap-6">
            <Rule strong />
            <div className="flex flex-col gap-3">
              {post.publishedAt === null && post.deletedAt === null ? (
                <Pressable variant="primary" size="lg" className="w-full" busy={lifecycle.isPending} onClick={publish}>
                  {t('compose.publish')}
                </Pressable>
              ) : null}
              {post.deletedAt === null ? (
                <ListRow
                  title={t('compose.withdraw')}
                  sub={t('compose.withdrawUndoable')}
                  busy={lifecycle.isPending}
                  onClick={withdraw}
                />
              ) : (
                // Restoring returns the post to its ORIGINAL feed position and costs no quota slot —
                // worth saying, because that fear is why people leave things up.
                <ListRow
                  title={t('compose.restore')}
                  sub={t('compose.restoreKeepsPosition')}
                  subLines={2}
                  busy={lifecycle.isPending}
                  onClick={restore}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── the stale conflict, as a conversation rather than a merge ───────────────────────────
          The sheet draws no pill: the page keeps its one. */}
      <Sheet open={staleOpen} onClose={() => save.reset()} title={t('compose.reason.stale')}>
        <p className="text-cap text-text-2">{t('compose.staleServerCopy')}</p>
        <p className="text-body text-text-1">{conflict?.post?.title}</p>
        <TextLink
          text="body"
          weight="strong"
          className="self-start"
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
        </TextLink>
      </Sheet>
    </Screen>
  );
}

/** The cover slot: the column's width at 16:9 (compose-post-1: 354 x 199). */
const SLOT_RATIO = 16 / 9;
/** The tallest a cover is drawn, as a fraction of the slot's width (compose-post-1: 240 / 354). */
const COVER_MAX_H = 240 / 354;
/** Of a picture taller than the slot, the share that rises above it (compose-post-1: 18 of 41 pt). */
const COVER_RISE = 18 / 41;

/**
 * Where the cover is drawn inside its 16:9 slot — compose-post-1, body script `pic('cover-gym',
 * 320, 240)` at `[17, -18]` in the 354 x 199 slot.
 *
 * ═══ WHOLE, NEVER CROPPED ══════════════════════════════════════════════════════════════════════
 *
 * The frame draws the picture whole at its own shape: the 4:3 still is 320 x 240, centred across
 * the slot and standing 18 pt above it and 23 pt below it, so the hanging lamp at its top and the
 * pool of light at its bottom both survive. Cropping it to fill the slot (what this page did before)
 * cut the lamp off — and the description under it says "lámpafényben".
 *
 * Generalised to any upload, which keeps its own aspect on the server (`fit: inside`): the
 * picture is as wide as the slot unless that would make it taller than 240 / 354 of the slot's
 * width; then the height wins. So a 16:9 upload fills the slot exactly (the honest rectangle the
 * screen note asks for), a 4:3 one is the frame's 320 x 240, a portrait one stands narrower in the
 * middle. A picture taller than the slot overflows it with the frame's 18 : 23 split; one shorter
 * than the slot is centred in it. The slot keeps its 16:9 height in the flow, so the caption and
 * everything under it stay on the frame's lines whatever the upload's shape.
 *
 * All four numbers are fractions of the slot, so the same picture scales with a narrower column.
 * A cover with no recorded size falls back to the slot's own shape.
 */
function coverPlacement(width: number, height: number) {
  const ratio = width > 0 && height > 0 ? width / height : SLOT_RATIO;
  const w = Math.min(1, COVER_MAX_H * ratio); // of the slot's width
  const h = (w / ratio) * SLOT_RATIO; // of the slot's height
  const top = h > 1 ? -(h - 1) * COVER_RISE : (1 - h) / 2;
  return { ratio, left: `${((1 - w) / 2) * 100}%`, width: `${w * 100}%`, top: `${top * 100}%` };
}
