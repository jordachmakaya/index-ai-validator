# v0.2.0 — Agent Index taxonomy migration

This release migrates `@hardmachinelabs/index-ai-validator` from the legacy Shadow taxonomy to the new Agent Index taxonomy.

## Breaking changes

- `access.shadow_layer` is replaced by `access.agent_index`
- `/ai-graph.json` is replaced by `/agent-index.json`
- HTML discovery changes from `rel="ai-index"` to `rel="agent-manifest"`
- `robots.txt` and `llms.txt` discovery hints change from `AI-Index:` to `Agent-Manifest:`
- DNS-style discovery changes from `_ai-index` to `_agent-manifest`
- Level 2a metrics are renamed from `shadow_layer_*` to `agent_index_*`
- Legacy Shadow terminology is removed from validator outputs, reports, docs, and tests

There is no legacy compatibility mode in this release.

## Added

- Agent Index terminology across validator checks, CLI output, JSON output, HTML reports, tests, and documentation
- Updated Level 2a documentation page: `level-2a-agent-index`
- Changesets-generated changelog for validator v0.2.0
- Lightweight documentation demo video

## Validation

The release branch was validated with:

\`\`\`bash
pnpm install --frozen-lockfile
pnpm --filter @hardmachinelabs/index-ai-validator check
pnpm --filter @hardmachinelabs/index-ai-validator test
pnpm --filter @hardmachinelabs/index-ai-validator build
npm pack --dry-run
\`\`\`

Additional smoke testing was performed by installing the generated `.tgz` into a clean npm project and generating JSON and HTML reports with `npx index-ai`.

Smoke result:

\`\`\`txt
passed: true
conformance: level-2a
agent_index_found: true
agent_index_schema_valid: true
\`\`\`

Legacy-token grep was clean across source, docs, smoke site, JSON report, and HTML report.
