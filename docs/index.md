---
layout: home

hero:
  name: index-ai-validator
  text: Experimental validator docs
  tagline: Experimental free CLI validator for index-ai Level 1 and Level 2a.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: CLI guide
      link: /guide/cli

features:
  - title: Implemented CLI
    details: The index-ai binary runs validateIndexAi(), prints deterministic human output, and supports stable JSON output.
  - title: Machine-readable results
    details: JSON mode includes duration_ms, conformance, passed, summary, metrics, and checks at the top level.
  - title: Honest limits
    details: The validator checks Level 1 and Level 2a exposure. It is not certification, a traffic guarantee, or a security audit.
---

## What this is

`index-ai-validator` is the repository for the experimental `@index-ai/validator`
package and docs.

- [`index-ai`](https://github.com/jordachmakaya/index-ai) is the experimental specification being validated.

`@index-ai/validator` is an experimental free CLI validator for public
`index-ai` Level 1 and Level 2a implementations.

The CLI binary is:

```txt
index-ai
```

Run it with:

```bash
npx @index-ai/validator https://example.com
```

The command calls `validateIndexAi()`, produces a human-readable report by
default, and can produce stable machine-readable JSON with `--json`.

## Current capabilities

The validator checks:

- Level 1 AI Manifest fetch, JSON content type, JSON parse, and schema shape
- manifest `access.shadow_layer`
- Shadow Index graph fetch from the declared path
- graph JSON content type and JSON parse
- graph `nodes` array and deprecated `pages` rejection
- required Level 2a node content fields
- `llm_url` structure and fetch behavior
- clean endpoint content type: `text/markdown` or `text/plain`
- hard HTML leaks and tolerated soft inline HTML warnings
- `content_chars_mode: exact`
- `content_chars_mode: max`
- Unicode NFC code-point counting
- obvious secret-shaped value detection outside Markdown code
- sensitive variable-name reference warnings
- private/internal infrastructure reference warnings
- private `llm_url` blocking by default
- homepage, `robots.txt`, and `/llms.txt` discovery hints
- `level-2a` conformance when Level 1 and Level 2a checks pass
- CLI JSON output, human output, and exit codes

## Current limitations

The package does not validate:

- full security audits
- vulnerability scanning
- discovery crawling
- sitemap validation
- DNS TXT discovery validation
- fixture validation
- Level 2b relations
- Level 3 MCP

It does not certify compliance, guarantee AI traffic, provide legal control over
AI agents, or prove that a site is safe.
