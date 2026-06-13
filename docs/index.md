---
layout: home

hero:
  name: index-ai
  text: Experimental validator docs
  tagline: Experimental free CLI validator for index-ai Level 1 and Level 2a.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Level 2a Shadow Index
      link: /guide/level-2a-shadow-index

features:
  - title: Implemented scope
    details: Sprint 5 implements Level 1, Level 2a, heuristic security checks, and shallow discovery checks through validateIndexAi().
  - title: Package and binary
    details: The npm package is @index-ai/validator. The CLI binary documented here is index-ai.
  - title: Honest limits
    details: The CLI command itself is still not the final full validator CLI behavior, and this package is not production-grade compliance certification.
---

## What this is

`@index-ai/validator` is an experimental free CLI validator for public
`index-ai` Level 1 and Level 2a implementations.

Sprint 5 implements Level 2a Shadow Index validation through the public
`validateIndexAi()` entrypoint. That includes AI Manifest validation, Shadow
Index graph fetch, graph schema validation, clean endpoint fetches, clean
endpoint content-type checks, HTML leak detection, `content_chars` validation,
heuristic security checks, and shallow discovery checks.

The CLI command itself is still not the final full validator CLI behavior. It
can parse the documented command shape, but final CLI JSON output, final exit
codes, and CI behavior are later work.

## Current capabilities

The validator entrypoint can now check:

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

## Current limitations

In the current Sprint 5 state, the package does not implement:

- final full CLI validation behavior
- final CLI JSON output
- final CLI exit-code behavior
- full security audits
- vulnerability scanning
- discovery crawling
- sitemap validation
- DNS TXT discovery validation
- fixture validation
- CI validation behavior
- Level 2b relations
- Level 3 MCP

It does not certify compliance, guarantee AI traffic, provide legal control over
AI agents, or prove that a site is safe.
