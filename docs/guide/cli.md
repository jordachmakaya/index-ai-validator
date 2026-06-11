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
| `--json` | No | `false` | Prints JSON shell output in Sprint 1. Final validation JSON is implemented later. |
| `--verbose` | No | `false` | Parsed by the CLI shell. Detailed validation output is implemented later. |
| `--strict` | No | `false` | Parsed by the CLI shell. Strict validation behavior is implemented later. |
| `--strict-security` | No | `false` | Parsed by the CLI shell. Security checks are implemented later. |
| `--fail-on-warn` | No | `false` | Parsed by the CLI shell. Warning-based exit behavior is implemented later. |
| `--no-exit-code` | No | `false` | Parsed by the CLI shell. Final validation exit behavior is implemented later. |
| `--timeout <ms>` | No | `10000` | Parses a positive timeout value in milliseconds. HTTP fetching is implemented later. |
| `--max-concurrency <n>` | No | `5` | Parses a positive concurrency value. Concurrent endpoint checks are implemented later. |
| `--allow-private-hosts` | No | `false` | Parsed by the CLI shell. Private host handling is implemented later. |

## STEP-1 - Run help

```bash
index-ai --help
```

This shows the current CLI command, options, and descriptions.

## STEP-2 - Run against a URL

```bash
index-ai https://example.com
```

In Sprint 1, this prints shell output only:

```txt
@index-ai/validator CLI shell
Target: https://example.com
Validation is not implemented in Sprint 1. Sprint 3 adds the validator orchestrator.
```

## STEP-3 - Try JSON shell output

```bash
index-ai https://example.com --json
```

In Sprint 1, `--json` prints a `not_implemented` shell object with parsed options.
It is not a real validation report yet.

## Current limitations

The CLI shell is available. Validation logic is implemented progressively across
later sprints.

Do not use Sprint 1 output as proof that a site passes `index-ai` Level 1 or Level
2a. Manifest validation, Shadow Index validation, HTTP fetching, security
scanning, discovery checks, fixture validation, and CI validation are not
implemented yet.
