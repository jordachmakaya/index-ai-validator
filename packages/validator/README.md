# @hardmachinelabs/index-ai-validator

[![npm version](https://img.shields.io/npm/v/@hardmachinelabs/index-ai-validator?style=for-the-badge&label=npm&color=378add)](https://www.npmjs.com/package/@hardmachinelabs/index-ai-validator)
[![npm downloads](https://img.shields.io/npm/dm/@hardmachinelabs/index-ai-validator?style=for-the-badge&label=downloads&color=10b981)](https://www.npmjs.com/package/@hardmachinelabs/index-ai-validator)
[![CI status](https://img.shields.io/github/actions/workflow/status/jordachmakaya/index-ai-validator/ci.yml?style=for-the-badge&label=ci&color=378add)](https://github.com/jordachmakaya/index-ai-validator/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/jordachmakaya/index-ai-validator?style=for-the-badge&label=license&color=7a8ba3)](https://github.com/jordachmakaya/index-ai-validator)

[![AI-readiness validator](https://img.shields.io/badge/AI--READINESS-VALIDATOR-378add?style=for-the-badge)](https://github.com/jordachmakaya/index-ai-validator)
[![index-ai Level 1 and Level 2a](https://img.shields.io/badge/INDEX--AI-LEVEL%201%20%2B%202A-10b981?style=for-the-badge)](https://github.com/jordachmakaya/index-ai-validator)
[![NPX ready CLI](https://img.shields.io/badge/CLI-NPX%20READY-378add?style=for-the-badge)](https://github.com/jordachmakaya/index-ai-validator)
[![Experimental status](https://img.shields.io/badge/STATUS-EXPERIMENTAL-f59e0b?style=for-the-badge)](https://github.com/jordachmakaya/index-ai-validator)

[![TypeScript ready](https://img.shields.io/badge/TypeScript-Ready-378add?style=for-the-badge)](https://github.com/jordachmakaya/index-ai-validator)
[![Node.js 20 plus](https://img.shields.io/badge/Node.js-20%2B-10b981?style=for-the-badge)](https://github.com/jordachmakaya/index-ai-validator)
[![4 runtime dependencies](https://img.shields.io/badge/Dependencies-4%20runtime-7a8ba3?style=for-the-badge)](https://github.com/jordachmakaya/index-ai-validator)
[![Small dependency surface](https://img.shields.io/badge/Surface-small-f59e0b?style=for-the-badge)](https://github.com/jordachmakaya/index-ai-validator)

![index-ai-validator explained](https://raw.githubusercontent.com/jordachmakaya/index-ai-validator/main/docs/index-ai-validator_explained.png)

`@hardmachinelabs/index-ai-validator` is a CLI for the `index-ai` agent-facing
content layer, and it has two commands that answer two different questions:

- **`validate`** — is a site's already-implemented `index-ai` layer correct?
  Local, free, no network dependency beyond the target site itself.
- **`scan`** — how AI-ready is a site overall, and what would upgrading to the
  full Agent View add? Calls a remote scanner service and returns a score.

Most websites are built for browsers — HTML, scripts, navigation, layout —
and AI agents have to read that browser-first HTML to understand them.
`index-ai` is a machine-readable layer built for agents instead. `validate`
checks whether a site exposes that layer correctly. `scan` diagnoses how
close a site is to full AI-readiness and shows what is missing.

It is a free, experimental developer CLI. It provides the `index-ai` binary
and the `validateIndexAi()` TypeScript entrypoint.

Naming:

- Repository: `index-ai-validator`
- Package: `@hardmachinelabs/index-ai-validator`
- CLI binary: `index-ai`
- Specification checked by `validate`: `index-ai`

Neither command is a production certification, legal compliance tool,
traffic guarantee, SEO ranking tool, security audit, or vulnerability
scanner.

Designed for CI and local audits: deterministic output, stable JSON,
standalone HTML reports, and a small runtime dependency surface.

## Installation / run with npx

The npm package is published under the HardMachine Labs scope. The CLI
binary remains `index-ai`.

Run without installing:

```bash
npx @hardmachinelabs/index-ai-validator https://example.com
```

Or with pnpm:

```bash
pnpm dlx @hardmachinelabs/index-ai-validator https://example.com
```

Local install:

```bash
pnpm add -D @hardmachinelabs/index-ai-validator
pnpm exec index-ai https://example.com
```

Requires Node.js 20 or newer.

## `validate` — local conformance check

`validate` checks whether a public site already exposes the current
`index-ai` spec correctly: Level 1 AI Manifest and Level 2a Agent Index.
It runs locally and is free — the only network calls are public HTTP
requests to the target site. There is no Level 3 / MCP check implemented.

### Usage

`validate` is the default command — there is no `validate` keyword to type:

```bash
index-ai <url> [options]
```

### Options

- `--json` — no default. Prints stable machine-readable JSON to stdout.
- `--verbose` — default `false`. Includes passing checks in human output.
- `--strict` — default `false`. Makes SHOULD-level warnings fail the
  global verdict.
- `--strict-security` — default `false`. Upgrades private-infrastructure
  findings from warn to fail.
- `--fail-on-warn` — default `false`. Makes any warning fail the global
  verdict.
- `--no-exit-code` — default `false`. Returns exit code `0` for validation
  failures only.
- `--timeout <ms>` — default `10000`. Request timeout in milliseconds.
- `--max-concurrency <n>` — default `5`. Maximum concurrent `llm_url`
  fetches.
- `--allow-private-hosts` — default `false`. Allows private/local hosts for
  trusted local development.
- `--html [path]` — no default. Writes a standalone HTML report. With no
  path, writes to `.report/validate-report.html` relative to the current
  working directory, creating that directory if it does not exist. With an
  explicit path, writes exactly there (its parent directory is also created
  if missing).

### Examples

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
index-ai https://example.com --html
index-ai https://example.com --html report.html
index-ai https://example.com --json --html
```

### JSON output

Use JSON mode for CI and machine ingestion:

```bash
index-ai https://example.com --json
```

In JSON mode, stdout contains only JSON. Normal validation results do not
use stderr. Usage, configuration, or runtime errors before a validation
result use stderr and exit with code `2`.

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

The real `metrics` object contains the implemented validator counters. The
real `checks` array contains check objects with stable codes, severity,
messages, and fixes where available.

### HTML report

```bash
index-ai https://example.com --html
index-ai https://example.com --html report.html
```

With no path after `--html`, the report is written to
`.report/validate-report.html` relative to the current working directory,
and that directory is created automatically if it does not exist. With an
explicit path, the report is written exactly there (its parent directory is
also created automatically).

The HTML report is optional. It is generated from the same `ValidationResult`
as the human and JSON output, and it does not change validation semantics or
exit codes.

HTML reports include a CI Verdict, a Readiness score, and recommended next
steps. The readiness score is report-only and does not affect `passed`,
`conformance`, JSON output, or exit codes.

JSON remains the automation format. When JSON and HTML are combined, stdout
still contains JSON only:

```bash
index-ai https://example.com --json --html report.html
```

The HTML report is not certification, legal compliance, a traffic guarantee,
SEO ranking guarantee, security audit, or vulnerability scan.

### Human output

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

### Exit codes

- `0` — a validation result exists and `passed` is `true`.
- `1` — a validation result exists and `passed` is `false`.
- `2` — no validation result exists, because usage, configuration, or
  runtime setup failed.

`--no-exit-code` changes validation failures from exit code `1` to exit
code `0`. It does not hide usage, configuration, or runtime errors that
happen before a validation result exists.

### TypeScript usage

```ts
import { validateIndexAi } from '@hardmachinelabs/index-ai-validator'

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

- `target` — required. Target website URL. Must use `http` or `https`.
- `strict` — default `false`. Makes SHOULD-level warnings fail the global
  verdict.
- `strictSecurity` — default `false`. Upgrades private-infrastructure
  findings from warn to fail.
- `failOnWarn` — default `false`. Makes any warning fail the global verdict.
- `verbose` — default `false`. Used by CLI output detail.
- `timeoutMs` — default `10000`. Request timeout in milliseconds.
- `maxConcurrency` — default `5`. Maximum concurrent clean endpoint fetches.
- `allowPrivateHosts` — default `false`. Allows private/local hosts for
  trusted local development.

### Conformance vs Passed

`conformance` is structural. It reports the highest implemented `index-ai`
level reached: `none`, `level-1`, or `level-2a`.

`passed` is the global verdict for the current validation policy. Any fail
check makes `passed` false. Warning-sensitive options can also make
warnings fail the global verdict:

- `--strict` makes SHOULD-level warnings fail.
- `--fail-on-warn` makes any warning fail.
- `--strict-security` upgrades private-infrastructure findings from warn
  to fail.

### Security model

Security checks are conservative heuristics over public AI-facing clean
endpoint text. The validator looks for obvious secret-shaped values and
private-infrastructure references, strips Markdown code examples before
scanning, and redacts secret evidence in failure details.

These checks are not a full security audit, vulnerability scanner,
penetration test, dependency scan, privacy review, or legal review.

Use `--allow-private-hosts` only for trusted local or private development.
It allows private/local hosts in targets and `llm_url` fetches that are
blocked by default.

### Current scope

Implemented in 0.1.0:

- Level 1 AI Manifest validation
- Level 2a Agent Index validation
- clean endpoint content type checks
- HTML leak checks
- `content_chars` exact and max checks
- conservative security heuristics
- shallow discovery hints
- CLI human output, JSON output, and exit codes
- `TEST_PATTERNS.md` governance for future validator tests

### Current limits

`validate` does not check:

- Level 2b relations
- Level 3 MCP
- full `robots.txt` `Disallow` behavior
- discovery crawling
- sitemap validation
- DNS TXT discovery
- content quality
- SEO or GEO performance
- production compliance certification
- AI traffic outcomes

## `scan` — remote Agent View diagnostic

`scan` calls the remote Agent View scanner service and returns an
AI-readiness score, a verdict, and a list of findings, including what
upgrading to the full Agent View would add. It checks a broader model of
AI-readiness than `validate`, and it requires a network call to the
scanner API — it is a diagnostic, not a local conformance check.

### Scan usage

```bash
index-ai scan <url> [options]
```

### Scan options

- `--json` — no default. Prints the raw scanner status as JSON.
- `--timeout <ms>` — default `10000`. Scan request timeout in milliseconds.
- `--api-key <key>` — no default. Reserved for future scanner
  authentication. It has no effect today: passing it changes nothing about
  the request or the result.
- `--html [path]` — no default. Writes a standalone HTML report. With no
  path, writes to `.report/scan-report.html` relative to the current
  working directory, creating that directory if it does not exist. With an
  explicit path, writes exactly there (its parent directory is also
  created if missing).

### Scan examples

```bash
index-ai scan https://example.com
index-ai scan https://example.com --json
index-ai scan https://example.com --html
index-ai scan https://example.com --html report.html
index-ai scan https://example.com --json --html
index-ai scan https://example.com --timeout 20000
index-ai scan https://example.com --api-key my-key
```

### Scan human output

Without `--json`, the CLI prints a compact summary and, on stderr, a link
to the full audit:

```txt
URL: https://example.com
Score: 82
Verdict: good
P0: 1
P1: 1
P2: 0
```

The stderr line (printed with or without `--json`) looks like:

```txt
Scan done — score 82, verdict good. Full audit: https://agent-view.com/audit/...
```

### Scan JSON output

```bash
index-ai scan https://example.com --json
```

`--json` prints the raw scanner status object to stdout. Illustrative
example — field names and shapes are real, values are made up:

```json
{
  "scanId": "scan_abc123",
  "status": "done",
  "submittedAt": "2026-07-04T00:00:00.000Z",
  "completedAt": "2026-07-04T00:00:20.000Z",
  "result": {
    "url": "https://example.com",
    "score": 82,
    "verdict": "good",
    "dimensions": [
      { "key": "access", "score": 18, "max": 20 },
      { "key": "extractability", "score": 20, "max": 25 },
      { "key": "citability", "score": 15, "max": 20 },
      { "key": "safety", "score": 20, "max": 20 },
      { "key": "agent_layer", "score": 9, "max": 15 }
    ],
    "findings": [
      {
        "id": "SCAN-FIND-012",
        "severity": "P1",
        "title": "No Agent Index declared",
        "detail": "The site does not expose an index-ai Agent Index.",
        "effort": "medium",
        "fix_url": "https://jordachmakaya.github.io/index-ai-validator/"
      }
    ],
    "noiseRatio": 0.12,
    "engineVersion": "1.4.0",
    "schemaVersion": "1.0"
  },
  "meta": {
    "links": {
      "self": "https://agent-view.com/api/v1/scan/scan_abc123",
      "shareUrl": "https://agent-view.com/s/scan_abc123",
      "audit": "https://agent-view.com/audit/scan_abc123"
    }
  }
}
```

`dimensions` always has exactly 5 entries, in this order: `access`,
`extractability`, `citability`, `safety`, `agent_layer`. `findings` entries
have `severity` `P0`, `P1`, or `P2`. Scoring, dimension weights, and finding
content are computed and owned by the remote scanner service, not by this
package, and can change independently of this package's version.

### Scan HTML report

```bash
index-ai scan https://example.com --html
index-ai scan https://example.com --html report.html
```

With no path after `--html`, the report is written to
`.report/scan-report.html` relative to the current working directory,
creating that directory automatically if it does not exist. With an
explicit path, the report is written exactly there.

The HTML report renders the score, verdict, per-dimension breakdown, and
findings with fix links where the scanner provides one. A generated
example is committed at
[`packages/validator/.preview/scan-report.html`](https://github.com/jordachmakaya/index-ai-validator/blob/main/packages/validator/.preview/scan-report.html)
in the repository.

### Scan exit codes

- `0` — the scan reached a terminal `done` result and printed it, whatever
  the score or verdict.
- non-zero (`2`) — the scan request failed: a scanner transport error, a
  server-side scan failure, a poll timeout, or a usage/configuration error.
  `scan` has no separate pass/fail exit code the way `validate` does — a
  low score or `P0` findings still exit `0`.

### Scope and limits

`scan` is a remote diagnostic against the Agent View scanner service. It
does not run locally, does not check Level 3 / MCP, and is not a
production certification, legal compliance tool, traffic guarantee, SEO
ranking tool, security audit, or vulnerability scanner.

## Need the layer built for you?

The validator tells you what is missing. If you need the AI-readable layer
implemented, audited, or documented for a public website, see the project
documentation and contact links.

Documentation:
[jordachmakaya.github.io/index-ai-validator](https://jordachmakaya.github.io/index-ai-validator/)

## About index-ai

`index-ai` is an experimental specification for making public websites
easier for AI agents to read, inspect, and budget before fetching content.

It is built around three simple ideas:

- an AI Manifest that describes the site and its machine-readable entry
  points;
- an Agent Index that maps important public content into structured nodes;
- clean Markdown or plain-text endpoints designed for agents instead of
  browsers.

`@hardmachinelabs/index-ai-validator` is the free CLI for the current
Level 1 and Level 2a implementation (`validate`), plus a remote
AI-readiness diagnostic against a broader model (`scan`).

It does not claim to be a formal standard. It is an experimental project
built in public to explore how websites can expose cleaner, cheaper, and
more reliable content surfaces for AI agents.

## Built by Jordach Makaya

`index-ai` and `@hardmachinelabs/index-ai-validator` are created and
maintained by Jordach Makaya.

Jordach builds AI infrastructure for insurance claims workflows and
developer tooling around reliable, inspectable AI systems.

The validator is part of a broader effort to make AI-facing web
infrastructure testable instead of vague.

## Links

- Documentation:
  [jordachmakaya.github.io/index-ai-validator](https://jordachmakaya.github.io/index-ai-validator/)
- GitHub:
  [github.com/jordachmakaya/index-ai-validator](https://github.com/jordachmakaya/index-ai-validator)
- npm:
  [npmjs.com/package/@hardmachinelabs/index-ai-validator](https://www.npmjs.com/package/@hardmachinelabs/index-ai-validator)
- Author: [github.com/jordachmakaya](https://github.com/jordachmakaya)

## License

MIT
