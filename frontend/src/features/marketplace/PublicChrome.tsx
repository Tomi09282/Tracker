import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  FileText,
  Layers,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { control } from '../../ui/primitives/control';
import { Pressable } from '../../ui/primitives/Pressable';
import type { PublicPost } from './usePublic';
import { initialsOf } from '../../lib/person';

/**
 * The chrome the three PUBLIC marketplace screens share.
 *
 * ═══ WHY THESE FOUR PIECES LIVE TOGETHER ═══════════════════════════════════════════════════════
 *
 * `/m`, `/m/p/:id` and `/m/c/:handle` render OUTSIDE `AppLayout`, so they have no bottom bar and
 * no header — they are the only screens in the product that have to draw their own way out. The
 * top bar, the kind glyph, the verified tick and the initials avatar are each used by two or three
 * of them; writing any of them twice is how the back arrow ends up 40px on one screen and 44 on
 * the next.
 *
 * They are NOT in `src/ui/`: nothing outside the public marketplace has a `Belépés` pill or a post
 * kind, and a shared component with one consumer group is a shared component that will be bent by
 * the second one.
 */

/**
 * Kind → glyph. The single change that makes a three-line card scannable: `Esemény` was a small
 * pill of text, and a word at glance distance is something you read, not something you recognise.
 * An unknown kind (a future taxonomy row) gets a neutral sheet rather than nothing, so a card
 * never renders with a hole where its icon is.
 */
const KIND_ICONS: Record<string, LucideIcon> = {
  program: Layers,
  event: Calendar,
  announcement: Megaphone,
};

export function kindIcon(kind: string): LucideIcon {
  return KIND_ICONS[kind] ?? FileText;
}

/**
 * `Esemény · Budapest · 2026. 09. 12.` — one grey line, with whatever is missing simply absent.
 *
 * A single string rather than three spans with separators between them: the separator belongs to
 * the pair it sits between, and a `·` rendered next to an absent city is the shape that leaves a
 * meta row starting with a dot.
 */
export function metaLine(parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(' · ');
}

/**
 * A post's own date: when it happens if it happens, otherwise when it was published.
 *
 * `Közlemény` has no event time and still wants a date on its card — the alternative is a meta
 * line that is one item shorter on exactly one kind, which reads as missing data rather than as
 * a kind that has no date.
 */
export function postDate(post: PublicPost, locale: string) {
  return new Date((post.eventAt ?? post.publishedAt) * 1000).toLocaleDateString(locale);
}

/**
 * The public top bar: one way back, and exactly one way into the product.
 *
 * `backTo` is a route when there is a known parent (`/m` from a post or a profile) and absent on
 * the feed itself, where the honest answer is browser history — a stranger who arrived on `/m`
 * from a shared link has no marketplace to go "up" to.
 */
export function PublicTopBar({ backTo }: { backTo?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-group">
      {backTo ? (
        <Link
          to={backTo}
          aria-label={t('common.back')}
          className={control({ variant: 'secondary', shape: 'icon' })}
        >
          <ArrowLeft className="size-icon-m" aria-hidden />
        </Link>
      ) : (
        <Pressable
          variant="secondary"
          shape="icon"
          aria-label={t('common.back')}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="size-icon-m" aria-hidden />
        </Pressable>
      )}

      {/* A PLAIN LINK, NEVER A SESSION PROBE. Reading the session here to hide the pill for a
          signed-in reader would reintroduce the exact defect the router comment records — the
          public surface defeated at the client. It is also why this is a `Link` wearing the
          control recipe rather than a `Pressable`: navigation is an anchor. */}
      <Link to="/login" className={control({ variant: 'primary', shape: 'chip' })}>
        {t('auth.switchToLogin')}
      </Link>
    </div>
  );
}

/**
 * The tinted holder a glyph sits in. `--tile-tint` is the token the whole redesign leans on for
 * this — a 20–24px glyph has no visual mass on its own, and the holder is what makes a row of
 * cards scan as objects instead of as a paragraph.
 *
 * It is its own component because the coach profile's section heading was writing a second copy of
 * the same square by hand: one tile drawn twice is two tiles that drift.
 */
export function TileHolder({
  size = 'md',
  className,
  children,
}: {
  /** `sm` on compact rows and section headings, `md` on the feed card. */
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-card',
        'bg-[var(--tile-tint)] text-[var(--tile-tint-fg)]',
        size === 'sm' ? 'size-11' : 'size-14',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The kind glyph in that holder — the card's entry point for the eye. */
export function KindTile({
  kind,
  size = 'md',
  className,
}: {
  kind: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = kindIcon(kind);
  return (
    <TileHolder size={size} className={className}>
      <Icon className={size === 'sm' ? 'size-icon-m' : 'size-icon-l'} strokeWidth={2} />
    </TileHolder>
  );
}

/**
 * The verified tick. Admin-granted and enforced by two database triggers, which is why it is the
 * one credential on these screens that is worth drawing at all — everything else a coach can type
 * about themselves.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <BadgeCheck
      className={cn('size-icon-s shrink-0 text-accent', className)}
      aria-label={t('marketplace.verified')}
    />
  );
}

/**
 * Initials, because `PublicCoach` carries no avatar.
 *
 * The mockup shows a photograph; the schema has handle, display name, headline, doc, city,
 * verified and published-at, and nothing else. Drawing a grey placeholder person would be worse
 * than nothing — initials are real data, they differ between coaches, and they read at 144px.
 */
export function InitialsAvatar({
  name,
  className,
  textClassName,
}: {
  name: string;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-chip',
        'bg-surface-2 text-text-1',
        className,
      )}
    >
      <span className={cn('font-display', textClassName)}>{initialsOf(name)}</span>
    </span>
  );
}
