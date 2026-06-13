---
layout: home

hero:
  name: index-ai-validator
  text: Validate your AI-readable website layer
  tagline: A free experimental CLI for checking index-ai manifests, Shadow Index graphs, clean endpoints, and agent-facing content quality.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: CLI guide
      link: /guide/cli

features:
  - title: Find the manifest
    details: Check whether a public site exposes an index-ai manifest and whether the file can be fetched, parsed, and validated.
  - title: Validate the Shadow Index
    details: Inspect the declared graph structure, Level 2a node fields, clean endpoint URLs, and content character declarations.
  - title: Protect the public AI layer
    details: Flag hard HTML leaks, obvious secret-shaped values outside code examples, private host references, and discovery gaps.
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

## Why this exists

Most websites are optimized for browser rendering, analytics, and human
navigation. AI agents need a different layer: clean metadata, inspectable graph
structure, and content that can be read without scraping a visual page.

This validator checks whether a public site exposes a clean machine-readable
content layer for `index-ai` Level 1 and Level 2a. It is meant to make that
surface easier to test before other tools or agents depend on it.

The project does not promise traffic, certification, SEO ranking, or legal
control over AI agents.

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
