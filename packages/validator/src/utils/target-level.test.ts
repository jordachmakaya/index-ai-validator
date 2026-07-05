import { describe, expect, test } from 'vitest'

import { CHECK } from '../constants'
import type { RequirementKind, Severity, ValidationCheck } from '../types'
import { computeLevelResults } from './target-level'

describe('computeLevelResults', () => {
  test('l1 requested, all checks pass -> a single tested LevelResult for l1', () => {
    const checks: ValidationCheck[] = [
      makeCheck(CHECK.L1_MANIFEST_FOUND, 'pass', 'must'),
      makeCheck(CHECK.L1_MANIFEST_SCHEMA_VALID, 'pass', 'must'),
    ]

    const results = computeLevelResults(checks, 'l1')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      level: 'l1',
      status: 'tested',
      pass: 2,
      warn: 0,
      fail: 0,
    })
  })

  test('l2a requested, l1 passes and l2a passes -> two tested LevelResults, l1 before l2a', () => {
    const checks: ValidationCheck[] = [
      makeCheck(CHECK.L1_MANIFEST_FOUND, 'pass', 'must'),
      makeCheck(CHECK.L2A_AGENT_INDEX_FOUND, 'pass', 'must'),
    ]

    const results = computeLevelResults(checks, 'l2a')

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ level: 'l1', status: 'tested', pass: 1, warn: 0, fail: 0 })
    expect(results[1]).toMatchObject({ level: 'l2a', status: 'tested', pass: 1, warn: 0, fail: 0 })
  })

  test('cascade-skip: l2a requested but l1 has a blocking must/fail -> l2a is skipped with a reason naming l1, never reported as failed', () => {
    const checks: ValidationCheck[] = [
      makeCheck(CHECK.L1_MANIFEST_FOUND, 'fail', 'must'),
      makeCheck(CHECK.L2A_AGENT_INDEX_FOUND, 'pass', 'must'),
    ]

    const results = computeLevelResults(checks, 'l2a')

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ level: 'l1', status: 'tested', pass: 0, warn: 0, fail: 1 })

    const l2aResult = results[1]
    expect(l2aResult.level).toBe('l2a')
    expect(l2aResult.status).toBe('skipped')
    expect(l2aResult.reason).toBeTruthy()
    expect(l2aResult.reason).toMatch(/level 1/i)
    // A skipped level was never actually run - it must never carry real or
    // phantom pass/warn/fail counts that could be misread as "l2a failed".
    expect(l2aResult.pass).toBe(0)
    expect(l2aResult.warn).toBe(0)
    expect(l2aResult.fail).toBe(0)
  })

  test('l1 has only a warn (not a blocking must/fail) -> l2a is not skipped', () => {
    const checks: ValidationCheck[] = [
      makeCheck(CHECK.L1_DOMAIN_MATCH, 'warn', 'should'),
      makeCheck(CHECK.L2A_AGENT_INDEX_FOUND, 'pass', 'must'),
    ]

    const results = computeLevelResults(checks, 'l2a')

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ level: 'l1', status: 'tested', pass: 0, warn: 1, fail: 0 })
    expect(results[1]).toMatchObject({ level: 'l2a', status: 'tested', pass: 1, warn: 0, fail: 0 })
  })

  test('cross-cutting DISCOVERY_/HTTP_/SEC_ checks are counted toward l1', () => {
    const checks: ValidationCheck[] = [
      makeCheck(CHECK.DISCOVERY_HTML_LINK, 'pass', 'should'),
      makeCheck(CHECK.HTTP_NETWORK_ERROR, 'warn', 'should'),
      makeCheck(CHECK.SEC_SECRET_PATTERN, 'fail', 'should'),
    ]

    const results = computeLevelResults(checks, 'l1')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      level: 'l1',
      status: 'tested',
      pass: 1,
      warn: 1,
      fail: 1,
    })
  })

  test('an empty checks array does not throw and returns a coherent tested result with zeroed counters', () => {
    const results = computeLevelResults([], 'l1')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      level: 'l1',
      status: 'tested',
      pass: 0,
      warn: 0,
      fail: 0,
    })
  })
})

function makeCheck(
  code: string,
  severity: Severity,
  requirement: RequirementKind,
): ValidationCheck {
  return {
    code,
    severity,
    requirement,
    message: `fixture check ${code}`,
  }
}
