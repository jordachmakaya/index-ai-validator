# @index-ai/validator

<p align="center">
  <a href="https://www.npmjs.com/package/@index-ai/validator">
    <img src="https://img.shields.io/npm/v/@index-ai/validator?style=for-the-badge&label=npm&color=378add" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/@index-ai/validator">
    <img src="https://img.shields.io/npm/dm/@index-ai/validator?style=for-the-badge&label=downloads&color=10b981" alt="npm downloads">
  </a>
  <a href="https://github.com/jordachmakaya/index-ai-validator/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/jordachmakaya/index-ai-validator/ci.yml?style=for-the-badge&label=ci&color=378add" alt="CI status">
  </a>
  <a href="https://github.com/jordachmakaya/index-ai-validator">
    <img src="https://img.shields.io/github/license/jordachmakaya/index-ai-validator?style=for-the-badge&label=license&color=7a8ba3" alt="License">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AI--READINESS-VALIDATOR-378add?style=for-the-badge" alt="AI-readiness validator">
  <img src="https://img.shields.io/badge/INDEX--AI-LEVEL%201%20%2B%202A-10b981?style=for-the-badge" alt="index-ai Level 1 and Level 2a">
  <img src="https://img.shields.io/badge/CLI-NPX%20READY-378add?style=for-the-badge" alt="NPX ready CLI">
  <img src="https://img.shields.io/badge/STATUS-EXPERIMENTAL-f59e0b?style=for-the-badge" alt="Experimental status">
</p>

![index-ai-validator explained](https://raw.githubusercontent.com/jordachmakaya/index-ai-validator/main/docs/index-ai-validator_explained.png)

**Is your website readable by AI agents?** Most sites are built for browsers — HTML, scripts, navigation, layout. Agents have to read that browser-first HTML to understand you. `@index-ai/validator` checks whether your site also exposes a clean, structured layer built for agents — and makes that layer **testable** from your terminal.

Point it at a public URL. It checks whether the site exposes the files and clean endpoints an agent needs to understand it without scraping rendered HTML: the AI Manifest, the Shadow Index, clean Markdown or plain-text endpoints, and the declared content size of each node. It also flags obvious secret or private-infrastructure leaks in that public agent-facing content.

It is a free, experimental developer CLI. It provides the `index-ai` binary and the `validateIndexAi()` TypeScript entrypoint, and it validates `index-ai` Level 1 and Level 2a.

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
index-ai https://example.com --html report.html
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
| `--html <path>` | No | - | Writes a standalone local HTML report to a `.html` file. |

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

## HTML report

Use `--html <path>` when a local, shareable human review report is useful:

```bash
index-ai https://example.com --html report.html
```

The HTML report is optional. It is generated from the same `ValidationResult`
as the human and JSON output, and it does not change validation semantics or
exit codes.

HTML reports include a CI Verdict, Readiness score, and recommended next steps.
The readiness score is report-only and does not affect `passed`,
`conformance`, JSON output, or exit codes.

JSON remains the automation format. When JSON and HTML are combined, stdout
still contains JSON only:

```bash
index-ai https://example.com --json --html report.html
```

The HTML report is not certification, legal compliance, a traffic guarantee,
SEO ranking guarantee, security audit, or vulnerability scan.

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


## Need the layer built for you?

The validator tells you what is missing. If you need the AI-readable layer implemented, audited, or documented for a public website, see the project documentation and contact links.

Documentation: https://jordachmakaya.github.io/index-ai-validator/


## About index-ai

`index-ai` is an experimental specification for making public websites easier for AI agents to read, inspect, and budget before fetching content.

It is built around three simple ideas:

* an AI Manifest that describes the site and its machine-readable entry points;
* a Shadow Index that maps important public content into structured nodes;
* clean Markdown or plain-text endpoints designed for agents instead of browsers.

`@index-ai/validator` is the free CLI validator for the current Level 1 and Level 2a implementation.

It does not claim to be a formal standard. It is an experimental project built in public to explore how websites can expose cleaner, cheaper, and more reliable content surfaces for AI agents.

## Built by Jordach Makaya

`index-ai` and `@index-ai/validator` are created and maintained by Jordach Makaya.

Jordach builds AI infrastructure for insurance claims workflows and developer tooling around reliable, inspectable AI systems.

The validator is part of a broader effort to make AI-facing web infrastructure testable instead of vague.

## Links

- Documentation: https://jordachmakaya.github.io/index-ai-validator/
- GitHub: https://github.com/jordachmakaya/index-ai-validator
- npm: https://www.npmjs.com/package/@index-ai/validator
- Author: https://github.com/jordachmakaya

## License

MIT
