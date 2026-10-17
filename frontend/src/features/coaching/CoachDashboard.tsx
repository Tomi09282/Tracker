import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ChevronRight, Plus } from 'lucide-react';
import { NotificationBell } from '../chat/NotificationBell';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Field } from '../../ui/primitives/Field';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Section } from '../../ui/data/SectionHeader';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Rule } from '../../ui/data/Rule';
import { StatBlock } from '../../ui/data/StatBlock';
import { Numeral } from '../../ui/data/Numeral';
import { LedgerRow } from '../../ui/data/LedgerRow';
import { SplitBar } from '../../ui/data/SplitBar';
import { Monogram } from '../../ui/data/Monogram';
import { Pic } from '../../ui/media/Pic';
import { CopyButton } from '../../ui/feedback/variants/E2CopyButton';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { useOnline } from '../plans/useOnline';
import { hasRole, useSession } from '../auth/useSession';
import { personLabel } from '../../lib/person';
import {
  useClients,
  useTeams,
  useCodes,
  useCreateTeam,
  useCreateCode,
  useRevokeCode,
  useArchiveClient,
  usePregenerate,
  type ClientRow,
} from './useCoaching';

/**
 * The team split's vocabulary.
 *
 * A team is a CATEGORY, not a status, so its part of the split is a step of ink by its place
 * (`SplitBar`'s default tone: 1 · .64 · .40 · .24 …) — never lime and never warn. This screen spends
 * amber on "this account cannot log in" and on "this client trained zero times"; a team wearing the
 * same amber would make both of those unreadable. The largest teams come first, so the folded tail
 * and the no-team bucket close the bar at the quietest steps — the absence of a team reads that way.
 */
/** The largest few keep their own segment; everything past that folds into one. */
const LEGEND_TEAMS = 3;

/**
 * One join code's line: "3 / 20 felhasználva" with the figure in ink and the word in the quiet ink,
 * as coach-dashboard-1 draws it. The string is the one translated sentence; the figure is split off
 * only when the sentence starts with it (it does in hu / en / de), otherwise it is drawn whole.
 */
function CodeUses({ text, figure }: { text: string; figure: string }) {
  if (!text.startsWith(figure)) return <>{text}</>;
  return (
    <>
      {figure}
      <span className="text-text-2">{text.slice(figure.length)}</span>
    </>
  );
}

/**
 * Coach dashboard — [[58-Pulse/Screens/coach-dashboard]], frames coach-dashboard-1 (the roster),
 * coach-dashboard-2 (the code, shown once) and coach-dashboard-3 (an account awaiting handover).
 *
 * ═══ THE ORDER OF THE PAGE ═════════════════════════════════════════════════════════════════════
 *
 * Header (the greeting grammar of Home, the bell, the one door to the plan library) → the ONE hero:
 * how many clients, the stopwatch glowing out of the black and the team split under it → the
 * handover notice when an account is not yet its owner's → the ROSTER, what the coach opens this
 * page for → the two counts as a ledger → the join codes with the screen's one lime pill and the
 * door to the pre-made accounts. Nothing is enclosed: rules, rows and space.
 *
 * Two forms and two explanatory paragraphs live behind sheets: `Csapat neve` + `Létrehozás` behind
 * the CSAPATOK ledger row, `E-mail címek` + `Fiókok létrehozása` behind the pre-made accounts door.
 * Both are setup acts performed a handful of times per coach.
 *
 * ACTIVITY IS A COUNT OF COMPLETED SESSIONS IN 28 DAYS, never a percentage. A percentage needs a
 * denominator, and "how many were prescribed" is the schedule rule — arithmetic over a window
 * rather than a column. An invented denominator would be faking it.
 */
export function CoachDashboard() {
  const { t, i18n } = useTranslation();
  const { data: user } = useSession();

  const clients = useClients();
  const teams = useTeams();
  const codes = useCodes();

  // Every act on this screen is a server write and there is no queued-write store behind the
  // coaching endpoints, so a mutation fired offline is simply lost. A control that looks live and
  // silently drops the work is worse than one that looks disabled — minting a code the coach then
  // reads out to a client is the worst case of it.
  const offline = !useOnline();

  const createTeam = useCreateTeam();
  const createCode = useCreateCode();
  const revokeCode = useRevokeCode();
  const archiveClient = useArchiveClient();
  const pregenerate = usePregenerate();

  const [teamName, setTeamName] = useState('');
  const [pregenEmails, setPregenEmails] = useState('');
  const [confirmArchive, setConfirmArchive] = useState<ClientRow | null>(null);
  const [mintedCode, setMintedCode] = useState<string | null>(null);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [pregenOpen, setPregenOpen] = useState(false);

  if (user && !hasRole(user, 'coach')) {
    // The whole page for a non-coach, so its title is the page heading. The route is a
    // convenience; the server enforces the role regardless.
    return (
      <Screen top="root">
        <EmptyState heading="h1" title={t('coaching.forbiddenTitle')} body={t('coaching.forbiddenBody')} />
      </Screen>
    );
  }

  /* ── THE ROSTER'S ORDER IS DECIDED HERE, NOT IN SQL ──────────────────────────────────────────
     SQLite compares text byte by byte under its default BINARY collation, and there is no API on
     `better-sqlite3` for registering a locale-aware one. On a Hungarian roster that is not a near
     miss, it is the wrong answer twice over: a lowercase e-mail local part (`demo.lukacs.adam`,
     the fallback for an account that has never been signed into) sorts after every capitalised
     name because `d` is 0x64 and `Z` is 0x5A, and every accented initial sorts after ALL of ASCII
     because `Á` is two bytes starting 0xC3. Measured order, before this: Balogh, Molnár, Papp,
     Zoltán, demo.lukacs.adam, nfarkas92, Ács Ádor, Örs Ödön — the unnamed accounts herded into a
     block at the bottom and `Ács` stranded below even them, at the very end of the alphabet.

     `Intl.Collator` in the app's own language gets all of that right, and the roster is a bounded
     list — the seat cap is what bounds it — so sorting it here costs nothing. The server's own
     ORDER BY stays as a stable default for any other consumer; this is what the coach sees.

     `sensitivity: 'base'` folds case and accent for COMPARISON only, so `Ács` files under A and an
     unnamed account files under whatever letter it starts with, rather than either being exiled to
     one end. `numeric` keeps `Kliens 2` before `Kliens 10`. */
  const collator = new Intl.Collator(i18n.language, { sensitivity: 'base', numeric: true });
  const rows = [...(clients.data?.clients ?? [])].sort(
    (a, b) =>
      // Teams first and in the same grouping the server sent, so the split's parts and the list
      // still agree; unassigned clients last, which is what `t.name IS NULL` meant in SQL.
      Number(a.team_name === null) - Number(b.team_name === null) ||
      collator.compare(a.team_name ?? '', b.team_name ?? '') ||
      collator.compare(personLabel(a), personLabel(b)),
  );
  const awaitingHandover = rows.filter((c) => c.must_change_credentials === 1);
  const liveCodes = (codes.data?.codes ?? []).filter((c) => !c.revoked_at && c.uses < c.max_uses);

  /* ── the hero's arithmetic ────────────────────────────────────────────────────────────────
     One part per team, largest first, with everything past the legend cap folded into a single
     part. Shrinking the labels instead would produce a key nobody can read on a phone. */
  const byTeam = new Map<string, number>();
  for (const c of rows) byTeam.set(c.team_name ?? '', (byTeam.get(c.team_name ?? '') ?? 0) + 1);

  const namedTeams = [...byTeam.entries()]
    .filter(([name]) => name !== '')
    .sort((a, b) => b[1] - a[1]);
  const unassigned = byTeam.get('') ?? 0;
  const tail = namedTeams.slice(LEGEND_TEAMS).reduce((sum, [, n]) => sum + n, 0);

  const legend = [
    ...namedTeams.slice(0, LEGEND_TEAMS).map(([name, count]) => ({ label: name, count })),
    // Its own noun, not `coaching.teams`: that string already labels the CSAPATOK ledger row with a
    // different number in it, and one word over two quantities is a contradiction the reader has
    // to resolve. This part is an other-bucket, so it says so.
    ...(tail > 0 ? [{ label: t('coaching.otherTeams'), count: tail }] : []),
    ...(unassigned > 0 ? [{ label: t('coaching.unassigned'), count: unassigned }] : []),
  ];

  // The screen's ONE lime pill, in the join-code section's head (coach-dashboard-1 "Új kód").
  const mintPill = (
    <Pressable
      variant="primary"
      size="sm"
      busy={createCode.isPending}
      disabled={offline}
      icon={<Plus size={16} strokeWidth={2.25} aria-hidden />}
      onClick={async () => {
        const result = await createCode.mutateAsync({ kind: 'multi', max_uses: 20 });
        setMintedCode(result.code);
      }}
    >
      {t('coaching.mintCode')}
    </Pressable>
  );

  /* The pre-gen sheet renders passwords that exist nowhere else on earth. While they are on
     screen the scrim and Escape must not throw them away, so the close handler refuses and the
     panel carries its own dismiss that says what is being destroyed. */
  const holdingSecrets = (pregenerate.data?.created.length ?? 0) > 0;

  /* ── the roster section ───────────────────────────────────────────────────────────────────
     The count trails the eyebrow only once the list has landed: a 0 printed for "not known yet"
     is a wrong number, not a placeholder. */
  const roster = (
    <Section
      title={t('coaching.roster')}
      trailing={clients.data ? <span className="text-data text-text-2">{rows.length}</span> : undefined}
    >
      {clients.isPending ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t('common.loading')}</span>
          <RowStack as="div">
            {[0, 1, 2].map((i) => (
              <ListRowSkeleton key={i} sub leadSlot index={i} />
            ))}
          </RowStack>
        </div>
      ) : clients.isError ? (
        // The header, the counts and the codes still render from whatever resolved; only the list
        // says it failed, and it says so with the one action that can fix it.
        <EmptyState
          title={t('auth.errors.generic')}
          action={
            <TextLink text="body" onClick={() => void clients.refetch()}>
              {t('common.retry')}
            </TextLink>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title={t('coaching.emptyTitle')} body={t('coaching.emptyBody')} />
      ) : (
        <RowStack>
          {rows.map((c) => (
            // The LINK id, not the client's user id. They are different id spaces and the route
            // takes the link, because the link is what carries the proof that this coach may see
            // this client. The name and the activity line are the link; the archive glyph is its
            // own target beside it, never inside it.
            <ListRow
              key={c.link_id}
              to={`/coach/clients/${c.link_id}`}
              leadSlot
              lead={<Monogram person={c} size={28} />}
              title={personLabel(c)}
              subFace="data"
              sub={
                <>
                  {/* A client with none gets the alert ink on the whole line rather than a zero in
                      the same grey as everything else — the whole value of this line is that the
                      quiet ones stand out of a flat list. */}
                  <span className={c.sessions_28d === 0 ? 'text-warning' : undefined}>
                    {t('coaching.sessions28d', { count: c.sessions_28d ?? 0 })}
                  </span>
                  {/* The tag stands 16 after the count, as drawn: a real space (one mono cell of the
                      13 pt line, 7.8) keeps the two words apart for a screen reader, 8 more make 16. */}
                  {c.must_change_credentials === 1 ? (
                    <>
                      {' '}
                      <span className="ms-2 text-micro text-warning">{t('coaching.pending')}</span>
                    </>
                  ) : null}
                </>
              }
              control={
                // Destructive, so it never fires from the row: it opens the confirmation. Quiet
                // (`text-3`) like the chevron beside it. Its 44 pt target runs into both of the
                // row's gaps (as drawn: 323-367, touching the text column and the chevron), so the
                // name and the activity line keep the drawn 235 pt column.
                <Pressable
                  variant="link"
                  shape="icon"
                  tone="faint"
                  className="-mx-4"
                  aria-label={t('coaching.archive')}
                  disabled={offline}
                  onClick={() => setConfirmArchive(c)}
                >
                  <Archive aria-hidden />
                </Pressable>
              }
              chevron
            />
          ))}
        </RowStack>
      )}
    </Section>
  );

  return (
    <Screen top="root" width="wide">
      {/* The bell rides this screen's OWN heading rather than a global app bar. An app bar would
          cost vertical space on every screen including the workout player, whose height is the
          thing its entire layout is built around. */}
      <ScreenHeader kind="greet" title={t('coaching.title')} sub={t('coaching.eyebrow')} trailing={<NotificationBell />}>
        {/* THE PLAN LIBRARY'S DOOR.
            `/coach/plans` held its own bottom-bar tab until the bar became role-shaped, and it is
            the worse of the two losses: its only other in-app link is the back arrow on the plan
            EDITOR, which you can only see once you are already inside a plan, plus the command
            palette, which is desktop-only. Without this the whole plan library is unreachable on a
            phone. A real anchor, not a button that navigates — a page you can middle-click is a
            page. `check-nav.mjs` asserts this link. */}
        <TextLink to="/coach/plans" text="body" trail={<ChevronRight />} className="self-start">
          {t('nav.plans')}
        </TextLink>
      </ScreenHeader>

      {/* ── the hero ─────────────────────────────────────────────────────────────────────────
          A numeral drawn at zero is a decoration pretending to be data, so an empty or failed
          roster gets no hero at all. While the roster loads: one block at the numeral's cap height
          and one for the bar; the still is withheld (Pulse draws no skeleton for an image). */}
      {clients.isPending ? (
        <div aria-hidden className="flex flex-col gap-5">
          <StatBlock label={t('coaching.clients')}>
            <Skeleton className="h-[102px] w-[53px]" />
          </StatBlock>
          <Skeleton className="h-1.5 w-full" />
        </div>
      ) : rows.length > 0 ? (
        // coach-dashboard-1 "Hero stage": the stopwatch is absolute, its lit right edge 34 past the
        // gutter (the scaffold clips it at the screen edge), nothing written on its lit area.
        <div className="relative flex flex-col gap-5">
          <Pic slot="hero-stopwatch" width={239} priority bleed className="absolute -right-[34px] -top-[58px]" />
          <StatBlock label={t('coaching.clients')} className="relative">
            <Numeral size="giant" value={rows.length} mode="roll" from={0} />
          </StatBlock>
          {/* The legend is the roster's team key — the flat list below carries no team of its own. */}
          <SplitBar className="relative" label={t('coaching.clients')} parts={legend} />
        </div>
      ) : null}

      {/* The one alert that is real today: accounts the coach created whose password the coach
          still knows. Until the client changes it, that account is not yet theirs. It stands
          between two section rules, right above the list it is about (coach-dashboard-3). */}
      {awaitingHandover.length > 0 ? (
        <div className="flex flex-col gap-4">
          <Rule strong />
          {/* Its own short key, not the client-detail one: the dashboard is a roster and this is a
              count with a consequence. */}
          <NoticeLine tone="warn" detail={t('coaching.handoverShort')}>
            {t('coaching.handoverTitle', { count: awaitingHandover.length })}
          </NoticeLine>
          {roster}
        </div>
      ) : (
        roster
      )}

      {/* ── access: the two counts, then the join codes and the pre-made accounts door ─────── */}
      <div className="flex flex-col gap-4">
        {/* A failed or pending read prints the dash, never a 0. "Élő kódok" opens nothing: no
            chevron, the figure in the same column. */}
        <RowStack open close as="div">
          <LedgerRow
            label={t('coaching.teams')}
            value={teams.data?.teams.length}
            failed={teams.isError}
            busy={teams.isPending}
            mode="roll"
            onClick={() => setTeamsOpen(true)}
          />
          <LedgerRow
            label={t('coaching.activeCodes')}
            value={codes.data ? liveCodes.length : undefined}
            failed={codes.isError}
            busy={codes.isPending}
            mode="roll"
            chevronSpace
          />
        </RowStack>

        {/* No live codes: the heading, the pill and the door stay, the code rows simply do not
            render. The code itself is unrecoverable, so a row names a code by what it does. */}
        <Section rule={false} trailingInFlow title={t('coaching.joinCodes')} trailing={mintPill}>
          <RowStack>
            {liveCodes.map((c) => (
              <ListRow
                key={c.id}
                title={
                  <CodeUses
                    text={t('coaching.codeUses', { used: c.uses, max: c.max_uses })}
                    figure={`${c.uses} / ${c.max_uses}`}
                  />
                }
                control={
                  // One tap, no confirmation (today's behaviour). The 44 pt target overhangs the
                  // 56 pt row by its padding, as drawn.
                  <TextLink
                    tone="danger"
                    className="-my-1"
                    busy={revokeCode.isPending}
                    disabled={offline}
                    onClick={() => revokeCode.mutate(c.id)}
                  >
                    {t('coaching.revoke')}
                  </TextLink>
                }
              />
            ))}
            <ListRow title={t('coaching.pregenTitle')} onClick={() => setPregenOpen(true)} chevron />
          </RowStack>
        </Section>
      </div>

      {/* ── sheets ─────────────────────────────────────────────────────────────────────────── */}
      <Sheet open={mintedCode !== null} onClose={() => setMintedCode(null)} title={t('coaching.codeReady')}>
        <p className="text-body text-text-2">{t('coaching.codeOnce')}</p>
        <RowStack open close as="div">
          <ListRow
            title={<span className="text-data-l">{mintedCode}</span>}
            // `common.copy`, not `common.save`. `label` is this button's aria-label in every state
            // and its visible word after a successful copy.
            // The 44 pt control overhangs the 56 pt row by its padding (coach-dashboard-2: the row
            // between the two rules is 56).
            control={
              <span className="-my-1 flex">
                <CopyButton value={mintedCode ?? ''} label={t('common.copy')} />
              </span>
            }
          />
        </RowStack>
      </Sheet>

      {/* The submit links of the two forms are text links, not pills: the page's Új kód pill stays
          on screen under the scrim, and Pulse allows one lime pill. */}
      <Sheet open={teamsOpen} onClose={() => setTeamsOpen(false)} title={t('coaching.teams')}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!teamName.trim()) return;
            createTeam.mutate({ name: teamName.trim() });
            setTeamName('');
          }}
        >
          <Field label={t('coaching.teamName')} value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          <TextLink
            type="submit"
            text="body"
            weight="strong"
            className="self-start"
            busy={createTeam.isPending}
            disabled={!teamName.trim() || offline}
          >
            {t('coaching.createTeam')}
          </TextLink>
        </form>
      </Sheet>

      <Sheet
        open={pregenOpen}
        // Refuses to close while temporary passwords are on screen. A scrim tap or an Escape
        // press would destroy credentials that exist in no database in plaintext, and neither of
        // those gestures says what it is about to throw away.
        onClose={() => {
          if (holdingSecrets) return;
          setPregenOpen(false);
        }}
        title={t('coaching.pregenTitle')}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const emails = pregenEmails
              .split(/[\s,;]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (emails.length === 0) return;
            pregenerate.mutate({ emails });
            setPregenEmails('');
          }}
        >
          <Field
            label={t('coaching.pregenEmails')}
            hint={t('coaching.pregenHint')}
            value={pregenEmails}
            onChange={(e) => setPregenEmails(e.target.value)}
          />
          <TextLink
            type="submit"
            text="body"
            weight="strong"
            className="self-start"
            busy={pregenerate.isPending}
            disabled={!pregenEmails.trim() || offline}
          >
            {t('coaching.pregenCreate')}
          </TextLink>
        </form>

        {holdingSecrets ? (
          <div className="flex flex-col gap-4">
            <NoticeLine tone="warn">{t('coaching.tempOnce')}</NoticeLine>
            <RowStack as="div">
              {(pregenerate.data?.created ?? []).map((c) => (
                <ListRow
                  key={c.userId}
                  title={personLabel(c)}
                  value={c.temporaryPassword}
                  control={<CopyButton value={`${c.email} / ${c.temporaryPassword}`} label={t('common.copy')} />}
                />
              ))}
            </RowStack>
            {/* The only way out while the panel is up, and it names the cost. */}
            <TextLink
              text="body"
              tone="danger"
              className="self-start"
              onClick={() => {
                pregenerate.reset();
                setPregenOpen(false);
              }}
            >
              {t('common.dismiss')}
            </TextLink>
          </div>
        ) : null}
      </Sheet>

      <Sheet
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        title={t('coaching.archiveConfirmTitle')}
      >
        <div className="flex items-center gap-4">
          {confirmArchive ? <Monogram person={confirmArchive} size={28} /> : null}
          <p className="text-body text-text-2">
            {t('coaching.archiveConfirmBody', { email: confirmArchive ? personLabel(confirmArchive) : '' })}
          </p>
        </div>
        <div className="flex flex-col items-start">
          {/* The row's glyph was guarded and this was not, so the sheet could be opened online and
              fired offline: the archive is dropped and the sheet closes as if it worked. There is
              no queued-write store behind the coaching endpoints, so the guard has to sit on the
              control that actually mutates. */}
          <TextLink
            text="body"
            tone="danger"
            busy={archiveClient.isPending}
            disabled={offline}
            onClick={async () => {
              if (confirmArchive) await archiveClient.mutateAsync(confirmArchive.link_id);
              setConfirmArchive(null);
            }}
          >
            {t('coaching.archive')}
          </TextLink>
          <TextLink text="body" onClick={() => setConfirmArchive(null)}>
            {t('common.cancel')}
          </TextLink>
        </div>
      </Sheet>
    </Screen>
  );
}
