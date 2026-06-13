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
| `metrics` | Implemented counters for manifest, Shadow Index, endpoint, and coverage behavior. |
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

The example is shortened. Real results include the full `metrics` object and
all generated checks.

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
