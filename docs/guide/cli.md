# CLI

The package and binary names are different:

```txt
Package: @index-ai/validator
Binary:  index-ai
```

The `index-ai` binary calls `validateIndexAi()` and returns either a
human-readable report or stable JSON.

## Basic command

```bash
index-ai https://example.com
```

When running directly from the package:

```bash
npx @index-ai/validator https://example.com
```

## Full command shape

```bash
index-ai <url> [--json] [--html <path>] [--verbose] [--strict] [--strict-security] [--fail-on-warn] [--no-exit-code] [--timeout <ms>] [--max-concurrency <n>] [--allow-private-hosts]
```

## Options

| Option | Required | Default | Description |
| --- | ---: | --- | --- |
| `<url>` | Yes | - | Target website URL. Must use `http` or `https`. |
| `--json` | No | `false` | Writes stable machine-readable JSON to stdout. |
| `--verbose` | No | `false` | Includes passing checks in human-readable output. |
| `--strict` | No | `false` | Makes SHOULD-level warnings fail the global verdict. |
| `--strict-security` | No | `false` | Upgrades private infrastructure heuristic findings from warn to fail. |
| `--fail-on-warn` | No | `false` | Makes any warning fail the global verdict. |
| `--no-exit-code` | No | `false` | Returns exit code `0` for validation failures only. |
| `--timeout <ms>` | No | `10000` | Request timeout in milliseconds. Must be a positive integer. |
| `--max-concurrency <n>` | No | `5` | Maximum concurrent clean endpoint checks. Must be a positive integer. |
| `--allow-private-hosts` | No | `false` | Allows private/local hosts for trusted local development. |
| `--html <path>` | No | - | Writes a standalone local HTML report to a `.html` file. |

## Examples

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

## Human output

Human output is deterministic and summary-first:

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

Metrics:
- manifest_found: true
- shadow_layer_found: true
- total_nodes: 6
- valid_clean_endpoints: 6
- valid_content_chars: 6

No failures or warnings.

Next:
- No blocking validation fixes were found.
```

After the summary, the report prints a `Metrics` block, then any `Failures` and
`Warnings` with check codes and fixes, and a closing `Next` line. Passing checks
are hidden unless `--verbose` is used.

## JSON output

```bash
index-ai https://example.com --json
```

JSON mode writes JSON only to stdout. It does not print banners, colors,
progress logs, or human prose around the JSON.

Top-level fields include:

- `schema_version`
- `target`
- `generated_at`
- `duration_ms`
- `conformance`
- `passed`
- `summary`
- `metrics`
- `checks`

Normal validation results keep stderr empty. Usage, configuration, or runtime
errors before a validation result use stderr.

## HTML report

```bash
index-ai https://example.com --html report.html
```

The HTML report is optional and intended for local or shareable human review.
It is generated from the same validation result as the human and JSON output.
It does not change validation semantics or exit codes.

HTML reports include a `CI Verdict`, a `Readiness` score, and recommended next
steps. The readiness score is report-only and does not affect `passed`,
`conformance`, JSON output, or exit codes.

The report path must be non-empty and end with `.html`. Parent directories are
not created automatically.

JSON remains the automation format. When used together, stdout stays JSON-only
and the HTML report is written to the file:

```bash
index-ai https://example.com --json --html report.html
```

The HTML report is a review aid, not a guarantee — see [Scope](/guide/scope).

## Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | A validation result exists and `passed` is `true`. |
| `1` | A validation result exists and `passed` is `false`. |
| `2` | No validation result exists because usage, configuration, or runtime setup failed. |

`--no-exit-code` changes validation failures from exit code `1` to exit code
`0`. It does not hide usage, configuration, or runtime errors that happen before
a validation result exists.

## Warning-sensitive modes

`conformance` is structural. It can be `level-2a` even when `passed` is false.

`passed` is the global verdict under the current options:

- `--strict` makes SHOULD-level warnings fail.
- `--fail-on-warn` makes any warning fail.
- `--strict-security` upgrades private infrastructure findings from warn to fail.

## Private hosts

Private and local hosts are blocked by default for public validation paths that
could otherwise probe internal networks.

Use this only for trusted local or private development:

```bash
index-ai http://localhost:3000 --allow-private-hosts
```

Do not use `--allow-private-hosts` as evidence that private endpoints are
appropriate for public `index-ai` implementations.

## Scope

The CLI validates `index-ai` Level 1 and Level 2a. For the full list of what it
does and does not check, see [Scope](/guide/scope).
