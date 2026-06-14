---
layout: home

hero:
  name: index-ai-validator
  text: Is your site readable by AI agents?
  tagline: A free CLI that checks whether your site exposes a clean, agent-facing layer — index-ai manifest, Shadow Index, clean endpoints, and measured content size. Runs in your terminal. No signup.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Fix your report
      link: /guide/fix-your-report

features:
  - title: Prove agents can find you
    details: Checks the AI Manifest at /.well-known/index-ai.json and the discovery hints agents rely on — HTML link, HTTP Link header, robots.txt, llms.txt.
  - title: Validate your Shadow Index
    details: Inspects the Level 2a graph nodes, fetches each clean llm_url endpoint, and verifies content_chars against the Unicode NFC code-point count.
  - title: Catch leaks before agents do
    details: Flags secret-shaped values, sensitive variable names, and private infrastructure references in the public content you expose to agents.
---

![index-ai-validator: from a public website through the AI Manifest, Shadow Index, and clean endpoints to a validation result](./index-ai-validator_explained.png)

## Most sites are readable by browsers. Is yours readable by agents?

Browsers read HTML, CSS, and JavaScript. AI agents need a different interface: a clean layer that says what a site is, where its content lives, how fresh it is, and how much text they will pay tokens for before fetching it.

`index-ai` explores that layer through three ideas — an [AI Manifest](/guide/level-1-manifest) that describes the site, a [Shadow Index](/guide/level-2a-shadow-index) that maps public content into structured nodes, and clean content endpoints that return Markdown or plain text instead of rendered HTML.

`@index-ai/validator` makes that layer testable. One command tells you whether yours works.

## Run it

```bash
npx @index-ai/validator https://example.com
```

The package name is `@index-ai/validator`. The CLI binary is `index-ai`. By default it prints a deterministic, summary-first report:

```txt
index-ai validation result

Target: https://example.com
Duration: 42 ms
Conformance: level-2a
Passed: true

Summary:
- pass: 12
- warn: 0
- fail: 0
- total: 12

Metrics:
- manifest_found: true
- shadow_layer_found: true
- total_nodes: 6
- valid_clean_endpoints: 6
- valid_content_chars: 6

No failures or warnings.

Next:
- No blocking validation fixes were found.
```

Add `--json` for a stable machine-readable result, or `--html report.html` for a shareable visual report with a CI verdict, a readiness score, and recommended next steps.

Checks Level 1 + Level 2a today. Not certification, not a traffic promise. → [See the full scope](/guide/scope)

## What it checks

- Level 1 AI Manifest: fetch, JSON content type, JSON parse, and schema shape
- The `access.shadow_layer` declaration and the Shadow Index graph it points to
- Level 2a node fields, `llm_url` structure, and clean endpoint content types
- Hard HTML leaks, with tolerated soft inline markup reported as warnings
- `content_chars` in `exact` and `max` modes, using Unicode NFC code-point counting
- Secret-shaped values and private infrastructure references in public AI-facing content
- Discovery hints on the homepage, `robots.txt`, and `/llms.txt`

For what it deliberately does not do, see [Scope](/guide/scope).

<div class="cta-band">
  <div class="cta-copy">
    <strong>Free tool. Need the layer built for you?</strong>
    <span>Get your agent-facing layer reviewed and shipped by the maker of index-ai.</span>
  </div>
  <div class="cta-actions">
    <a class="primary" href="https://jordach.dev/services/ai-readable-website-audit">AI-readable audit</a>
    <a class="secondary" href="https://jordach.dev/contact">Contact</a>
  </div>
</div>
