# Installation

`@hardmachinelabs/index-ai-validator` requires Node.js 20 or newer.

The package name is:

```txt
@hardmachinelabs/index-ai-validator
```

The CLI binary is available under two equivalent aliases:

```txt
index-ai
index-ai-validator
```

Both point to the same executable.

## What you can run

The CLI has two main commands:

```txt
index-ai validate <url>   Check an Agent View / index-ai implementation.
index-ai scan <url>       Run a remote Agent View diagnostic for a public site.
```

`validate` is also the default mode:

```txt
index-ai <url>
```

is equivalent to:

```txt
index-ai validate <url>
```

Use `scan` when you want to measure agent-readiness.

Use `validate` when you want to check whether an Agent View / index-ai implementation is correct.

## STEP-1 - Check Node.js

Run:

```bash
node -v
```

Use Node.js 20 or newer.

## STEP-2 - Run without installing

Use `npx` for the default validation mode:

```bash
npx @hardmachinelabs/index-ai-validator https://example.com
```

Or make the command explicit:

```bash
npx @hardmachinelabs/index-ai-validator validate https://example.com
```

Use `scan` when you want the remote Agent View diagnostic:

```bash
npx @hardmachinelabs/index-ai-validator scan https://example.com
```

With `pnpm dlx`:

```bash
pnpm dlx @hardmachinelabs/index-ai-validator validate https://example.com
```

```bash
pnpm dlx @hardmachinelabs/index-ai-validator scan https://example.com
```

## STEP-3 - Install locally

Install the package as a development dependency:

```bash
pnpm add -D @hardmachinelabs/index-ai-validator
```

Then run the CLI through pnpm.

Validate an Agent View / index-ai implementation:

```bash
pnpm exec index-ai validate https://example.com
```

Or use the default validation mode:

```bash
pnpm exec index-ai https://example.com
```

Run a remote Agent View diagnostic:

```bash
pnpm exec index-ai scan https://example.com
```

## Verify the CLI

Show the main help:

```bash
pnpm exec index-ai --help
```

Show the scan help:

```bash
pnpm exec index-ai scan --help
```

Show the version:

```bash
pnpm exec index-ai --version
```

or:

```bash
pnpm exec index-ai -V
```

## Local development

You can validate a local development server with `validate`.

Because localhost, private IPs, and internal hostnames are treated as private infrastructure by default, pass `--allow-private-hosts` when testing locally.

```bash id="vdwf8j"
pnpm exec index-ai validate http://localhost:3000 --allow-private-hosts
```

Or with the default validation mode:

```bash id="5uykv7"
pnpm exec index-ai http://localhost:3000 --allow-private-hosts
```

For JSON output:

```bash id="nc9tpo"
pnpm exec index-ai validate http://localhost:3000 --allow-private-hosts --json --no-exit-code
```

Use this for local implementation checks before publishing your Agent View / `index-ai` files.

> [!note]
> `--allow-private-hosts` is intended for local development and trusted internal testing. For public validation runs, keep the default private-host protection enabled.

## Generate HTML reports

Generate a validation report:

```bash
pnpm exec index-ai validate https://example.com --html
```

With no path, the report is written to:

```txt
.report/validate-report.html
```

Generate a scan report:

```bash
pnpm exec index-ai scan https://example.com --html
```

With no path, the report is written to:

```txt
.report/scan-report.html
```

Both reports are standalone HTML files.

## Use JSON output

For validation automation:

```bash
pnpm exec index-ai validate https://example.com --json
```

For scan automation:

```bash
pnpm exec index-ai scan https://example.com --json
```

`--json` is intended for machine-readable output. Human-facing banner text is not printed in JSON mode.

## Scope

`validate` covers the current local `index-ai` Level 1 and Level 2a validation scope.

`scan` calls the remote Agent View scanner and depends on scanner service availability.

For what the package does and does not check, see [Scope](/guide/scope).
