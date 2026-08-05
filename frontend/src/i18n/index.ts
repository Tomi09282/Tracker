import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import hu from './hu.json';
import en from './en.json';
import de from './de.json';

const STORAGE_KEY = 'tracker.lang';

/**
 * The registry of shipped languages — the ONE place a language is added.
 *
 * It used to be three: the resource map here, the `setLanguage` union type, and a hardcoded array
 * in `LanguageToggle`. Three lists that must agree is two lists that will eventually disagree, and
 * the failure is silent — a language loads but never appears in the switch, or appears in the
 * switch and has nothing to load. Everything below is derived from this object.
 *
 * `label` is the language's NATIVE name, never a translated one. A German speaker looking for
 * their language scans for "Deutsch", not for "Német" or "German" — which is also why these
 * strings are identical in every bundle.
 *
 * A language belongs here only when its bundle is COMPLETE. `check-i18n.mjs` enforces that: every
 * bundle must carry exactly the same key set, so a missing key fails the build instead of
 * rendering a raw key path at a user.
 */
export const LOCALES = {
  hu: { label: 'Magyar', bundle: hu },
  en: { label: 'English', bundle: en },
  de: { label: 'Deutsch', bundle: de },
} as const;

export type LocaleCode = keyof typeof LOCALES;

export const LOCALE_CODES = Object.keys(LOCALES) as LocaleCode[];

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
const isKnown = (v: string | null): v is LocaleCode => v !== null && v in LOCALES;

/**
 * Hungarian is the default: this is a Hungarian product first, and defaulting to English
 * would make the majority of users switch on every fresh device.
 *
 * Resources are bundled rather than fetched — a language file arriving over the network is one
 * more thing that can be slow, blocked by the CSP, or missing when the app is offline.
 */
void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(LOCALES).map(([code, { bundle }]) => [code, { translation: bundle }]),
  ),
  // A stored value is client data: it survives across app versions, so a language that has since
  // been removed must not be honoured just because localStorage still names it.
  lng: isKnown(stored) ? stored : 'hu',
  fallbackLng: 'hu',
  interpolation: { escapeValue: false }, // React already escapes
});

export function setLanguage(lang: LocaleCode) {
  void i18n.changeLanguage(lang);
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
}

document.documentElement.lang = i18n.language;

export default i18n;
