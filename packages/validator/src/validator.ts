import { CHECK, SCHEMA_VERSION } from './constants'
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
  const checks = manifestResult.checks
  const summary = summarizeChecks(checks)
  const metrics = createMetrics(checks)
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

function createMetrics(checks: readonly ValidationCheck[]): ValidationMetrics {
  return {
    manifest_found: hasPassingCheck(checks, CHECK.L1_MANIFEST_FOUND),
    manifest_schema_valid: hasPassingCheck(checks, CHECK.L1_MANIFEST_SCHEMA_VALID),
    shadow_layer_found: false,
    shadow_layer_schema_valid: false,
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
  }
}

function getConformance(
  metrics: ValidationMetrics,
  checks: readonly ValidationCheck[],
): ConformanceLevel {
  if (
    metrics.manifest_found
    && metrics.manifest_schema_valid
    && !hasMustFailure(checks)
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

function hasMustFailure(checks: readonly ValidationCheck[]): boolean {
  return checks.some((check) => check.requirement === 'must' && check.severity === 'fail')
}
