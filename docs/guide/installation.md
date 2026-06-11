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

## Current limitations

The CLI shell is available. Validation logic is implemented progressively across
later sprints.

This means the current Sprint 1 CLI can parse options and print shell output, but
it does not yet fetch a site, inspect an AI Manifest, inspect a Shadow Index, or
produce a real conformance result.
