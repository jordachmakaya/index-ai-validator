---
title: check-error-registry.mjs — Documentation
description: Comprehensive reference for the error registry validation script — what it scans, how it parses ERRORS.md, failure types, flags, CI integration, and pre-commit setup.
type: reference
status: current
job_ref: setup
last_update: 2026-06-29
---

# check-error-registry.mjs

Validates the project's error code registry.

Ensures every `static readonly CODE = 'SECTOR-NNN'` declared in source files is
registered in `ERRORS.md`, and that no registered code is stale (points to a
class that no longer exists). Exits non-zero on failure so it can gate CI and
pre-commit hooks.

**Rule reference:** `.shokunin/rules/RULE_ErrorRegistry.md`

---

## Quick start

```bash
# Run directly
node scripts/check-error-registry.mjs

# Via package.json
pnpm run errors:check
pnpm run errors:check:strict
pnpm run errors:check:json
```

---

## Usage

```
node scripts/check-error-registry.mjs [--strict] [--json]
```

### Flags

| Flag       | Effect                                                                           |
| ---------- | -------------------------------------------------------------------------------- |
| _(none)_   | Human-readable coloured output. Warnings do not fail the exit code.              |
| `--strict` | Promotes all warnings to errors. Any warning causes exit 1.                     |
| `--json`   | Outputs a machine-readable JSON object instead of coloured text (see §6).       |

### Exit codes

| Code | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| `0`  | Registry is clean (no errors; in non-strict mode, warnings are OK)    |
| `1`  | One or more errors found (or warnings in `--strict` mode)             |

---

## What the script scans

### Source files

The script walks `src/` recursively and reads every file with one of these
extensions:

```
.ts   .tsx   .mts   .cts
```

The following directories are skipped unconditionally regardless of depth:

```
node_modules/   dist/   coverage/   .turbo/   .git/   .cache/
```

If `src/` does not exist (e.g., a freshly scaffolded blueprint), the script
exits `0` with a `NO_REGISTRY` warning only if `ERRORS.md` is also absent.
This is the expected state before the first error class is written.

### Pattern matched in source

```
static readonly CODE = 'SECTOR-NNN'
static readonly CODE = "SECTOR-NNN"
```

With optional `as const` and any surrounding whitespace. The captured group
must match:

```
/^[A-Z]{2,8}-\d{3}$/
```

Examples matched:

```ts
static readonly CODE = 'USER-001' as const       ✓
static readonly CODE = "BILLING-042"              ✓
static readonly CODE = 'AUTH-007' as const        ✓
```

Examples NOT matched (intentionally excluded):

```ts
static readonly CODE = 'DATABASE_ERROR'    ✗  no SECTOR-NNN format
static readonly CODE = 'user-001'          ✗  lowercase sector
static readonly CODE = 'US-001'            ✗  sector < 2 chars
static readonly CODE = 'TOOLONGNAME-001'   ✗  sector > 8 chars
static readonly CODE = 'USER-1'            ✗  number not zero-padded to 3 digits
```

> Infrastructure base error codes (`'DATABASE_ERROR'`, `'EXTERNAL_SERVICE_ERROR'`,
> etc.) are excluded by design — they use generic string identifiers and are
> internal-only, never registered in `ERRORS.md`.

### ERRORS.md parsing

The script reads `.shokunin/errors/ERRORS.md` from the project root and extracts codes from
markdown table rows. A table row registers a code when its first pipe-delimited
cell exactly matches `SECTOR-NNN`:

```
| USER-001 | domain | UserNotFoundError | ...
  ^^^^^^^^
  extracted
```

The extraction regex:

```
/^\|\s*([A-Z]{2,8}-\d{3})\s*\|/gm
```

Rules for `ERRORS.md` formatting:
- The code **must be in the first cell** of a table row.
- Leading and trailing whitespace around the code is trimmed automatically.
- Header rows (e.g., `| Code | Layer | ...`) are ignored because `Code` does
  not match `[A-Z]{2,8}-\d{3}`.
- Comment lines (`<!-- ... -->`) are ignored by the regex.

---

## Failure types

### `UNREGISTERED` — error (always blocks)

A `static readonly CODE` matching `SECTOR-NNN` exists in source but has no
corresponding row in `ERRORS.md`.

```
✗ [ERR:UNREGISTERED] Code "USER-003" is not registered in ERRORS.md
         Declared at src/user/domain/errors/user-blocked.error.ts:8
```

**Fix:** Add a row to `ERRORS.md` in the correct sector section.

---

### `STALE` — warning (blocks in `--strict`)

A code exists in `ERRORS.md` but no `static readonly CODE` matching it was
found anywhere in `src/`.

```
⚠ [WRN:STALE_ENTRY] Code "AUTH-003" is in ERRORS.md but has no matching class in source
         Remove the row or restore the error class
```

**Fix:** Either delete the row from `ERRORS.md` (if the class was intentionally
removed) or restore the error class.

> Stale entries are warnings by default, not errors, because a class might be
> temporarily removed during a refactor without `ERRORS.md` being updated yet.
> Use `--strict` in CI to treat them as errors.

---

### `DUPLICATE` — error (always blocks)

The same `SECTOR-NNN` code appears in `static readonly CODE` in two or more
source files.

```
✗ [ERR:DUPLICATE_CODE] Code "USER-001" is declared in 2 files
         src/user/domain/errors/user-not-found.error.ts:8
         src/user/domain/errors/user-inactive.error.ts:6
```

**Fix:** Assign a new unique code to one of the classes and register it in
`ERRORS.md`.

---

### `NO_REGISTRY` — conditional

`ERRORS.md` does not exist.

- If `src/` also has no `SECTOR-NNN` codes → **warning** (blueprint state, acceptable).
- If `src/` has `SECTOR-NNN` codes → **error** (registry is missing but codes exist).

```
✗ [ERR:NO_REGISTRY] ERRORS.md not found but SECTOR-NNN codes exist in source
         Run: touch ERRORS.md and register the 3 code(s) listed below
```

---

## Output formats

### Human (default)

Coloured, one issue per line with an indented detail. Summary at the bottom.

```
Error Registry Validator
Source: src/  |  Registry: ERRORS.md

  ✗ [ERR:UNREGISTERED] Code "USER-003" is not registered in ERRORS.md
         Declared at src/user/domain/errors/user-blocked.error.ts:8
  ⚠ [WRN:STALE_ENTRY] Code "AUTH-003" is in ERRORS.md but has no matching class in source
         Remove the row or restore the error class

Summary
  ✗ Errors  : 1
  ⚠ Warnings: 1

Fix the issues above before committing.
```

Clean output:

```
Error Registry Validator
Source: src/  |  Registry: ERRORS.md

✓ Registry is clean.
```

### JSON (`--json`)

```json
{
  "errors": 1,
  "warnings": 1,
  "findings": [
    {
      "level": "error",
      "code": "UNREGISTERED",
      "message": "Code \"USER-003\" is not registered in ERRORS.md",
      "detail": "Declared at src/user/domain/errors/user-blocked.error.ts:8"
    },
    {
      "level": "warn",
      "code": "STALE_ENTRY",
      "message": "Code \"AUTH-003\" is in ERRORS.md but has no matching class in source",
      "detail": "Remove the row or restore the error class"
    }
  ]
}
```

Use `--json` in CI pipelines that parse script output programmatically, or when
integrating with a dashboard.

---

## CI integration

### GitHub Actions

```yaml
# .github/workflows/validate.yml

name: Validate

on: [push, pull_request]

jobs:
  error-registry:
    name: Error registry
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Check error registry
        run: node scripts/check-error-registry.mjs --strict
```

Use `--strict` in CI so stale entries are also caught — the registry must be
fully clean before a merge.

---

## Pre-commit hook

Using [simple-git-hooks](https://github.com/toplevel-codes/simple-git-hooks):

```json
// package.json
{
  "simple-git-hooks": {
    "pre-commit": "node scripts/check-error-registry.mjs --strict"
  }
}
```

Using [husky](https://typicode.github.io/husky/):

```bash
# .husky/pre-commit
node scripts/check-error-registry.mjs --strict
```

The pre-commit hook prevents committing unregistered error codes or stale
entries in `ERRORS.md`.

---

## No external dependencies

The script uses only Node.js built-in modules:

```
fs      — readFileSync, readdirSync, statSync
path    — join, relative, extname, dirname
url     — fileURLToPath
```

No `npm install` is required. It runs on any project regardless of package
manager or dependencies.

Minimum Node.js version: **20** (ESM, `import.meta.url`).

---

## Adding a new error class — checklist

When the script fails with `UNREGISTERED`, follow these steps:

```
1. Confirm the sector from the module folder: src/{module}/ → {SECTOR}
2. Find the highest existing NNN for that sector in ERRORS.md
3. Assign {SECTOR}-{NNN+1} as the static readonly CODE
4. Add the row to ERRORS.md under the ## {SECTOR} section:

   | {SECTOR}-{NNN} | domain/application | ClassName | Description | Likely cause | src/path/ |

5. Run: node scripts/check-error-registry.mjs
6. Confirm exit 0 before committing
```

---

## Troubleshooting

**`.shokunin/errors/ERRORS.md` not found`**

Create the file at `.shokunin/errors/ERRORS.md` using the template provided by
the `shokunin-error-handling` skill. At minimum the file must exist; it can be
empty or contain only the sector table.

---

**`Code "X" is declared in 2 files`**

Two error classes share the same code. Find both with:

```bash
grep -rn "SECTOR-NNN" src/
```

Assign a new unused number to one class, add the new row to `ERRORS.md`, and
re-run the script.

---

**`Code is in ERRORS.md but has no matching class`**

The class was likely removed or renamed. Grep to confirm:

```bash
grep -rn "SECTOR-NNN" src/
```

If the class is gone, delete the row from `ERRORS.md`. If it was renamed,
update the class name column only — the code `SECTOR-NNN` stays stable.

---

**Script reports no issues but I know a class exists**

Check that the class uses the exact pattern:

```ts
static readonly CODE = 'SECTOR-NNN' as const
```

Not:

```ts
readonly CODE = 'SECTOR-NNN'           ✗  missing static
static CODE = 'SECTOR-NNN'             ✗  missing readonly
static readonly code = 'SECTOR-NNN'    ✗  lowercase property name
```

Also confirm the file extension is `.ts`, `.tsx`, `.mts`, or `.cts` and lives
under `src/`.
