// scripts/lib/parse-routes.mjs — ONE definition of "what a route is".
//
// ═══ WHY THIS IS A MODULE AND NOT A REGEX IN TWO FILES ═════════════════════════════════════════
//
// This project's second-most-common defect is a SECOND implementation of a problem it had already
// solved — ten instances so far, almost always by omission rather than by choice. `check-routes`
// already knew how to find every route in `src/`. The admin audit gate needs the same knowledge,
// and copying the regex would have produced two parsers that agree on the day they are written and
// drift the first time a route is formatted differently. When they drift, the copy that is WRONG
// goes quiet — a parser that fails to see a route reports nothing about it, and silence reads
// exactly like a pass.
//
// So the parser moved here and both gates import it. There is one answer to "is this a route", and
// when it is wrong, it is wrong in both places at once, loudly.
//
// ═══ AND MOVING IT FOUND FOUR ROUTES NO GATE HAD EVER SEEN ═════════════════════════════════════
//
// The regex this replaced required the chain to terminate at `asyncRoute(`. Four routes do not:
//
//     router.post('/workouts/:id/finish', requireAuth, setLimiter, endSession('completed'));
//     router.post('/workouts/:id/abandon', requireAuth, setLimiter, endSession('abandoned'));
//     router.put('/plans/:planId/blocks/order', ..., reorderIn('workout_plan_blocks'));
//     router.put('/plans/:planId/exercises/order', ..., reorderIn('workout_plan_exercises'));
//
// They pass a handler built by a FACTORY instead of writing one inline, which is a perfectly good
// way to write two routes that differ by one word. But it meant `check-routes` printed
// "161 routes — all authenticated" while never once looking at them. All four happen to comply;
// that is luck, and luck is not a property. A clean result is a statement about COVERAGE before it
// is a statement about the subject, and for these four the coverage was zero.
//
// So the parser now splits the argument list properly and resolves a factory handler back to the
// function that built it. 165 routes, and `suspects` — anything that still will not parse — is a
// HARD FAILURE in every gate that uses this. An invisible route passes every check by not existing
// to it, so "I could not read this" must never be spelled the same way as "this is fine".
import fs from 'node:fs';
import path from 'node:path';

/** Every `.js` file under `dir`, recursively. */
export function sourceFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) out.push(p);
    }
  })(dir);
  return out;
}

/**
 * Scan forward one token, returning the index just past it.
 *
 * Comments are handled BEFORE strings, so an apostrophe in `// the caller's role` cannot open a
 * string literal and swallow the rest of the file. Everything downstream — paren matching, argument
 * splitting — is built on this, because the naive versions all meet
 * `INSERT INTO audit_log (actor_id, ...)` inside a template literal and mistake data for structure.
 */
function skip(src, i) {
  const c = src[i];
  if (c === '/' && src[i + 1] === '/') {
    const nl = src.indexOf('\n', i);
    return nl === -1 ? src.length : nl + 1;
  }
  if (c === '/' && src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2);
    return end === -1 ? src.length : end + 2;
  }
  if (c === "'" || c === '"' || c === '`') {
    let j = i + 1;
    while (j < src.length && src[j] !== c) {
      if (src[j] === '\\') j += 1;
      j += 1;
    }
    return j + 1;
  }
  return i + 1;
}

/** Walk from an opening bracket to its match. `open`/`close` are `(`/`)` or `{`/`}`. */
function matchBracket(src, openIdx, open = '(', close = ')') {
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const next = skip(src, i);
    if (next === i + 1) {
      if (src[i] === open) depth += 1;
      else if (src[i] === close) {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    i = next;
  }
  return -1;
}

/** Split an argument list (the text BETWEEN the outer parens) on top-level commas. */
function splitArgs(inner) {
  const args = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < inner.length) {
    const next = skip(inner, i);
    if (next === i + 1) {
      const c = inner[i];
      if (c === '(' || c === '[' || c === '{') depth += 1;
      else if (c === ')' || c === ']' || c === '}') depth -= 1;
      else if (c === ',' && depth === 0) {
        args.push(inner.slice(start, i));
        start = i + 1;
      }
    }
    i = next;
  }
  const tail = inner.slice(start);
  if (tail.trim()) args.push(tail);
  return args;
}

/**
 * Find a top-level `const NAME = ...` or `function NAME(...)` in `src` and return its body text.
 *
 * Used to resolve a factory handler: `endSession('completed')` is not a handler, it BUILDS one, and
 * what the gates need to inspect is what it built.
 */
function resolveDefinition(src, name) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|function)\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) return null;
  const brace = src.indexOf('{', m.index + m[0].length);
  if (brace === -1) return null;
  const end = matchBracket(src, brace, '{', '}');
  return end === -1 ? null : src.slice(brace, end + 1);
}

const METHODS = 'get|post|patch|put|delete';

/**
 * Parse every route under `root`.
 *
 * Returns `{ files, routes, suspects }`.
 *   routes   — { file, line, key, method, route, chain, handler, via }
 *              `via` is 'inline' for an `asyncRoute(...)` handler, or the factory's name.
 *   suspects — registrations that matched `router.<method>(` but could not be parsed. A NON-EMPTY
 *              list is a build failure, not a note: see the header.
 */
export function parseRoutes(root = 'src') {
  const files = sourceFiles(root);
  const routes = [];
  const suspects = [];

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const loose = new RegExp(`router\\.(${METHODS})\\(`, 'g');
    let c;

    while ((c = loose.exec(src))) {
      const method = c[1].toUpperCase();
      const openIdx = c.index + c[0].length - 1;
      const closeIdx = matchBracket(src, openIdx);
      const line = src.slice(0, c.index).split('\n').length;
      const suspect = (why) => suspects.push({ file: rel, line, why });

      if (closeIdx === -1) {
        suspect('its argument list never closes');
        continue;
      }

      const args = splitArgs(src.slice(openIdx + 1, closeIdx));
      const pathArg = /^\s*'([^']+)'\s*$/.exec(args[0] ?? '');
      if (!pathArg) {
        suspect('its first argument is not a single-quoted path literal');
        continue;
      }
      if (args.length < 2) {
        suspect('it registers a path with no handler');
        continue;
      }

      const route = pathArg[1];
      const last = args[args.length - 1];
      const chain = args.slice(1, -1).join(',');

      // Case A — the handler is written inline. This is how 161 of 165 routes are written.
      const inline = /^\s*asyncRoute\b/.test(last);
      // Case B — the handler was BUILT by a factory called in the registration.
      const factory = inline ? null : /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(last);

      let handler;
      let via;
      if (inline) {
        handler = last;
        via = 'inline';
      } else if (factory) {
        const body = resolveDefinition(src, factory[1]);
        if (!body) {
          suspect(`its handler is built by \`${factory[1]}(...)\`, which is not defined in this file`);
          continue;
        }
        handler = body;
        via = factory[1];
      } else {
        suspect('its last argument is neither `asyncRoute(...)` nor a call to a handler factory');
        continue;
      }

      routes.push({
        file: rel,
        line,
        key: `${method} ${route}`,
        method,
        route,
        // The factory's own arguments are part of the chain for gate purposes only in the sense
        // that they are NOT middleware — the chain is what sits between the path and the handler.
        chain,
        handler,
        via,
      });
    }
  }

  return { files, routes, suspects };
}
