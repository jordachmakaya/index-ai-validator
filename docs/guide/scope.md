# Scope

This is the single source of truth for what `@hardmachinelabs/index-ai-validator` does, what it does not do, and what it deliberately is not. Other pages link here instead of repeating it.

The validator is honest by design. It measures a specific, public layer and reports what it found. It does not inflate that into a promise.

The package has two features, each with its own scope: Default validation
mode (local, checks an already-implemented `index-ai` layer) and `scan`
(remote, diagnoses AI-readiness overall). This page covers both.

## What Default validation mode checks today

Default validation mode validates `index-ai` Level 1 and Level 2a through `validateIndexAi()` and the `index-ai` CLI:

- Level 1 AI Manifest: canonical fetch at `/.well-known/index-ai.json`, fallback at `/index-ai.json` (with a warning), JSON content type, JSON parse, schema shape, and an `identity.domain` host check
- The manifest `access.agent_index` declaration
- Agent Index graph: fetch, JSON content type, JSON parse, schema, `nodes` array, and rejection of the deprecated `pages` array
- Per-node `llm_url`: structural validation, fetch, and clean endpoint content type (`text/markdown` or `text/plain`)
- Hard HTML leak detection, with tolerated soft inline markup reported as a warning
- `content_chars` in `exact` and `max` modes, using Unicode NFC code-point counting
- Conservative security heuristics: secret-shaped values, sensitive variable names, and private infrastructure references in public AI-facing content
- Shallow discovery hints on the homepage, `robots.txt`, and `/llms.txt`

The highest structural level Default validation mode emits is `level-2a`. See [Conformance vs Passed](/guide/conformance-vs-passed).

## What Default validation mode does not validate

Default validation mode does not perform:

- full security audits or vulnerability scanning
- discovery crawling, sitemap validation, or DNS TXT discovery validation
- fixture validation
- Level 2b relations
- Level 3 MCP

`level-2b` and `level-3` exist as reserved values in the result type, but the current validator does not emit them.

## What `scan` checks today

`scan` calls the remote Agent View scanner service and returns a broader,
independently-computed model of AI-readiness — it does not run Default
validation mode's checks, and it works whether or not `index-ai` is
implemented at all:

- Five scored dimensions: `access`, `extractability`, `citability`,
  `safety`, `agent_layer`
- Findings ranked by severity (`P0`, `P1`, `P2`), each with an effort
  estimate and a fix link where available
- A noise ratio, a CSR (client-side-rendering) gap percentage, and a
  rendered-vs-raw comparison status

Scoring, dimension weights, and finding content are computed and owned by
the remote scanner service, not by this package, and can change
independently of this package's version — the same version-pinned-contract
caution that applies to any external dependency.

## What `scan` does not check

`scan` does not perform Default validation mode's Level 1/Level 2a schema
and endpoint checks — the two features are independent, not layered. It
has no separate pass/fail exit code the way Default validation mode does: a
low score or `P0` findings still exit `0`; only a request or usage failure
exits non-zero. It does not perform full security audits, vulnerability
scanning, discovery crawling, sitemap validation, or DNS TXT discovery
validation either.

## What neither feature is

Neither Default validation mode nor `scan`:

- certifies compliance
- guarantees AI traffic
- guarantees SEO ranking
- provides legal control over AI agents
- proves that a site is safe

`index-ai` is not a formal standard. It is an experimental specification and validator, built in public to explore how websites can expose cleaner, cheaper, and more reliable content surfaces for AI agents.

Both HTML reports carry the same disclaimer: they are for local or shareable human review, not certification, legal compliance, a traffic guarantee, an SEO ranking guarantee, a security audit, or a vulnerability scan.

## Why the honesty matters

A validator that overclaims is worse than no validator. The value here is narrow and real: the agent-facing layer of a website becomes testable, with deterministic checks and an exact, auditable size metric, and its overall AI-readiness becomes measurable against a broader, independently-scored model. Everything on this page is enforced by the code, not by marketing.
