// src/lib/lang.js — which language a request wants, and what it falls back to.
import * as db from '../db/index.js';

let cache = null;

/**
 * The enabled language set, cached for the process lifetime.
 *
 * Adding a language is a row in `languages`, not a deploy — but it is also not something that
 * changes minute to minute, so a restart to pick it up is an acceptable trade for not querying
 * this on every single request.
 */
export async function languages() {
  if (cache) return cache;
  const rows = await db.all(
    'SELECT code, name_en, name_native, is_default FROM languages WHERE enabled = 1 ORDER BY sort_order',
  );
  cache = {
    codes: rows.map((r) => r.code),
    fallback: rows.find((r) => r.is_default)?.code ?? 'en',
    list: rows,
  };
  return cache;
}

/** Called after a language row changes, so the next request sees it. */
export const invalidateLanguageCache = () => {
  cache = null;
};

/**
 * Resolve the language for a request: an explicit `?lang=` wins, then Accept-Language, then the
 * default.
 *
 * Accept-Language is parsed rather than trusted wholesale — it is client input, and a header
 * value must never reach a query. Only a code that exists in the enabled set is ever returned,
 * so the result is safe to use as a bound parameter and can never be an injection vector.
 */
export async function resolveLang(req) {
  const { codes, fallback } = await languages();

  const explicit = typeof req.query?.lang === 'string' ? req.query.lang.toLowerCase() : null;
  if (explicit && codes.includes(explicit)) return explicit;

  const header = req.get('Accept-Language');
  if (header) {
    // "hu-HU,hu;q=0.9,en;q=0.8" → ['hu','hu','en'], in the client's stated preference order.
    const preferred = header
      .split(',')
      .map((part) => {
        const [tag, q] = part.trim().split(';q=');
        return { tag: tag.trim().toLowerCase().slice(0, 2), q: q ? Number.parseFloat(q) : 1 };
      })
      .filter((p) => /^[a-z]{2}$/.test(p.tag))
      .sort((a, b) => b.q - a.q);
    const match = preferred.find((p) => codes.includes(p.tag));
    if (match) return match.tag;
  }

  return fallback;
}
