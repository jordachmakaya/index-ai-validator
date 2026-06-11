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
  - title: Current Sprint 1 scope
    details: The CLI shell is available. Validation logic is implemented progressively across later sprints.
  - title: Package and binary
    details: The npm package is @index-ai/validator. The CLI binary documented here is index-ai.
  - title: Honest limits
    details: This is not production-grade compliance certification and does not guarantee AI traffic.
---

## What this is

`@index-ai/validator` is being built as an experimental CLI package for checking
public `index-ai` Level 1 and Level 2a implementations.

At Doc Checkpoint 1, Sprint 1 has implemented the CLI shell and public TypeScript
types only. The CLI can parse the documented command shape and print shell output,
but the validation checks are not implemented yet.

## Current limitations

In the current Sprint 1 state, this package does not perform manifest validation,
Shadow Index validation, HTTP fetching, security scanning, discovery checks,
fixture validation, or CI validation.

It also does not support Level 2b relations, Level 3 MCP, production-grade
compliance certification, legal control over AI agents, or AI traffic guarantees.
