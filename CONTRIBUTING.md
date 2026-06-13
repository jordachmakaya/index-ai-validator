# Contributing

Thanks for helping improve `index-ai`.

## Development Setup

Use Node.js 20 or newer and pnpm 10.

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

## Pull Requests

- Keep changes focused and easy to review.
- Do not include generated folders such as `dist`, `coverage`, `.turbo`, or `docs/.vitepress/dist`.
- Add or update tests for validator behavior changes.
- Update docs when behavior changes.
- Do not add dependencies without explaining why.

## Scope

Current public package scope is `@index-ai/validator` for `index-ai` Level 1 and
Level 2a. Do not add audit engine, hosted API, dashboard, Level 2b, or Level 3
MCP behavior in ordinary contributions.
