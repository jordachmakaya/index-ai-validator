# TEST_PATTERNS.md

Testing governance for the `index-ai` repository.

This file defines how tests must be written for `@hardmachinelabs/index-ai-validator`. It is not a generic testing guide. It is the project-specific contract for durable tests, especially before Sprint 6 final CLI behavior.

## Purpose

The validator exists to answer one product question:

```txt
Does this public website correctly expose the current index-ai agent-facing content layer?
```

Tests must protect that purpose.

A test is useful only if it would fail when the validator gives a wrong answer, emits wrong JSON, returns the wrong exit code, leaks secrets, accepts invalid data, or hides a real failure.

## Scope

This repository currently uses:

```txt
TypeScript
Vitest
Node.js 20+
local HTTP servers
CLI tests
validator/check tests
schema tests
utility tests
pnpm
Turborepo
```

This repository does not currently need browser component tests, Playwright flows, Supertest API tests, database tests, or framework-specific testing patterns.

## Test Philosophy

Tests must prove public behavior.

Prefer testing:

```txt
validateIndexAi() result behavior
public CLI behavior
check codes and severities
schema accept/reject behavior
local HTTP behavior
JSON stdout/stderr behavior
exit code behavior
```

Avoid testing private implementation details that can change without changing user-visible behavior.

A good test answers:

```txt
What user-visible or machine-visible behavior breaks if this code is wrong?
```

A weak test answers only:

```txt
Did this private helper return the same shape today?
```

## Hard Rules

* Tests must fail if the implementation is wrong.
* Tests must use deterministic inputs.
* Tests must not call the public internet.
* Tests must use local HTTP servers for network behavior.
* Tests must close every local server.
* Tests must avoid broad snapshots.
* Tests must avoid `any`.
* Tests must assert exact check codes when validating checks.
* Tests must assert severity, requirement, and important details.
* Tests must cover pass, warn, fail, and edge cases when relevant.
* Tests must cover `validateIndexAi()` for public validator behavior.
* CLI tests must verify stdout, stderr, JSON parsing, and exit codes.
* JSON tests must assert `JSON.parse()` works.
* JSON tests must assert stdout contains no human text.
* Security tests must assert redaction and no raw secret leakage.
* Discovery tests must assert shallow explicit hints only, not crawler behavior.

## Test Structure: Arrange / Act / Assert

Use Arrange / Act / Assert.

```ts
import { describe, expect, it } from 'vitest'
import { countContentChars } from './utils/content-chars'

describe('countContentChars', () => {
  it('counts Unicode NFC code points instead of UTF-16 length', () => {
    // Arrange
    const input = '🚀'

    // Act
    const result = countContentChars(input)

    // Assert
    expect(result).toBe(1)
  })
})
```

Keep setup close to the test unless shared setup makes the test clearer.

## Test Naming Conventions

Use behavior-first names.

Pattern:

```txt
[unit or feature] [expected behavior] [condition]
```

Good:

```ts
describe('validateIndexAi', () => {
  it('returns level-2a when manifest and shadow index checks pass', async () => {})
  it('returns passed false when a clean endpoint leaks a secret', async () => {})
  it('keeps discovery warnings non-blocking by default', async () => {})
})
```

Bad:

```ts
it('works', () => {})
it('test 1', () => {})
it('returns object', () => {})
```

The test name must explain what behavior is protected.

## Assertions

Use exact assertions when the behavior matters.

Preferred:

```ts
expect(check.code).toBe('L2A_LLM_URL_FETCH')
expect(check.severity).toBe('fail')
expect(check.requirement).toBe('must')
expect(check.message).toContain('Clean endpoint')
expect(check.details).toMatchObject({
  node_id: 'home',
})
```

Avoid vague assertions:

```ts
expect(check).toBeTruthy()
expect(result.checks.length).toBeGreaterThan(0)
```

Use `toStrictEqual` for stable object contracts:

```ts
expect(result.summary).toStrictEqual({
  pass: 12,
  warn: 1,
  fail: 0,
  total: 13,
})
```

Use `toMatchObject` when extra fields are acceptable:

```ts
expect(check.details).toMatchObject({
  content_type: 'text/markdown; charset=utf-8',
})
```

## Validator Check Tests

When testing a check, assert the full behavioral contract:

```ts
function findCheck(checks: ValidationCheck[], code: string): ValidationCheck {
  const check = checks.find((candidate) => candidate.code === code)

  if (!check) {
    throw new Error(`Missing check: ${code}`)
  }

  return check
}

it('fails when the Shadow Index graph is missing', async () => {
  // Arrange
  const server = await createTestServer({
    '/.well-known/index-ai.json': {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(validManifest({ shadowLayer: '/missing.json' })),
    },
  })

  try {
    // Act
    const result = await validateIndexAi({
      target: server.origin,
      strict: false,
      strictSecurity: false,
      failOnWarn: false,
      verbose: false,
      timeoutMs: 10000,
      maxConcurrency: 5,
      allowPrivateHosts: true,
    })

    // Assert
    const check = findCheck(result.checks, 'L2A_SHADOW_FOUND')

    expect(check.severity).toBe('fail')
    expect(check.requirement).toBe('must')
    expect(check.message).toContain('Shadow Index')
    expect(result.passed).toBe(false)
  } finally {
    await server.close()
  }
})
```

A validator check test should usually assert:

```txt
check code
severity
requirement
message
fix or details when relevant
result.passed when public behavior is affected
result.conformance when structural behavior is affected
```

## Schema Tests

Schema tests must cover valid data and specific invalid cases.

Good:

```ts
describe('shadowGraphSchema', () => {
  it('rejects nodes missing required summary_method', () => {
    // Arrange
    const graph = validGraph()
    delete graph.nodes[0].content.summary_method

    // Act
    const result = validateShadowGraphSchema(graph)

    // Assert
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: expect.stringContaining('/content'),
          keyword: 'required',
        }),
      ]),
    )
  })
})
```

Do not only assert that validation failed. Assert why it failed.

Schema tests should include:

```txt
valid minimal object
missing required field
wrong enum
wrong type
invalid URL-like field
deprecated field when relevant
edge case that previously broke
```

## HTTP / Fetch Tests

HTTP tests must use local servers.

Do not call:

```txt
https://example.com
https://google.com
https://npmjs.com
any public internet target
```

Use local deterministic responses.

```ts
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

async function createTextServer(body: string, contentType: string) {
  const server = createServer((request, response) => {
    response.statusCode = 200
    response.setHeader('content-type', contentType)
    response.end(body)
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      }),
  }
}
```

Always close servers in `finally`.

```ts
const server = await createTextServer('ok', 'text/plain')

try {
  const result = await fetchText(server.origin)
  expect(result.ok).toBe(true)
} finally {
  await server.close()
}
```

## Local Server Tests

Local server tests must be isolated.

Rules:

```txt
bind to 127.0.0.1
use port 0
derive the runtime port from server.address()
close in finally
avoid shared mutable routes across tests unless isolated
never leave a server running after a test
```

If a test uses a host rewrite or fetch spy, restore it in `finally`.

```ts
const restoreFetch = installFetchHostRewrite('example.test', server.origin)

try {
  const result = await validateIndexAi(options)
  expect(result.passed).toBe(true)
} finally {
  restoreFetch()
  await server.close()
}
```

## CLI Tests

CLI tests must prove user-visible CLI behavior.

Sprint 6 CLI tests must verify:

```txt
stdout
stderr
JSON parseability
duration_ms
top-level passed/conformance/summary
exit code
option wiring
```

Prefer testing the built CLI or a testable CLI handler with the same behavior.

When testing a subprocess, capture:

```txt
exit code
stdout
stderr
```

Example shape:

```ts
import { spawn } from 'node:child_process'

async function runCli(args: string[]) {
  return await new Promise<{
    code: number | null
    stdout: string
    stderr: string
  }>((resolve) => {
    const child = spawn(process.execPath, ['dist/cli.js', ...args], {
      cwd: packageRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
  })
}
```

Do not assert entire human output as a broad snapshot. Assert stable lines and required fragments.

## JSON Output Tests

`--json` mode is a machine contract.

It must be strict.

Tests must prove:

```txt
stdout is JSON only
JSON.parse(stdout) works
stderr is empty for normal validation results
duration_ms exists
passed is top-level
conformance is top-level
summary is top-level
metrics is top-level
checks is top-level
no colors
no banner
no human prose before or after JSON
```

Example:

```ts
it('prints JSON only in --json mode', async () => {
  // Arrange
  const server = await createValidIndexAiServer()

  try {
    // Act
    const result = await runCli([server.origin, '--json', '--allow-private-hosts'])

    // Assert
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')

    const parsed = JSON.parse(result.stdout) as ValidationResult & {
      duration_ms: number
    }

    expect(parsed.target).toBe(server.origin)
    expect(parsed.passed).toBe(true)
    expect(parsed.conformance).toBe('level-2a')
    expect(parsed.duration_ms).toBeGreaterThanOrEqual(0)
    expect(parsed.summary).toHaveProperty('fail')
    expect(parsed.summary).toHaveProperty('warn')
    expect(parsed.summary).toHaveProperty('pass')
    expect(Array.isArray(parsed.checks)).toBe(true)
  } finally {
    await server.close()
  }
})
```

Never print progress logs to stdout in JSON mode.

## Exit Code Tests

The CLI exit code contract is:

```txt
0 -> validation completed and passed is true
1 -> validation completed and passed is false
2 -> CLI usage/config/runtime error before a validation result exists
```

`--no-exit-code` changes only validation failure exit code.

```txt
passed false without --no-exit-code -> 1
passed false with --no-exit-code -> 0
missing URL -> 2
invalid timeout -> 2
invalid maxConcurrency -> 2
```

Example:

```ts
it('returns exit code 2 when the URL is missing', async () => {
  const result = await runCli([])

  expect(result.code).toBe(2)
  expect(result.stdout).toBe('')
  expect(result.stderr).toContain('missing required argument')
})
```

## Security / Discovery Tests

Security and discovery tests must be conservative and exact.

Security tests must verify:

```txt
secret-shaped value outside Markdown code -> fail
secret-shaped value only inside Markdown code -> pass
sensitive env var name only -> warn, not fail
secret evidence is redacted
raw secret value is not printed in details
private infra reference -> warn by default
private infra reference -> fail with strictSecurity
private infra examples inside Markdown code -> pass
private llm_url host -> fail by default
private llm_url host -> pass with allowPrivateHosts
```

Example redaction test:

```ts
it('redacts secret-shaped evidence in failure details', () => {
  const checks = validateSecurity({
    resources: [
      {
        url: 'https://example.test/clean.md',
        text: 'token = "sk_live_1234567890abcdef"',
      },
    ],
    strictSecurity: false,
  })

  const check = findCheck(checks, 'SEC_SECRET_PATTERN')

  expect(check.severity).toBe('fail')
  expect(JSON.stringify(check.details)).not.toContain('sk_live_1234567890abcdef')
  expect(JSON.stringify(check.details)).toContain('[redacted]')
})
```

Discovery tests must verify shallow hints only:

```txt
homepage HTML rel="ai-index"
HTTP Link header rel="ai-index"
robots.txt AI-Index
llms.txt content type
llms.txt bridge to manifest
missing hints warn
strict/failOnWarn can affect passed
no crawler behavior
no sitemap validation
no DNS TXT validation
```

Do not test or imply full crawling.

## content_chars Tests

`content_chars` tests must protect Unicode correctness.

Required coverage:

```txt
exact mode equal -> pass
exact mode mismatch -> fail
max mode under limit -> pass
max mode over limit -> fail
integer required
0 rejected
emoji counts as one code point
decomposed accents normalize to NFC
```

Example:

```ts
it('counts emoji as one Unicode code point', () => {
  expect(countContentChars('🚀')).toBe(1)
})
```

## HTML Leak Tests

HTML leak tests must distinguish hard leaks, tolerated inline markup, and Markdown code examples.

Required coverage:

```txt
<!doctype html> -> fail
<html> -> fail
<body> -> fail
<script> -> fail
<div> -> fail
<nav> -> fail
<br> -> warn
HTML-like text in inline code -> ignored
HTML-like text in fenced code -> ignored
plain Markdown -> pass
```

Do not rely on broad body snapshots.

Assert exact check severity and message fragments.

## Mocking Rules

Use Vitest syntax:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})
```

Allowed:

```ts
const spy = vi.spyOn(globalThis, 'fetch')
```

Avoid Jest syntax:

```ts
jest.fn()
jest.mock()
jest.requireActual()
```

This project uses Vitest.

## Boundary Mocking

Mock boundaries only.

Mock these when necessary:

```txt
global fetch at process boundary
Date/time when deterministic timestamps are needed
process exit behavior if testing an in-process CLI handler
filesystem only if a future feature requires it
```

Do not mock these:

```txt
schema validation logic
content_chars logic
HTML leak detection logic
security scanning logic
discovery decision logic
validateIndexAi business flow
pure utility functions
```

Prefer local HTTP servers over mocking fetch for integration behavior.

If global fetch is mocked, restore it:

```ts
const originalFetch = globalThis.fetch

try {
  globalThis.fetch = testFetch as typeof fetch
  // test behavior
} finally {
  globalThis.fetch = originalFetch
}
```

## Determinism Rules

Tests must be repeatable.

Do:

```txt
use local servers
use fixed test data
use fixed routes
use deterministic timestamps when needed
assert stable fields
close resources
restore spies
```

Do not:

```txt
call public internet
depend on current external websites
depend on network timing
depend on test order
share mutable state across tests
use broad snapshots
leave timers or servers open
```

If a test checks elapsed time, do not require an exact value. Assert type and reasonable range:

```ts
expect(result.duration_ms).toBeGreaterThanOrEqual(0)
expect(Number.isFinite(result.duration_ms)).toBe(true)
```

## Coverage Expectations

Coverage is not the goal. Behavior protection is the goal.

Minimum expectations for important modules:

```txt
schemas: high coverage and negative cases
validator orchestration: public result behavior
checks: pass/warn/fail coverage
CLI: stdout/stderr/exit code/JSON behavior
HTTP: timeout, redirects, private host blocking, content-type paths
security: redaction and false-positive protection
discovery: shallow hint behavior
```

Do not add meaningless tests only to raise coverage.

A test that does not fail on a real bug is noise.

## Anti-Patterns

| Anti-pattern                           | Problem                       | Better approach                               |
| -------------------------------------- | ----------------------------- | --------------------------------------------- |
| Testing private implementation details | Breaks on harmless refactor   | Test public inputs/outputs                    |
| Snapshotting full validation results   | Diffs become unreadable       | Assert check codes, severity, and key details |
| Public internet in tests               | Flaky and slow                | Use local HTTP servers                        |
| Leaving servers open                   | Test leaks and port conflicts | Close servers in `finally`                    |
| Mocking business logic                 | False confidence              | Test real validator flow                      |
| Accepting `any` in tests               | Hides type bugs               | Use exact types or `unknown` narrowing        |
| Only testing happy paths               | Misses regressions            | Cover pass, warn, fail, edge cases            |
| Ignoring stderr                        | CLI contract can break        | Assert stdout and stderr                      |
| Not checking exit codes                | CI behavior can break         | Assert exit code 0/1/2                        |
| Broad snapshots                        | No one reviews them properly  | Assert specific stable fields                 |
| Permanent skipped tests                | Dead protection               | Fix or delete                                 |
| Testing third-party libraries          | Wasted effort                 | Test our integration contract                 |
| Swallowed async errors                 | False passes                  | Always `await` async work                     |

Bad:

```ts
it('returns checks', async () => {
  const result = await validateIndexAi(options)

  expect(result.checks.length).toBeGreaterThan(0)
})
```

Better:

```ts
it('fails when the manifest is not valid JSON', async () => {
  const result = await validateIndexAi(options)

  const check = findCheck(result.checks, 'L1_MANIFEST_JSON_VALID')

  expect(check.severity).toBe('fail')
  expect(check.requirement).toBe('must')
  expect(result.passed).toBe(false)
})
```

## Sprint 6 CLI Test Contract

Sprint 6 must not be accepted unless tests prove the final CLI contract.

Required CLI tests:

```txt
--json emits JSON only
JSON.parse works
duration_ms exists
passed is top-level
conformance is top-level
summary is top-level
stderr is empty for normal validation results
human output is deterministic
human output includes duration
human output includes conformance
human output includes passed
human output includes fail/warn/pass counts
human output shows failures
human output shows warnings
human output shows fixes when available
exit code 0 for passed true
exit code 1 for passed false
--no-exit-code returns 0 for validation failure
exit code 2 for missing URL
exit code 2 for invalid timeout
exit code 2 for invalid maxConcurrency
--strict affects passed with SHOULD warnings
--fail-on-warn affects passed with warnings
--strict-security affects private infra behavior
--allow-private-hosts allows local/private development targets
--verbose includes passed checks
non-verbose stays concise
```

Sprint 6 tests must fail if:

```txt
JSON mode prints human text
JSON mode prints colors
JSON mode prints banners
JSON mode omits duration_ms
JSON mode omits top-level passed/conformance/summary
passed false exits 0 without --no-exit-code
--no-exit-code does not work
missing URL is not exit 2
invalid timeout is accepted
invalid maxConcurrency is accepted
strict/failOnWarn/strictSecurity are not wired
allowPrivateHosts is not wired
stderr contains normal validation output
```

## Sprint Review Test Gate

Before a sprint can receive GO, the report must include:

```txt
files changed
tests added or updated
commands run
coverage summary
search for any
evidence that no public internet is used
evidence that local servers are closed
exit code evidence for CLI work
JSON parse evidence for JSON work
known limitations
```

The reviewer must request source files and command outputs before GO.

A sprint cannot receive GO from a report alone.

## Required Commands for Test Review

For validator implementation sprints:

```bash
pnpm --filter "./packages/validator" test
pnpm --filter "./packages/validator" test:coverage
pnpm --filter "./packages/validator" check
pnpm --filter "./packages/validator" build
pnpm check
pnpm build
```

For CLI sprints, also run:

```bash
node packages/validator/dist/cli.js --help
node packages/validator/dist/cli.js
```

The missing URL command must exit with code `2`.

On Windows PowerShell, verify exit code with:

```powershell
node packages/validator/dist/cli.js
$LASTEXITCODE
```

## Final Rule

Tests are not decoration.

For this repository, tests are the executable contract between:

```txt
the index-ai spec
the validator implementation
the CLI
CI users
future audit tooling
```

If a test does not protect that contract, rewrite it or remove it.
