# CI

`@index-ai/validator` can be used in CI when a project wants an executable check
for public `index-ai` Level 1 and Level 2a exposure.

## Basic CI command

```bash
npx @index-ai/validator https://example.com --json
```

JSON mode is recommended for CI because stdout contains only JSON when a
validation result exists.

## Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | A validation result exists and `passed` is `true`. |
| `1` | A validation result exists and `passed` is `false`. |
| `2` | No validation result exists because usage, configuration, or runtime setup failed. |

## Reporting mode

Use `--no-exit-code` when CI should collect the JSON result without failing the
job for validation findings:

```bash
npx @index-ai/validator https://example.com --json --no-exit-code
```

`--no-exit-code` only changes validation failures. Usage, configuration, or
runtime errors before a validation result still exit with code `2`.

## Strict modes

Use stricter options when warnings should block the job:

```bash
npx @index-ai/validator https://example.com --json --strict
npx @index-ai/validator https://example.com --json --fail-on-warn
npx @index-ai/validator https://example.com --json --strict-security
```

| Option | CI effect |
| --- | --- |
| `--strict` | Makes SHOULD-level warnings fail the global verdict. |
| `--fail-on-warn` | Makes any warning fail the global verdict. |
| `--strict-security` | Upgrades private infrastructure findings from warn to fail. |

## Local development targets

Use private hosts only for trusted local or private development:

```bash
npx @index-ai/validator http://localhost:3000 --json --allow-private-hosts
```

Do not use `--allow-private-hosts` as evidence that private endpoints are
appropriate for public `index-ai` implementations.

## Test governance

Future validator tests are governed by `TEST_PATTERNS.md` at the repository
root. That file defines the expected behavior coverage for CLI JSON output,
stderr, exit codes, local HTTP servers, security heuristics, and durable
validator tests.

## Current limits

The validator is useful as a CI gate for implemented Level 1 and Level 2a
checks. It is not a security audit, vulnerability scanner, production
certification, traffic guarantee, SEO ranking guarantee, Level 2b validator, or
Level 3 MCP validator.
