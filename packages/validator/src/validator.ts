import { CHECK, SCHEMA_VERSION } from './constants'
import { validateGraph } from './checks/graph'
import { validateManifest } from './checks/manifest'
import type {
  ConformanceLevel,
  ValidationCheck,
  ValidationMetrics,
  ValidationResult,
  ValidationSummary,
  ValidatorOptions,
} from './types'

export async function validateIndexAi(options: ValidatorOptions): Promise<ValidationResult> {
  const manifestResult = await validateManifest(options)
  const graphResult = manifestResult.manifest
    ? await validateGraph(options, manifestResult.manifest)
    : undefined
  const checks = [
    ...manifestResult.checks,
    ...(graphResult?.checks ?? []),
  ]
  const summary = summarizeChecks(checks)
  const metrics = createMetrics(checks, graphResult?.graph?.nodes?.length ?? 0)
  const conformance = getConformance(metrics, checks)

  return {
    schema_version: SCHEMA_VERSION,
    target: options.target,
    generated_at: new Date().toISOString(),
    conformance,
    passed: isPassed(checks, options),
    summary,
    metrics,
    checks,
  }
}

function summarizeChecks(checks: readonly ValidationCheck[]): ValidationSummary {
  return checks.reduce<ValidationSummary>(
    (summary, check) => {
      summary[check.severity] += 1
      summary.total += 1

      return summary
    },
    {
      pass: 0,
      warn: 0,
      fail: 0,
      total: 0,
    },
  )
}

function createMetrics(
  checks: readonly ValidationCheck[],
  totalNodes: number,
): ValidationMetrics {
  const nodesWithLlmUrl = countPassingChecks(checks, CHECK.L2A_LLM_URL_FETCH)
  const validContentChars = countPassingChecks(checks, CHECK.L2A_CONTENT_CHARS_EXACT_MATCH)
    + countPassingChecks(checks, CHECK.L2A_CONTENT_CHARS_MAX_VALID)
  const nodesWithContentChars = countChecks(checks, CHECK.L2A_CONTENT_CHARS_EXACT_MATCH)
    + countChecks(checks, CHECK.L2A_CONTENT_CHARS_MAX_VALID)

  return {
    manifest_found: hasPassingCheck(checks, CHECK.L1_MANIFEST_FOUND),
    manifest_schema_valid: hasPassingCheck(checks, CHECK.L1_MANIFEST_SCHEMA_VALID),
    shadow_layer_found: hasPassingCheck(checks, CHECK.L2A_SHADOW_FOUND),
    shadow_layer_schema_valid: hasPassingCheck(checks, CHECK.L2A_SHADOW_SCHEMA_VALID),
    total_nodes: totalNodes,
    nodes_with_llm_url: nodesWithLlmUrl,
    nodes_with_content_chars: nodesWithContentChars,
    nodes_with_content_chars_mode: nodesWithContentChars,
    valid_clean_endpoints: countPassingChecks(checks, CHECK.L2A_LLM_URL_CONTENT_TYPE),
    valid_content_chars: validContentChars,
    html_leaks: countNonPassingChecks(checks, CHECK.L2A_LLM_URL_HTML_LEAK),
    secret_findings: 0,
    coverage: {
      llm_url_percent: percentage(nodesWithLlmUrl, totalNodes),
      content_chars_percent: percentage(validContentChars, totalNodes),
    },
  }
}

function getConformance(
  metrics: ValidationMetrics,
  checks: readonly ValidationCheck[],
): ConformanceLevel {
  if (
    metrics.manifest_found
    && metrics.manifest_schema_valid
    && metrics.shadow_layer_found
    && metrics.shadow_layer_schema_valid
    && metrics.total_nodes > 0
    && metrics.nodes_with_llm_url === metrics.total_nodes
    && metrics.valid_clean_endpoints === metrics.total_nodes
    && metrics.valid_content_chars === metrics.total_nodes
    && !hasMustFailure(checks)
  ) {
    return 'level-2a'
  }

  if (
    metrics.manifest_found
    && metrics.manifest_schema_valid
    && !hasLevelOneMustFailure(checks)
  ) {
    return 'level-1'
  }

  return 'none'
}

function isPassed(
  checks: readonly ValidationCheck[],
  options: ValidatorOptions,
): boolean {
  if (checks.some((check) => check.severity === 'fail')) {
    return false
  }

  if (options.failOnWarn && checks.some((check) => check.severity === 'warn')) {
    return false
  }

  if (
    options.strict
    && checks.some((check) => check.requirement === 'should' && check.severity === 'warn')
  ) {
    return false
  }

  return true
}

function hasPassingCheck(checks: readonly ValidationCheck[], code: string): boolean {
  return checks.some((check) => check.code === code && check.severity === 'pass')
}

function countChecks(checks: readonly ValidationCheck[], code: string): number {
  return checks.filter((check) => check.code === code).length
}

function countPassingChecks(checks: readonly ValidationCheck[], code: string): number {
  return checks.filter((check) => check.code === code && check.severity === 'pass').length
}

function countNonPassingChecks(checks: readonly ValidationCheck[], code: string): number {
  return checks.filter((check) => check.code === code && check.severity !== 'pass').length
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }

  return Math.round((numerator / denominator) * 100)
}

function hasMustFailure(checks: readonly ValidationCheck[]): boolean {
  return checks.some((check) => check.requirement === 'must' && check.severity === 'fail')
}

function hasLevelOneMustFailure(checks: readonly ValidationCheck[]): boolean {
  return checks.some((check) =>
    check.code.startsWith('L1_')
    && check.requirement === 'must'
    && check.severity === 'fail')
}
