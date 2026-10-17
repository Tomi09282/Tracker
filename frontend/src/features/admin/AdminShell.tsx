import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Segmented } from '../../ui/feedback/variants/E6Segmented';
import { RowStack } from '../../ui/data/RowStack';
import { ListRow } from '../../ui/data/ListRow';
import { useWide } from './ModerationQueue';

export interface AdminSection {
  key: string;
  /** Rendered lazily: a section nobody has opened should not be fetching. */
  render: () => ReactNode;
  /** A live count after the section's word (only "Moderáció" carries one); not drawn at 0. */
  count?: number;
}

/**
 * The admin shell — the section switch and the panel it swaps in place.
 *
 * ═══ ON A PHONE: THE THREE WORDS ON A HAIRLINE ═════════════════════════════════════════════════
 *
 * admin-1 / -2 / -3 draw the switch as the kit's `segSwitch` in its equal-cells form: three words
 * across the content width, the chosen one in ink with the 2 pt mark on the hairline, and the
 * waiting count in mono lime 6 after "Moderáció". No icon, no capsule, no fill.
 *
 * ═══ FROM lg UP: THE RAIL STAYS (R21) ══════════════════════════════════════════════════════════
 *
 * The desktop layout keeps its twelve columns: the sections as a rail of rows beside the panel. The
 * rail is the same choice as the switch — a radiogroup — drawn as rows, because three words across a
 * 260 pt column would be a switch nobody reads. ONE control is rendered, picked by `useWide`, so no
 * second radiogroup sits hidden in the document.
 *
 * ═══ A RADIOGROUP AND A LABELLED REGION, NOT A TABLIST ═════════════════════════════════════════
 *
 * The kit's switch is a radiogroup (`Segmented`), so the panel is a region named by the chosen
 * section rather than a `tabpanel` wired to a tab id. What a screen-reader user hears is the same
 * choice, read as "Moderáció 3, kiválasztva".
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
  const wide = useWide();
  const current = sections.find((s) => s.key === active) ?? sections[0];
  const label = (key: string) => t(`admin.section.${key}`);

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-6">
      {wide ? (
        <RowStack as="div" role="radiogroup" aria-label={t('admin.sections')} className="lg:col-span-3 lg:max-w-[var(--admin-sidebar-w)]">
          {sections.map((s) => {
            const selected = s.key === current?.key;
            return (
              <ListRow
                key={s.key}
                role="radio"
                aria-checked={selected}
                tone={selected ? 'default' : 'muted'}
                title={label(s.key)}
                value={s.count && s.count > 0 ? String(s.count) : undefined}
                onClick={() => onSelect(s.key)}
              />
            );
          })}
        </RowStack>
      ) : (
        <Segmented
          layout="cells"
          label={t('admin.sections')}
          options={sections.map((s) => ({ value: s.key, label: label(s.key), count: s.count }))}
          value={current?.key ?? active}
          onChange={onSelect}
        />
      )}

      {/* `min-w-0`: a grid child defaults to `min-width: auto`, and a wide row would push the grid out. */}
      <section aria-label={current ? label(current.key) : undefined} className="min-w-0 lg:col-span-9">
        {current?.render()}
      </section>
    </div>
  );
}
