import type { ValidationCheck, ValidationResult } from '../types'

type HumanFormatOptions = {
  readonly verbose: boolean
}

export function formatHumanResult(
  result: ValidationResult,
  options: HumanFormatOptions,
): string {
  const lines = [
    'index-ai validation result',
    '',
    `Target: ${result.target}`,
    `Duration: ${result.duration_ms} ms`,
    `Conformance: ${result.conformance}`,
    `Passed: ${String(result.passed)}`,
    '',
    'Summary:',
    `- pass: ${result.summary.pass}`,
    `- warn: ${result.summary.warn}`,
    `- fail: ${result.summary.fail}`,
    `- total: ${result.summary.total}`,
    '',
    'Metrics:',
    `- manifest_found: ${String(result.metrics.manifest_found)}`,
    `- shadow_layer_found: ${String(result.metrics.shadow_layer_found)}`,
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
