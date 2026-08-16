# Developer tooling

Why this design: every other reference file states an invariant ("config funnels through the zod env
object", "the backend uses pino, never `console.*`", "relative ESM imports carry `.js`"). This file
makes those invariants **mechanically enforced on your machine** — a lint rule that fails, a formatter
that rewrites, a type-checker that catches a wrong row shape — before the code reaches CI or
[supply-chain-security](supply-chain-security.md)'s gates. One flat ESLint config, one Prettier
config, one Node version, one `tsconfig.json` type-checking the `.js` backend without a rewrite, and a
`package.json` scripts block that is the single menu of every task. Local hooks stay **fast** (staged
files only); the heavy `verify` sequence lives in CI. It enforces the `process.env`-only-in-`env.js`
rule from [env-and-secrets](env-and-secrets.md), pino-only logging from
[observability](observability.md), and the `api()` wrapper from
[frontend-conventions](frontend-conventions.md).

---

## 1. ESLint flat config with security rule sets [must]

**Rationale:** a single ESM-native `eslint.config.js` at the repo root lets one file lint both the
`.js` backend and the `.ts` frontend, and encode the project's hard rules (no `process.env` outside
`env.js`, no `console.*` in the app code, `node:` prefix + `.js` on relative imports) as lint errors.

```js
// eslint.config.js — flat config, ESM (matches "type":"module"). Order matters: prettier LAST.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';
import importPlugin from 'eslint-plugin-import';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// eslint-plugin-react-hooks keeps reshaping its presets: `recommended-latest` is a flat-config
// OBJECT in v5.2/v7 but a flat-config ARRAY in v6, where `.rules` is undefined — and spreading
// undefined silently applies zero rules. Normalise once so the ruleset survives a major upgrade.
const rhPreset = reactHooks.configs['recommended-latest'];
const reactHooksRules = (Array.isArray(rhPreset) ? rhPreset[0] : rhPreset).rules;

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'data/', 'logs/', 'node_modules/'] },

  // Baseline for every file.
  js.configs.recommended,
  security.configs.recommended, // detects unsafe RegExp, non-literal fs paths, child_process, etc.

  // ---- Backend: .js ES modules, type-aware via the same tsconfig as §3. ----
  {
    files: ['src/**/*.js', '*.js', 'scripts/**/*.js'],
    languageOptions: {
      parser: tseslint.parser, // parse .js with the TS parser so type-aware rules work on JSDoc
      parserOptions: {
        // Root-level *.js (this config, run-server.js, cluster.js) sit outside tsconfig's include;
        // without allowDefaultProject the project service refuses to parse them and lint fails.
        projectService: { allowDefaultProject: ['*.js'] },
        ecmaVersion: 2023,
        sourceType: 'module',
      },
      // js.configs.recommended turns on no-undef — hand-listing a few globals would make
      // setTimeout, URL, fetch, crypto, etc. false-positive across the whole backend.
      globals: globals.node,
    },
    plugins: { import: importPlugin, 'no-secrets': noSecrets },
    rules: {
      // Every relative import MUST end in .js and every builtin MUST use node: — otherwise the
      // NodeNext resolver (§3) and the real runtime disagree and the app crashes at import time.
      'import/extensions': ['error', 'always', { ignorePackages: true }],
      'import/no-unresolved': 'off', // the TS resolver in §3 owns this; import plugin double-flags ESM
      // High-entropy string literals (a pasted key/token) never belong in source.
      'no-secrets/no-secrets': ['error', { tolerance: 4.2 }],
      // Hard rule: process.env is read ONLY in src/lib/env.js, which validates it with zod
      // (env-and-secrets.md). Everywhere else, import the typed `env` object instead.
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Import the validated env object from src/lib/env.js — never read process.env directly.' },
      ],
    },
  },
  // Application code logs through pino, never console.* (observability.md). Scoped to src/ only:
  // the root supervisors run-server.js / cluster.js and the secrets:gen script (§6) legitimately
  // use console before the logger exists (server-skeleton.md), so the ban must not reach them.
  {
    files: ['src/**/*.js'],
    rules: { 'no-console': 'error' },
  },
  // env.js is the ONE place allowed to touch process.env, and it must console.error the fatal
  // boot message before the pino logger is importable (env-and-secrets.md) — lift both bans here.
  {
    files: ['src/lib/env.js'],
    rules: { 'no-restricted-properties': 'off', 'no-console': 'off' },
  },

  // ---- Frontend: .ts/.tsx, React + a11y. ----
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({ ...c, files: ['frontend/**/*.{ts,tsx}'] })),
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooksRules, // exhaustive-deps: stops stale-closure bugs (normalised above)
      ...jsxA11y.flatConfigs.recommended.rules,
      // Tokens never live in localStorage (frontend-conventions.md) — cookies are HttpOnly.
      'no-restricted-properties': ['error', { object: 'localStorage', property: 'setItem', message: 'No auth tokens in localStorage — see frontend-conventions.md.' }],
    },
  },

  // MUST be last: turns off every ESLint rule that Prettier already owns (§2). Zero conflicts.
  prettier,
);
```

Install: `npm i -D eslint @eslint/js typescript-eslint eslint-plugin-security eslint-plugin-no-secrets eslint-plugin-import eslint-plugin-react-hooks eslint-plugin-jsx-a11y eslint-config-prettier globals`.

## 2. Prettier + eslint-config-prettier [must]

**Rationale:** Prettier owns *formatting* and ESLint owns *correctness*; appending
`eslint-config-prettier` last (§1) switches off ESLint's stylistic rules so the two never fight over
the same line.

```json
// .prettierrc — printWidth 100 matches the line length of these reference files.
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all",
  "arrowParens": "always"
}
```

```gitignore
# .prettierignore — never rewrite data, logs, build output, or SQL/DB fixtures.
data/
logs/
dist/
coverage/
*.db
*.db-wal
*.db-shm
*.sql
package-lock.json
```

Scripts (see §6): `format` writes, `format:check` verifies in CI without mutating the tree.

## 3. Backend type-checking via JSDoc + checkJs (no rewrite) [must]

**Rationale:** the backend stays plain `.js` ES modules — no build step, no transpile — but a
`tsconfig.json` with `checkJs` turns `tsc` into a type-checker that reads JSDoc, so a wrong prepared-
statement row shape or a mistyped worker payload fails `npm run typecheck` instead of at runtime.

```jsonc
// tsconfig.json — type-CHECKS the backend .js; emits nothing. Frontend has its own tsconfig (Vite).
{
  "compilerOptions": {
    "checkJs": true,
    "allowJs": true,
    "noEmit": true,
    "strict": true,
    // NodeNext is MANDATORY: it is the only mode where the `node:` prefix and `.js` relative
    // specifiers (§1) type-resolve the same way the real ESM runtime resolves them.
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "types": ["node"],
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.js", "scripts/**/*.js"],
  "exclude": ["node_modules", "dist", "frontend"]
}
```

Install: `npm i -D typescript @types/node` — `"types": ["node"]` hard-fails (TS2688) without
`@types/node`, and `typecheck` needs `tsc` as a declared dep, not a hoisted peer of typescript-eslint.

Type the **seams** where a wrong shape is silent — the env object, the worker task payloads, the row
shapes, and the `api()` contract:

```js
// src/lib/env.js — infer the public env type straight from the zod schema (env-and-secrets.md).
/** @typedef {import('zod').infer<typeof EnvSchema>} Env */
/** @type {Env} */ export const env = parsed.data;

// src/db/worker.js — the Piscina task payload/result contract, checked on both sides of the pool.
/** @typedef {{ kind:'all'|'get'|'run', sql:string, params?:unknown[] }} DbTask */
/** @typedef {{ id:number, email:string, role:string }} UserRow */

// src/db/index.js — parameterise the facade so callers get the row type back, not `any`.
/** @template T @param {string} sql @param {unknown[]} [params] @returns {Promise<T[]>} */
export async function all(sql, params) { /* ... dispatch to the pool ... */ }
```

```ts
// frontend/src/lib/api.ts — one generic wrapper (frontend-conventions.md); callers state the shape.
export async function api<T>(path: string, init?: RequestInit): Promise<T> { /* fetch + X-CSRF */ }
```

`typecheck` runs `tsc --noEmit`. The frontend already gets `strict` from Vite; this extends the same
guarantee across the wire so a backend `UserRow` and its frontend consumer can't drift.

## 4. husky + lint-staged pre-commit hook [must]

**Rationale:** the hook keeps commits clean by linting and formatting **only the staged files** — it
is the fast last-line check; the full `typecheck` + `test` run belongs in CI (and commit-msg, §5),
not on every commit where it would make committing painful.

```jsonc
// package.json (fragments)
{
  "scripts": { "prepare": "husky" }, // husky v9: `npm run prepare` installs the git hooks
  "lint-staged": {
    "*.{js,ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

```sh
# .husky/pre-commit — husky v9 hooks are plain scripts (no more sourcing husky.sh).
npx lint-staged
```

Install: `npm i -D husky lint-staged`, then `npm run prepare` once. lint-staged passes only the
staged paths to each command, so a 2-file commit never lints the whole tree.

## 5. commitlint + Conventional Commits (commit-msg hook) [should]

**Rationale:** Conventional Commits give every message a machine-readable `type(scope):` prefix, so a
`security`-scoped fix or a `BREAKING CHANGE` footer becomes a signal release tooling can act on —
enforced by a `commit-msg` hook so a non-conforming message is rejected at commit time.

```js
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow a `security` type alongside the full config-conventional default set, so security
    // fixes are greppable in history without rejecting any of the standard types.
    'type-enum': [2, 'always', ['feat', 'fix', 'perf', 'refactor', 'style', 'revert', 'chore', 'docs', 'test', 'build', 'ci', 'security']],
  },
};
```

```sh
# .husky/commit-msg — validate the message the developer just wrote.
npx --no -- commitlint --edit "$1"
```

Install: `npm i -D @commitlint/cli @commitlint/config-conventional`. Optional guided prompt:
`npm i -D cz-git commitizen`, add `"commit": "cz"` to scripts (§6) for `npm run commit`.

## 6. npm-scripts as the canonical task runner [should]

**Rationale:** one flat, discoverable scripts block is the single menu of every task — a newcomer runs
`npm run` and sees the whole surface; CI runs the exact same `verify` sequence a developer runs
locally, so "passes on my machine" and "passes in CI" cannot diverge.

```jsonc
// package.json — thin, composable scripts. `verify` is the exact gate CI runs.
{
  "scripts": {
    "dev": "node run-server.js",
    "dev:all": "npm-run-all --parallel dev fe:dev", // backend + vite together (real parallelism)
    "fe:dev": "npm --prefix frontend run dev",
    "start": "node cluster.js",

    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",

    "test": "vitest run",
    "test:cov": "vitest run --coverage",
    "build": "npm --prefix frontend run build",

    "db:migrate": "node scripts/migrate.js",
    "db:rekey": "node scripts/rekey.js",                       // env-and-secrets.md rekey procedure
    "secrets:gen": "node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"",

    // The one command that must pass before merge — CI runs this verbatim (supply-chain-security.md).
    // format:check is here because eslint-config-prettier (§1) strips formatting from lint —
    // without it nothing in the gate checks formatting at all.
    "verify": "npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build",
    "prepare": "husky"
  }
}
```

Reach for `npm-run-all` (or `concurrently`) **only** where genuine parallelism helps, like
`dev:all`; sequential gates stay `&&`-chained so the first failure stops the run. Install the one
parallel helper: `npm i -D npm-run-all`.

## 7. Devcontainer / Docker dev env (Linux parity for the native module) [should]

**Rationale:** `better-sqlite3-multiple-ciphers` ships a C++ addon compiled per Node/ABI; a
devcontainer on the **same base image as production** ([deployment](deployment.md)) with the build
toolchain guarantees the native binary you develop against matches the one that ships — critical on a
Windows-primary machine where a locally built addon has the wrong ABI for the Linux runtime.

```jsonc
// .devcontainer/devcontainer.json
{
  "name": "app-dev",
  // Same major as .nvmrc (§8) and the Dockerfile base — one Node version everywhere.
  "image": "mcr.microsoft.com/devcontainers/javascript-node:22-bookworm",
  "features": {
    // common-utils sets up a sane shell/user; the compiler toolchain (python3 + make + g++) is
    // installed by onCreateCommand below so node-gyp can build the encrypted-SQLite addon.
    "ghcr.io/devcontainers/features/common-utils:2": {}
  },
  "onCreateCommand": "sudo apt-get update && sudo apt-get install -y python3 make g++ && npm ci",
  "forwardPorts": [3000],
  // Keep the encrypted DB and audit log OUT of the image — they live on the host mount only.
  "mounts": [],
  "remoteUser": "node"
}
```

The production `Dockerfile` (multi-stage build → slim runtime, non-root `node`) lives in
[deployment](deployment.md); it uses this same `node:22-bookworm` base so the addon compiled in the
build stage runs unchanged in the runtime stage. `data/` and `logs/` stay on volumes, never baked in.

## 8. .editorconfig for cross-editor baseline [should]

**Rationale:** `lf` line endings are non-negotiable on a Windows-primary machine — a stray `crlf`
turns every file into a noisy diff and makes Prettier/lint-staged (§2, §4) rewrite lines nobody
touched; `.editorconfig` fixes the newline, charset, and indent before the editor even saves.

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf              # critical on Windows: keeps git diffs and the lint-staged pipeline clean
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false   # two trailing spaces are a hard line break in Markdown

[*.{sql,db}]
insert_final_newline = false
```

Pair it with a repo `.gitattributes` line `* text=auto eol=lf` so git normalises on checkout too —
belt and braces against CRLF creeping back in through a clone on Windows.

## 9. .nvmrc + engines pin (Node LTS lock) [must]

**Rationale:** one Node version — local, CI, and devcontainer — is a single source of truth; the
`engines` range plus `engine-strict` makes an install on the wrong major **fail loudly** instead of
producing an addon compiled against an ABI production doesn't have.

```
# .nvmrc — the exact LTS line; `nvm use` reads it, CI reads it via node-version-file.
22
```

```jsonc
// package.json — declare the supported range; CI (supply-chain-security.md) reads .nvmrc, not this.
{ "engines": { "node": ">=22 <23" } }
```

```ini
# .npmrc — hard-fail an install on the wrong Node major instead of warning and continuing.
engine-strict=true
```

CI pins with `node-version-file: '.nvmrc'` (see the setup-node step in
[supply-chain-security](supply-chain-security.md)), so `.nvmrc` is the one file that dictates the Node
version in every environment; `engines` documents and enforces the same range at install time.