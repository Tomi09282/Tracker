import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Pressable } from '../primitives/Pressable';
import { setLanguage, LOCALES, LOCALE_CODES, type LocaleCode } from '../../i18n';

/**
 * Segmented language switch, derived from the locale registry rather than from its own list.
 *
 * `aria-pressed` rather than a radio group: these are buttons that each perform an action
 * immediately, not a form input awaiting submission.
 *
 * Labels come from the registry and are NATIVE names, so they are deliberately NOT passed through
 * `t()`. A language name is the one label that must never be translated — the person using this
 * control is precisely the person who cannot read the current UI language.
 */
export function LanguageToggle() {
  const { i18n } = useTranslation();

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-chip border border-[var(--surface-border)] bg-surface-1 p-1">
      {LOCALE_CODES.map((code: LocaleCode) => {
        const active = i18n.language.startsWith(code);
        return (
          <Pressable
            key={code}
            shape="chip"
            density="compact"
            /* `secondary`, not `ghost`, for the two that are off. `ghost` has neither border nor
               fill, so inside a bordered container the unselected languages read as bare words
               floating beside a pill rather than as two more choices — and the row stops looking
               like a set of three. `secondary` already carries the border, the surface fill and the
               hover edge this needs. */
            variant={active ? 'primary' : 'secondary'}
            aria-pressed={active}
            // Tells a screen reader to switch voice for this word. Without it, "Deutsch" is read
            // with Hungarian phonetics.
            lang={code}
            onClick={() => setLanguage(code)}
          >
            {LOCALES[code].label}
            {/* THE CHECK IS THE PART THAT SURVIVES. Selection was carried by fill colour alone, and
                a filled chip beside two outlined ones is a colour distinction — the one kind
                roughly a twelfth of men cannot make, and the same argument that put a check on the
                muscle map's side pills and on the muscle chips. `aria-pressed` above already says
                it to a screen reader; this says it to the eye. */}
            {active ? <Check className="size-icon-s shrink-0" strokeWidth={3} aria-hidden /> : null}
          </Pressable>
        );
      })}
    </div>
  );
}
