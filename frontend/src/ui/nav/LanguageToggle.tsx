import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { Segment } from '../feedback/variants/E6Segmented';
import { setLanguage, LOCALES, LOCALE_CODES, type LocaleCode } from '../../i18n';

/**
 * The language switch — the kit's `segSwitch` in its hug form, exactly as the frames draw it under
 * the login form (`auth-1`, "Language · Magyar selected") and in the "Nyelv" section head of
 * Profil (`settings-2`): "Magyar  English  Deutsch", the words 24 apart, the chosen one in
 * `text-1` over a 2 pt ink mark. It wears the face of `Segmented` (`Segment`), so the two can never
 * drift apart.
 *
 * Derived from the locale registry rather than from its own list.
 *
 * `aria-pressed` rather than a radio group: these are buttons that each perform an action
 * immediately — the whole interface changes language under the user's finger — not a form input,
 * and that is the contract this control has always had. The group is named (`common.language`) so
 * the three buttons are announced as one set.
 *
 * Labels come from the registry and are NATIVE names, so they are deliberately NOT passed through
 * `t()`. A language name is the one label that must never be translated — the person using this
 * control is precisely the person who cannot read the current UI language.
 *
 * Reference: docs/pipeline/pulse/kit/selection.md.
 */
export function LanguageToggle({ className }: { /** Placement only. */ className?: string } = {}) {
  const { i18n, t } = useTranslation();

  return (
    <div role="group" aria-label={t('common.language')} data-kit="segSwitch" className={cn('inline-flex w-fit gap-6', className)}>
      {LOCALE_CODES.map((code: LocaleCode) => {
        const active = i18n.language.startsWith(code);
        return (
          <Segment
            key={code}
            layout="hug"
            selected={active}
            aria-pressed={active}
            // Tells a screen reader to switch voice for this word. Without it, "Deutsch" is read
            // with Hungarian phonetics.
            lang={code}
            onClick={() => setLanguage(code)}
          >
            {LOCALES[code].label}
          </Segment>
        );
      })}
    </div>
  );
}
