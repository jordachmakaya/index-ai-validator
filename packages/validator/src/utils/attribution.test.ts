import { describe, expect, test } from 'vitest'

import type { AttributionSrc } from './attribution'
import { InvalidAuditUrlError, rewriteAttributionSrc } from './attribution'

// Real fixture from CONTRACT_SCANNER.md §9 — meta.links.audit exactly as
// received from the scanner, pre-attributed with src=cli-json. This module
// never builds an audit URL from scratch, it only rewrites the src param of
// a URL already received.
const auditUrlFixture
  = 'https://agent-view.com/audit?src=cli-json&scanId=3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01'

describe('rewriteAttributionSrc', () => {
  test('rewrites src to cli-report for the HTML report context', () => {
    const result = rewriteAttributionSrc(auditUrlFixture, 'cli-report')
    const parsed = new URL(result)

    expect(parsed.searchParams.get('src')).toBe('cli-report')
    expect(parsed.searchParams.get('scanId')).toBe(
      '3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01',
    )
  })

  test('rewrites src to cli-terminal for the terminal message context', () => {
    const result = rewriteAttributionSrc(auditUrlFixture, 'cli-terminal')
    const parsed = new URL(result)

    expect(parsed.searchParams.get('src')).toBe('cli-terminal')
    expect(parsed.searchParams.get('scanId')).toBe(
      '3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01',
    )
  })

  test('preserves protocol, host, path, scanId, and every other query param untouched', () => {
    const auditUrlWithExtraParam
      = 'https://agent-view.com/audit?src=cli-json&scanId=3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01&utm_campaign=launch'

    const result = rewriteAttributionSrc(auditUrlWithExtraParam, 'cli-report')
    const parsed = new URL(result)

    expect(parsed.protocol).toBe('https:')
    expect(parsed.host).toBe('agent-view.com')
    expect(parsed.pathname).toBe('/audit')
    expect(parsed.searchParams.get('scanId')).toBe(
      '3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01',
    )
    expect(parsed.searchParams.get('utm_campaign')).toBe('launch')
    // Only src changes value; nothing else is added, dropped, or reordered
    // in an observable way.
    expect([...parsed.searchParams.keys()]).toStrictEqual([
      'src',
      'scanId',
      'utm_campaign',
    ])
  })

  test('throws an explicit InvalidAuditUrlError on a malformed audit URL instead of inventing one', () => {
    expect(() => rewriteAttributionSrc('not-an-absolute-url', 'cli-report')).toThrow(
      InvalidAuditUrlError,
    )
  })

  test('rejects cli-json at the type level — it is the value already received from the scanner, never a rewrite target', () => {
    // @ts-expect-error — 'cli-json' is not accepted by rewriteAttributionSrc's
    // src parameter. It is the value the scanner already attributes the audit
    // link with; the CLI only ever rewrites it to 'cli-report' or
    // 'cli-terminal', never back to 'cli-json'. If this stops erroring, the
    // function's parameter type has regressed and `pnpm check` must catch it.
    rewriteAttributionSrc(auditUrlFixture, 'cli-json')
  })

  test('exported AttributionSrc union covers cli-json, cli-report, and cli-terminal', () => {
    const allValues: AttributionSrc[] = ['cli-json', 'cli-report', 'cli-terminal']
    expect(allValues).toHaveLength(3)

    // AttributionSrc is deliberately wider than rewriteAttributionSrc's src
    // parameter: it must include 'cli-json' (the scanner-provided value)
    // even though the function itself never accepts it as a rewrite target.
    const scannerProvided: AttributionSrc = 'cli-json'
    expect(scannerProvided).toBe('cli-json')

    // @ts-expect-error — AttributionSrc is wider than rewriteAttributionSrc's
    // src parameter: 'cli-json' is a valid AttributionSrc value but not a
    // valid rewrite target for the function.
    rewriteAttributionSrc(auditUrlFixture, scannerProvided)
  })
})
