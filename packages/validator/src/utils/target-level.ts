/**
 * @filemeta
 * type: utility
 * title: Target-level result cascade
 * description: Groups ValidationCheck[] by conformance level (l1/l2a/l2b) and applies cascade-skip semantics — a blocking must/fail at one level skips every level after it instead of reporting phantom counts.
 * job_ref: T5.5_target-level-types-and-cascade
 * functions: [computeLevelResults]
 * inputs: [checks, targetLevel]
 * outputs: [LevelResult[] ordered l1 -> l2a -> l2b, truncated to targetLevel]
 * relations:
 *   - tested_by: packages/validator/src/utils/target-level.test.ts
 * last_update: 2026-07-05
 */

import type { LevelResult, TargetLevel, ValidationCheck } from '../types'

const LEVEL_ORDER: readonly TargetLevel[] = ['l1', 'l2a', 'l2b']

const LEVEL_LABEL: Record<TargetLevel, string> = {
  l1: 'Level 1',
  l2a: 'Level 2A',
  l2b: 'Level 2B',
}

/**
 * Maps a check's code prefix to the level it counts toward. `L2A_*` counts
 * toward l2a, `L2B_*` toward l2b, and everything else (`L1_*`, plus the
 * cross-cutting `DISCOVERY_*` / `HTTP_*` / `SEC_*` families) counts toward l1.
 */
function levelOfCheck(code: string): TargetLevel {
  if (code.startsWith('L2A_')) return 'l2a'
  if (code.startsWith('L2B_')) return 'l2b'
  return 'l1'
}

/**
 * Groups `checks` by target level and applies cascade-skip semantics: level
 * l1 is always computed first; if `targetLevel` requests l2a or l2b, each
 * subsequent level is computed for real unless a prior level in the chain
 * had a blocking failure (requirement 'must' + severity 'fail'), in which
 * case it — and every level after it — is reported as 'skipped' with an
 * explicit reason, and zeroed counters (a skipped level never ran, so it
 * must never carry real or phantom pass/warn/fail counts).
 */
export function computeLevelResults(checks: ValidationCheck[], targetLevel: 'l1'): [LevelResult]
export function computeLevelResults(
  checks: ValidationCheck[],
  targetLevel: 'l2a',
): [LevelResult, LevelResult]
export function computeLevelResults(
  checks: ValidationCheck[],
  targetLevel: 'l2b',
): [LevelResult, LevelResult, LevelResult]
export function computeLevelResults(
  checks: ValidationCheck[],
  targetLevel: TargetLevel,
): LevelResult[] {
  const lastIndex = LEVEL_ORDER.indexOf(targetLevel)
  const levelsToCompute = LEVEL_ORDER.slice(0, lastIndex + 1)

  const results: LevelResult[] = []
  let skipReason: string | undefined

  for (const level of levelsToCompute) {
    if (skipReason) {
      results.push({ level, status: 'skipped', pass: 0, warn: 0, fail: 0, reason: skipReason })
      continue
    }

    const levelChecks = checks.filter((check) => levelOfCheck(check.code) === level)
    const pass = levelChecks.filter((check) => check.severity === 'pass').length
    const warn = levelChecks.filter((check) => check.severity === 'warn').length
    const fail = levelChecks.filter((check) => check.severity === 'fail').length

    results.push({ level, status: 'tested', pass, warn, fail })

    const hasBlockingFailure = levelChecks.some(
      (check) => check.requirement === 'must' && check.severity === 'fail',
    )
    if (hasBlockingFailure) {
      skipReason = `${LEVEL_LABEL[level]} failed`
    }
  }

  return results
}
