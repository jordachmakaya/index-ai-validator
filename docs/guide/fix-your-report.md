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
