---
layout: home

hero:
  name: index-ai-validator
  text: Is your site readable by AI agents?
  tagline: A free CLI with two features. Default validation mode checks whether your site correctly exposes the index-ai layer — manifest, Agent Index, clean endpoints, measured content size. `scan` calls the remote Agent View scanner and shows how AI-ready your site is overall. Runs in your terminal. No signup.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Fix your report
      link: /guide/fix-your-report

features:
  - title: Check your discovery signals
    details: Checks the AI Manifest at /.well-known/index-ai.json and the discovery hints agents rely on — HTML link, HTTP Link header, robots.txt, llms.txt.
  - title: Validate your Agent Index
    details: Inspects the Level 2a graph nodes, fetches each clean llm_url endpoint, and verifies content_chars against the Unicode NFC code-point count.
  - title: Catch leaks before agents do
    details: Flags secret-shaped values, sensitive variable names, and private infrastructure references in the public content you expose to agents.
  - title: See your AI-readiness score
    details: Run `scan` to call the remote Agent View scanner — one URL, one score out of 100, one shareable report showing the gap between what humans see and what bots can extract.
---

<br>

<div class="hero-media">
  <video src="/can_AI_Read_Your_Site_hardmachinelabs.mp4" controls autoplay muted loop playsinline style="width: 100%; height: auto; border-radius: 12px;" aria-label="index-ai-validator: from a public website through the AI Manifest, Agent Index, and clean endpoints to a validation result">
    Your browser does not support the video tag. The index-ai-validator demo shows a public website validated through the AI Manifest, Agent Index, and clean endpoints to a validation result.
  </video>
</div>

## What is index-ai-validator?

`@hardmachinelabs/index-ai-validator` is a free CLI that checks two
things:

1. **Is a site's `index-ai` layer already implemented correctly?**
   Default validation mode — local, no signup, no account.
2. **How AI-ready is a site overall, implemented or not?**
   `scan` — calls the remote Agent View scanner, returns a score, a
   verdict, and findings.

Run either against a real site in one command.

## What is Agent View?

![llms.txt vs index-ai: llms.txt is a human-readable note providing context; index-ai is a queryable, structured interface](llmTxt_vs_index-ai-hardmachinelabs.png)

If `llms.txt` is a human-readable note, `index-ai` is a queryable,
structured interface.

Most sites are built for browsers: HTML, CSS, and JavaScript. AI agents
read that same page differently — they need a clean, machine-readable
interface that states what a site is, where its content lives, how fresh
it is, and how much text they will pay tokens for before fetching it.
Agent View is that interface: an [AI Manifest](/guide/level-1-manifest),
an [Agent Index](/guide/level-2a-agent-index), and clean content
endpoints that return Markdown or plain text instead of rendered HTML.
It is defined by the open [`index-ai` specification](https://github.com/jordachmakaya/index-ai)
and diagnosed at scale by [Agent View](https://agent-view.com), the
remote scanner `scan` calls.

## See it for yourself

[Jordach's own site](https://jordach.dev) implements Agent View — proof,
not a claim to take on faith. Try this:

1. Copy `https://jordach.dev`.
2. Paste it into any LLM chat (ChatGPT, Claude, or similar) and ask it
   questions about Jordach — his background, his work, his projects.
3. Then ask the LLM directly: was that information easy to retrieve, and
   why?

Easy or hard, and why, is exactly what this CLI measures. Run `scan` or
Default validation mode on your own site next.

## Run it

```bash
npx @hardmachinelabs/index-ai-validator scan https://example.com
```

Returns an AI-readiness score out of 100, findings, and an optional shareable HTML report — no implementation required first.

```bash
npx @hardmachinelabs/index-ai-validator https://example.com
```

The package name is `@hardmachinelabs/index-ai-validator`. The CLI binary is `index-ai`, and Default validation mode runs automatically — there is no command keyword to type. By default it prints a deterministic, summary-first report:

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
- agent_index_found: true
- total_nodes: 6
- valid_clean_endpoints: 6
- valid_content_chars: 6

No failures or warnings.

Next:
- No blocking validation fixes were found.
```

Both commands accept `--json` for a stable machine-readable result, and `--html` for a shareable HTML report.

Default validation mode checks Level 1 + Level 2a conformance today. `scan` calls the remote Agent View scanner for a broader AI-readiness diagnostic. Neither is certification, and neither is a traffic promise. → [See the full scope](/guide/scope)

## What Default validation mode checks

- Level 1 AI Manifest: fetch, JSON content type, JSON parse, and schema shape
- The `access.agent_index` declaration and the Agent Index graph it points to
- Level 2a node fields, `llm_url` structure, and clean endpoint content types
- Hard HTML leaks, with tolerated soft inline markup reported as warnings
- `content_chars` in `exact` and `max` modes, using Unicode NFC code-point counting
- Secret-shaped values and private infrastructure references in public AI-facing content
- Discovery hints on the homepage, `robots.txt`, and `/llms.txt`

## What `scan` checks

- Five scored dimensions from the remote Agent View scanner: `access`, `extractability`, `citability`, `safety`, and `agent_layer`
- The gap between what a human sees (rendered page) and what a bot can extract (raw content)
- Findings ranked by severity, with fix links back to `index-ai` where relevant

For what each command deliberately does not do, see [Scope](/guide/scope).

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
