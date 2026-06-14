# About

`index-ai-validator` is maintained by Jordach Makaya.

Jordach builds AI infrastructure for insurance claims workflows, with a focus on systems that are reliable, inspectable, and testable before they are trusted in production.

## Why this project exists

Most websites expose content through pages designed for humans: HTML, layout, navigation, scripts, analytics, and visual interaction.

AI agents need something different.

They need a clean, machine-readable layer that explains what a site is, where its important content lives, how fresh that content is, and how much text must be fetched before spending tokens on it.

`index-ai` explores that layer through three ideas:

* an AI Manifest that describes the site;
* a Shadow Index that maps public content into structured nodes;
* clean content endpoints that return Markdown or plain text instead of rendered HTML.

## What this validator does

`index-ai-validator` is the free CLI validator for the experimental `index-ai` specification.

It checks whether a public website exposes the expected Level 1 and Level 2a layer:

* AI Manifest discovery and schema validation;
* Shadow Index graph validation;
* clean `llm_url` endpoint checks;
* `content_chars` consistency;
* HTML leak detection;
* conservative public-content security heuristics;
* machine-readable JSON output for automation.

The goal is not to promise traffic, ranking, certification, or legal control over AI agents.

The goal is simpler: make the agent-facing layer of a website testable.

## Current status

`index-ai` is not a formal standard.

It is an experimental specification and validator built in public to explore how websites can expose cleaner, cheaper, and more reliable content surfaces for AI agents. For the exact boundaries of what the validator checks, see [Scope](/guide/scope).

## Start here

* Run the validator: [Getting Started](/guide/getting-started)
* Read a report: [Fix Your Report](/guide/fix-your-report)
* Source code: [github.com/jordachmakaya/index-ai](https://github.com/jordachmakaya/index-ai)
* Need the layer built for you: [AI-readable website audit](https://jordach.dev/services/ai-readable-website-audit)
