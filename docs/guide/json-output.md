# JSON Output

Use JSON output when another tool, CI job, or future audit ingestion process
needs a stable machine-readable result.

```bash
index-ai https://example.com --json
```

## Output discipline

When `--json` is used:

- stdout contains JSON only
- normal validation results keep stderr empty
- usage, configuration, or runtime errors before a validation result use stderr
- no colors, banners, progress logs, or human prose wrap the JSON

## Top-level contract

The JSON result is the `ValidationResult` shape returned by `validateIndexAi()`,
plus five level-aware fields the CLI adds for `--json` output (see
[Target level fields](#target-level-fields) below). `ValidationResult` itself
is unchanged by `--target-level` — the five extra fields are additive
CLI-output composition, not a new field on the validator's own result type.

Top-level fields:

| Field | Meaning |
| --- | --- |
| `schema_version` | Result schema version emitted by the package. |
| `target` | Target URL passed to the validator. |
| `generated_at` | ISO timestamp for result generation. |
| `duration_ms` | Elapsed validation time in milliseconds. |
| `conformance` | Highest implemented structural level reached. |
| `passed` | Global validation verdict under the selected options. |
| `summary` | Counts of pass, warn, fail, and total checks. |
| `metrics` | Implemented counters for manifest, Agent Index, endpoint, and coverage behavior. |
| `checks` | Detailed validation checks with stable codes and severities. |
| `requested_level` | The `--target-level` value used (`l1` or `l2a`). |
| `tested_levels` | Every level actually reached by the cascade, in order (`l1`, then `l2a` if requested). |
| `achieved_level` | The highest level reached with zero failures, or `"none"`. |
| `failed_level` | The first tested level with a blocking failure, or `null` if none. |
| `level_results` | Per-level breakdown — see [Target level fields](#target-level-fields). |

## Example

```json
{
  "schema_version": "0.1",
  "target": "https://example.com",
  "generated_at": "2026-06-12T00:00:00.000Z",
  "duration_ms": 42,
  "conformance": "level-2a",
  "passed": true,
  "summary": {
    "pass": 59,
    "warn": 0,
    "fail": 0,
    "total": 59
  },
  "metrics": {
    "manifest_found": true,
    "manifest_schema_valid": true,
    "agent_index_found": true,
    "agent_index_schema_valid": true,
    "total_nodes": 6,
    "nodes_with_llm_url": 6,
    "nodes_with_content_chars": 6,
    "nodes_with_content_chars_mode": 6,
    "valid_clean_endpoints": 6,
    "valid_content_chars": 6,
    "html_leaks": 0,
    "secret_findings": 0,
    "coverage": {
      "llm_url_percent": 100,
      "content_chars_percent": 100
    }
  },
  "checks": [
    {
      "code": "L1_MANIFEST_FOUND",
      "severity": "pass",
      "requirement": "must",
      "message": "An index-ai manifest was found at the canonical path.",
      "url": "https://example.com/.well-known/index-ai.json"
    },
    {
      "code": "L2A_CONTENT_CHARS_EXACT_MATCH",
      "severity": "pass",
      "requirement": "must",
      "message": "The clean endpoint content_chars value matches exactly.",
      "url": "https://example.com/about?format=markdown",
      "details": {
        "node_id": "about",
        "declared": 2100,
        "measured": 2100,
        "mode": "exact"
      }
    }
  ]
}
```

>[!note]
>The `metrics` object above is complete. The `checks` array is shortened to two
representative entries — a real result lists every generated check. In this
passing example the summary totals 59 checks.

## Target level fields

Real output, `index-ai https://example.com --target-level l2a --json` against
a site with no manifest — Level 1 fails, so Level 2a is cascade-skipped rather
than reported as a second failure:

```json
{
  "requested_level": "l2a",
  "tested_levels": ["l1", "l2a"],
  "achieved_level": "none",
  "failed_level": "l1",
  "level_results": {
    "l1": {
      "label": "Level 1",
      "status": "tested",
      "pass": 0,
      "warn": 5,
      "fail": 1
    },
    "l2a": {
      "label": "Level 2a",
      "status": "skipped",
      "reason": "Level 1 failed"
    }
  }
}
```

`level_results` only has a key for each level actually reached by the cascade —
`--target-level l1` produces a `level_results` with only an `l1` key, never an
`l2a` entry for a level that was never targeted. A `"tested"` entry always has
`pass`/`warn`/`fail` counts; a `"skipped"` entry always has a `reason` instead,
and never carries pass/warn/fail counts of its own — a skipped level never ran.

## Reading the result quickly

Automation can answer the main validation question from top-level fields:

| Field | How to use it |
| --- | --- |
| `passed` | `true` means the current validation policy passed. |
| `conformance` | Shows the highest implemented structural level reached. |
| `summary.fail` | Number of blocking failures. |
| `summary.warn` | Number of warnings. |
| `duration_ms` | How long the validation took. |

## Failure JSON

If validation completes and the target fails, JSON is still printed to stdout.
The process exits with code `1` unless `--no-exit-code` is used.

If no validation result exists because CLI usage or configuration failed, the
command exits with code `2` and writes the diagnostic to stderr.

## JSON with an HTML report

JSON remains the automation format even when an HTML report is requested.

```bash
index-ai https://example.com --json --html report.html
```

With this combination:

- stdout contains JSON only
- the HTML report is written to the provided `.html` file
- the HTML report includes a CI Verdict, Readiness score, and recommended next
  steps for human review
- validation semantics do not change
- exit codes do not change

The readiness score is report-only. It does not affect `passed`, `conformance`,
JSON output, or exit codes.

The HTML report is for local or shareable human review — see [Scope](/guide/scope).
