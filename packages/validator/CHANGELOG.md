# @hardmachinelabs/index-ai-validator

## 0.2.0

### Minor Changes

- Migrate the validator from the legacy Shadow taxonomy to the new Agent Index taxonomy.

  Breaking changes:

  - Replaces `access.shadow_layer` with `access.agent_index`
  - Replaces `/ai-graph.json` with `/agent-index.json`
  - Replaces discovery hints:
    - `rel="ai-index"` becomes `rel="agent-manifest"`
    - `AI-Index:` becomes `Agent-Manifest:`
    - `_ai-index` becomes `_agent-manifest`
  - Renames Level 2a metrics from `shadow_layer_*` to `agent_index_*`
  - Removes legacy public Shadow terminology from validator outputs, reports, docs, and tests

  This is a clean v0.2.0 migration with no legacy compatibility mode.
