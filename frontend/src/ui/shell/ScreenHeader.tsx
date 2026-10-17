import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { routeMetaFor } from '../../app/routeMeta';
import { useCurrentView } from '../../app/viewContext';
import { cn } from '../../lib/cn';

/**
 * Where a pushed header's back control goes, when the screen has to say so itself.
 *
 * Most pushed screens say nothing: their way back is a row of `app/routeMeta.ts`. This is for the
 * screen that has no row (a public root whose "back" is the history) or an outcome state that
 * must leave somewhere else.
 */
export type ScreenHeaderBack =
  | {
      /** A router path. */
      to: string;
      /** The parent's name: printed as the eyebrow, and the control's accessible name. */
      label: string;
      /** Draw the chevron alone; `label` stays the accessible name. */
      bare?: boolean;
      /** Kit specimens only: hold the control pressed or keyboard-focused. */
      force?: 'pressed' | 'focus';
    }
  | {
      /** A step that is not a link, e.g. `() => navigate(-1)`. */
      onClick: () => void;
      label: string;
      bare?: boolean;
      force?: 'pressed' | 'focus';
    };

interface HeaderCommon {
  /** ONE node on the right of the top row: an icon button, a text link, the small pill. */
  trailing?: ReactNode;
  /** Lines that belong to the header, 4 pt under the title (a meta line, an intro, a door). */
  children?: ReactNode;
  /** `id` of the `h1`, for `aria-labelledby`. */
  titleId?: string;
  className?: string;
}

export type ScreenHeaderProps =
  | (HeaderCommon & {
      /** Tab root with a greeting: title 22 + one quiet line (Kezdőlap, the coach dashboard). */
      kind: 'greet';
      title: ReactNode;
      /** The line under the title: a date, the name of the surface. */
      sub?: ReactNode;
    })
  | (HeaderCommon & {
      /** Tab root with one display line (Gyakorlatok, Táplálkozás, Haladás). */
      kind: 'root';
      title: ReactNode;
    })
  | (HeaderCommon & {
      /**
       * Pushed screen: the back chevron with the PARENT'S NAME as an eyebrow, then the display
       * title. The parent comes from `app/routeMeta.ts` by the current route.
       */
      kind: 'push';
      /** Omit it when the screen draws its own title block under the back row. */
      title?: ReactNode;
      /** Overrides the row of `routeMeta` — or supplies the way back where there is no row. */
      back?: ScreenHeaderBack;
    })
  | (HeaderCommon & {
      /**
       * Category screen: the grid of a pushed header, with an eyebrow that is NOT a way back
       * (Tervezés, Adminisztráció, Megjelenés).
       */
      kind: 'section';
      eyebrow: ReactNode;
      title: ReactNode;
      /**
       * The eyebrow row hugs its text (20 pt) instead of standing in the 44 pt row, so the title
       * sits 12 pt higher. Only where the frame draws it so and the row holds no control
       * (`coach-plans-1`): a control needs the 44 pt row.
       */
      tight?: boolean;
    })
  | (HeaderCommon & {
      /**
       * G-shell. A desk that belongs to a PERSON (compose-hub-1 / -2, "Piactéri pult"): the 44 pt top
       * row is who it is — a 28 pt monogram, the name, the handle — on ONE baseline, the trailing
       * control at the right edge; 4 under it the display title. A tab root with no way back, on the
       * grid of a pushed header (`Screen top="push"`: the row at y 64, the title at y 112).
       */
      kind: 'identity';
      /** The person's mark: `<Monogram size={28} … />` (ink-tight, its bottom on the baseline). 12 before the name. */
      lead?: ReactNode;
      /** The person's name, `body-m` `text-1`. */
      name: ReactNode;
      /** The handle ("@kovacs-peter"), `cap` `text-2`, 8 after the name; it is the part that truncates. */
      handle?: ReactNode;
      title: ReactNode;
    });

const TITLE_DISPLAY = 'text-display min-w-0 text-text-1';
const EYEBROW = 'text-eyebrow text-text-2';

/**
 * The back control of a pushed header.
 *
 * The kit draws it as a 12 x 24 slot with the 24 pt chevron hung 8 pt to its left, so the glyph's
 * INK (not its box) starts on the gutter, then 6 pt, then the parent's name. The whole row is the
 * target (44 pt high); bare, it is a 44 x 44 square with the chevron in the same place.
 */
function BackControl({ back }: { back: ScreenHeaderBack }) {
  const className = cn(
    'inline-flex min-h-[var(--target-min)] shrink-0 items-center gap-1.5 text-text-1',
    back.bare && 'min-w-[var(--target-min)]',
    'transition-opacity duration-[var(--duration-instant)] ease-[var(--ease-standard)]',
    'active:opacity-[var(--pressed-opacity)] motion-reduce:transition-none',
    // A specimen holds a state that needs a finger or a keyboard: the same declarations as the
    // real `:active` and the global `:focus-visible` ring.
    'data-[force=pressed]:opacity-[var(--pressed-opacity)]',
    'data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-[var(--focus-ring)]',
  );
  const content = (
    <>
      <span aria-hidden className="relative block h-6 w-3 shrink-0">
        <ChevronLeft className="absolute -left-2 top-0 size-6" strokeWidth={1.75} />
      </span>
      {back.bare ? null : <span className={EYEBROW}>{back.label}</span>}
    </>
  );
  const name = back.bare ? back.label : undefined;
  if ('to' in back) {
    return (
      <Link
        to={back.to}
        aria-label={name}
        data-kit="iconBtn"
        data-part="back"
        data-force={back.force}
        className={className}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={back.onClick}
      aria-label={name}
      data-kit="iconBtn"
      data-part="back"
      data-force={back.force}
      className={className}
    >
      {content}
    </button>
  );
}

/**
 * The header of a screen, in the four forms the frames draw. One component, so a title, a back
 * control and a trailing action sit on the same grid on every screen.
 *
 *   greet    row 48: title 22 / 28 + a 13 / 18 line; trailing icon button      Screen top="root"
 *   root     row 48: ONE display line 32 / 34; trailing icon button            Screen top="root"
 *   push     row 44: chevron + parent eyebrow, trailing node; 4; display title Screen top="push"
 *   section  row 44: category eyebrow, trailing link; 4; display title         Screen top="push"
 *   identity row 44: monogram + name + handle on a baseline, trailing; 4; title   Screen top="push"  (G-shell)
 *
 * It is the screen's `h1`. There is no top app bar, no centred title and no surface: the header
 * is ordinary content on the gutter, and it scrolls away with the page.
 *
 * `push` reads its parent from `app/routeMeta.ts` — the same row the gates hold to the router, to
 * the three bundles and to the lit tab. A pushed screen that names its own parent in a prop would
 * be the second copy of that fact.
 */
export function ScreenHeader(props: ScreenHeaderProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const view = useCurrentView();
  const { trailing, children, titleId, className } = props;

  if (props.kind === 'greet' || props.kind === 'root') {
    return (
      <header data-kit="screenHead" data-kind={props.kind} className={cn('flex flex-col gap-1', className)}>
        <div className="flex h-12 items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col">
            <h1
              id={titleId}
              className={
                props.kind === 'greet' ? 'text-title min-w-0 truncate text-text-1' : cn(TITLE_DISPLAY, 'truncate')
              }
            >
              {props.title}
            </h1>
            {props.kind === 'greet' && props.sub != null ? (
              <p className="text-cap min-w-0 truncate text-text-2">{props.sub}</p>
            ) : null}
          </div>
          {trailing != null ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
        </div>
        {children}
      </header>
    );
  }

  if (props.kind === 'section') {
    return (
      <header
        data-kit="screenHead"
        data-kind="section"
        className={cn('flex flex-col gap-1', props.tight && 'pt-3', className)}
      >
        <div className={cn('flex items-center justify-between gap-4', props.tight ? 'min-h-5' : 'h-11')}>
          <p className={cn(EYEBROW, 'min-w-0 truncate')}>{props.eyebrow}</p>
          {trailing != null ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
        </div>
        <h1 id={titleId} className={TITLE_DISPLAY}>
          {props.title}
        </h1>
        {children}
      </header>
    );
  }

  if (props.kind === 'identity') {
    // compose-hub-1: Identity 24,64 354 x 44 · Monogram/KP ink 24,70 25 x 22 · name 61,75 (body-m
    // 16 / 22) · handle 168,78 (cap 13 / 18, text-2) · status control 331,65 47 x 44 · title 24,112.
    // The three share the baseline at y 92: the name's line box ends 5 under it, at 97, which is
    // 11 above the row's bottom — so the group stands on the row's bottom edge with 11 under it and
    // aligns its items on the baseline (the monogram is trimmed to cap height and baseline, so its
    // bottom IS the baseline).
    return (
      <header data-kit="screenHead" data-kind="identity" className={cn('flex flex-col gap-1', className)}>
        <div className="flex h-11 items-end justify-between gap-4">
          <div data-part="identity" className="flex min-w-0 items-baseline pb-2.75">
            {props.lead != null ? <span className="mr-3 flex shrink-0 items-baseline">{props.lead}</span> : null}
            <span className="text-body-m shrink-0 text-text-1">{props.name}</span>
            {props.handle != null ? <span className="text-cap ml-2 min-w-0 truncate text-text-2">{props.handle}</span> : null}
          </div>
          {trailing != null ? <div className="flex shrink-0 items-center self-center">{trailing}</div> : null}
        </div>
        <h1 id={titleId} className={TITLE_DISPLAY}>
          {props.title}
        </h1>
        {children}
      </header>
    );
  }

  // The view decides the parent of a screen every view shares (`/notifications`, `byView`).
  const row = routeMetaFor(pathname, view);
  const back: ScreenHeaderBack | null =
    props.back ?? (row ? { to: row.parent, label: t(row.parentLabelKey), bare: row.bare } : null);

  return (
    <header data-kit="screenHead" data-kind="push" className={cn('flex flex-col gap-1', className)}>
      <div className="flex h-11 items-center justify-between gap-4">
        {/* A pushed screen with no row and no `back` keeps its grid and has no way back drawn:
            the row is still 44 high, so the title does not jump when the table gets its row. */}
        {back ? <BackControl back={back} /> : <span aria-hidden />}
        {trailing != null ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
      </div>
      {props.title != null ? (
        <h1 id={titleId} className={TITLE_DISPLAY}>
          {props.title}
        </h1>
      ) : null}
      {children}
    </header>
  );
}
