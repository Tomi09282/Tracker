import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Palette, RefreshCw } from 'lucide-react';
import { apiWithRefresh } from '../../lib/api';
import { Skeleton } from '../../ui/feedback/ScreenSkeleton';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { Pressable } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { StatBlock } from '../../ui/data/StatBlock';
import { Numeral } from '../../ui/data/Numeral';
import { SplitBar, SplitLegend, type SplitPart } from '../../ui/data/SplitBar';
import { LedgerRow } from '../../ui/data/LedgerRow';
import { RowStack } from '../../ui/data/RowStack';
import { SectionHeader } from '../../ui/data/SectionHeader';
import { Rule } from '../../ui/data/Rule';
import { hasRole, useSession } from '../auth/useSession';
import { MarketplaceQueue } from './MarketplaceQueue';
import { ModerationQueue } from './ModerationQueue';
import { AdminShell } from './AdminShell';
import { UserSearch } from './UserSearch';

interface Stats {
  users: { total: number; coaches: number; admins: number; disabled: number; new_7d: number };
  exercises: { total: number; global: number; private: number; custom: number };
  media: { total: number; bytes: number };
  moderation: { pending: number };
  translations: { rows: number; langs: number };
  sessions: { active: number };
  audit: { events_24h: number };
}

/**
 * A translated sentence with some of its figures in ink.
 *
 * The figures are interpolated as markers and the sentence is cut around them, so the words stay
 * the bundle's (in every language, in its own order) and only the figures change colour — "3
 * várakozik", "3 aktív munkamenet · 14 naplóesemény az elmúlt 24 órában" (admin-1: the counts in
 * ink, the words in text-2; the "24" of the sentence is a word, not a figure).
 */
function inked(sentence: (marks: Record<string, string>) => string, figures: Record<string, string>): ReactNode[] {
  const names = Object.keys(figures);
  const marks = Object.fromEntries(names.map((name, i) => [name, `\u0001${i}\u0001`]));
  return sentence(marks)
    .split(/\u0001(\d+)\u0001/)
    .map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} className="text-text-1">
          {figures[names[Number(part)]]}
        </span>
      ) : (
        part
      ),
    );
}

/**
 * ═══ THE PARTS PARTITION BY ROLE, AND THAT IS THE WHOLE POINT ══════════════════════════════════
 *
 * A split claims its parts add up to the whole. The obvious three — members, coaches, new this week
 * — do not: `users.new_7d` counts everyone who registered in the last seven days, so a coach who
 * signed up on Tuesday is in TWO of them. `role` is one column on `users`, so member / coach / admin
 * are disjoint by construction and sum to the total exactly.
 *
 * admin-1: the giant total under its eyebrow, the three-line legend beside it (first cap line on the
 * numeral's top, last baseline on its baseline), and the proportional bar 20 under the numeral in
 * three ink steps — roles are categories, never lime. From five digits the numeral needs the width,
 * so the legend drops under the bar (`admin-1.body.js`).
 */
function UserSplit({ users }: { users: Stats['users'] }) {
  const { t } = useTranslation();
  const members = Math.max(0, users.total - users.coaches - users.admins);
  // The legend names POPULATIONS (`Tagok`, `Edzők`, `Adminok`); the eyebrow names the unit the
  // figure counts (`Felhasználó`), not the plural table label `admin.users`.
  const parts: SplitPart[] = [
    { label: t('admin.legend.members'), count: members },
    { label: t('admin.legend.coaches'), count: users.coaches },
    { label: t('admin.legend.admins'), count: users.admins },
  ];
  const long = String(users.total).length >= 5;
  const figure = (
    <StatBlock label={t('admin.unit.user')}>
      <Numeral size="giant" value={users.total} mode="roll" from={0} />
    </StatBlock>
  );

  return (
    <div className="flex flex-col gap-5">
      {long ? (
        figure
      ) : (
        <div className="flex items-start justify-between gap-6">
          {figure}
          <SplitLegend layout="stack" parts={parts} keepZero label={t('admin.users')} className="mt-6 -mb-1 w-30 self-stretch" />
        </div>
      )}
      {users.total > 0 ? <SplitBar legend={long ? 'grid' : 'none'} parts={parts} label={t('admin.users')} /> : null}
    </div>
  );
}

/** Where the figures will stand while `/admin/stats` loads: eyebrow, the giant's cap, the bar, the ledger line. */
function FiguresSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-8">
      <span className="sr-only">{t('common.loading')}</span>
      <div aria-hidden className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-25 w-24" />
        </div>
        <Skeleton className="h-1.5 w-full" />
      </div>
      <Skeleton className="h-19 w-full" />
    </div>
  );
}

/**
 * The moderation panel's head: the eyebrow, and ONE trailing node — the waiting count (mono, the
 * figure in ink) with the refresh glyph after it.
 *
 * ═══ WHY THE REFRESH BUTTON EXISTS ═════════════════════════════════════════════════════════════
 *
 * The queue only ever refetched as a side effect of a decision. So the one state that is REACHED by
 * doing nothing — somebody else decided a submission while this list sat on screen, and opening it
 * now 404s — had no way out except a full page reload. `admin.reviewGoneBody` tells the admin to
 * "refresh the list"; this is what they press.
 */
function ModerationHeader({ pending }: { pending?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['admin', 'moderation'] }) > 0;

  return (
    <SectionHeader
      rule={false}
      title={t('admin.moderation')}
      trailing={
        <span className="inline-flex items-center gap-1">
          {/* A count only when there IS one — never a grey zero. */}
          {pending ? (
            <span className="text-data text-text-2">
              {inked((m) => t('admin.pendingCount', { count: pending, replace: { count: m.count } }), { count: String(pending) })}
            </span>
          ) : null}
          <Pressable
            variant="link"
            shape="icon"
            aria-label={t('admin.refreshQueue')}
            busy={fetching}
            className="-me-3"
            onClick={() => void qc.invalidateQueries({ queryKey: ['admin', 'moderation'] })}
          >
            <RefreshCw aria-hidden />
          </Pressable>
        </span>
      }
    />
  );
}

/**
 * Admin — the platform's landing screen for the one role that can change it.
 *
 * admin-1: the category header with the one door to the style studio on its eyebrow row; the user
 * split as the hero; the exercise and media counts on one ledger line; the section switch; the open
 * section; the liveness footer under a strong rule. Nothing is enclosed. `Moderáció` is the section
 * that opens: its count is the only element on the screen that means "someone is waiting".
 */
export function AdminPage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  // Which panel is open. Local state rather than a route: these are three views of one screen, and
  // a URL per view would mean three routes the palette and the router both have to know about.
  const [section, setSection] = useState('moderation');

  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiWithRefresh<Stats>('/admin/stats'),
    enabled: hasRole(user, 'admin'),
  });

  // The server enforces this too — this is only so a non-admin sees an explanation instead of
  // a screen full of failed requests.
  if (user && !hasRole(user, 'admin')) {
    return (
      <Screen top="root">
        {/* `heading="h1"`: this IS the page for a non-admin, and a page with no `h1` is one a
            screen-reader user cannot navigate into. */}
        <EmptyState heading="h1" title={t('admin.forbiddenTitle')} body={t('admin.forbiddenBody')} />
      </Screen>
    );
  }

  return (
    <Screen top="push" width="wide">
      <ScreenHeader
        kind="section"
        eyebrow={t('admin.eyebrow')}
        title={t('admin.title')}
        trailing={
          // A real anchor, and the only door to the studio.
          // `-me-1.25`: the chevron's 16 pt box ends 5 past the gutter, so its INK ends on it (admin-1).
          <TextLink to="/admin/styles" lead={<Palette />} trail={<ChevronRight />} className="-me-1.25">
            {t('admin.styleStudio')}
          </TextLink>
        }
      />

      {stats.isPending ? (
        <FiguresSkeleton />
      ) : stats.data ? (
        <>
          <UserSplit users={stats.data.users} />
          {/* Two counts on one ledger line, not tappable: what the library and the uploads hold. */}
          <RowStack open close>
            <LedgerRow
              label={t('admin.unit.exercise')}
              value={stats.data.exercises.total}
              pair={{ label: t('admin.unit.media'), value: stats.data.media.total }}
            />
          </RowStack>
        </>
      ) : null}

      {/*
        Three sections behind one switch rather than three stacked on one page. The section that is
        not open does not render, so it does not fetch either: `render` is a function for that reason.
      */}
      <AdminShell
        sections={[
          {
            key: 'accounts',
            render: () => <UserSearch enabled={hasRole(user, 'admin')} />,
          },
          {
            key: 'moderation',
            count: stats.data?.moderation.pending,
            render: () => (
              <div className="flex flex-col gap-4">
                <ModerationHeader pending={stats.data?.moderation.pending} />
                {/* The queue AND the decision live here. See the header comment in ModerationQueue. */}
                <ModerationQueue />
              </div>
            ),
          },
          {
            key: 'marketplace',
            render: () => <MarketplaceQueue />,
          },
        ]}
        active={section}
        onSelect={setSection}
      />

      {stats.data ? (
        // The last block, and kept: the cheapest liveness signal on the screen.
        <footer className="flex flex-col gap-4">
          <Rule strong />
          {/* 240 wide: the sentence breaks after its second figure's word, as admin-1 draws it
              ("… · 14 naplóesemény" / "az elmúlt 24 órában"). */}
          <p className="max-w-60 text-cap text-text-2">
            {inked((m) => t('admin.footer', { sessions: m.sessions, events: m.events }), {
              sessions: String(stats.data.sessions.active),
              events: String(stats.data.audit.events_24h),
            })}
          </p>
        </footer>
      ) : null}
    </Screen>
  );
}
