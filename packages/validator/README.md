# @index-ai/validator

Experimental free CLI validator for `index-ai` Level 1 and Level 2a.

It checks public `index-ai` implementations and reports structured validation
checks for the AI Manifest, Level 2a Shadow Index, clean endpoints,
`content_chars`, heuristic security findings, and shallow discovery hints.

It is not compliance certification, a legal review, a security audit, a
vulnerability scanner, or an AI traffic promise.

## Installation

Run without installing:

```bash
npx @index-ai/validator https://example.com
```

Install as a development dependency:

```bash
pnpm add -D @index-ai/validator
```

Then run:

```bash
pnpm exec index-ai https://example.com
```

The package name is `@index-ai/validator`.

The primary CLI binary is `index-ai`.

## CLI Usage

```bash
index-ai <url> [--json] [--verbose] [--strict] [--strict-security] [--fail-on-warn] [--no-exit-code] [--timeout <ms>] [--max-concurrency <n>] [--allow-private-hosts]
```

Common examples:

```bash
index-ai https://example.com
index-ai https://example.com --strict --fail-on-warn
index-ai http://localhost:3000 --allow-private-hosts
```

## TypeScript Usage

```ts
import { validateIndexAi } from '@index-ai/validator'

const result = await validateIndexAi({
  target: 'https://example.com',
  strict: false,
  strictSecurity: false,
  failOnWarn: false,
  verbose: false,
  timeoutMs: 10000,
  maxConcurrency: 5,
  allowPrivateHosts: false,
})
```

Public exports:

```ts
export { validateIndexAi } from '@index-ai/validator'
export type * from '@index-ai/validator'
```

## What It Validates

Current implemented scope:

- Level 1 AI Manifest fetch, content type, JSON parse, and schema shape
- canonical manifest path and fallback manifest warning
- `identity.domain` host mismatch warning
- `access.shadow_layer`
- Level 2a Shadow Index graph fetch, content type, JSON parse, and schema shape
- required Level 2a node fields
- deprecated `pages` array rejection
- `llm_url` structure and fetch behavior
- clean endpoint content type: `text/markdown` or `text/plain`
- private `llm_url` host blocking by default
- hard HTML leak failure and soft inline HTML warning
- `content_chars` exact and max checks using Unicode NFC code point counting
- heuristic secret-shaped value detection outside Markdown code
- sensitive environment variable name warnings
- private/internal infrastructure reference warnings
- shallow discovery hints for homepage HTML, HTTP `Link`, `robots.txt`, and `/llms.txt`

## What It Does Not Validate

Current limits:

- no Level 2b relation validation
- no Level 3 MCP validation
- no full security audit
- no vulnerability scanning
- no site crawling
- no sitemap validation
- no DNS TXT discovery validation
- no fixture publishing workflow guarantee
- no hosted API, dashboard, audit engine, or benchmark mode

## Conformance vs Passed

`conformance` is structural. It reports the highest implemented `index-ai`
level the target satisfies: `none`, `level-1`, or `level-2a`.

`passed` is the global verdict. It becomes `false` when any failure exists. It
can also become `false` when warning-sensitive options are enabled.

Useful options:

- `strict`: treats SHOULD-level warnings as global failures.
- `failOnWarn`: treats any warning as a global failure.
- `strictSecurity`: upgrades private/internal infrastructure heuristic findings from warn to fail.
- `allowPrivateHosts`: permits local/private targets and `llm_url` hosts for trusted development.

## Security Model

Security checks are conservative heuristics for public AI-facing clean endpoint
text.

Secret-shaped values outside Markdown code fail. Secret-shaped examples only
inside Markdown fenced or inline code are ignored. Sensitive environment
variable names, such as `SUPABASE_SERVICE_ROLE_KEY`, warn but are not treated as
leaked secret values.

Private/internal infrastructure references warn by default and fail when
`strictSecurity` is enabled.

Private `llm_url` hosts fail by default. Use `allowPrivateHosts` only for trusted
local development.

## CI Usage

Recommended CI command:

```bash
pnpm check
pnpm test
pnpm build
```

For release readiness:

```bash
pnpm check
pnpm test
pnpm test:coverage
pnpm build
pnpm --filter @index-ai/validator pack:check
pnpm --filter @index-ai/validator pack:dry-run
```

## Published Files

The npm package publishes only:

- `dist`
- `README.md`
- `LICENSE`
- `package.json`

Repository docs and tests are available on GitHub but are not included in the
npm package tarball.

## License

ISC
