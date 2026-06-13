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

## Verify the CLI

```bash
index-ai --help
```

The CLI calls `validateIndexAi()`, prints a deterministic human report by
default, and supports stable JSON output with `--json`.

## Current limitations

The package does not validate:

- full security audits
- vulnerability scanning
- discovery crawling
- sitemap validation
- DNS TXT discovery validation
- fixture validation
- Level 2b relations
- Level 3 MCP
