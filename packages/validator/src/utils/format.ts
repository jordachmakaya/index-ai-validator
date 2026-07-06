/**
 * @filemeta
 * type: utility
 * title: Human-readable validation report formatter
 * description: Renders a ValidationResult as a plain-text CLI report, including a grouped-by-level cascade block driven by computeLevelResults.
 * job_ref: T5.7_target-level-human-report
 * functions: [formatHumanResult]
 * classes: []
 * inputs: [ValidationResult, HumanFormatOptions]
 * outputs: [plain-text human validation report]
 * relations:
 *   - imports: packages/validator/src/utils/target-level.ts
 *   - used_by: packages/validator/src/cli.ts
 *   - tested_by: packages/validator/src/utils/format.test.ts
 * last_update: 2026-07-06
 */

import type { LevelResult, TargetLevel, ValidationCheck, ValidationResult } from '../types'
import { computeLevelResults } from './target-level'

type HumanFormatOptions = {
  readonly verbose: boolean
  readonly targetLevel: TargetLevel
}

/**
 * Human-readable labels for the grouped-by-level report, deliberately
 * distinct from `target-level.ts`'s internal `LEVEL_LABEL` (which uses
 * 'Level 2A'/'Level 2B' for its skip-reason strings) — this casing is locked
 * by format.test.ts.
 */
const LEVEL_LABEL: Record<TargetLevel, string> = {
  l1: 'Level 1',
  l2a: 'Level 2a',
  l2b: 'Level 2b',
}

export function formatHumanResult(
  result: ValidationResult,
  options: HumanFormatOptions,
): string {
  const levelResults = computeLevelResultsFor(result.checks, options.targetLevel)

  const lines = [
    'index-ai validation result',
    '',
    `Target: ${result.target}`,
    `Duration: ${result.duration_ms} ms`,
    `Conformance: ${result.conformance}`,
    `Passed: ${String(result.passed)}`,
    '',
    `Requested target level: ${LEVEL_LABEL[options.targetLevel]}`,
    `Tested levels: ${levelResults.map((levelResult) => LEVEL_LABEL[levelResult.level]).join(', ')}`,
    `Achieved level: ${formatAchievedLevel(levelResults)}`,
    '',
    'Level results:',
    ...levelResults.map(formatLevelResultLine),
    '',
    'Summary:',
    `- pass: ${result.summary.pass}`,
    `- warn: ${result.summary.warn}`,
    `- fail: ${result.summary.fail}`,
    `- total: ${result.summary.total}`,
    '',
    'Metrics:',
    `- manifest_found: ${String(result.metrics.manifest_found)}`,
    `- agent_index_found: ${String(result.metrics.agent_index_found)}`,
    `- total_nodes: ${result.metrics.total_nodes}`,
    `- valid_clean_endpoints: ${result.metrics.valid_clean_endpoints}`,
    `- valid_content_chars: ${result.metrics.valid_content_chars}`,
  ]
  const failures = result.checks.filter((check) => check.severity === 'fail')
  const warnings = result.checks.filter((check) => check.severity === 'warn')
  const passed = result.checks.filter((check) => check.severity === 'pass')

  appendCheckSection(lines, 'Failures', failures)
  appendCheckSection(lines, 'Warnings', warnings)

  if (!failures.length && !warnings.length) {
    lines.push('', 'No failures or warnings.')
  }

  if (options.verbose) {
    appendCheckSection(lines, 'Passed checks', passed)
  }

  appendNextSection(lines, result)

  return lines.join('\n')
}

/**
 * Calls `computeLevelResults` with `targetLevel` narrowed to one of its
 * three overloaded literal signatures via an explicit switch, since a plain
 * `TargetLevel`-typed argument doesn't match any single overload of a
 * function overloaded on string literals.
 */
function computeLevelResultsFor(
  checks: ValidationCheck[],
  targetLevel: TargetLevel,
): LevelResult[] {
  switch (targetLevel) {
    case 'l1':
      return computeLevelResults(checks, 'l1')
    case 'l2a':
      return computeLevelResults(checks, 'l2a')
    case 'l2b':
      return computeLevelResults(checks, 'l2b')
  }
}

function formatLevelResultLine(levelResult: LevelResult): string {
  const label = LEVEL_LABEL[levelResult.level]

  if (levelResult.status === 'skipped') {
    return `- ${label}: skipped (${levelResult.reason})`
  }

  return `- ${label}: ${levelResult.pass} pass, ${levelResult.warn} warn, ${levelResult.fail} fail`
}

/**
 * Walks the cascade from l1 upward and returns the label of the highest
 * level that was actually tested with zero failures, stopping at the first
 * level that either was never tested (skipped) or failed itself — mirrors
 * computeLevelResults' cascade-skip semantics. Returns 'none' if even l1
 * failed. Ported from cli.ts's T5.6 `deriveAchievedLevel` (now removed
 * there) so this render has a single source of truth.
 */
function formatAchievedLevel(levelResults: readonly LevelResult[]): string {
  let achieved: TargetLevel | undefined

  for (const levelResult of levelResults) {
    if (levelResult.status !== 'tested' || levelResult.fail > 0) {
      break
    }

    achieved = levelResult.level
  }

  return achieved === undefined ? 'none' : LEVEL_LABEL[achieved]
}

function appendCheckSection(
  lines: string[],
  title: string,
  checks: readonly ValidationCheck[],
): void {
  if (!checks.length) {
    return
  }

  lines.push('', `${title}:`)

  for (const check of checks) {
    lines.push(`- ${check.code}: ${check.message}`)

    if (check.url) {
      lines.push(`  URL: ${check.url}`)
    }

    if (check.fix) {
      lines.push(`  Fix: ${check.fix}`)
    }
  }
}

function appendNextSection(lines: string[], result: ValidationResult): void {
  lines.push('', 'Next:')

  if (result.summary.fail > 0) {
    lines.push('- Fix all fail checks before treating this site as passed.')
    return
  }

  if (result.summary.warn > 0) {
    lines.push('- Review warnings if strict or fail-on-warn is used.')
    return
  }

  lines.push('- No blocking validation fixes were found.')
}
