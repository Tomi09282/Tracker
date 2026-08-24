import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  Users,
  KeyRound,
  UserPlus,
  TriangleAlert,
  Archive,
  Ticket,
  ClipboardList,
  Plus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { NotificationBell } from '../chat/NotificationBell';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { Surface } from '../../ui/primitives/Surface';
import { SummaryTile } from '../../ui/data/SummaryTile';
import { Gauge } from '../../ui/feedback/Gauge';
import { CountUp } from '../../ui/feedback/CountUp';
import { CopyButton } from '../../ui/feedback/variants/E2CopyButton';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Monogram } from './Monogram';
import { useSession } from '../auth/useSession';
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
 * A section's header: a tinted icon holder, the heading, and whatever belongs on the right.
 *
 * It replaces a bare `<h2>` because the redesigned screen has no rules and no card borders between
 * sections — the icon holder IS the section boundary. Local rather than shared for now; it appears
 * on several screens and wants promoting.
 */
function SectionHead({
  icon: Icon,
  title,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-tight">
      <span
        aria-hidden
        className="inline-grid size-11 shrink-0 place-items-center rounded-chip bg-accent-subtle text-accent"
      >
        <Icon className="size-icon-m" strokeWidth={2} />
      </span>
      <h2 className="text-title-2 min-w-0 flex-1 text-text-1">{title}</h2>
      {trailing}
    </div>
  );
}

/**
 * The donut's vocabulary.
 *
 * A team is a CATEGORY, not a status, so the colours are drawn from the neutral end of the
 * semantic set — accent, info, success — and never from warning or danger. This screen spends amber
 * on "this account cannot log in" and on "this client trained zero times"; a team wearing the same
 * amber would make both of those unreadable.
 *
 * The greys close the ring: the folded tail and the no-team bucket are the absence of a team, and
 * they read that way.
 */
const TEAM_COLORS = ['var(--accent)', 'var(--info)', 'var(--success)'] as const;
const TAIL_COLOR = 'var(--text-2)';
const UNASSIGNED_COLOR = 'var(--text-3)';

/** The largest few keep their own segment; everything past that folds into one. */
const LEGEND_TEAMS = TEAM_COLORS.length;

/**
 * Coach dashboard — the redesign of Bible blueprint 6.
 *
 * ═══ WHAT LEFT THE SCROLL ══════════════════════════════════════════════════════════════════════
 *
 * Two forms and two explanatory paragraphs. `Csapat neve` + `Létrehozás` now live behind the
 * CSAPATOK tile, and `E-mail címek` + `Fiókok létrehozása` behind the ghost `Előre létrehozott
 * fiókok` button. Both are setup acts performed a handful of times per coach, and they were costing
 * the DAILY screen four controls and two paragraphs above the roster — the one thing the coach
 * opens this page to read.
 *
 * The team sub-headings left the roster too. Their information is the donut's legend now, which
 * says the same split in one glance instead of one grey heading per team on a list that is
 * scrolled every day. The list being flat is what makes a zero-session row visible: every row now
 * looks identical except the one that is amber.
 *
 * ACTIVITY IS A COUNT OF COMPLETED SESSIONS IN 28 DAYS, never a percentage. A percentage needs a
 * denominator, and "how many were prescribed" is the schedule rule — arithmetic over a window
 * rather than a column. An invented denominator would be faking it.
 */
export function CoachDashboard() {
  const { t } = useTranslation();
  const { data: user } = useSession();

  const clients = useClients();
  const teams = useTeams();
  const codes = useCodes();

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

  if (user && user.role !== 'coach' && user.role !== 'admin') {
    return (
      <div className="col-wide screen-x py-6">
        {/* The whole page for a non-coach, so its title is the page heading. The route is a
            convenience; the server enforces the role regardless. */}
        <EmptyState
          icon={Users}
          title={t('coaching.forbiddenTitle')}
          body={t('coaching.forbiddenBody')}
          heading="h1"
        />
      </div>
    );
  }

  const rows = clients.data?.clients ?? [];
  const awaitingHandover = rows.filter((c) => c.must_change_credentials === 1);
  const liveCodes = (codes.data?.codes ?? []).filter((c) => !c.revoked_at && c.uses < c.max_uses);

  /* ── the anchor's arithmetic ──────────────────────────────────────────────────────────────
     One segment per team, largest first, with everything past the legend cap folded into a single
     segment. Shrinking the labels instead would produce a key nobody can read on a phone. */
  const byTeam = new Map<string, number>();
  for (const c of rows) byTeam.set(c.team_name ?? '', (byTeam.get(c.team_name ?? '') ?? 0) + 1);

  const namedTeams = [...byTeam.entries()]
    .filter(([name]) => name !== '')
    .sort((a, b) => b[1] - a[1]);
  const unassigned = byTeam.get('') ?? 0;
  const tail = namedTeams.slice(LEGEND_TEAMS).reduce((sum, [, n]) => sum + n, 0);

  const legend = [
    ...namedTeams.slice(0, LEGEND_TEAMS).map(([name, count], i) => ({
      key: `team-${name}`,
      label: name,
      count,
      color: TEAM_COLORS[i],
    })),
    ...(tail > 0
      ? [{ key: 'tail', label: t('coaching.teams'), count: tail, color: TAIL_COLOR }]
      : []),
    ...(unassigned > 0
      ? [
          {
            key: 'unassigned',
            label: t('coaching.unassigned'),
            count: unassigned,
            color: UNASSIGNED_COLOR,
          },
        ]
      : []),
  ];

  const teamCount = teams.data?.teams.length ?? 0;

  const mintPill = (
    <Pressable
      variant="primary"
      shape="chip"
      busy={createCode.isPending}
      icon={<Plus className="size-icon-m" strokeWidth={2} aria-hidden />}
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

  return (
    <div className="col-wide screen-x flex flex-col gap-section py-6">
      {/* The bell rides this screen's OWN heading rather than a global app bar. An app bar would
          cost vertical space on every screen including the workout player, whose height is the
          thing its entire layout is built around. */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-micro uppercase text-accent">{t('coaching.eyebrow')}</p>
          <h1 className="text-title-1 mt-1 text-text-1">{t('coaching.title')}</h1>
          {/* THE PLAN LIBRARY'S DOOR.
              `/coach/plans` held its own bottom-bar tab until the bar became role-shaped, and it
              is the worse of the two losses: its only other in-app link is the back arrow on the
              plan EDITOR, which you can only see once you are already inside a plan, plus the
              command palette, which is desktop-only. Without this the whole plan library is
              unreachable on a phone. A real anchor, not a button that navigates — a page you can
              middle-click is a page. `check-nav.mjs` asserts this link. */}
          <Link
            to="/coach/plans"
            className="text-body-s mt-1 inline-flex min-h-[var(--target-min)] items-center gap-2 text-accent"
          >
            <ClipboardList className="size-icon-s" aria-hidden />
            {t('nav.plans')}
          </Link>
        </div>
        <NotificationBell className="-mr-2 shrink-0" />
      </header>

      {/* ── anchor ─────────────────────────────────────────────────────────────────────────── */}
      {clients.isPending ? (
        <div className="flex flex-col items-center gap-group">
          <Skeleton className="size-[208px] rounded-full" />
          <Skeleton className="h-4 w-64" />
        </div>
      ) : rows.length > 0 ? (
        // A ring drawn at zero is a decoration pretending to be data, so an empty roster gets no
        // donut at all — see the empty branch further down.
        <div className="flex flex-col items-center gap-group">
          <Gauge
            className="size-[208px]"
            label={t('coaching.clients')}
            segments={legend.map((l) => ({
              value: l.count / rows.length,
              color: l.color,
              label: l.label,
            }))}
          >
            <div className="flex flex-col items-center">
              <p className="text-display font-display tabular-nums text-text-1">
                <CountUp to={rows.length} />
              </p>
              <p className="text-micro uppercase text-text-3">{t('coaching.clients')}</p>
            </div>
          </Gauge>

          {/* The legend is the roster's team key — the flat list below carries no team of its own. */}
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-tight">
            {legend.map((l) => (
              <li key={l.key} className="text-body-s flex items-center gap-tight text-text-2">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: l.color }}
                />
                <span className="truncate">{l.label}</span>
                <span className="font-medium tabular-nums text-text-1">{l.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── inventory ──────────────────────────────────────────────────────────────────────── */}
      {clients.isPending ? (
        <div className="grid grid-cols-2 gap-group">
          <Skeleton className="h-[140px] rounded-card" />
          <Skeleton className="h-[140px] rounded-card" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-group">
          {/* Pressable wraps the tile rather than reimplementing it: one tile component, one
              44px floor, one set of interaction states. */}
          <Pressable
            variant="ghost"
            className={cn(
              'group h-full w-full flex-col items-stretch whitespace-normal rounded-card p-0',
              'text-left hover:bg-transparent',
            )}
            onClick={() => setTeamsOpen(true)}
          >
            <SummaryTile
              icon={Ticket}
              value={teamCount}
              caption={t('coaching.teams')}
              className={cn(
                'h-full w-full transition-colors duration-[var(--duration-fast)]',
                'ease-[var(--ease-standard)] group-hover:border-[var(--surface-border-strong)]',
                'group-hover:bg-surface-2',
              )}
            />
          </Pressable>

          <SummaryTile
            icon={KeyRound}
            value={liveCodes.length}
            caption={t('coaching.activeCodes')}
            className="h-full"
          />
        </div>
      )}

      {/* The one alert that is real today: accounts the coach created whose password the coach
          still knows. Until the client changes it, that account is not yet theirs. */}
      {awaitingHandover.length > 0 ? (
        <Surface className="flex items-start gap-group border-warning-border bg-warning-subtle">
          <span
            aria-hidden
            className="inline-grid size-11 shrink-0 place-items-center rounded-chip bg-[var(--warning-subtle)] text-warning"
          >
            <TriangleAlert className="size-icon-m" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-title-3 text-text-1">
              {t('coaching.handoverTitle', { count: awaitingHandover.length })}
            </p>
            <p className="text-body-s measure mt-1 text-text-2">{t('coaching.handoverBody')}</p>
          </div>
        </Surface>
      ) : null}

      {/* ── join codes ─────────────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-group">
        <SectionHead icon={KeyRound} title={t('coaching.joinCodes')} trailing={mintPill} />

        {/* No live codes: the heading and the pill stay, the row list simply does not render. The
            explainer paragraph that used to sit here is stated where it matters instead — inside
            the `A kód elkészült` sheet, at the one moment the code is visible. */}
        {liveCodes.length > 0 ? (
          <ul className="flex flex-col gap-tight">
            {liveCodes.map((c) => (
              <Surface
                as="li"
                key={c.id}
                pad="none"
                className="flex min-h-[var(--target-min)] items-center justify-between gap-tight py-2 pl-4 pr-2"
              >
                {/* The code itself is unrecoverable, so the row identifies it by what it does
                    rather than by what it is. */}
                <span className="text-body min-w-0 truncate text-text-1">
                  {t('coaching.codeUses', { used: c.uses, max: c.max_uses })}
                </span>
                <Pressable
                  shape="chip"
                  density="compact"
                  variant="secondary"
                  busy={revokeCode.isPending}
                  onClick={() => revokeCode.mutate(c.id)}
                >
                  {t('coaching.revoke')}
                </Pressable>
              </Surface>
            ))}
          </ul>
        ) : null}

        <Pressable
          variant="ghost"
          shape="chip"
          className="self-start"
          icon={<UserPlus className="size-icon-m" strokeWidth={2} aria-hidden />}
          onClick={() => setPregenOpen(true)}
        >
          {t('coaching.pregenTitle')}
        </Pressable>
      </section>

      {/* ── roster ─────────────────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-group">
        <SectionHead
          icon={Users}
          title={t('coaching.roster')}
          trailing={
            <span className="text-body shrink-0 tabular-nums text-text-3">{rows.length}</span>
          }
        />

        {clients.isPending ? (
          <Skeleton className="h-[228px] rounded-card" />
        ) : clients.isError ? (
          // The shell, the header and the tiles still render from whatever resolved; only the
          // list says it failed, and it says so with the one action that can fix it.
          <Surface pad="none">
            <EmptyState
              icon={Users}
              title={t('auth.errors.generic')}
              action={
                <Pressable variant="secondary" onClick={() => void clients.refetch()}>
                  {t('common.retry')}
                </Pressable>
              }
            />
          </Surface>
        ) : rows.length === 0 ? (
          <Surface pad="none">
            <EmptyState icon={Users} title={t('coaching.emptyTitle')} body={t('coaching.emptyBody')} />
          </Surface>
        ) : (
          <Surface pad="none">
            <ul>
              {rows.map((c) => (
                <li
                  key={c.link_id}
                  className={cn(
                    'flex items-center gap-tight py-2 pl-4 pr-2',
                    'border-t border-[var(--surface-border)] first:border-t-0',
                  )}
                >
                  <Monogram email={c.email} />

                  {/* The LINK id, not the client's user id. They are different id spaces and the
                      route takes the link, because the link is what carries the proof that this
                      coach may see this client.
                      The whole text column is the target: it is the one row a coach taps all day,
                      on a phone, one-handed. */}
                  <Link
                    to={`/coach/clients/${c.link_id}`}
                    className="flex min-h-[var(--target-min)] min-w-0 flex-1 flex-col justify-center"
                  >
                    <span className="text-body block truncate text-text-1">{c.email}</span>
                    <span className="text-caption mt-1 flex flex-wrap items-center gap-tight text-text-3">
                      {/* A client with none gets the alert tone rather than a zero in the same
                          grey as everything else — the whole value of this line is that the quiet
                          ones stand out of a flat list. */}
                      <span className={c.sessions_28d === 0 ? 'text-warning' : undefined}>
                        {t('coaching.sessions28d', { count: c.sessions_28d ?? 0 })}
                      </span>
                      {c.must_change_credentials === 1 ? (
                        <span className="text-micro uppercase rounded-chip bg-[var(--warning-subtle)] px-2 py-0.5 text-warning">
                          {t('coaching.pending')}
                        </span>
                      ) : null}
                    </span>
                  </Link>

                  {/* Destructive, so it is never in the primary position and never fires without
                      a confirmation. */}
                  <Pressable
                    shape="icon"
                    variant="ghost"
                    aria-label={t('coaching.archive')}
                    onClick={() => setConfirmArchive(c)}
                  >
                    <Archive className="size-icon-m" strokeWidth={2} aria-hidden />
                  </Pressable>
                </li>
              ))}
            </ul>
          </Surface>
        )}
      </section>

      {/* ── sheets ─────────────────────────────────────────────────────────────────────────── */}
      <Sheet open={mintedCode !== null} onClose={() => setMintedCode(null)} title={t('coaching.codeReady')}>
        <p className="text-body-s measure text-text-2">{t('coaching.codeOnce')}</p>
        <Surface elevation="inset" className="mt-4 flex items-center justify-between gap-3">
          <span className="text-title-3 tabular-nums text-text-1">{mintedCode}</span>
          <CopyButton value={mintedCode ?? ''} label={t('common.save')} />
        </Surface>
      </Sheet>

      <Sheet open={teamsOpen} onClose={() => setTeamsOpen(false)} title={t('coaching.teams')}>
        <form
          className="flex flex-col gap-group"
          onSubmit={(e) => {
            e.preventDefault();
            if (!teamName.trim()) return;
            createTeam.mutate({ name: teamName.trim() });
            setTeamName('');
          }}
        >
          <Field
            label={t('coaching.teamName')}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            leading={<Ticket className="size-icon-m" aria-hidden />}
          />
          <Pressable
            type="submit"
            variant="primary"
            busy={createTeam.isPending}
            disabled={!teamName.trim()}
            className="self-start"
          >
            {t('coaching.createTeam')}
          </Pressable>
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
          className="flex flex-col gap-group"
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
            leading={<UserPlus className="size-icon-m" aria-hidden />}
          />
          <Pressable
            type="submit"
            variant="primary"
            busy={pregenerate.isPending}
            disabled={!pregenEmails.trim()}
            className="self-start"
          >
            {t('coaching.pregenCreate')}
          </Pressable>
        </form>

        {holdingSecrets ? (
          <Surface className="mt-4 flex flex-col gap-tight border-warning-border bg-warning-subtle">
            <p className="text-body-s text-text-1">{t('coaching.tempOnce')}</p>
            <ul className="flex flex-col gap-tight">
              {(pregenerate.data?.created ?? []).map((c) => (
                <li key={c.userId} className="flex items-center justify-between gap-3">
                  <span className="text-body-s min-w-0 truncate text-text-1">{c.email}</span>
                  <span className="text-body-s shrink-0 tabular-nums text-text-1">
                    {c.temporaryPassword}
                  </span>
                  <CopyButton value={`${c.email} / ${c.temporaryPassword}`} label={t('common.save')} />
                </li>
              ))}
            </ul>
            {/* The only way out while the panel is up, and it names the cost. */}
            <Pressable
              variant="danger"
              className="mt-2 self-start"
              onClick={() => {
                pregenerate.reset();
                setPregenOpen(false);
              }}
            >
              {t('common.dismiss')}
            </Pressable>
          </Surface>
        ) : null}
      </Sheet>

      <Sheet
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        title={t('coaching.archiveConfirmTitle')}
      >
        <div className="flex items-center gap-tight">
          {confirmArchive ? <Monogram email={confirmArchive.email} /> : null}
          <p className="text-body-s measure text-text-2">
            {t('coaching.archiveConfirmBody', { email: confirmArchive?.email })}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-tight">
          <Pressable
            variant="danger"
            busy={archiveClient.isPending}
            onClick={async () => {
              if (confirmArchive) await archiveClient.mutateAsync(confirmArchive.link_id);
              setConfirmArchive(null);
            }}
          >
            {t('coaching.archive')}
          </Pressable>
          <Pressable variant="ghost" onClick={() => setConfirmArchive(null)}>
            {t('common.cancel')}
          </Pressable>
        </div>
      </Sheet>
    </div>
  );
}
