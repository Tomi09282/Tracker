import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from '../chat/NotificationBell';
import { Link } from 'react-router';
import { Users, KeyRound, UserPlus, TriangleAlert, Archive, Ticket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';
import { Field } from '../../ui/primitives/Field';
import { CountUp } from '../../ui/feedback/CountUp';
import { CopyButton } from '../../ui/feedback/variants/E2CopyButton';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
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

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-card border border-[var(--surface-border)] bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-chip bg-accent-subtle text-accent">
          <Icon className="size-icon-m" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-micro uppercase text-text-3">{label}</span>
      </div>
      <p className="text-display font-display mt-4 text-text-1">
        <CountUp to={value} />
      </p>
    </div>
  );
}

/**
 * Coach dashboard — Bible blueprint 6.
 *
 * Stat row, then the alerts that are actually actionable today, then the client list grouped by
 * team.
 *
 * ACTIVITY ARRIVED WHEN ITS REASON FOR BEING ABSENT EXPIRED. This block used to say adherence was
 * "deliberately absent rather than faked: nothing logs a workout yet". That was true when it was
 * written and stopped being true the day the player shipped — a comment asserting a state of the
 * world rather than a rule, quietly outliving the world it described.
 *
 * It is a COUNT of completed sessions in 28 days, never a percentage. A percentage needs a
 * denominator, and "how many were prescribed" is the schedule rule — arithmetic over a window, not
 * a column. An invented denominator would be exactly the faking the old comment refused.
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

  if (user && user.role !== 'coach' && user.role !== 'admin') {
    return (
      <div className="col-wide screen-x py-6">
        {/* The whole page for a non-coach, so its title is the page heading. Third instance of
            this shape — a role gate that renders nothing but an EmptyState. */}
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

  // Grouped by team, with the unassigned bucket last — a coach reads their squads first.
  const grouped = new Map<string, ClientRow[]>();
  for (const c of rows) {
    const key = c.team_name ?? '';
    grouped.set(key, [...(grouped.get(key) ?? []), c]);
  }
  const groups = [...grouped.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])));

  return (
    <div className="col-wide screen-x py-6">
      {/* The bell rides this screen's OWN heading rather than a global app bar. An app bar would
          cost vertical space on every screen including the workout player, whose height is the
          thing its entire layout is built around. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-micro uppercase text-accent">{t('coaching.eyebrow')}</p>
          <h1 className="text-title-1 mt-1 text-text-1">{t('coaching.title')}</h1>
        </div>
        <NotificationBell className="-mr-2 shrink-0" />
      </div>

      {clients.isPending ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-card" />)}
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat icon={Users} label={t('coaching.clients')} value={rows.length} />
          <Stat icon={Ticket} label={t('coaching.teams')} value={teams.data?.teams.length ?? 0} />
          <Stat icon={KeyRound} label={t('coaching.activeCodes')} value={liveCodes.length} />
        </div>
      )}

      {/* The one alert that is real today: accounts the coach created whose password the coach
          still knows. Until the client changes it, that account is not yet theirs. */}
      {awaitingHandover.length > 0 ? (
        <div className="mt-8 flex items-start gap-3 rounded-card border border-[var(--warning-border)] bg-[var(--warning-subtle)] p-4">
          <TriangleAlert strokeWidth={2} aria-hidden className="size-icon-m mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="text-body text-text-1">{t('coaching.handoverTitle', { count: awaitingHandover.length })}</p>
            <p className="text-body-s measure mt-1 text-text-2">{t('coaching.handoverBody')}</p>
          </div>
        </div>
      ) : null}

      {/* ── join codes ─────────────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-title-3 text-text-1">{t('coaching.joinCodes')}</h2>
        <p className="text-body-s measure mt-1 text-text-2">{t('coaching.joinCodesBody')}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Pressable
            variant="primary"
            busy={createCode.isPending}
            icon={<KeyRound className="size-icon-m" strokeWidth={2} aria-hidden />}
            onClick={async () => {
              const result = await createCode.mutateAsync({ kind: 'multi', max_uses: 20 });
              setMintedCode(result.code);
            }}
          >
            {t('coaching.mintCode')}
          </Pressable>
        </div>

        {liveCodes.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {liveCodes.map((c) => (
              <li
                key={c.id}
                className="flex min-h-[var(--target-min)] items-center justify-between gap-3 rounded-card border border-[var(--surface-border)] bg-surface-1 px-3 py-2"
              >
                <span className="text-body-s text-text-2">
                  {/* The code itself is unrecoverable, so the row identifies it by what it does
                      rather than by what it is. */}
                  {t('coaching.codeUses', { used: c.uses, max: c.max_uses })}
                </span>
                <Pressable
                  density="compact"
                  variant="ghost"
                  busy={revokeCode.isPending}
                  onClick={() => revokeCode.mutate(c.id)}
                >
                  {t('coaching.revoke')}
                </Pressable>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── teams ──────────────────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-title-3 text-text-1">{t('coaching.teams')}</h2>
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
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
            className="w-56"
          />
          <Pressable type="submit" busy={createTeam.isPending} disabled={!teamName.trim()}>
            {t('coaching.createTeam')}
          </Pressable>
        </form>
      </section>

      {/* ── pre-generated accounts (flow C) ────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-title-3 text-text-1">{t('coaching.pregenTitle')}</h2>
        <p className="text-body-s measure mt-1 text-text-2">{t('coaching.pregenBody')}</p>

        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const emails = pregenEmails.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
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
            className="w-full sm:w-96"
          />
          <Pressable
            type="submit"
            busy={pregenerate.isPending}
            icon={<UserPlus className="size-icon-m" strokeWidth={2} aria-hidden />}
          >
            {t('coaching.pregenCreate')}
          </Pressable>
        </form>

        {/* Temporary passwords are shown exactly once. They are not stored in plaintext, so if
            this list is dismissed the coach must create the account again. */}
        {pregenerate.data && pregenerate.data.created.length > 0 ? (
          <div className="mt-4 rounded-card border border-[var(--warning-border)] bg-[var(--warning-subtle)] p-4">
            <p className="text-body-s text-text-1">{t('coaching.tempOnce')}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {pregenerate.data.created.map((c) => (
                <li key={c.userId} className="flex items-center justify-between gap-3">
                  <span className="text-body-s truncate text-text-1">{c.email}</span>
                  <span className="text-body-s shrink-0 tabular-nums text-text-1">{c.temporaryPassword}</span>
                  <CopyButton value={`${c.email} / ${c.temporaryPassword}`} label={t('common.save')} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ── roster ─────────────────────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-title-3 text-text-1">{t('coaching.roster')}</h2>

        {clients.isPending ? (
          <Skeleton className="mt-4 h-40 rounded-card" />
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-card border border-[var(--surface-border)] bg-surface-1">
            <EmptyState icon={Users} title={t('coaching.emptyTitle')} body={t('coaching.emptyBody')} />
          </div>
        ) : (
          groups.map(([teamName2, members]) => (
            <div key={teamName2 || 'unassigned'} className="mt-4">
              <p className="text-micro uppercase text-text-3">{teamName2 || t('coaching.unassigned')}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {members.map((c) => (
                  <li key={c.link_id}>
                    <div
                      className={cn(
                        'flex min-h-[72px] items-center gap-3 rounded-card border px-3 py-1',
                        'border-[var(--surface-border)] bg-surface-1',
                      )}
                    >
                      <span
                        aria-hidden
                        className="text-body inline-flex size-10 shrink-0 items-center justify-center rounded-chip bg-surface-2 uppercase text-text-2"
                      >
                        {c.email.slice(0, 2)}
                      </span>

                      {/* The LINK id, not the client's user id. They are different id spaces and
                          the route takes the link, because the link is what carries the proof
                          that this coach may see this client. */}
                      <Link
                        to={`/coach/clients/${c.link_id}`}
                        // 40px before this. The Bible floor is 44, and this is the coach's primary
                        // navigation — the one row they tap all day, on a phone, one-handed.
                        className="flex min-h-[var(--target-min)] min-w-0 flex-1 flex-col justify-center"
                      >
                        <span className="text-body block truncate text-text-1">{c.email}</span>
                        <span className="text-caption mt-0.5 flex items-center gap-2 text-text-3">
                          {t(`coaching.origin.${c.origin}`)}
                          {/* Activity, as a count over 28 days. A client with none gets a warning
                              tone rather than a zero in the same grey as everything else — the
                              whole value of this column is that the quiet ones stand out. */}
                          <span className={c.sessions_28d === 0 ? 'text-warning' : undefined}>
                            {t('coaching.sessions28d', { count: c.sessions_28d ?? 0 })}
                          </span>
                          {c.must_change_credentials === 1 ? (
                            <span className="text-micro uppercase rounded-chip bg-[var(--warning-subtle)] px-1.5 text-warning">
                              {t('coaching.pending')}
                            </span>
                          ) : null}
                        </span>
                      </Link>

                      {/* Destructive, so it is never in the primary position and never fires
                          without a confirmation. */}
                      <Pressable
                        shape="icon"
                        variant="ghost"
                        aria-label={t('coaching.archive')}
                        onClick={() => setConfirmArchive(c)}
                      >
                        <Archive className="size-icon-m" strokeWidth={2} aria-hidden />
                      </Pressable>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <Sheet open={mintedCode !== null} onClose={() => setMintedCode(null)} title={t('coaching.codeReady')}>
        <p className="text-body-s measure text-text-2">{t('coaching.codeOnce')}</p>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-card border border-[var(--surface-border)] bg-surface-2 p-3">
          <span className="text-title-3 tabular-nums text-text-1">{mintedCode}</span>
          <CopyButton value={mintedCode ?? ''} label={t('common.save')} />
        </div>
      </Sheet>

      <Sheet
        open={confirmArchive !== null}
        onClose={() => setConfirmArchive(null)}
        title={t('coaching.archiveConfirmTitle')}
      >
        <p className="text-body-s measure text-text-2">
          {t('coaching.archiveConfirmBody', { email: confirmArchive?.email })}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
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
