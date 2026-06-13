# index-ai-validator

This repository contains the experimental `@index-ai/validator` package and
documentation for validating `index-ai` Level 1 and Level 2a implementations.

Naming:

- `index-ai-validator` is this validator repository.
- [`index-ai`](https://github.com/jordachmakaya/index-ai) is the experimental specification being validated.
- `@index-ai/validator` is the npm package.
- `index-ai` is also the CLI binary name.

The validator answers one practical question:

```txt
Does this public website correctly expose the current index-ai agent-facing content layer?
```

## Validator package

Package:

```txt
@index-ai/validator
```

CLI binary:

```txt
index-ai
```

Run the CLI with:

```bash
npx @index-ai/validator https://example.com
```

The CLI calls `validateIndexAi()`, prints a deterministic human-readable report
by default, and can print stable JSON with `--json`.

See:

- [Package README](packages/validator/README.md)
- [Documentation](docs/index.md)
- [CLI guide](docs/guide/cli.md)

## Scope

The current validator checks public `index-ai` Level 1 and Level 2a behavior:

- AI Manifest fetch, JSON parsing, content type, and schema shape
- Shadow Index fetch, graph shape, node fields, and deprecated `pages` rejection
- clean endpoint fetches through `llm_url`
- clean endpoint content type, HTML leak, and `content_chars` checks
- conservative security heuristics
- shallow discovery hints
- CLI JSON output, human output, and exit codes

It does not provide legal compliance, production certification, a security
audit, vulnerability scanning, AI traffic guarantees, SEO ranking guarantees,
Level 2b relations, or Level 3 MCP validation.
