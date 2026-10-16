import { ChevronRight } from 'lucide-react';
import type { AriaAttributes, AriaRole, MouseEventHandler, ReactNode, Ref } from 'react';
import { Link, type To } from 'react-router';
import { cn } from '../../lib/cn';
import { Skeleton } from '../feedback/ScreenSkeleton';
import { FigureUnit } from './FigureUnit';

/**
 * A list row — kit `listRow(title, { sub, lines, thumb, mono, lead, value, trail, chev, color })`.
 *
 *     [lead]  Title                              value  trailing  control  ›
 *             Sub line
 *
 * Hugs its content with a floor: 56 px, 64 with a sub line (`--row-h`, `--row-h-sub`); 10 px above
 * and below, 16 between the slots. The title is `body-m`, one line (two with `lines={2}`), the sub
 * line `cap` in `text-2`. Everything trailing ends on the right edge by INK: the chevron's 16 px
 * box overhangs the edge by 5 so that its tip, not its empty box, stands on the line.
 *
 * It has no background, no radius and no border. The hairline between two rows belongs to
 * `RowStack`, which is the only thing a row should ever be put in.
 *
 * ═══ A ROW THAT DOES SOMETHING ══════════════════════════════════════════════════════════════════
 *
 * `to` (router link), `href` (plain link) or `onClick` (button) makes the row an action. The whole
 * row is then the target — far above the 44 pt floor — it answers a press by dropping to 60 %
 * (Pulse: "rows and links → opacity 0.6", no scale, no fill) and it shows the focus ring.
 *
 * An interactive element may not sit inside another, so a row has TWO trailing slots and the
 * difference is exactly that:
 *
 *   trailing   something to read: a tag, a status, a time with a dot. Part of the row's action.
 *   control    something to operate: a switch, a check, an icon button, a text link. It stands
 *              BESIDE the row's action, never inside it — the row's own target then ends where the
 *              control begins.
 *
 * A row with only a `control` is not an action itself (a switch row, a code with "Visszavonás").
 *
 * ═══ WHAT IS NOT HERE ═══════════════════════════════════════════════════════════════════════════
 *
 * No selected fill, no hover fill, no swipe. Selection in Pulse is a mark (the lime tick of a set
 * check, the ink mark of a segment), and it is drawn by the control in the `control` slot.
 *
 * ═══ THE FEED AND PLAN ROWS (kit gap G-data 4, additive) ════════════════════════════════════════
 *
 * Three more frames draw a row with more grammar than title + sub, and the props below draw them
 * without a second row component:
 *
 *   kicker      a `micro` line (mono 11 / 16, upper, text-1) 4 above the title: the kind, city and
 *               date of a post (marketplace-1/2, coach-profile-1). Title and sub then stand 4 apart.
 *   titleSize   `title` = 22 / 28 SemiBold, balanced over its two lines (coach-plans-1 plan rows).
 *   subFace     `data` = the sub line in mono 13 / 18 ("Aktív · 7 nap · 7 napos ciklus").
 *   subLead     a 14 px glyph 6 before the sub line, in the lamp colour (the lime tick of an active plan).
 *   subInk      `ink` = the sub line in text-1 (the active plan's line; a draft's stays text-2).
 *   valueOn     `sub` = the trailing value stands on the sub line's baseline, right-aligned (the price
 *               in a post byline), instead of beside the title block.
 *   valueUnit   the value as a figure + unit pair (`FigureUnit`: "108 kg", client-detail-3);
 *   valueStep   with `dataL` (16 / 20 text-1, the default when `valueUnit` is given) or `data`.
 *   pad         `loose` = 16 above and below instead of 10 (feed rows 96 high, plan rows).
 *
 * `RowStack trim` takes the top padding off the first row and the bottom padding off the last one
 * (coach-plans-1: the first plan's title stands 16 under the section head, as a section's content does).
 */

export type ListRowTone = 'default' | 'muted' | 'danger';

type RowAria = Pick<
  AriaAttributes,
  | 'aria-label'
  | 'aria-describedby'
  | 'aria-current'
  | 'aria-checked'
  | 'aria-pressed'
  | 'aria-selected'
  | 'aria-expanded'
  | 'aria-controls'
  | 'aria-haspopup'
>;

interface ListRowBase extends RowAria {
  /** The row's one line of content. A string in almost every case. */
  title: ReactNode;
  /** The line under the title: `cap`, `text-2`. Its presence raises the floor from 56 to 64. */
  sub?: ReactNode;
  /** Lines the title may take before it is cut with an ellipsis. Default 1. */
  lines?: 1 | 2;
  /** Lines the sub line may take. Default 1; a hint that explains a disabled control may need 3. */
  subLines?: 1 | 2 | 3;
  /**
   * The lead slot: a 48 pt image (`<Pic slot="equip-barbell" width={48} />`), a 28 pt monogram or
   * a 20 px glyph. A bare Lucide icon is drawn as the kit draws a lead glyph — 20 px, stroke 1.75,
   * `text-2` — so the call site passes `<Bell />` and nothing else.
   */
  lead?: ReactNode;
  /**
   * Give the lead a fixed 48 pt slot, 44 high, content on its left edge. For a monogram, and for a
   * row with NO lead in a list where other rows have one: every row then keeps the same text edge.
   */
  leadSlot?: boolean;
  /**
   * The trailing value, in `text-2`. A string that holds a digit is set in mono (`data`), words in
   * `cap` — Pulse: "mono is for figures and codes".
   */
  value?: ReactNode;
  /** Something to READ at the end of the row. Never interactive — see `control`. */
  trailing?: ReactNode;
  /** Something to OPERATE at the end of the row: a switch, a check, an icon button, a text link. */
  control?: ReactNode;
  /** The 16 px chevron in `text-3`: this row leads somewhere. Decorative, hidden from assistive tech. */
  chevron?: boolean;
  /** `muted`: an option that is not the chosen one. `danger`: a destructive action — text only. */
  tone?: ListRowTone;
  /**
   * The row's ACTION is unavailable: 40 %, inert, still focusable. The reason belongs in `sub`.
   * A row that only holds a `control` is not dimmed — the control carries its own disabled state
   * and the words stay readable (the board's "Rezgés" row: the switch at 40 %, the title in ink).
   */
  disabled?: boolean;
  /**
   * The row's own action is in flight: it holds the pressed level and refuses input (`aria-busy`).
   * Pulse draws no spinner in a row.
   */
  busy?: boolean;
  /** The id of the title element, for a control that is labelled by it (`aria-labelledby`). */
  titleId?: string;
  /** Only on a row that is an action: `radio`, `option`, `menuitem`, `tab`. */
  role?: AriaRole;
  /** Only on a row that is an action, for a roving tabindex. */
  tabIndex?: number;
  /** The link or button of a row that is an action. */
  actionRef?: Ref<HTMLAnchorElement | HTMLButtonElement>;
  /** Placement only. */
  className?: string;
  /** For the kit specimen and captures only: hold the pressed look or the focus ring. */
  'data-force'?: 'pressed' | 'focus';
  /**
   * A `micro` line 4 above the title (mono 11 / 16, upper case): city · date. In text-1 alone; in
   * text-2 after a `kickerLead`.
   */
  kicker?: ReactNode;
  /** The kicker's first word in text-1 — the post's kind ("Közlemény") — then " · " and `kicker` in text-2 (marketplace-1). */
  kickerLead?: string;
  /** `title` = 22 / 28 SemiBold, two lines balanced. Default `body` (`body-m` 16 / 22). */
  titleSize?: 'body' | 'title';
  /** `data` = the sub line in mono 13 / 18. Default `cap`. */
  subFace?: 'cap' | 'data';
  /** A 14 px glyph 6 before the sub line, drawn in the lamp colour (a bare Lucide icon). */
  subLead?: ReactNode;
  /** `ink` = the sub line in text-1. Default `quiet` (text-2). */
  subInk?: 'quiet' | 'ink';
  /** `sub` = the trailing value on the sub line's baseline, right-aligned. Default `title` (beside the text block). */
  valueOn?: 'title' | 'sub';
  /** The value's unit: the value is then a figure + unit pair (`FigureUnit`). */
  valueUnit?: string;
  /** The step of a figure + unit value. Default `dataL` (16 / 20 text-1). */
  valueStep?: 'dataL' | 'data';
  /** `loose` = 16 above and below. Default 10. */
  pad?: 'default' | 'loose';
}

export type ListRowProps = ListRowBase &
  (
    | { to: To; href?: never; onClick?: MouseEventHandler<HTMLElement> }
    | { href: string; to?: never; onClick?: MouseEventHandler<HTMLElement> }
    | { onClick?: MouseEventHandler<HTMLElement>; to?: never; href?: never }
  );

const SLOTS = 'flex items-center gap-4';
const BOX = 'py-2.5 text-start';
const BOX_LOOSE = 'py-4 text-start';
const FLOOR = { plain: 'min-h-[var(--row-h)]', sub: 'min-h-[var(--row-h-sub)]' } as const;

/** The five states of a row that is an action: rest, pressed, focus-visible, disabled, busy. */
const ACTION = [
  'cursor-pointer transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
  'active:opacity-[var(--pressed-opacity)]',
  'aria-busy:pointer-events-none aria-busy:opacity-[var(--pressed-opacity)]',
  'aria-disabled:pointer-events-none',
  // Keyboard focus is the global `:focus-visible` ring (index.css: 2 px `--focus-ring`, 2 off the
  // box). `data-force` holds a state for the kit specimen and for captures only, with the same
  // declarations as the real `:active` and `:focus-visible` (the convention of the actions lane).
  'data-[force=pressed]:opacity-[var(--pressed-opacity)]',
  'data-[force=focus]:rounded-2 data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-[var(--focus-ring)]',
].join(' ');

const TITLE_INK: Record<ListRowTone, string> = {
  default: 'text-text-1',
  muted: 'text-text-2',
  danger: 'text-danger',
};

const CLAMP = { 1: 'truncate', 2: 'line-clamp-2', 3: 'line-clamp-3' } as const;

/** Pulse System 2.2: a trailing value that holds a digit is a figure, and figures are mono. */
const holdsDigit = (value: ReactNode) => (typeof value === 'string' || typeof value === 'number') && /\d/.test(String(value));

export function ListRow(props: ListRowProps) {
  const {
    title,
    sub,
    lines = 1,
    subLines = 1,
    lead,
    leadSlot = false,
    value,
    trailing,
    control,
    chevron = false,
    tone = 'default',
    disabled = false,
    busy = false,
    titleId,
    role,
    tabIndex,
    actionRef,
    className,
    to,
    href,
    onClick,
    kicker,
    kickerLead,
    titleSize = 'body',
    subFace = 'cap',
    subLead,
    subInk = 'quiet',
    valueOn = 'title',
    valueUnit,
    valueStep,
    pad = 'default',
    ...aria
  } = props;

  const has = (node: ReactNode) => node !== undefined && node !== null && node !== false;
  const floor = has(sub) || has(kicker) || !!kickerLead ? FLOOR.sub : FLOOR.plain;
  const isAction = to !== undefined || href !== undefined || onClick !== undefined;
  const split = isAction && has(control);
  const box = pad === 'loose' ? BOX_LOOSE : BOX;
  const figurePair = valueUnit !== undefined || valueStep !== undefined;
  const valueNode = !has(value) ? null : figurePair && (typeof value === 'string' || typeof value === 'number') ? (
    <FigureUnit value={value} unit={valueUnit} step={valueStep ?? 'dataL'} />
  ) : figurePair ? (
    <span className="flex shrink-0 items-baseline">{value}</span>
  ) : (
    <span className={cn('shrink-0 whitespace-nowrap text-text-2', holdsDigit(value) ? 'text-data' : 'text-cap')}>{value}</span>
  );
  const valueOnSub = valueOn === 'sub' && valueNode !== null;
  const hasKicker = has(kicker) || (kickerLead !== undefined && kickerLead !== '');
  const roomy = hasKicker || titleSize === 'title';
  // Hungarian (and German) typesetting keeps a dash at the END of a line, never at the start of the
  // next: in a 22 pt title the space before " – " is made unbreakable (coach-plans-1 breaks
  // "Felső/alsó szplit –" / "12 hetes blokk").
  const shownTitle = titleSize === 'title' && typeof title === 'string' ? title.replace(/ ([–—])/g, '\u00a0$1') : title;
  const subLine =
    has(sub) || valueOnSub ? (
      <span className={cn('flex min-w-0 items-baseline gap-4', subFace === 'data' ? 'text-data' : 'text-cap', subInk === 'ink' ? 'text-text-1' : 'text-text-2')}>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {has(subLead) ? (
            <span aria-hidden className="flex shrink-0 items-center [&>svg]:size-3.5 [&>svg]:stroke-2 [&>svg]:text-accent">
              {subLead}
            </span>
          ) : null}
          {has(sub) ? <span className={cn('min-w-0', CLAMP[subLines])}>{sub}</span> : null}
        </span>
        {valueOnSub ? valueNode : null}
      </span>
    ) : null;

  const read = (
    <>
      {has(lead) || leadSlot ? (
        <span
          className={cn(
            'flex shrink-0 items-center [&>svg]:size-5 [&>svg]:stroke-[1.75] [&>svg]:text-text-2',
            leadSlot && 'h-11 w-[var(--thumb)]',
          )}
        >
          {lead}
        </span>
      ) : null}
      <span className={cn('flex min-w-0 flex-1 flex-col', roomy ? 'gap-1' : 'gap-0.5')}>
        {hasKicker ? (
          kickerLead ? (
            <span className="truncate text-micro text-text-2">
              <span className="text-text-1">{kickerLead}</span>
              {has(kicker) ? <> · {kicker}</> : null}
            </span>
          ) : (
            <span className="truncate text-micro text-text-1">{kicker}</span>
          )
        ) : null}
        <span
          id={titleId}
          className={cn(titleSize === 'title' ? 'text-title text-balance' : 'text-body-m', TITLE_INK[tone], CLAMP[lines])}
        >
          {shownTitle}
        </span>
        {subLine}
      </span>
      {valueOnSub ? null : valueNode}
      {has(trailing) ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
    </>
  );
  const operate = has(control) ? <span className="flex shrink-0 items-center">{control}</span> : null;
  const mark = chevron ? (
    <ChevronRight aria-hidden className="-me-1.25 size-4 shrink-0 text-text-3" strokeWidth={1.75} />
  ) : null;

  // Not an action: one flat row. `role`, `tabIndex` and the ARIA props are for the action only.
  if (!isAction) {
    return (
      <div data-kit="listRow" data-row-pad="" className={cn(SLOTS, box, floor, 'w-full', className)}>
        {read}
        {operate}
        {mark}
      </div>
    );
  }

  const inert = disabled || busy;
  const actionClass = cn(
    SLOTS,
    box,
    floor,
    ACTION,
    split ? 'min-w-0 flex-1 self-stretch' : 'w-full',
    disabled && 'opacity-[var(--disabled-opacity)]',
    !split && className,
  );
  const shared = {
    role,
    tabIndex,
    'data-row-pad': '',
    'aria-busy': busy || undefined,
    className: actionClass,
    ...aria,
  };
  const inside = (
    <>
      {read}
      {split ? null : mark}
    </>
  );

  let action: ReactNode;
  if (to !== undefined) {
    action = (
      <Link
        ref={actionRef as Ref<HTMLAnchorElement>}
        to={to}
        onClick={inert ? (event) => event.preventDefault() : onClick}
        aria-disabled={inert || undefined}
        data-kit={split ? undefined : 'listRow'}
        {...shared}
      >
        {inside}
      </Link>
    );
  } else if (href !== undefined) {
    action = (
      <a
        ref={actionRef as Ref<HTMLAnchorElement>}
        href={href}
        onClick={inert ? (event) => event.preventDefault() : onClick}
        aria-disabled={inert || undefined}
        data-kit={split ? undefined : 'listRow'}
        {...shared}
      >
        {inside}
      </a>
    );
  } else {
    action = (
      <button
        ref={actionRef as Ref<HTMLButtonElement>}
        type="button"
        // `aria-disabled`, not `disabled`: a row that turns busy or disabled while it has the
        // focus would drop it to the top of the page. It stays reachable and refuses the click.
        onClick={inert ? undefined : onClick}
        aria-disabled={inert || undefined}
        data-kit={split ? undefined : 'listRow'}
        {...shared}
      >
        {inside}
      </button>
    );
  }

  if (!split) return action;

  // An action AND a control: two targets side by side, never one inside the other.
  return (
    <div
      data-kit="listRow"
      className={cn(SLOTS, 'w-full', className)}
    >
      {action}
      {operate}
      {mark}
    </div>
  );
}

/**
 * The loading form of a row: the same floor, a block in place of each text line (16 for the title,
 * 12 for the sub line — 8 apart, which is where the two lines of text stand), and nothing in the
 * lead slot: Pulse withholds images while they load, it does not draw a grey square for them.
 *
 * `index` only varies the widths, so three rows in a stack do not read as a table of equal bars.
 */
const SKELETON_WIDTHS = [
  ['w-55', 'w-30'],
  ['w-45', 'w-24'],
  ['w-65', 'w-35'],
] as const;

export interface ListRowSkeletonProps {
  /** The row it stands in for has a sub line. */
  sub?: boolean;
  /** The row it stands in for has a kicker: a 12 pt block 8 above the title's, and the loose padding. */
  kicker?: boolean;
  /** The row it stands in for has a 48 pt lead slot: keep the text edge, leave the slot empty. */
  leadSlot?: boolean;
  index?: number;
  className?: string;
}

export function ListRowSkeleton({ sub = false, kicker = false, leadSlot = false, index = 0, className }: ListRowSkeletonProps) {
  const [titleWidth, subWidth] = SKELETON_WIDTHS[Math.abs(index) % SKELETON_WIDTHS.length];
  return (
    <div
      aria-hidden
      data-kit="listRow"
      data-loading=""
      data-row-pad=""
      className={cn(SLOTS, kicker ? BOX_LOOSE : BOX, sub || kicker ? FLOOR.sub : FLOOR.plain, 'w-full', className)}
    >
      {leadSlot ? <span className="h-11 w-[var(--thumb)] shrink-0" /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        {kicker ? <Skeleton className={cn('h-3 max-w-full', subWidth)} /> : null}
        <Skeleton className={cn('h-4 max-w-full', titleWidth)} />
        {sub ? <Skeleton className={cn('h-3 max-w-full', subWidth)} /> : null}
      </span>
    </div>
  );
}
