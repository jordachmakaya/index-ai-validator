# CLI

The package and binary names are different:

```txt
Package: @index-ai/validator
Binary:  index-ai
```

## Basic command

Run:

```bash
index-ai https://example.com
```

When running directly from the package:

```bash
npx @index-ai/validator https://example.com
```

## Full command shape

```bash
index-ai <url> [--json] [--verbose] [--strict] [--strict-security] [--fail-on-warn] [--no-exit-code] [--timeout <ms>] [--max-concurrency <n>] [--allow-private-hosts]
```

## Options

| Option | Required | Default | Description |
| --- | ---: | --- | --- |
| `<url>` | Yes | - | Target website URL to validate. Must be supplied as the positional argument. |
| `--json` | No | `false` | Parsed by the CLI shell. Final machine-readable validation JSON output is not implemented yet. |
| `--verbose` | No | `false` | Parsed by the CLI shell. Final detailed CLI output is not implemented yet. |
| `--strict` | No | `false` | Available to `validateIndexAi()` for warning-sensitive `passed` behavior. |
| `--strict-security` | No | `false` | Parsed by the CLI shell. Security checks are not implemented yet. |
| `--fail-on-warn` | No | `false` | Available to `validateIndexAi()` for warning-sensitive `passed` behavior. |
| `--no-exit-code` | No | `false` | Parsed by the CLI shell. Final validation exit-code behavior is not implemented yet. |
| `--timeout <ms>` | No | `10000` | Used by the validation entrypoint for manifest, graph, and endpoint fetches. |
| `--max-concurrency <n>` | No | `5` | Used by the validation entrypoint to cap concurrent clean endpoint checks. |
| `--allow-private-hosts` | No | `false` | Allows private/local hosts for trusted local development. |

## STEP-1 - Run help

```bash
index-ai --help
```

This shows the current CLI command, options, and descriptions.

## STEP-2 - Run against a URL

```bash
index-ai https://example.com
```

The CLI command itself is still not the final full validator CLI behavior. Do
not use current CLI output as proof that a site passes `index-ai` Level 1 or
Level 2a.

## STEP-3 - Use the TypeScript entrypoint for current validation

Sprint 4 validation is available through `validateIndexAi()`:

```ts
import { validateIndexAi } from '@index-ai/validator'

const result = await validateIndexAi({
  target: 'https://example.com',
  strict: false,
  strictSecurity: false,
  failOnWarn: false,
  verbose: false,
  timeoutMs: 10000,
  maxConcurrency: 5,
  allowPrivateHosts: false,
})
```

`validateIndexAi()` can return `level-2a` when Level 1 and Level 2a checks pass.

## Current limitations

The CLI command is still not the final full validator CLI behavior.

Not implemented yet:

- final CLI validation report
- final JSON CLI output
- final CLI exit-code behavior
- security scanning
- discovery checks
- fixture validation
- CI validation behavior
- Level 2b relations
- Level 3 MCP
