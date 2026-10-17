import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Calendar, Check, FileText, Layers, Megaphone, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { PressableLink } from '../../ui/primitives/Pressable';
import { TextLink } from '../../ui/primitives/TextLink';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';
import { Monogram } from '../../ui/data/Monogram';
import type { PublicPost } from './usePublic';
import { initialsOf } from '../../lib/person';

/**
 * The chrome the three PUBLIC marketplace screens share.
 *
 * ═══ WHY THESE PIECES LIVE TOGETHER ════════════════════════════════════════════════════════════
 *
 * `/m`, `/m/p/:id` and `/m/c/:handle` render OUTSIDE `AppLayout`, so they have no bottom bar and
 * no header — they are the only screens in the product that have to draw their own way out. The
 * top bar, the kind glyph, the verified tick and the initials are each used by two or three of
 * them; writing any of them twice is how the back chevron ends up in a different place on one
 * screen than on the next.
 *
 * They are NOT in `src/ui/`: nothing outside the public marketplace has a `Belépés` link or a post
 * kind. Since Pulse every piece here is a thin face over the kit (`ScreenHeader`, `TextLink`,
 * `Monogram`): the exports and their props are frozen (`MarketplacePage` and `ProfileEditorPage`
 * import them), only what they render changed.
 */

/**
 * Kind → glyph. An unknown kind (a future taxonomy row) gets a neutral sheet rather than nothing,
 * so a row never renders with a hole where its icon is.
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
 * `Esemény · Budapest · 2026. 09. 12.` — one line, with whatever is missing simply absent.
 *
 * A single string rather than three spans with separators between them: the separator belongs to
 * the pair it sits between, and a `·` rendered next to an absent city is the shape that leaves a
 * meta row starting with a dot.
 */
export function metaLine(parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(' · ');
}

/**
 * The same rule for a meta row whose parts are ELEMENTS rather than strings — the post detail's
 * row, where one group (the date) carries its own ink and cannot be flattened into one string.
 *
 * The dot is inserted only BETWEEN two present groups, for the reason above: a `·` rendered beside
 * an absent city is what leaves a row starting with a dot. It is `aria-hidden` because it is
 * punctuation between spans a screen reader already reads as separate.
 */
export function metaRow(parts: (ReactNode | null | false)[]): ReactNode[] {
  const present = parts.filter(Boolean) as ReactNode[];
  // A keyed `Fragment`, not a wrapper span: the groups are flex children of the caller's row, and
  // an extra inline box around each one would take them out of that layout.
  return present.flatMap((node, i) =>
    i === 0
      ? [<Fragment key={`p${i}`}>{node}</Fragment>]
      : [
          <span key={`s${i}`} aria-hidden>
            ·
          </span>,
          <Fragment key={`p${i}`}>{node}</Fragment>,
        ],
  );
}

/**
 * A post's own date: when it happens if it happens, otherwise when it was published.
 *
 * `Közlemény` has no event time and still wants a date on its row — the alternative is a meta
 * line that is one item shorter on exactly one kind, which reads as missing data rather than as
 * a kind that has no date.
 */
export function postDate(post: PublicPost, locale: string) {
  return new Date((post.eventAt ?? post.publishedAt) * 1000).toLocaleDateString(locale);
}

/**
 * The public top bar: one way back, and exactly one way into the product.
 *
 * It is the kit's pushed header WITHOUT a title (`ScreenHeader kind="push"`, post-detail-1 /
 * coach-profile-1 "Top bar" 24,64 354 x 44): the bare back chevron in its 44 pt target on the
 * gutter, and the login on the right edge. The page draws its own h1 under it.
 *
 * `backTo` is a route when there is a known parent (`/m` from a post or a profile) and absent on
 * the feed itself, where the honest answer is browser history — a stranger who arrived on `/m`
 * from a shared link has no marketplace to go "up" to.
 *
 * `cta` is HOW LOUD `Belépés` is allowed to be. On a post and on a coach profile it is the quiet
 * text link the frames draw (Geist Medium 16 / 22, `text-1`, ending on the right gutter): the
 * screen's subject is the post or the person, and neither page has a lime pill. On the feed the
 * login is the screen's one call to action, so it is the small lime pill.
 */
export function PublicTopBar({
  backTo,
  cta = 'primary',
}: {
  backTo?: string;
  cta?: 'primary' | 'link';
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = t('common.back');

  return (
    <ScreenHeader
      kind="push"
      // `relative z-10`: placement only — a post's feathered cover starts under this row (y 96 on
      // a 64 + 44 bar) and must never paint over the back chevron or the login.
      className="relative z-10"
      back={backTo ? { to: backTo, label, bare: true } : { onClick: () => navigate(-1), label, bare: true }}
      trailing={
        // A PLAIN LINK, NEVER A SESSION PROBE. Reading the session here to hide the login for a
        // signed-in reader would reintroduce the exact defect the router comment records — the
        // public surface defeated at the client. Navigation is an anchor, so both looks are links.
        cta === 'link' ? (
          <TextLink to="/login" text="body">
            {t('auth.switchToLogin')}
          </TextLink>
        ) : (
          <PressableLink to="/login" variant="primary" size="sm">
            {t('auth.switchToLogin')}
          </PressableLink>
        )
      }
    />
  );
}

/**
 * The box a glyph sits in. Pulse draws no tinted holders ("nothing is enclosed"), so this is a
 * bare, sized, centred box now: the glyph keeps its place in a row, and nothing is drawn around it.
 */
export function TileHolder({
  size = 'md',
  className,
  children,
}: {
  /** `sm` on compact rows, `md` on the feed card. */
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center text-text-2', size === 'sm' ? 'size-11' : 'size-14', className)}
    >
      {children}
    </span>
  );
}

/** The kind glyph in that box — a bare 20 px glyph in the second ink. */
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
      <Icon className="size-5" strokeWidth={1.75} />
    </TileHolder>
  );
}

/**
 * The verified tick. Admin-granted and enforced by two database triggers, which is why it is the
 * one credential on these screens that is worth drawing at all — everything else a coach can type
 * about themselves.
 *
 * The frames' one lit mark of a person: a 16 px lime check (kit `glyph('check', 16, accent, 3)`),
 * beside the name on the post's coach row and the feed, and at the head of the profile's
 * credential line. No badge body, no disc.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Check
      className={cn('size-4 shrink-0 text-accent', className)}
      strokeWidth={3}
      role="img"
      aria-label={t('marketplace.verified')}
    />
  );
}

/**
 * Initials, because `PublicCoach` carries no avatar: the kit's 28 pt row monogram (ink letters, no
 * disc). `className` and `textClassName` are still accepted for the frozen signature; the size is
 * the monogram's own, so `textClassName` is ignored and `className` is placement only.
 */
export function InitialsAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span aria-hidden className={cn('inline-flex shrink-0', className)}>
      <Monogram initials={initialsOf(name)} size={28} />
    </span>
  );
}
