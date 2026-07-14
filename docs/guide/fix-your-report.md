# Fix Your Report

Use the HTML report to decide what to repair next on a public `index-ai`
implementation. The report is a human review artifact. JSON remains the
automation output.

The report is a review aid, not a guarantee — see [Scope](/guide/scope).

## Read the top cards

Start with the top cards:

- `CI Verdict` shows `Passed` or `Failed` from the same `passed` field used by
  JSON output and exit codes.
- `Readiness` is a human progress indicator based on passed checks.
- `Conformance` shows the highest implemented structural level reached.
- `Summary` counts pass, warn, fail, and total checks.

## CI Verdict vs Readiness

`Passed` or `Failed` is for automation. It controls the normal CLI exit code.

`Readiness` is report-only. It helps a human see progress, but it does not
change `passed`, `conformance`, JSON output, or exit codes.

## If Level 1 is blocked

Add a valid AI Manifest at:

```txt
/.well-known/index-ai.json
```

You can also expose the fallback path:

```txt
/index-ai.json
```

The manifest should describe the site identity, freshness, and available
`index-ai` access paths.

## If discovery warnings appear

Add the discovery hints that fit your deployment:

- a homepage `<link rel="agent-manifest">` element
- an HTTP `Link` header
- an `Agent-Manifest` hint in `robots.txt`
- a `/llms.txt` bridge that points to the AI Manifest

Discovery warnings do not replace the manifest itself. They help agents and
tools find it.

## If the Agent Index is missing

Add `/agent-index.json` and declare it in the AI Manifest under
`access.agent_index`.

The Agent Index should list public pages or resources that have clean
agent-facing content.

## If clean endpoints fail

Make each `llm_url` endpoint return `text/markdown` or `text/plain`.

Clean endpoints should avoid HTML, CSS, navigation, scripts, tracking snippets,
private data, and unrelated page chrome. They should expose the public content
an agent needs to inspect.

## If content_chars fails

Measure `content_chars` from the exact clean endpoint response after Unicode NFC
normalization.

Do not count the browser page, template HTML, navigation, or a different draft
of the clean endpoint body.

## If content_sha256 does not match

This only fires in `content_chars_mode: exact`. It means the content served at
`llm_url` right now is not byte-for-byte (after Unicode NFC normalization) the
content you declared `content_sha256` for when you last computed it.

Re-hash the current clean endpoint response and update `content_sha256`, or
restore the content that matches the declared hash. `content_sha256` is
optional — you can also remove it if you do not want to maintain it, without
losing Level 2a conformance.

## If a Level 2b DAG check fails

This only fires when at least one node declares `relations` and
`--target-level l2b` (or higher) was requested. It never affects an
already-earned Level 1 or Level 2a result.

- **`L2B_GRAPH_ROOT_EXISTS` fails**: set `relations.parent` to `null`
  (explicitly, not just omitted) on the node with no parent in the graph.
- **`L2B_GRAPH_BIDIRECTIONAL` fails**: for every node listed in another
  node's `relations.children`, make sure that listed node's own
  `relations.parent` points back to it — the check requires agreement in
  both directions.
- **`L2B_GRAPH_ACYCLIC` fails**: trace the `parent`/`children` chain
  starting from the reported nodes and break the loop — remove or
  redirect one of the edges so no path returns to where it started.
- **`L2B_GRAPH_NO_ORPHANS` fails**: remove the dangling id from
  `relations.children`/`relations.related`, or add the missing node to
  the graph.

See [Level 2b Agent Graph](/guide/level-2b-agent-graph) for the full rules.

## If security findings appear

Remove secrets, tokens, private infrastructure references, or sensitive data
from public AI-facing content.

The security checks are conservative heuristics. Treat findings as prompts to
inspect the public content carefully.

## Re-run the validator

Generate a new JSON or HTML report after each fix:

```bash
index-ai https://example.com --json
index-ai https://example.com --html report.html
```

Use JSON for CI and automation. Use HTML when a person needs to review the
current state and choose the next repair.
