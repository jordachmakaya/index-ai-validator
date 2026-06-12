---
layout: home

hero:
  name: index-ai
  text: Experimental validator docs
  tagline: Experimental free CLI validator for index-ai Level 1 and Level 2a.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: CLI reference
      link: /guide/cli

features:
  - title: Current checkpoint scope
    details: The CLI shell and Sprint 2 runtime utility layer are available. Full validation wiring is implemented progressively across later sprints.
  - title: Package and binary
    details: The npm package is @index-ai/validator. The CLI binary documented here is index-ai.
  - title: Honest limits
    details: This is not production-grade compliance certification and does not guarantee AI traffic.
---

## What this is

`@index-ai/validator` is being built as an experimental CLI package for checking
public `index-ai` Level 1 and Level 2a implementations.

At Doc Checkpoint 2, Sprint 1 has implemented the CLI shell and public
TypeScript types. Sprint 2 has added the runtime utility layer for HTTP fetch
policy, timeout behavior, redirect caps, private-host blocking, URL
normalization, same-origin checks, Unicode NFC `content_chars` counting, and
semaphore-based concurrency limiting.

Mini Sprint 2.1 added durable Vitest tests for those Sprint 2 utilities.

The CLI can parse the documented command shape and print shell output. Full
end-to-end validation is still implemented progressively across later sprints.

## Current limitations

In the current Sprint 2 state, this package does not perform end-to-end live
website validation yet.

Manifest validation, Shadow Index validation, security scanning, discovery
checks, fixture validation, and CI validation are still later work. HTTP fetch
and URL safety utilities exist, but they are not yet wired into the full
validator workflow.

It also does not support Level 2b relations, Level 3 MCP, production-grade
compliance certification, legal control over AI agents, or AI traffic guarantees.
