import { useTranslation } from 'react-i18next';
import { ChevronRight, Palette } from 'lucide-react';
import { EmptyState } from '../../ui/feedback/EmptyState';
import { TextLink } from '../../ui/primitives/TextLink';
import { Screen } from '../../ui/shell/Screen';
import { ScreenHeader } from '../../ui/shell/ScreenHeader';

/**
 * The admin view's shared parts — the header every admin tab stands under, and the refusal a
 * non-admin sees.
 *
 * ═══ THE SECTIONS ARE TABS NOW (design round A) ════════════════════════════════════════════════
 *
 * Moderáció (`/admin`), Fiókok (`/admin/accounts`) and Piactér (`/admin/marketplace`) used to be
 * three panels of one screen behind a local switch. They are routes of the admin bar now, so the
 * switch is gone and each page draws the same header (admin-view-1 / -2 / -3): the eyebrow
 * "Adminisztráció" with the one door to the style studio on its row, and the tab's name as the
 * display title.
 */
export function AdminHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <ScreenHeader
      kind="section"
      eyebrow={t('admin.eyebrow')}
      title={title}
      trailing={
        // A real anchor, and the only door to the studio.
        // `-me-1.25`: the chevron's 16 pt box ends 5 past the gutter, so its INK ends on it.
        <TextLink to="/admin/styles" lead={<Palette />} trail={<ChevronRight />} className="-me-1.25">
          {t('admin.styleStudio')}
        </TextLink>
      }
    />
  );
}

/**
 * What a signed-in non-admin sees on any admin route. The server enforces the role on every
 * endpoint behind these pages; this only explains the refusal instead of a screen of failed reads.
 * `heading="h1"`: this IS the page for them, and a page with no `h1` cannot be navigated into.
 */
export function AdminForbidden() {
  const { t } = useTranslation();
  return (
    <Screen top="root">
      <EmptyState heading="h1" title={t('admin.forbiddenTitle')} body={t('admin.forbiddenBody')} />
    </Screen>
  );
}
