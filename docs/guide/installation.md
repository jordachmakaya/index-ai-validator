# Installation

`@hardmachinelabs/index-ai-validator` requires Node.js 20 or newer.

The package name is:

```txt
@hardmachinelabs/index-ai-validator
```

The CLI binary is:

```txt
index-ai
```

## STEP-1 - Check Node.js

Run:

```bash
node -v
```

Use Node.js 20 or newer.

## STEP-2 - Run without installing

Use `npx`:

```bash
npx @hardmachinelabs/index-ai-validator https://example.com
```

Or use `pnpm dlx`:

```bash
pnpm dlx @hardmachinelabs/index-ai-validator https://example.com
```

## STEP-3 - Install locally

Install the package as a development dependency:

```bash
pnpm add -D @hardmachinelabs/index-ai-validator
```

Then run the CLI through pnpm:

```bash
pnpm exec index-ai https://example.com
```

## Verify the CLI

```bash
index-ai --help
```

The CLI calls `validateIndexAi()`, prints a deterministic human report by
default, and supports stable JSON output with `--json`.

## Scope

The validator covers `index-ai` Level 1 and Level 2a. For what it does and does
not check, see [Scope](/guide/scope).
