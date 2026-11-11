import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { TextLink } from '../../ui/primitives/TextLink';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { NoticeLine } from '../../ui/feedback/NoticeLine';
import { Sheet } from '../../ui/feedback/variants/E14E20';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { Monogram, MonogramSkeleton } from '../../ui/data/Monogram';
import { Numeral } from '../../ui/data/Numeral';
import { StatBlock } from '../../ui/data/StatBlock';
import { Rule } from '../../ui/data/Rule';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow, ListRowSkeleton } from '../../ui/data/ListRow';
import { Section } from '../../ui/data/SectionHeader';
import { Dot } from '../../ui/data/Dot';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { NutritionTab } from './NutritionTab';
import { ProgressTab } from './ProgressTab';
import { PlanTab } from './PlanTab';
import { ChatTab } from './ChatTab';
import { usePlans } from '../plans/usePlans';
import { useClient, useClientOnboarding, useClients, type ClientOnboarding } from './useCoaching';
import { ClientEquipmentCard } from './ClientEquipmentCard';
import { personLabel } from '../../lib/person';

/* ── views ────────────────────────────────────────────────────────────────────────────────────
   The four working views of the client, switched by the page-level `Segmented` (client-detail-1:
   the hug switch seated on a full-width hairline, the ink mark on the line). Words only: Pulse
   draws no glyph in a switch, so the icons the old chip tabs carried are gone with them. */
const TABS = [{ key: 'plan' }, { key: 'nutrition' }, { key: 'progress' }, { key: 'chat' }] as const;
type TabKey = (typeof TABS)[number]['key'];

type Limitation = ClientOnboarding['limitations'][number];

/* ── pieces ───────────────────────────────────────────────────────────────────────────────── */

/**
 * One answer of the questionnaire that changes what gets written (client-detail-1, "Answers"):
 * the eyebrow in the first third of the content width (the stat grid's column, 118 at 402), the
 * value in the other two as a 22 / 28 title, the client's own note under it. Not a kit component:
 * the Figma file builds it locally on the page (`answer()` in client-detail-1.body.js), so it is
 * composed here from the type steps, and promoted to the kit when a second screen needs it.
 *
 * `dot` hangs a 6 pt warn dot in the gap BEFORE the value column, so every value keeps one edge.
 * `strong` (a `Kerülendő` area) also puts the value in the warning ink: `avoid` and `caution` are
 * two weights of the same instruction and must not read as the same fact.
 */
function FactRow({
  label,
  value,
  note,
  extra,
  dot = false,
  strong = false,
}: {
  label: string;
  value: string;
  note?: string | null;
  extra?: ReactNode;
  dot?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 py-3.5">
      {/* pr-5: the label ends before the dot that hangs 14 in front of the value column */}
      <p className="text-eyebrow break-words pt-1.5 pr-5 text-text-2">{label}</p>
      <div className="relative col-span-2 flex min-w-0 flex-col gap-1">
        {dot ? <Dot tone="warn" className="absolute -left-3.5 top-[11px]" /> : null}
        <p className={strong ? 'text-title break-words text-warning' : 'text-title break-words text-text-1'}>
          {value}
          {extra}
        </p>
        {/* The client's own words, in the client's own language. Never translated. */}
        {note ? <p className="text-cap text-text-2">{note}</p> : null}
      </div>
    </div>
  );
}

/* ── the page ─────────────────────────────────────────────────────────────────────────────── */

/**
 * One client, in full — Pulse client-detail-1.
 *
 * The anchor is the person, drawn as type: the 124 pt monogram whose full stop carries the account
 * state (lime = the client owns the account, warn = the coach still knows the password). Then
 * ruled ledgers, nothing enclosed: three numbers on one line, the two answers that change what
 * gets written with the door to the whole questionnaire as the last row of their table, the
 * equipment editor, and the four views of the client under one switch.
 *
 * The questionnaire opens in a SHEET rather than a route: the coach reads it against the plan
 * list and must not lose their place in it.
 */
export function ClientDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const linkId = Number.parseInt(params.id ?? '', 10);
  const { data, isPending, isError } = useClient(Number.isFinite(linkId) ? linkId : null);
  const onboarding = useClientOnboarding(Number.isFinite(linkId) ? linkId : null);
  // NO SECOND ENDPOINT. `GET /plans` is the query `PlanTab` already runs; asking for it here too
  // hits the same react-query key, so the `TERV` number costs one cache read rather than a request.
  const plans = usePlans();
  // The 28-day count lives on the roster row only (GET /clients/:id does not compute it), so it is
  // read from the roster query the coach dashboard already caches: a deep link and in-app
  // navigation show the same number, and it is an em dash while it loads or fails — never a 0.
  const roster = useClients();
  const [tab, setTab] = useState<TabKey>('plan');
  const [profileOpen, setProfileOpen] = useState(false);

  if (isPending) {
    // The page's own geometry: the real back row, a block where the monogram goes, the name line,
    // three numeral blocks on the stat grid. Never a spinner.
    return (
      <Screen top="push" width="wide">
        <ScreenHeader kind="push">
          <div className="flex pt-1 pb-4">
            <MonogramSkeleton size={124} />
          </div>
          <Skeleton className="h-[34px] w-64" />
        </ScreenHeader>
        <div className="flex flex-col gap-4" role="status" aria-label={t('common.loading')}>
          <Rule strong />
          <div className="grid grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-[39px] w-9" />
              </div>
            ))}
          </div>
        </div>
      </Screen>
    );
  }

  // The server returns 404 for "not yours", "archived" and "never existed" alike, so the UI shows
  // one message for all three. Distinguishing them here would rebuild the oracle the API refuses
  // to be — and it is also the role gate: the link id is what carries the proof of access.
  if (isError || !data?.client) {
    return (
      <Screen top="push" width="wide">
        <EmptyState
          heading="h1"
          title={t('coaching.clientMissingTitle')}
          body={t('coaching.clientMissingBody')}
          action={
            <TextLink text="body" lead={<ArrowLeft />} onClick={() => history.back()}>
              {t('common.back')}
            </TextLink>
          }
        />
      </Screen>
    );
  }

  const c = data.client;
  const pending = c.must_change_credentials === 1;
  const p = onboarding.data?.profile ?? null;

  /* `Régi, már nem fáj` never surfaces here — it is filtered out before the row is built.
     `Kerülendő` outranks `Óvatosan`, so the row promotes the worst one and counts the rest. */
  const flagged = (p?.limitations ?? [])
    .filter((l: Limitation) => l.severity !== 'past')
    .sort((a: Limitation, b: Limitation) =>
      a.severity === b.severity ? 0 : a.severity === 'avoid' ? -1 : 1,
    );
  const worst = flagged[0] ?? null;
  const multiFlag = flagged.length > 1;

  const planCount = plans.data?.plans.filter((x) => x.coach_client_id === linkId).length ?? 0;
  const sessions28d = roster.data?.clients.find((x) => x.link_id === linkId)?.sessions_28d;

  return (
    <Screen top="push" width="wide">
      {/* ── identity: back to Klienseim (app/routeMeta.ts) → the monogram → the name → team · origin */}
      <ScreenHeader kind="push">
        <div className="flex pt-1 pb-4">
          <Monogram
            person={c}
            size={124}
            dot={pending ? 'warn' : true}
            dotLabel={t(pending ? 'coaching.account.pending' : 'coaching.account.owned')}
          />
        </div>
        {/* Wraps, never truncates: the e-mail is the client's name on this screen. */}
        <h1 className="text-display break-words text-text-1">{personLabel(c)}</h1>
        <p className="text-body text-text-2">
          {c.team_name ? `${c.team_name} · ` : null}
          {t(`coaching.origin.${c.origin}`)}
        </p>
        {pending ? (
          <NoticeLine tone="warn" role="status" className="mt-1">
            {t('coaching.handoverBody')}
          </NoticeLine>
        ) : null}
      </ScreenHeader>

      {/* ── the three numbers, read-only: eyebrow over an ink-tight numeral, no tiles ──────────── */}
      <div className="flex flex-col gap-4">
        <Rule strong />
        <div className="grid grid-cols-3">
          <StatBlock
            className="w-full"
            // The window is part of the fact. A bare "6 edzés" reads as a lifetime total.
            label={`${t('coaching.tile.sessions')} / ${t('plans.dayCount', { count: 28 })}`}
          >
            <Numeral size="num" value={sessions28d ?? '—'} />
          </StatBlock>
          <StatBlock className="w-full" label={t('coaching.tile.weekly')}>
            {/* A dash rather than a zero when there is no questionnaire: nobody answered, which is
                not the same claim as "they train zero times a week". */}
            <Numeral size="num" value={p?.sessions_per_week ?? '—'} />
          </StatBlock>
          <StatBlock className="w-full" label={t('coaching.tile.plans')}>
            <Numeral size="num" value={plans.isPending ? '—' : planCount} />
          </StatBlock>
        </div>
      </div>

      {/* ── the two answers that change what gets written + the door to the whole questionnaire */}
      <RowStack open as="div">
        {onboarding.isPending ? (
          <>
            <ListRowSkeleton index={0} />
            <ListRowSkeleton index={1} />
          </>
        ) : !p ? (
          <p className="text-body py-4 text-text-2">{t('coaching.noProfile')}</p>
        ) : (
          <>
            <FactRow
              label={t('onboarding.field.primary_goal')}
              value={p.primary_goal ? t(`onboarding.goal.${p.primary_goal}`) : '—'}
            />
            {worst ? (
              <FactRow
                label={t('coaching.limitations')}
                value={`${t(`onboarding.area.${worst.body_area}`)} — ${t(`onboarding.sev.${worst.severity}`)}`}
                note={worst.note}
                dot
                strong={worst.severity === 'avoid'}
                extra={
                  multiFlag ? (
                    // The remainder is a COUNT rather than a silence: a coach who reads one
                    // limitation and assumes it is the whole list is the failure this data exists
                    // to prevent.
                    <span
                      className="text-data ms-2 align-middle text-warning"
                      aria-label={t('coaching.moreFlagged', { count: flagged.length - 1 })}
                    >
                      +{flagged.length - 1}
                    </span>
                  ) : null
                }
              />
            ) : null}
          </>
        )}
        <ListRow
          title={t('coaching.profileFull')}
          onClick={() => setProfileOpen(true)}
          chevron
          trailing={
            p?.status === 'draft' || multiFlag ? (
              <span className="flex items-center gap-1.5">
                {/* A further flagged area is not only a count on the row above: the door to the
                    full list carries the warn dot too. */}
                {multiFlag ? <Dot tone="warn" /> : null}
                {p?.status === 'draft' ? (
                  <span className="text-micro text-text-2">{t('coaching.profileIncomplete')}</span>
                ) : null}
              </span>
            ) : undefined
          }
        />
      </RowStack>

      {/* ── the equipment editor: its own queries, its own skeleton / no-profile / 404 states ──── */}
      <ClientEquipmentCard key={linkId} linkId={linkId} />

      {/* ── the four views of the client ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Rule strong />
          {/* The hug switch does not wrap: where the four words are wider than the column (de at
              360: "Nachrichten" ends past the edge) the switch scrolls sideways inside this box
              instead of being cut by the screen. The 8 / 4 of padding given back in negative
              margins keep the focus ring of the first option and its top / bottom unclipped. */}
          <div className="-mx-2 -my-1 overflow-x-auto px-2 py-1">
            <Segmented
              rule
              label={t('coaching.tabs')}
              options={TABS.map(({ key }) => ({ value: key, label: t(`coaching.tab.${key}`) }))}
              value={tab}
              onChange={setTab}
            />
          </div>
        </div>
        <div className="min-h-40">
          {tab === 'progress' ? (
            <ProgressTab linkId={linkId} />
          ) : tab === 'plan' ? (
            <PlanTab linkId={linkId} />
          ) : tab === 'chat' ? (
            <ChatTab linkId={linkId} />
          ) : (
            // ALL FOUR VIEWS HAVE A FEATURE, and TypeScript is what said so: with nutrition wired,
            // `tab` narrowed to `never` in the fallback.
            <NutritionTab linkId={linkId} />
          )}
        </div>
      </div>

      {/* ── the questionnaire, in full ─────────────────────────────────────────────────────── */}
      <Sheet open={profileOpen} onClose={() => setProfileOpen(false)} title={t('coaching.profileTitle')}>
        {p ? (
          <div className="flex flex-col gap-section">
            {/* The full sentence lives HERE, where acting on incomplete answers actually begins. */}
            {p.status === 'draft' ? <NoticeLine tone="warn">{t('coaching.profileDraft')}</NoticeLine> : null}

            <RowStack as="div">
              <ListRow
                title={t('onboarding.step.goal.title')}
                lines={2}
                value={p.primary_goal ? t(`onboarding.goal.${p.primary_goal}`) : '—'}
              />
              <ListRow
                title={t('onboarding.sessionsPerWeek')}
                lines={2}
                value={p.sessions_per_week ? String(p.sessions_per_week) : '—'}
              />
              <ListRow
                title={t('onboarding.location')}
                lines={2}
                value={p.training_location ? t(`onboarding.loc.${p.training_location}`) : '—'}
              />
              <ListRow
                // The longest question with the longest answer: the answer goes to the sub line (as the
                // equipment answer does), so the question never loses a word to the value column (de
                // "Trainingserfahrung" was cut beside "Fortgeschritten — 1–3 Jahre").
                title={t('onboarding.experience')}
                lines={2}
                sub={p.experience ? t(`onboarding.exp.${p.experience}`) : '—'}
              />
              <ListRow
                title={t('onboarding.sessionMinutes')}
                lines={2}
                value={p.session_minutes ? `${p.session_minutes} ${t('common.minutesShort')}` : '—'}
              />
              <ListRow title={t('onboarding.heightCm')} lines={2} value={p.height_cm ? `${p.height_cm} cm` : '—'} />
              <ListRow
                title={t('onboarding.weightKg')}
                lines={2}
                value={p.bodyweight_kg ? `${p.bodyweight_kg} kg` : '—'}
              />
              <ListRow title={t('onboarding.birthYear')} lines={2} value={p.birth_year ? String(p.birth_year) : '—'} />
              <ListRow title={t('onboarding.sex')} lines={2} value={p.sex ? t(`onboarding.sexOpt.${p.sex}`) : '—'} />
              <ListRow
                title={t('onboarding.equipment')}
                lines={2}
                subLines={3}
                sub={
                  p.equipment.length
                    ? p.equipment.map((e: ClientOnboarding['equipment'][number]) => e.name).join(', ')
                    : '—'
                }
              />
            </RowStack>

            {/* Every flagged area, not just the promoted one. */}
            {flagged.length ? (
              <Section title={t('coaching.limitations')}>
                <RowStack as="div">
                  {flagged.map((l: Limitation) => (
                    <ListRow
                      key={l.body_area}
                      title={
                        <span className="flex items-center gap-2">
                          <Dot tone="warn" />
                          {`${t(`onboarding.area.${l.body_area}`)} — ${t(`onboarding.sev.${l.severity}`)}`}
                        </span>
                      }
                      sub={l.note ?? undefined}
                      subLines={2}
                    />
                  ))}
                </RowStack>
              </Section>
            ) : null}

            {p.notes ? (
              <div className="flex flex-col gap-2">
                <p className="text-eyebrow text-text-2">{t('onboarding.notes')}</p>
                <p className="text-body whitespace-pre-wrap text-text-1">{p.notes}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-body text-text-2">{t('coaching.noProfile')}</p>
        )}
      </Sheet>
    </Screen>
  );
}
