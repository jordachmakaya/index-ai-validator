# CLI

The package name is `@hardmachinelabs/index-ai-validator`. Its CLI binary is
installed under two equivalent names — either one runs the same executable:

```txt
Package: @hardmachinelabs/index-ai-validator
Binary:  index-ai, index-ai-validator
```

The `index-ai` binary has two features that answer two different questions:

- **Default validation mode** — local, free conformance check against the
  `index-ai` Level 1 Manifest and Level 2a Agent Index. No network
  dependency beyond the target site itself.
- **`scan`** — calls the remote Agent View scanner service and diagnoses how
  close a site is to full AI-readiness, and what upgrading to the full Agent
  View would add.

## Default validation mode

>[!note]
>Default validation mode runs automatically — no command keyword is
required. `validate <url>` is the same mode with an explicit keyword. Both
call `validateIndexAi()` and return either a human-readable report or
stable JSON.

### Basic command

```bash
index-ai https://example.com
index-ai validate https://example.com
```

When running directly from the package:

```bash
npx @hardmachinelabs/index-ai-validator https://example.com
```

### Full command shape

```bash
index-ai <url> [--json] [--html [path]] [--verbose] [--strict] [--strict-security] [--fail-on-warn] [--no-exit-code] [--timeout <ms>] [--max-concurrency <n>] [--allow-private-hosts] [--target-level <level>]
```

### Options

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
| `--html [path]` | No | - | Writes a standalone local HTML report to a `.html` file. |
| `--target-level <level>` | No | `l2a` | Conformance level to validate against: `l1` or `l2a`. `l2b` is rejected — see [Target level](#target-level) below. |

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
index-ai https://example.com --html report.html
index-ai https://example.com --target-level l1
```

### Target level

Levels are progressive and cumulative: Level 2a includes Level 1. `--target-level`
lets you choose how far to validate, without changing what each level itself
requires.

| Value | Validates |
| --- | --- |
| `l1` | Level 1 manifest requirements only. |
| `l2a` (default) | Level 1 + Level 2a agent index requirements. |
| `l2b` | Rejected with a dev-friendly error. Level 2b is not implemented yet — see [Scope](/guide/scope). |

```bash
index-ai https://example.com --target-level l1
index-ai https://example.com --target-level l2a
index-ai https://example.com --target-level l2b
# error: option '--target-level <level>' argument 'l2b' is invalid. Level 2b validation is not yet available. Use --target-level l1 or --target-level l2a instead.
```

**Cascade-skip, not cascade-fail**: if an earlier level has a blocking failure,
every level after it is reported as `skipped` with the reason, never as a
second `failed` — a later level was never actually run once an earlier one
blocked it. The human report gains four fields plus a level-by-level
breakdown: `Requested target level`, `Tested levels`, `Achieved level`, and
`Level results`.

Real output, `index-ai https://example.com --target-level l2a` against a site
with no manifest:

```txt
index-ai validation result

Target: https://example.com
Duration: 441 ms
Conformance: none
Passed: false

Requested target level: Level 2a
Tested levels: Level 1, Level 2a
Achieved level: none

Level results:
- Level 1: 0 pass, 5 warn, 1 fail
- Level 2a: skipped (Level 1 failed)

Summary:
- pass: 0
- warn: 5
- fail: 1
- total: 6
```

`Achieved level` is derived from the same per-level pass/fail results as
`Level results`, not from `conformance` — it reflects the highest level
actually reached with zero failures under the requested target, and reads
`none` if even Level 1 didn't pass. See [JSON Output](/guide/json-output) for
the equivalent machine-readable fields.

### Human output

Human output is deterministic and summary-first:

```txt
index-ai validation result

Target: https://example.com
Duration: 42 ms
Conformance: level-2a
Passed: true

Requested target level: Level 2a
Tested levels: Level 1, Level 2a
Achieved level: Level 2a

Level results:
- Level 1: 5 pass, 0 warn, 0 fail
- Level 2a: 7 pass, 0 warn, 0 fail

Summary:
- pass: 12
- warn: 0
- fail: 0
- total: 12

Metrics:
- manifest_found: true
- agent_index_found: true
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

### JSON output

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
- `requested_level`
- `tested_levels`
- `achieved_level`
- `failed_level`
- `level_results`

See [JSON Output](/guide/json-output) for field meanings and shapes.

Normal validation results keep stderr empty. Usage, configuration, or runtime
errors before a validation result use stderr.

### HTML report

```bash
index-ai https://example.com --html report.html
```

>[!note]
>The HTML report is optional and intended for local or shareable human review.
It is generated from the same validation result as the human and JSON output.
It does not change validation semantics or exit codes.

HTML reports include a `CI Verdict`, a `Readiness` score, and recommended next
steps. The readiness score is report-only and does not affect `passed`,
`conformance`, JSON output, or exit codes. They also include a level summary
in the hero section: requested target level, tested levels, achieved level,
failed level (when a level failed), and a per-level pass/warn/fail (or
skipped-with-reason) breakdown.

>[!important]
>The report path must be non-empty and end with `.html`. Parent directories
are created automatically if missing — the same recursive-create behavior as
`scan --html` below.

JSON remains the automation format. When used together, stdout stays JSON-only
and the HTML report is written to the file:

```bash
index-ai https://example.com --json --html report.html
```

The HTML report is a review aid, not a guarantee — see [Scope](/guide/scope).

### Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | A validation result exists and `passed` is `true`. |
| `1` | A validation result exists and `passed` is `false`. |
| `2` | No validation result exists because usage, configuration, or runtime setup failed. |

`--no-exit-code` changes validation failures from exit code `1` to exit code
`0`. It does not hide usage, configuration, or runtime errors that happen before
a validation result exists.

### Warning-sensitive modes

`conformance` is structural. It can be `level-2a` even when `passed` is false.

`passed` is the global verdict under the current options:

- `--strict` makes SHOULD-level warnings fail.
- `--fail-on-warn` makes any warning fail.
- `--strict-security` upgrades private infrastructure findings from warn to fail.

### Private hosts

Private and local hosts are blocked by default for public validation paths that
could otherwise probe internal networks.

Use this only for trusted local or private development:

```bash
index-ai http://localhost:3000 --allow-private-hosts
```

>[!caution]
>Do not use `--allow-private-hosts` as evidence that private endpoints are
appropriate for public `index-ai` implementations.

## `scan`

Use `scan` to run the Agent View scanner: one URL, one score, one shareable
report showing the gap between what humans see and what bots can extract.
`scan` calls the remote Agent View scanner service — this package has no
scanning logic of its own, and the scan result is owned and computed by that
service, not by this CLI.

### Basic command

```bash
index-ai scan https://example.com
```

### Full command shape

```bash
index-ai scan <url> [--json] [--html [path]] [--api-key <key>] [--timeout <ms>]
```

### Options

| Option | Required | Default | Description |
| --- | ---: | --- | --- |
| `<url>` | Yes | - | Site URL to scan, for example `https://example.com`. |
| `--json` | No | - | Prints the raw scanner status as JSON on success, or a CLI-authored JSON error object on failure — see [JSON output](#json-output-1) below. |
| `--html [path]` | No | - | Writes a minimal HTML report. With no path, writes to `.report/scan-report.html`. |
| `--api-key <key>` | No | - | Reserved for future scanner authentication. It currently has no effect: passing it changes nothing about the request or the result. |
| `--timeout <ms>` | No | `10000` | Scan request timeout in milliseconds. Must be a positive integer. |

### Examples

```bash
index-ai scan https://example.com
index-ai scan https://example.com --json
index-ai scan https://example.com --html
index-ai scan https://example.com --html report.html
index-ai scan https://example.com --json --html
index-ai scan https://example.com --timeout 20000
index-ai scan https://example.com --api-key my-key
```

### Human output

Without `--json`, the CLI prints a compact summary and, on stderr, a link to
the full audit:

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

### JSON output

```bash
index-ai scan https://example.com --json
```

On success, `--json` prints the raw scanner status object to stdout, and
nothing else. Illustrative example — field names and shapes are real, values
are made up:

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
    "csrGapPercent": 18.4,
    "renderedComparison": {
      "status": "gap"
    },
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
have `severity` `P0`, `P1`, or `P2`. `csrGapPercent` and `renderedComparison`
are optional — present when the scanner computed a client-side-rendering
comparison. Scoring, dimension weights, and finding content are computed and
owned by the remote scanner service, not by this package, and can change
independently of this package's version.

On failure, `--json` prints a different, CLI-authored JSON error object to
stdout instead — never the raw scanner status object:

```json
{
  "passed": false,
  "status": "error",
  "error_type": "network_error",
  "message": "Network error while calling \"https://agent-view.com/api/v1/scan\": fetch failed."
}
```

Fields: `passed` (always `false`), `status` (always `"error"`), `error_type`
(a CLI-defined error category — one of `network_error`, `server_error`,
`invalid_request`, `not_found`, `expired`, `rate_limited`, `timeout_error`,
`result_schema_error`, `response_shape_error`, `scan_failed`, or
`unknown_error`), and `message` (a human-readable description of what
failed, reused on stderr).

### HTML report

```bash
index-ai scan https://example.com --html
index-ai scan https://example.com --html report.html
```

With no path after `--html`, the report is written to
`.report/scan-report.html` relative to the current working directory, creating
that directory automatically if it does not exist. With an explicit path, the
report is written exactly there (its parent directory is also created
automatically if missing).

The HTML report renders the score, verdict, per-dimension breakdown, and
findings with fix links where the scanner provides one. A generated example is
committed at
[`packages/validator/.preview/scan-report.html`](https://github.com/jordachmakaya/index-ai-validator/blob/main/packages/validator/.preview/scan-report.html)
in the repository. It carries the same review-aid disclaimer as the Default
validation mode HTML report — see [Scope](/guide/scope).

### Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | The scan reached a terminal `done` result and printed it, whatever the score or verdict. Under `--json`, stdout holds the raw scanner status object. |
| `2` | The scan request failed: a scanner transport error, a server-side scan failure, a poll timeout, or a usage/configuration error. Under `--json`, stdout holds the CLI-authored JSON error object (`{ passed, status, error_type, message }`) described above, not the raw scanner status object. |

Unlike Default validation mode, `scan` has no separate pass/fail exit code —
a low score or `P0` findings still exit `0`.

## Choose the right one

| Feature | Use it for | Output |
| --- | --- | --- |
| Default validation mode (`index-ai <url>`) | Check `index-ai` conformance | Manifest checks, Agent Index checks, clean endpoint checks, CI-friendly JSON |
| `scan <url>` | Diagnose the AI-readability gap | Score, verdict, findings, scanner payload, shareable HTML report |

## Scope

Default validation mode checks `index-ai` Level 1 and Level 2a. `scan` calls
the remote Agent View scanner service for a broader AI-readiness diagnostic.
For the full list of what each feature does and does not check, see
[Scope](/guide/scope).
