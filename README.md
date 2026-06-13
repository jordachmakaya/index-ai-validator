# index-ai

Monorepo for the experimental `index-ai` validator and documentation.

## Packages

- `@index-ai/validator`: experimental free CLI validator for `index-ai` Level 1 and Level 2a.
- `docs`: VitePress documentation for the validator and current implementation scope.

## Development

Use Node.js 20 or newer and pnpm 10.

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

## Release Readiness

The npm package is prepared from `packages/validator`.

Local verification commands:

```bash
pnpm check
pnpm test
pnpm test:coverage
pnpm build
pnpm pack:dry-run
```

Publishing is manual only. Do not publish from local automation unless the
maintainer explicitly approves it.
