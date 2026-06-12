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
    details: Sprint 3 adds Level 1 AI Manifest validation through the public validator entrypoint. Full Level 2a validation is implemented later.
  - title: Package and binary
    details: The npm package is @index-ai/validator. The CLI binary documented here is index-ai.
  - title: Honest limits
    details: This is not production-grade compliance certification and does not guarantee AI traffic.
---

## What this is

`@index-ai/validator` is being built as an experimental CLI package for checking
public `index-ai` Level 1 and Level 2a implementations.

At Doc Checkpoint 3, Sprint 1 has implemented the CLI shell and public
TypeScript types. Sprint 2 has added the runtime utility layer for HTTP fetch
policy, timeout behavior, redirect caps, private-host blocking, URL
normalization, same-origin checks, Unicode NFC `content_chars` counting, and
semaphore-based concurrency limiting.

Mini Sprint 2.1 added durable Vitest tests for those Sprint 2 utilities.
Sprint 3 adds Level 1 AI Manifest validation through `validateIndexAi()`.

The CLI can parse the documented command shape and print shell output. The
public validator entrypoint can now validate Level 1 AI Manifest behavior. Full
end-to-end CLI validation is still implemented progressively across later
sprints.

## Current limitations

In the current Sprint 3 state, this package validates the Level 1 AI Manifest
through the public validator entrypoint. It does not perform full end-to-end
Level 2a validation yet.

Shadow Index validation, graph validation, `content_chars` comparison, HTML leak
detection, security scanning, discovery checks, fixture validation, and CI
validation are still later work.

It also does not support Level 2b relations, Level 3 MCP, production-grade
compliance certification, legal control over AI agents, or AI traffic guarantees.
