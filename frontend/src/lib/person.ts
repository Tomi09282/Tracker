/**
 * How a person is named on screen — one function, because there are six places that have to agree.
 *
 * ═══ WHAT THIS REPLACED ════════════════════════════════════════════════════════════════════════
 *
 * Until migration 029 the `users` table had no name column at all, so every screen that needed to
 * name somebody printed their e-mail address: `<h1>demo.farkas.nora@tracker.local</h1>` on the
 * client detail page, the same string on each roster row, in the archive confirmation, in the plan
 * assignment list. The monogram took its two letters from it as well.
 *
 * That was three separate problems, and only the first one was cosmetic:
 *
 *   1. It is not what the design says. Every mockup shows a name.
 *   2. It is a privacy leak. A coach with forty clients had forty working, deliverable addresses
 *      on one screen — readable over a shoulder, lifted whole in one screenshot. Nothing about
 *      coaching needs that; the coach needs to know WHICH client, and there is an id for that.
 *   3. An address is not stable. Change it and every screen silently renames the person.
 *
 * ═══ WHY THE FALLBACK IS THE LOCAL PART AND NOT THE ADDRESS ════════════════════════════════════
 *
 * `display_name` is nullable and legitimately so — a coach-created account whose owner has never
 * signed in cannot have chosen a name yet, and nobody is ever forced to. So there IS a fallback,
 * and choosing the full address for it would undo reason 2 in the same line of code that was
 * written to satisfy reason 1.
 *
 * The local part identifies without delivering: `demo.lukacs.adam` tells the coach exactly which
 * account they created and cannot be pasted into a mail client. Where the address itself is the
 * subject — the account section of Settings, the admin user search — it is still shown in full,
 * under a label that says so. That is a field, not a name.
 *
 * ═══ THE SHAPE ════════════════════════════════════════════════════════════════════════════════
 *
 * `display_name`, snake_case, because that is what the API sends and renaming it on the way in
 * means two names for one field and a mapper to keep in step. The optional/nullable pair is
 * deliberate: `undefined` is "this endpoint does not send it", `null` is "this person has not set
 * one". Both fall back, but they are not the same fact and a future caller may need to tell them
 * apart.
 */
export interface Person {
  email: string;
  display_name?: string | null;
}

/** The name to print. Never an e-mail address. */
export function personLabel(person: Person): string {
  const name = person.display_name?.trim();
  if (name) return name;
  // `@` is guaranteed by the address itself; `split` on a string without one returns the whole
  // string, which is still the right answer rather than an empty label.
  return person.email.split('@')[0];
}

/**
 * Two letters for the avatar stand-in — the ONE definition.
 *
 * ═══ THERE WERE FIVE ═══════════════════════════════════════════════════════════════════════════
 *
 * `ChatPanel`, `ComposePage`, `ProfileEditorPage`, `PublicChrome` and `Monogram` each grew their
 * own, and they had already drifted into producing different answers for the same person:
 *
 *   name          chat   compose   profile-editor   public   monogram
 *   Farkas Nóra   FN     FN        FN               FN       DE  ← sliced the e-mail
 *   Madonna       MA     M         M                M        DE
 *   (empty)       ""     ""        ·                ""       ""
 *   👩‍🦰 Anna       ?      broken    broken           ?A       DE
 *
 * Four of the five differences are invisible until the one input that triggers them shows up, and
 * the surrogate-pair one corrupts the glyph rather than shortening it — `name[0]` on an emoji
 * returns half a character. This function takes the correct behaviour from each of them:
 *
 *   * two words → one initial each, which is what makes a monogram read as a monogram
 *   * one word → its first TWO characters, from the chat panel: `M` alone is not a monogram
 *   * `[...word][0]`, from the public chrome: iterating a string yields whole code points,
 *     indexing it yields UTF-16 units, and a name with an emoji or an astral character in it
 *     breaks apart under the second
 *   * `·` for nothing at all, from the profile editor — the only one that handled an empty field,
 *     which is the state a live editor is in on every first keystroke
 *   * `toLocaleUpperCase()`, from the public chrome: `i` upper-cases differently in Turkish, and
 *     this app ships three languages already
 *
 * It also splits on `._-`, so an e-mail local part used as a fallback (`lukacs.adam`) yields `LA`
 * rather than `LU`.
 */
export function initialsOf(label: string): string {
  const words = label.trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return '·';
  const letters =
    words.length >= 2
      ? `${[...words[0]][0] ?? ''}${[...words[1]][0] ?? ''}`
      : [...words[0]].slice(0, 2).join('');
  return letters.toLocaleUpperCase();
}

/** The same two letters, for a record rather than a string. Same fallback, by construction. */
export function personInitials(person: Person): string {
  return initialsOf(personLabel(person));
}

/**
 * Is this a name the server will accept?
 *
 * THE THIRD STATEMENT OF ONE RULE, and it cannot be helped: the rule has to hold in the database
 * (029's CHECK), be reported as a readable error by the API (`DisplayNamePatch` in
 * `backend/src/auth/routes.js`), and disable a button here before the user presses it. Three
 * runtimes, no shared module. What CAN be helped is the three disagreeing, so all three now count
 * the same unit and this comment names the other two.
 *
 * The unit is CODE POINTS, because that is what SQLite's `length()` counts. Counting `.length`
 * instead — UTF-16 code units — is what let a single emoji through the first version of the
 * endpoint: `'🎉'.length` is 2, so it passed a `min(2)` bound that the database then measured as 1
 * and refused, with a message that explained nothing to the person who typed it.
 *
 * Empty is `true` here and not a name at all: clearing the field is how you remove your name, and
 * the caller sends `null` rather than `''`.
 */
export function isValidDisplayName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  // Mirrors CONTROLS in the route: C0, DEL + C1, and the bidi overrides and isolates, which can
  // re-order the text around them and rewrite how a whole roster row reads.
  if (new RegExp([
    '[',
    '\\u0000-\\u001F',
    '\\u007F-\\u009F',
    '\\u202A-\\u202E',
    '\\u2066-\\u2069',
    ']',
  ].join('')).test(trimmed)) return false;
  const points = [...trimmed].length;
  return points >= 2 && points <= 120;
}
