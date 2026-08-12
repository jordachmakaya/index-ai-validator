import { describe, expect, test } from 'vitest'

import { CHECK } from '../constants'
import type { ValidationCheck, ValidationResult } from '../types'
import { formatHumanResult } from './format'

// T5.7_target-level-human-report: formatHumanResult must call
// computeLevelResults() itself (design locked by the CTO — format.ts is the
// single source of truth for this render, not a receiver of data pre-chewed
// by cli.ts) and render a "Requested target level / Tested levels / Achieved
// level / Level results" block using human labels (Level 1 / Level 2a /
// Level 2b), never raw level codes (l1/l2a/l2b). RED until the Coder job
// adds `targetLevel` to HumanFormatOptions and implements the block.
describe('formatHumanResult — target-level grouped report', () => {
  test('l1 requested, l1 fails: prints Requested/Tested/Achieved and exactly one Level results line', () => {
    const checks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'Manifest not found.',
      },
    ]
    const result = buildResult(checks)

    const output = formatHumanResult(result, { verbose: false, targetLevel: 'l1' })

    expect(output).toContain('Requested target level: Level 1')
    expect(output).toContain('Tested levels: Level 1')
    expect(output).toContain('Achieved level: none')
    expect(output).toContain('Level results:')
    expect(output).toContain('- Level 1: 0 pass, 0 warn, 1 fail')
    expect(levelResultLines(output)).toHaveLength(1)
  })

  test('l2a requested, l1 fails: cascade-skips l2a with a reason naming l1, Achieved level stays none', () => {
    const checks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'Manifest not found.',
      },
    ]
    const result = buildResult(checks)

    const output = formatHumanResult(result, { verbose: false, targetLevel: 'l2a' })

    expect(output).toContain('Requested target level: Level 2a')
    expect(output).toContain('Tested levels: Level 1, Level 2a')
    expect(output).toContain('Achieved level: none')
    expect(output).toContain('- Level 1: 0 pass, 0 warn, 1 fail')
    expect(output).toContain('- Level 2a: skipped (Level 1 failed)')
    expect(levelResultLines(output)).toHaveLength(2)
  })

  test('l2a requested, everything passes: Achieved level is Level 2a and no line is skipped', () => {
    const checks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'pass',
        requirement: 'must',
        message: 'Manifest found.',
      },
      {
        code: CHECK.L2A_AGENT_INDEX_FOUND,
        severity: 'pass',
        requirement: 'must',
        message: 'Agent Index graph found.',
      },
    ]
    const result = buildResult(checks)

    const output = formatHumanResult(result, { verbose: false, targetLevel: 'l2a' })

    expect(output).toContain('Requested target level: Level 2a')
    expect(output).toContain('Tested levels: Level 1, Level 2a')
    expect(output).toContain('Achieved level: Level 2a')
    expect(output).toContain('- Level 1: 1 pass, 0 warn, 0 fail')
    expect(output).toContain('- Level 2a: 1 pass, 0 warn, 0 fail')
    expect(output).not.toContain('skipped')
  })

  test('l2b requested, l1 fails: cascade-skips both l2a and l2b, listing all three levels', () => {
    const checks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'Manifest not found.',
      },
    ]
    const result = buildResult(checks)

    const output = formatHumanResult(result, { verbose: false, targetLevel: 'l2b' })

    expect(output).toContain('Requested target level: Level 2b')
    expect(output).toContain('Tested levels: Level 1, Level 2a, Level 2b')
    expect(output).toContain('Achieved level: none')
    expect(output).toContain('- Level 1: 0 pass, 0 warn, 1 fail')
    expect(output).toContain('- Level 2a: skipped (Level 1 failed)')
    expect(output).toContain('- Level 2b: skipped (Level 1 failed)')
    expect(levelResultLines(output)).toHaveLength(3)
  })

  test('l1 requested, l1 has warnings but zero failures: Achieved level is Level 1', () => {
    const checks: ValidationCheck[] = [
      {
        code: CHECK.L1_DOMAIN_MATCH,
        severity: 'warn',
        requirement: 'should',
        message: 'Domain does not match.',
      },
      {
        code: CHECK.DISCOVERY_HTML_LINK,
        severity: 'warn',
        requirement: 'should',
        message: 'No HTML discovery link found.',
      },
    ]
    const result = buildResult(checks)

    const output = formatHumanResult(result, { verbose: false, targetLevel: 'l1' })

    expect(output).toContain('Achieved level: Level 1')
    expect(output).toContain('- Level 1: 0 pass, 2 warn, 0 fail')
  })

  test('non-regression: the existing Summary section is still present and unchanged', () => {
    const checks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'pass',
        requirement: 'must',
        message: 'Manifest found.',
      },
    ]
    const result = buildResult(checks)

    const output = formatHumanResult(result, { verbose: false, targetLevel: 'l1' })

    expect(output).toContain('Summary:')
    expect(output).toContain(`- pass: ${result.summary.pass}`)
    expect(output).toContain(`- warn: ${result.summary.warn}`)
    expect(output).toContain(`- fail: ${result.summary.fail}`)
    expect(output).toContain(`- total: ${result.summary.total}`)
  })
})

/**
 * Extracts the trimmed, non-empty lines of the "Level results:" block from a
 * formatHumanResult output, so tests can assert an exact line count without
 * depending on unrelated sections that come before or after it.
 */
function levelResultLines(output: string): string[] {
  const marker = 'Level results:'
  const markerIndex = output.indexOf(marker)

  if (markerIndex === -1) {
    return []
  }

  const rest = output.slice(markerIndex + marker.length)
  const blockEnd = rest.indexOf('\n\n')
  const block = blockEnd === -1 ? rest : rest.slice(0, blockEnd)

  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function buildResult(
  checks: ValidationCheck[],
  overrides?: Partial<ValidationResult>,
): ValidationResult {
  const pass = checks.filter((check) => check.severity === 'pass').length
  const warn = checks.filter((check) => check.severity === 'warn').length
  const fail = checks.filter((check) => check.severity === 'fail').length

  return {
    schema_version: '0.1',
    target: 'https://example.com',
    generated_at: '2026-06-12T00:00:00.000Z',
    duration_ms: 12,
    conformance: 'none',
    passed: fail === 0,
    summary: { pass, warn, fail, total: checks.length },
    metrics: {
      manifest_found: false,
      manifest_schema_valid: false,
      agent_index_found: false,
      agent_index_schema_valid: false,
      total_nodes: 0,
      nodes_with_llm_url: 0,
      nodes_with_content_chars: 0,
      nodes_with_content_chars_mode: 0,
      valid_clean_endpoints: 0,
      valid_content_chars: 0,
      html_leaks: 0,
      secret_findings: 0,
      coverage: {
        llm_url_percent: 0,
        content_chars_percent: 0,
      },
    },
    checks,
    ...overrides,
  }
}
