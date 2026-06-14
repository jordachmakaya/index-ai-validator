# Level 1 Manifest

Level 1 starts with the AI Manifest. It is a JSON document that describes the
site identity, freshness metadata, and machine-readable entry points for an
`index-ai` implementation.

Level 1 is the base for Level 2a. The public `validateIndexAi()` entrypoint and
the `index-ai` CLI validate the AI Manifest before attempting Agent Index
validation.

## What the AI Manifest is

The AI Manifest is the first public file the validator checks. It answers basic
questions:

- What site or publisher does this file describe?
- Which `index-ai` spec version does it target?
- When was the described content updated or generated?
- Which URL fields point to related machine-readable resources?

Level 1 is structural. Level 2a builds on it by using the current
`access.shadow_layer` manifest field to find and validate the Agent Index.

## Manifest location

The canonical manifest path is:

```txt
/.well-known/index-ai.json
```

The validator also accepts this fallback path:

```txt
/index-ai.json
```

Using the fallback path produces a warning because the canonical path is still
preferred for Level 1.

## Validation flow

```mermaid
flowchart TD
  A["Target URL"] --> B["Fetch /.well-known/index-ai.json"]
  B --> C{"Found?"}
  C -->|No| D["Try /index-ai.json"]
  C -->|Yes| E["Check JSON content type"]
  D --> E
  E --> F["Parse JSON"]
  F --> G["Validate Level 1 schema"]
  G --> H["Use access.shadow_layer for Level 2a when present"]
```

## Required Level 1 fields

The current schema requires:

| Field | Required | Rule |
| --- | ---: | --- |
| `spec_version` | Yes | Must be `"1.0"`. |
| `manifest_version` | Yes | Must be `1`. |
| `identity` | Yes | Must include `name` and `description`. |
| `freshness` | Yes | Must be an object. |

If `level` is present, it must be `level-1` or `level-2a`.

URL-like manifest fields are checked structurally. The current rule accepts
absolute `http` or `https` URLs and root-relative paths.

## Agent Index declaration

Level 2a validation uses:

```txt
access.shadow_layer
```

When present, the validator resolves this path against the target URL and tries
to fetch the Agent Index graph. `/ai-graph.json` is the expected graph target
when a manifest declares that path.

`access.shadow_layer` is the current schema field name. The public docs use
Agent Index for the Level 2a graph to avoid the negative meaning of "shadow" in
AI and security contexts.

## Content type and JSON

The manifest response must be served as JSON.

Accepted content types include:

```txt
application/json
application/*+json
```

The body must parse as valid JSON before schema validation runs. If JSON parsing
fails, schema validation is skipped and the result contains a JSON failure check.

## Domain warning

If `identity.domain` is missing or does not match the host serving the manifest,
the validator reports a warning.

This is a Level 1 consistency warning. It is not a security scan and it is not a
legal ownership check.

## Validation checks

Manifest behavior maps into validation checks:

| Check | Meaning |
| --- | --- |
| `L1_MANIFEST_FOUND` | A manifest was found at the canonical path or fallback path. |
| `L1_FALLBACK_MATCH` | The fallback path was used instead of the canonical path. |
| `L1_MANIFEST_CONTENT_TYPE` | The manifest response used a JSON content type. |
| `L1_MANIFEST_JSON_VALID` | The manifest response parsed as JSON. |
| `L1_MANIFEST_SCHEMA_VALID` | The parsed JSON matched the Level 1 schema. |
| `L1_DOMAIN_MATCH` | `identity.domain` matched the manifest host, or warned if not. |

Failures include actionable messages and fixes where possible.

## TypeScript entrypoint

Level 1, Level 2a, heuristic security checks, and shallow discovery checks are
available through `validateIndexAi()`.

```ts
import { validateIndexAi } from '@hardmachinelabs/index-ai-validator'

const result = await validateIndexAi({
  target: 'https://example.com',
  strict: false,
  strictSecurity: false,
  failOnWarn: false,
  verbose: false,
  timeoutMs: 10000,
  maxConcurrency: 5,
  allowPrivateHosts: false,
})
```

| Option | Required | Default | Description |
| --- | ---: | --- | --- |
| `target` | Yes | - | Target website URL. Must use `http` or `https`. |
| `strict` | No | `false` | Treats SHOULD-level warnings as failures in the global result. |
| `strictSecurity` | No | `false` | Upgrades private/internal infrastructure heuristic findings from warn to fail. |
| `failOnWarn` | No | `false` | Makes warnings fail the global result. |
| `verbose` | No | `false` | Reserved for output detail. |
| `timeoutMs` | No | `10000` | Request timeout in milliseconds. |
| `maxConcurrency` | No | `5` | Maximum concurrent clean endpoint checks. |
| `allowPrivateHosts` | No | `false` | Allows private/local hosts for trusted local development. |

## Scope

Level 1 and Level 2a validation are implemented through `validateIndexAi()`.
For what the package does not implement, see [Scope](/guide/scope).
