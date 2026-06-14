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

The JSON result is the `ValidationResult` shape returned by `validateIndexAi()`.

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
    "shadow_layer_found": true,
    "shadow_layer_schema_valid": true,
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

The `metrics` object above is complete. The `checks` array is shortened to two
representative entries — a real result lists every generated check. In this
passing example the summary totals 59 checks.

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
