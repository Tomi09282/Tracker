import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Field } from '../../ui/primitives/Field';
import { TextArea } from '../../ui/primitives/TextArea';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Switch } from '../../ui/primitives/Switch';
import { CheckMark } from '../../ui/primitives/CheckMark';
import { Chip, ChipRow } from '../../ui/primitives/ChipRow';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { ListRow } from '../../ui/data/ListRow';
import { RowStack } from '../../ui/data/RowStack';
import { Monogram, MonogramSkeleton } from '../../ui/data/Monogram';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Sheet } from '../../ui/feedback/variants/E14E20';
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
 * A counter with its figure in ink and its words quiet — "4 / 6 kiválasztva", "7552 karakter
 * maradt" (compose-profile-1). The words come from ONE translated string, so the figure is found in
 * it rather than assumed to lead: German puts it in the middle ("Noch 7552 Zeichen"). A string that
 * does not hold the figure is drawn in one ink. Near or past a cap the whole counter takes the
 * warning / danger colour of `counterTone` instead.
 */
function InkCounter({ text, figure, tone }: { text: string; figure: string; tone?: string }) {
  const at = text.indexOf(figure);
  if (tone) return <span className={`text-data ${tone}`}>{text}</span>;
  if (at < 0) return <span className="text-data text-text-2">{text}</span>;
  return (
    <span className="text-data text-text-2">
      {text.slice(0, at)}
      <span className="text-text-1">{figure}</span>
      {text.slice(at + figure.length)}
    </span>
  );
}

/**
 * The identity line's disclosure — the rename of the handle the anchor DISPLAYS (compose-profile-2,
 * "Nyilvános név módosítása").
 *
 * ═══ IT IS FOLDED AWAY ON PURPOSE ══════════════════════════════════════════════════════════════
 *
 * A LISTED profile's rename retires the old handle for a year and spends a cooldown the coach then
 * cannot spend again for thirty days. That does not belong as an always-open field beside a headline,
 * where it is one absent-minded edit away from happening. So it is a strong TEXT action, never a
 * second pill: the screen's one lime pill is `Mentés`.
 *
 * ═══ AND `from` IS THE DEFENCE AGAINST THIS VERY SCREEN ════════════════════════════════════════
 *
 * `current` comes from the loaded profile, and it travels with the request. If this tab has been
 * open since before a rename made elsewhere — a second tab, a phone — the server sees a `from` that
 * no longer matches and refuses, naming the handle that is actually there. Without it, this form
 * would happily revert that rename and burn both names for a month while showing a success.
 *
 * The city the anchor also displays is picked in the row under this panel (`CityRow`): it is saved
 * by `Mentés` with the rest of the form, while the rename acts on its own.
 */
function IdentityDisclosure({
  current,
  listed,
  onClose,
}: {
  current: string;
  listed: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ctx = useComposeContext();
  const rename = useRenameHandle();
  const [next, setNext] = useState(current);

  const conflict = conflictOf(rename.error);
  const cooldownDays = Math.round((ctx.data?.handleRenameCooldownS ?? 2592000) / 86400);
  // Both numbers in the warning come from the server. The retirement window was hardcoded as "a
  // year" in three translation files while the rename window beside it was read from policy — two
  // numbers describing one rule, only one of which could be changed.
  const retireDays = Math.round((ctx.data?.handleCooldownS ?? 31536000) / 86400);

  return (
    <Section title={t('compose.handleChangeTitle')}>
      {/* The form, 4 apart: the field, its status line, the warning, the refusal, the two actions. */}
      <div className="flex flex-col gap-1">
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
          <NoticeLine tone="warn">
            {t('compose.handleCooldownWarning', { days: cooldownDays, retireDays, handle: current })}
          </NoticeLine>
        ) : null}

        {conflict ? (
          <NoticeLine tone="danger" role="alert">
            {t(`compose.reason.${conflict.reason}`, {
              defaultValue: t('compose.reason.generic'),
              handle: (conflict as { handle?: string }).handle,
              date:
                typeof (conflict as { eligibleAt?: number }).eligibleAt === 'number'
                  ? new Date((conflict as { eligibleAt: number }).eligibleAt * 1000).toLocaleDateString()
                  : undefined,
            })}
          </NoticeLine>
        ) : null}

        <div className="flex items-center gap-6">
          <TextLink
            text="body"
            weight="strong"
            busy={rename.isPending}
            disabled={next === current || next.length === 0}
            onClick={() => rename.mutate({ from: current, to: next }, { onSuccess: onClose })}
          >
            {t('compose.handleChangeConfirm')}
          </TextLink>
          <TextLink text="body" onClick={onClose}>
            {t('common.cancel')}
          </TextLink>
        </div>
      </div>
    </Section>
  );
}

/**
 * The city the anchor shows — a row with its value and the chevron (compose-profile-2 "Város"),
 * opening the bottom sheet of cities (Pulse: pickers are sheets). The first option means NO city and
 * reads `Bárhol`. A tap chooses and closes; the choice is saved by `Mentés`, as it always was.
 *
 * The sheet is the kit's `Sheet` with the radio rows `SelectSheet` draws (the chosen one in ink with
 * the lime tick, the others quiet, ArrowUp / ArrowDown between them); only the trigger differs: the
 * frame draws a list row here, not an underline field.
 */
function CityRow({
  value,
  onChange,
  cities,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  cities: { key: string; name: string }[] | undefined;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rows = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
  const options = [{ key: '', name: t('marketplace.everywhere') }, ...(cities ?? [])];
  const chosen = options.find((c) => c.key === value) ?? options[0];

  const onRowsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = rows.current.filter((r): r is HTMLButtonElement => !!r);
    const at = list.findIndex((r) => r === document.activeElement);
    const next = list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <>
      <ListRow
        title={t('compose.city')}
        value={chosen.name}
        chevron
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={t('compose.city')}>
        <div onKeyDown={onRowsKey}>
          <RowStack as="div" role="radiogroup" aria-label={t('compose.city')}>
            {options.map((c, i) => {
              const on = c.key === chosen.key;
              return (
                <ListRow
                  key={c.key || '-'}
                  title={c.name}
                  tone={on ? 'default' : 'muted'}
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  actionRef={(el) => {
                    rows.current[i] = el;
                  }}
                  onClick={() => {
                    onChange(c.key);
                    setOpen(false);
                  }}
                  trailing={on ? <CheckMark done /> : undefined}
                />
              );
            })}
          </RowStack>
        </div>
      </Sheet>
    </>
  );
}

/**
 * The anchor's frame: the pushed header (`VISSZA A PULTHOZ`, from routeMeta) 16 above whatever
 * stands under it — the monogram, or its skeleton.
 */
function Top({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader kind="push" />
      {children}
    </div>
  );
}

/**
 * Create or edit the public profile — Pulse frames `compose-profile-1` (the whole form) and
 * `compose-profile-2` (the identity panel open, a new handle typed).
 *
 * ═══ THE ANCHOR IS THE PERSON ══════════════════════════════════════════════════════════════════
 *
 * This screen edits a person, so the top is that person as a stranger will meet them: the 176 pt
 * textured monogram (its lime full stop says the profile is live), the display name as the ONLY
 * heading — typing in the name field visibly rewrites it — and `@handle · city` under it. That line
 * is the door to the folded identity panel: quiet with a chevron while closed, ink when open.
 *
 * ═══ READING ORDER ═════════════════════════════════════════════════════════════════════════════
 *
 * Who you are — things that act on their own: the rename, the city row, the public switch — then
 * what `Mentés` saves: the name, the one-line pitch, the specialties as words with the lime mark,
 * the bio as markdown source in an eight-line window. Then THE lime pill, and `Előnézet` as text
 * under it. Nothing is enclosed: rules, rows and underlines only.
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
  /*
   * A moderator-removed profile is READ-ONLY here — the spec's `Taken down` state, and the same
   * derivation `PostEditorPage` uses one word for one word. Without it every field, chip and toggle
   * stayed live and `Mentés` fired a PUT the server refuses: a form that accepts edits it cannot
   * keep is the quietest way to lose somebody's work.
   *
   * `!!profile` and not a `!== undefined` pair: on create `profile` is null and that already
   * answers it, so `readOnly` is false through the whole create form.
   */
  const readOnly = !!profile && profile.removedAt !== null;

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
    // The anchor, then the field stack — the shapes that actually arrive. The way back works while
    // it loads. Blocks where the text will be; nothing round, nothing spinning.
    return (
      <Screen top="push" role="status" aria-busy="true">
        <span className="sr-only">{t('common.loading')}</span>
        <Top>
          <div className="flex flex-col gap-6">
            <MonogramSkeleton size={176} />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </Top>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </Screen>
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

  const liveConflict = conflictOf(setLive.error);
  const showCity = isNew || (!readOnly && identityOpen);

  return (
    <Screen top="push">
      {/* ── the anchor: back row 16 above the 176 pt monogram, the name 24 under it, the identity
          line 4 under the name (its 44 pt target overhangs invisibly, above and below) ───────── */}
      <Top>
        {/* One line, the same shape the post editor's takedown line uses. The FULL explanation
            (`compose.removedBody`) is the desk's job per the spec; this screen only says why
            nothing here can be typed into. */}
        {readOnly ? (
          <NoticeLine tone="danger" role="status">
            {t('compose.removedTitle')}
          </NoticeLine>
        ) : null}

        <div className="flex flex-col gap-6">
          {/* No camera badge and no `Kép cseréje`: there is no avatar upload on the coach profile,
              only post covers. The lime full stop says the profile is live — the switch row below
              says it in words, so the dot is decoration here. */}
          <Monogram
            initials={initialsOf(displayName)}
            size={176}
            dot={profile !== null && profile.publishedAt !== null}
            className="self-start"
          />

          <div className="flex flex-col">
            <h1 className="text-title text-text-1">
              {displayName.trim() === '' ? t('compose.createProfile') : displayName}
            </h1>

            {/* THE IDENTITY LINE STAYS EVEN WHEN NOTHING CAN BE EDITED. It is the anchor's second
                half — the live preview of the marketplace card — so a takedown turns the trigger
                into plain text rather than removing the line. On create there is no handle yet. */}
            {isNew ? null : readOnly ? (
              <p className="text-body mt-1 truncate text-text-2">
                @{profile?.handle} · {cityName}
              </p>
            ) : (
              <TextLink
                text="body"
                weight="regular"
                tone={identityOpen ? 'default' : 'quiet'}
                trail={identityOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
                aria-expanded={identityOpen}
                className="-mb-2.75 -mt-1.75 self-start"
                onClick={() => setIdentityOpen((v) => !v)}
              >
                @{profile?.handle} · {cityName}
              </TextLink>
            )}
          </div>
        </div>
      </Top>

      {/* ── who you are: the parts that act on their own (rename, city, the public switch), then
          what `Mentés` saves (name, pitch) — the panel 20 above the rows, the rest 24 apart ────── */}
      <div className="flex flex-col gap-5">
        {isNew ? (
          <HandleField label={t('compose.handle')} value={handle} onChange={setHandle} hint={t('compose.handleHint')} />
        ) : !readOnly && identityOpen ? (
          <IdentityDisclosure
            current={profile?.handle ?? ''}
            listed={profile?.listedAt !== null}
            onClose={() => setIdentityOpen(false)}
          />
        ) : null}

        <div className="flex flex-col gap-6">
          {showCity || profile ? (
            <div className="flex flex-col gap-1">
              <RowStack as="div" open close>
                {showCity ? <CityRow value={city} onChange={setCity} cities={taxonomy.data?.cities} /> : null}

                {/* ONE FACT, TWO SCREENS. This switch and the desk's status control read and
                    write the SAME published flag, and unpublishing here takes the whole back
                    catalogue dark exactly as it does there. Hidden on create: nothing to publish
                    yet. A noun phrase, not the desk's verb, and the sub line says the consequence. */}
                {profile ? (
                  <ListRow
                    title={t('compose.publicProfile')}
                    titleId="compose-public-label"
                    sub={t('compose.publicProfileHint')}
                    control={
                      <Switch
                        checked={profile.publishedAt !== null}
                        disabled={setLive.isPending || readOnly}
                        labelledBy="compose-public-label"
                        onChange={(nextOn) => setLive.mutate(nextOn)}
                      />
                    }
                  />
                ) : null}
              </RowStack>

              {setLive.data && typeof setLive.data.postsWentDark === 'number' && setLive.data.postsWentDark > 0 ? (
                <NoticeLine role="status">{t('compose.wentDark', { count: setLive.data.postsWentDark })}</NoticeLine>
              ) : null}

              {liveConflict ? (
                <NoticeLine tone="danger" role="alert">
                  {t(`compose.reason.${liveConflict.reason}`, {
                    defaultValue: t('compose.reason.generic'),
                    version: liveConflict.activeVersion,
                    when: liveConflict.eligibleAt ? new Date(liveConflict.eligibleAt * 1000).toLocaleDateString() : '',
                  })}
                </NoticeLine>
              ) : null}
            </div>
          ) : null}

          {/* The server enforces a minimum here, so the control says so semantically AND visibly:
              `aria-required` for a screen reader, the `Kötelező` marker on the label row for
              everyone else. */}
          <Field
            label={t('compose.displayName')}
            aria-required
            marker={t('compose.required')}
            value={displayName}
            maxLength={limits?.displayNameMax}
            disabled={readOnly}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          {/* One logical line that wraps (a 54-character pitch takes two rows, the underline under
              the second). `Nem kötelező` on the label row answers a question asked before typing;
              the hint says WHERE the text lands. */}
          <TextArea
            singleLine
            label={t('compose.headline')}
            marker={t('compose.optional')}
            markerTone="quiet"
            hint={t('compose.headlineHint')}
            value={headline}
            maxLength={limits?.headlineMax}
            disabled={readOnly}
            onChange={(e) => setHeadline(e.target.value)}
          />
        </div>
      </div>

      {/* ── specialties: words, no capsules — the chosen ones in ink with the lime mark; the
          count on the eyebrow's baseline; `Több` opens the rest of the taxonomy (no way back) ──── */}
      <Section
        title={t('compose.specialties')}
        trailing={
          <InkCounter
            text={t('compose.specialtiesCount', { n: specialties.length, max: specialtyMax })}
            figure={`${specialties.length} / ${specialtyMax}`}
          />
        }
      >
        <div className="-mt-3 flex flex-col">
          <ChipRow wrap label={t('compose.specialties')} disabled={readOnly}>
            {visibleSpecialties.map((s) => (
              <Chip
                key={s.key}
                selected={specialties.includes(s.key)}
                disabled={readOnly}
                onClick={() => toggleSpecialty(s.key)}
              >
                {t(s.i18nKey, { defaultValue: s.key })}
              </Chip>
            ))}
          </ChipRow>
          {allSpecialties || ordered.length <= 6 ? null : (
            <TextLink
              text="body"
              trail={<ChevronDown aria-hidden />}
              className="-mb-2.75 self-start"
              onClick={() => setAllSpecialties(true)}
            >
              {t('common.more')}
            </TextLink>
          )}
        </div>
      </Section>

      {/* ── the bio: markdown SOURCE in the plain UI face, an eight-line window that scrolls
          inside; the characters-left counter on the eyebrow's baseline (warning near the cap,
          danger past it — a counter loud from the first character is one people stop seeing) ──── */}
      <Section
        title={t('compose.bio')}
        trailing={
          limits ? (
            <InkCounter
              text={t('compose.charsLeft', { n: Math.max(0, limits.bioMax - bio.length) })}
              figure={String(Math.max(0, limits.bioMax - bio.length))}
              tone={counterTone(bio.length, limits.bioMax) === 'calm' ? undefined : COUNTER_CLASS[counterTone(bio.length, limits.bioMax)]}
            />
          ) : undefined
        }
      >
        {/* The section's eyebrow names it; the field's own label stays for assistive tech. The
            frame starts the text at the window's top, so the field (11 pt pad) sits 11 higher. */}
        <TextArea
          labelHidden
          label={t('compose.bio')}
          minRows={8}
          maxRows={8}
          value={bio}
          disabled={readOnly}
          className="-mt-2.75"
          onChange={(e) => setBio(e.target.value)}
        />
      </Section>

      {/* ── THE lime pill ends the form; the preview toggle is text under it ───────────────────── */}
      <div className="flex flex-col gap-3">
        <Pressable
          variant="primary"
          size="lg"
          className="w-full"
          busy={create.isPending || save.isPending}
          // `Előnézet` under it stays live: rendering the bio is not an edit.
          disabled={readOnly}
          onClick={submit}
        >
          {isNew ? t('compose.createProfile') : t('compose.save')}
        </Pressable>
        <TextLink text="body" lead={<Eye aria-hidden />} className="self-start" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? t('compose.hidePreview') : t('compose.showPreview')}
        </TextLink>

        {markdownReason && !conflict ? (
          <NoticeLine tone="danger" role="alert">
            {t(`compose.markdown.${markdownReason}`, { defaultValue: t('compose.markdown.generic') })}
          </NoticeLine>
        ) : null}

        {conflict ? (
          <NoticeLine tone="warn" role="alert">
            {t(`compose.reason.${conflict.reason}`, {
              defaultValue: t('compose.reason.generic'),
              key: conflict.key,
            })}
          </NoticeLine>
        ) : null}
      </div>

      {showPreview ? (
        <Section title={t('compose.preview')}>
          {preview.data ? (
            <DocRenderer doc={preview.data.doc} />
          ) : (
            <p className="text-cap text-text-3">{t('compose.previewEmpty')}</p>
          )}
        </Section>
      ) : null}
    </Screen>
  );
}
