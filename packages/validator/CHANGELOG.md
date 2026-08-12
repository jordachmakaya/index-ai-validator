# @hardmachinelabs/index-ai-validator

## 0.3.0

### Minor Changes

- Level 2b (Agent Graph DAG) support is now complete for `validate`: `--target-level l2b`, structural DAG checks (root existence, bidirectional parent/children consistency, acyclicity, no orphan references), `content_sha256`/`content_version` node-level verification, 0%-drift HTML/JSON reports, and a dynamic AI Fix Prompt card for coding agents.

  `scan` is temporarily gated behind a coming-soon response instead of attempting a live scanner call — it depends on the `agent-view.com` service, which has not launched publicly yet. `scan <url>` now returns instantly with a clear message (human mode) or `{"status": "coming_soon", "message": "...", "docs_url": "..."}` (`--json` mode), exit code `0` in both cases. `scan --html` is a silent no-op. All existing `scan` behavior (network calls, error handling, HTML/JSON output shapes) remains fully implemented and tested — it will resume working once the flag is flipped back on and the service is confirmed reachable. No code was deleted.

  **Behavior-contract note for existing `scan --json` consumers**: previously, a `scan` attempt against the (currently unreachable) service would fail with an `error_type`-shaped error object. It now returns a `status: "coming_soon"` object instead — not an error shape. This is a deliberate, user-facing change; since the remote service has never been publicly reachable, no real-world script should have depended on the prior failure shape, but scripts parsing `scan --json` output should account for the `coming_soon` status.

  Also fixes: the `scan` HTML report's topbar date previously read the system clock instead of the actual scan completion time, making regenerated reports non-deterministic — it now uses the real scan timestamp. Several `validate` report CTA links previously pointed to `agent-view.com` (also not yet live) — the "index-ai standard" masthead link and "Learn about Level 3" / "Learn about the agent layer" CTAs now point to the live spec documentation instead; the "Get the badge" CTA (which has no live equivalent outside the `agent-view.com` service) is now labeled "(coming soon)".

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
