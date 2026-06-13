# Installation

`@index-ai/validator` requires Node.js 20 or newer.

The package name is:

```txt
@index-ai/validator
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
npx @index-ai/validator https://example.com
```

Or use `pnpm dlx`:

```bash
pnpm dlx @index-ai/validator https://example.com
```

## STEP-3 - Install locally

Install the package as a development dependency:

```bash
pnpm add -D @index-ai/validator
```

Then run the CLI through pnpm:

```bash
pnpm exec index-ai https://example.com
```

## Current implementation state

Sprint 4 implements Level 1 AI Manifest validation and Level 2a Shadow Index
validation through `validateIndexAi()`.

The CLI command itself is still not the final full validator CLI behavior. Final
CLI JSON output, final exit-code behavior, fixture validation, and CI behavior
are later work.

## Current limitations

The package does not yet implement:

- security scanning
- discovery checks
- fixture validation
- final CI validation behavior
- final CLI JSON output
- final CLI exit-code behavior
- Level 2b relations
- Level 3 MCP
