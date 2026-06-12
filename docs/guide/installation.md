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

The CLI shell is available. It can parse options and print shell output, but the
CLI command itself is still not the final full validator CLI.

Sprint 2 added the runtime utility foundation for HTTP fetch policy, timeouts,
redirect caps, private-host blocking, URL normalization, same-origin checks,
Unicode NFC `content_chars` counting, and concurrency limiting.

Sprint 3 adds Level 1 AI Manifest validation through `validateIndexAi()`.

Later work still includes:

- Shadow Index validation
- full Level 2a validation
- graph validation
- `content_chars` comparison on live websites
- security checks
- discovery checks
- fixture validation
- CI behavior
