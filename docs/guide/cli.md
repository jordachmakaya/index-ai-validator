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
| `--json` | No | `false` | Prints JSON shell output. Final validation JSON is implemented later. |
| `--verbose` | No | `false` | Parsed by the CLI shell. Detailed validation output is implemented later. |
| `--strict` | No | `false` | Parsed by the CLI shell. Strict validation behavior is implemented later. |
| `--strict-security` | No | `false` | Parsed by the CLI shell. Security checks are implemented later. |
| `--fail-on-warn` | No | `false` | Parsed by the CLI shell. Warning-based exit behavior is implemented later. |
| `--no-exit-code` | No | `false` | Parsed by the CLI shell. Final validation exit behavior is implemented later. |
| `--timeout <ms>` | No | `10000` | The CLI parses this timeout. Sprint 2 HTTP timeout utility support exists; later sprints wire it into full validation. |
| `--max-concurrency <n>` | No | `5` | The CLI parses this concurrency value. Sprint 2 semaphore utility support exists; later sprints wire it into endpoint validation. |
| `--allow-private-hosts` | No | `false` | The CLI parses this flag. Sprint 2 private-host utility support exists; later sprints wire it into full validation. |

## STEP-1 - Run help

```bash
index-ai --help
```

This shows the current CLI command, options, and descriptions.

## STEP-2 - Run against a URL

```bash
index-ai https://example.com
```

At the current Sprint 2 checkpoint, this prints shell output only:

```txt
@index-ai/validator CLI shell
Target: https://example.com
End-to-end validation is not implemented yet. Sprint 3 adds the validator orchestrator.
```

The package also contains the Sprint 2 runtime utility layer, but the current
CLI command does not yet fetch and validate a target website end-to-end.

## STEP-3 - Try JSON shell output

```bash
index-ai https://example.com --json
```

At the current Sprint 2 checkpoint, `--json` prints a `not_implemented` shell
object with parsed options.
It is not a real validation report yet.

## Current limitations

The CLI shell is available. Validation logic is implemented progressively across
later sprints.

Sprint 2 runtime utilities are available behind the package: HTTP fetch policy,
timeout behavior, redirect caps, private-host blocking, URL normalization,
same-origin checks, Unicode NFC `content_chars` counting, and concurrency
limiting.

Do not use current CLI output as proof that a site passes `index-ai` Level 1 or
Level 2a. Manifest validation, Shadow Index validation, security scanning,
discovery checks, fixture validation, and CI validation are not implemented yet.
