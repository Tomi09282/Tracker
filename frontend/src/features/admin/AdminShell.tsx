import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Pressable } from '../../ui/primitives/Pressable';

export interface AdminSection {
  key: string;
  icon: LucideIcon;
  /** Rendered lazily: a section nobody has opened should not be fetching. */
  render: () => ReactNode;
  /** Shown on the rail when the section has something waiting. */
  badge?: number;
}

/**
 * The admin shell — a left rail and a content column, on a twelve-column grid.
 *
 * ═══ A GRID COLUMN, NOT A SECOND FIXED ELEMENT ═════════════════════════════════════════════════
 *
 * `BottomNav` is already `fixed inset-x-0 bottom-0` with its own z-index and its own safe-area
 * padding. A second fixed rail would have to know about all three, plus the toast layer — three
 * z-index decisions to get wrong instead of none. Inside the 1120px column it is just a column, and
 * it scrolls with the page like everything else.
 *
 * ═══ AND IT ONLY EXISTS FROM lg UP ═════════════════════════════════════════════════════════════
 *
 * Below that the sections stack, which is what they did before this file existed. A rail on a
 * 390px screen is a rail nobody can read the labels of, competing for width with the tables that
 * are the actual content.
 *
 * ═══ `col-span-*` NEARLY COST THIS ITS GRID ════════════════════════════════════════════════════
 *
 * `check-tokens` flagged `col-span-3` as an undefined utility: its rule was written to catch typos
 * in this project's own `col-mobile` / `col-wide` and matched `col-[a-z]+`, which is also Tailwind's
 * prefix. So the twelve-column layout this screen was specced with could not be written without the
 * build going red — measured by trying it. The gate now names Tailwind's four real column
 * utilities, and a typo in `col-mobile` is still caught.
 */
export function AdminShell({
  sections,
  active,
  onSelect,
}: {
  sections: AdminSection[];
  active: string;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div className="grid gap-group lg:grid-cols-12 lg:gap-6">
      {/*
        A tablist, not a nav. These switch a panel in place; they do not navigate, and calling it
        navigation would promise a screen-reader user a page change that never happens.

        ═══ PILLS ON A PHONE, THE SAME RAIL ABOVE lg ══════════════════════════════════════════════

        Three sections fit across a phone as chips, so the row costs one line and the panel below it
        starts above the fold. It is the same control either way — one horizontal scroll container
        that turns into the vertical rail at the breakpoint — not two implementations of a tablist
        that would have to be kept in step.
      */}
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={t('admin.sections')}
        className="flex gap-tight overflow-x-auto lg:col-span-3 lg:max-w-[var(--admin-sidebar-w)] lg:flex-col lg:overflow-visible"
      >
        {sections.map((s) => {
          const Icon = s.icon;
          const selected = s.key === current?.key;
          return (
            <Pressable
              key={s.key}
              role="tab"
              id={`admin-tab-${s.key}`}
              aria-selected={selected}
              aria-controls={`admin-panel-${s.key}`}
              variant={selected ? 'secondary' : 'ghost'}
              shape="chip"
              density="compact"
              className={cn(
                'shrink-0 justify-start gap-tight lg:w-full',
                // The open section is the only one that gets a fill and an accent edge; the rest
                // keep the hairline that says "this is pressable" and nothing more.
                selected
                  ? 'border-[length:var(--border-width)] border-accent font-medium text-accent'
                  : 'border-[length:var(--border-width)] border-[var(--surface-border)]',
              )}
              onClick={() => onSelect(s.key)}
            >
              <Icon className="size-icon-s shrink-0" aria-hidden />
              <span className="truncate">{t(`admin.section.${s.key}`)}</span>
              {/*
                A count, and only when there IS one. A grey zero beside "Moderation" reads as a
                queue with nothing in it AND as a badge that is broken; a number that appears only
                when it means something can only mean the one thing.
              */}
              {s.badge ? (
                <span className="text-micro tabular-nums ml-auto rounded-chip bg-accent-subtle px-1.5 text-accent">
                  {s.badge}
                </span>
              ) : null}
            </Pressable>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`admin-panel-${current?.key}`}
        aria-labelledby={`admin-tab-${current?.key}`}
        // `min-w-0` is not decoration: a grid child defaults to `min-width: auto`, so a table wider
        // than its column pushes the whole grid out instead of scrolling inside its own wrapper —
        // which would take the sticky header's scroll container with it.
        className="min-w-0 lg:col-span-9"
      >
        {current?.render()}
      </div>
    </div>
  );
}
