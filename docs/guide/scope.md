# Scope

This is the single source of truth for what `@hardmachinelabs/index-ai-validator` does, what it does not do, and what it deliberately is not. Other pages link here instead of repeating it.

The validator is honest by design. It measures a specific, public layer and reports what it found. It does not inflate that into a promise.

## What it checks today

The current package validates `index-ai` Level 1 and Level 2a through `validateIndexAi()` and the `index-ai` CLI:

- Level 1 AI Manifest: canonical fetch at `/.well-known/index-ai.json`, fallback at `/index-ai.json` (with a warning), JSON content type, JSON parse, schema shape, and an `identity.domain` host check
- The manifest `access.shadow_layer` declaration
- Shadow Index graph: fetch, JSON content type, JSON parse, schema, `nodes` array, and rejection of the deprecated `pages` array
- Per-node `llm_url`: structural validation, fetch, and clean endpoint content type (`text/markdown` or `text/plain`)
- Hard HTML leak detection, with tolerated soft inline markup reported as a warning
- `content_chars` in `exact` and `max` modes, using Unicode NFC code-point counting
- Conservative security heuristics: secret-shaped values, sensitive variable names, and private infrastructure references in public AI-facing content
- Shallow discovery hints on the homepage, `robots.txt`, and `/llms.txt`

The highest structural level the validator emits is `level-2a`. See [Conformance vs Passed](/guide/conformance-vs-passed).

## What it does not validate

The package does not perform:

- full security audits or vulnerability scanning
- discovery crawling, sitemap validation, or DNS TXT discovery validation
- fixture validation
- Level 2b relations
- Level 3 MCP

`level-2b` and `level-3` exist as reserved values in the result type, but the current validator does not emit them.

## What it is not

`@hardmachinelabs/index-ai-validator` does not:

- certify compliance
- guarantee AI traffic
- guarantee SEO ranking
- provide legal control over AI agents
- prove that a site is safe

`index-ai` is not a formal standard. It is an experimental specification and validator, built in public to explore how websites can expose cleaner, cheaper, and more reliable content surfaces for AI agents.

The HTML report carries the same disclaimer: it is for local or shareable human review, not certification, legal compliance, a traffic guarantee, an SEO ranking guarantee, a security audit, or a vulnerability scan.

## Why the honesty matters

A validator that overclaims is worse than no validator. The value here is narrow and real: the agent-facing layer of a website becomes testable, with deterministic checks and an exact, auditable size metric. Everything on this page is enforced by the code, not by marketing.
