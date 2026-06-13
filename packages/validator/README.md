# @index-ai/validator

Experimental free CLI validator for `index-ai` Level 1 and Level 2a.

The package provides the `index-ai` binary and the `validateIndexAi()`
TypeScript entrypoint. It checks whether a public website exposes the current
agent-facing files and clean endpoints expected by `index-ai` Level 1 and Level
2a.

Naming:

- Repository: `index-ai-validator`
- Package: `@index-ai/validator`
- CLI binary: `index-ai`
- Specification validated: `index-ai`

It is a developer validator, not a production certification, legal compliance
tool, traffic guarantee, SEO ranking tool, security audit, or vulnerability
scanner.

## Installation / run with npx

Run without installing:

```bash
npx @index-ai/validator https://example.com
```

Or with pnpm:

```bash
pnpm dlx @index-ai/validator https://example.com
```

Local install:

```bash
pnpm add -D @index-ai/validator
pnpm exec index-ai https://example.com
```

Requires Node.js 20 or newer.

## CLI Usage

```bash
index-ai <url> [options]
```

Examples:

```bash
index-ai https://example.com
index-ai https://example.com --json
index-ai https://example.com --strict
index-ai https://example.com --fail-on-warn
index-ai https://example.com --strict-security
index-ai https://example.com --allow-private-hosts
index-ai https://example.com --no-exit-code
index-ai https://example.com --timeout 10000
index-ai https://example.com --max-concurrency 5
```

| Option | Required | Default | Description |
| --- | ---: | --- | --- |
| `<url>` | Yes | - | Target website URL. Must use `http` or `https`. |
| `--json` | No | `false` | Prints stable machine-readable JSON to stdout. |
| `--verbose` | No | `false` | Includes passing checks in human output. |
| `--strict` | No | `false` | Makes SHOULD-level warnings fail the global verdict. |
| `--strict-security` | No | `false` | Upgrades private infrastructure findings from warn to fail. |
| `--fail-on-warn` | No | `false` | Makes any warning fail the global verdict. |
| `--no-exit-code` | No | `false` | Returns exit code `0` for validation failures only. |
| `--timeout <ms>` | No | `10000` | Request timeout in milliseconds. |
| `--max-concurrency <n>` | No | `5` | Maximum concurrent clean endpoint checks. |
| `--allow-private-hosts` | No | `false` | Allows private/local hosts for trusted local development. |

## JSON output

Use JSON mode for CI and machine ingestion:

```bash
index-ai https://example.com --json
```

In JSON mode, stdout contains only JSON. Normal validation results do not use
stderr. Usage, configuration, or runtime errors before a validation result use
stderr and exit with code `2`.

Example shape:

```json
{
  "schema_version": "0.1",
  "target": "https://example.com",
  "generated_at": "2026-06-12T00:00:00.000Z",
  "duration_ms": 42,
  "conformance": "level-2a",
  "passed": true,
  "summary": {
    "pass": 12,
    "warn": 0,
    "fail": 0,
    "total": 12
  },
  "metrics": {
    "manifest_found": true
  },
  "checks": []
}
```

The real `metrics` object contains the implemented validator counters. The real
`checks` array contains check objects with stable codes, severity, messages,
and fixes where available.

## Human output

Without `--json`, the CLI prints a deterministic summary-first report:

```txt
index-ai validation result

Target: https://example.com
Duration: 42 ms
Conformance: level-2a
Passed: true

Summary:
- pass: 12
- warn: 0
- fail: 0
- total: 12
```

Failures and warnings are shown with check codes and fixes where available.
Passing checks are shown only with `--verbose`.

## Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | A validation result exists and `passed` is `true`. |
| `1` | A validation result exists and `passed` is `false`. |
| `2` | No validation result exists because usage, configuration, or runtime setup failed. |

`--no-exit-code` changes validation failures from exit code `1` to exit code
`0`. It does not hide usage, configuration, or runtime errors that happen before
a validation result exists.

## TypeScript Usage

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

| Option | Required | Default | Description |
| --- | ---: | --- | --- |
| `target` | Yes | - | Target website URL. Must use `http` or `https`. |
| `strict` | No | `false` | Makes SHOULD-level warnings fail the global verdict. |
| `strictSecurity` | No | `false` | Upgrades private infrastructure findings from warn to fail. |
| `failOnWarn` | No | `false` | Makes any warning fail the global verdict. |
| `verbose` | No | `false` | Used by CLI output detail. |
| `timeoutMs` | No | `10000` | Request timeout in milliseconds. |
| `maxConcurrency` | No | `5` | Maximum concurrent clean endpoint checks. |
| `allowPrivateHosts` | No | `false` | Allows private/local hosts for trusted local development. |

## Conformance vs Passed

`conformance` is structural. It reports the highest implemented `index-ai`
level reached: `none`, `level-1`, or `level-2a`.

`passed` is the global verdict for the current validation policy. Any fail check
makes `passed` false. Warning-sensitive options can also make warnings fail the
global verdict:

- `--strict` makes SHOULD-level warnings fail.
- `--fail-on-warn` makes any warning fail.
- `--strict-security` upgrades private infrastructure findings from warn to fail.

## Security model

Security checks are conservative heuristics over public AI-facing clean endpoint
text. The validator looks for obvious secret-shaped values and private
infrastructure references, strips Markdown code examples before scanning, and
redacts secret evidence in failure details.

These checks are not a full security audit, vulnerability scanner, penetration
test, dependency scan, privacy review, or legal review.

Use `--allow-private-hosts` only for trusted local or private development. It
allows private/local hosts in targets and `llm_url` fetches that are blocked by
default.

## Current scope

Implemented in 0.1.0:

- Level 1 AI Manifest validation
- Level 2a Shadow Index validation
- clean endpoint content type checks
- HTML leak checks
- `content_chars` exact and max checks
- conservative security heuristics
- shallow discovery hints
- CLI human output, JSON output, and exit codes
- `TEST_PATTERNS.md` governance for future validator tests

## Current limits

The package does not validate:

- Level 2b relations
- Level 3 MCP
- full robots.txt Disallow behavior
- discovery crawling
- sitemap validation
- DNS TXT discovery
- content quality
- SEO or GEO performance
- production compliance certification
- AI traffic outcomes
