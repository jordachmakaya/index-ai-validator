import { CHECK, SCHEMA_VERSION } from './constants'
import { validateDiscovery } from './checks/discovery'
import { validateGraph } from './checks/graph'
import { validateManifest } from './checks/manifest'
import { validateSecurity } from './checks/security'
import type {
  AiGraphNode,
  ConformanceLevel,
  ValidationCheck,
  ValidationMetrics,
  ValidationResult,
  ValidationSummary,
  ValidatorOptions,
} from './types'

/**
 * One node's declared `content_version` label, surfaced in `--json` output
 * (T5.30, gap flagged by T5.27's reviewer). `checks/graph.ts` only ever
 * emits a check when `content_version` is present but NOT a string
 * (`CHECK.L2A_CONTENT_VERSION_TYPE`, a warn) — a *valid* string
 * `content_version` never produced any check at all, so it never reached the
 * result object. This type/field is additive-only (see
 * `MetricsWithContentVersions` below); it does not change
 * `ValidationMetrics` itself (out of this job's allowed-files scope — see
 * the coder report).
 */
type ContentVersionEntry = {
  readonly node_id: string
  readonly content_version: string
}

/**
 * `ValidationMetrics` widened with an optional `content_versions` list.
 * Deliberately a local intersection type, not an edit to `types.ts`
 * (`ValidationMetrics`'s own module, out of this job's allowed-files scope):
 * assigning a `MetricsWithContentVersions` value into a `ValidationResult`'s
 * `metrics: ValidationMetrics` field is structurally sound (every
 * `ValidationMetrics` property is present) and — because the value is a
 * variable, not a fresh object literal, at the assignment site — TypeScript
 * does not excess-property-check it away. The extra field still serializes
 * through `JSON.stringify`, which is what actually "relays" it to `--json`
 * output.
 */
type MetricsWithContentVersions = ValidationMetrics & {
  readonly content_versions?: readonly ContentVersionEntry[]
}

export async function validateIndexAi(options: ValidatorOptions): Promise<ValidationResult> {
  const startedAt = Date.now()
  const manifestResult = await validateManifest(options)
  const graphResult = manifestResult.manifest
    ? await validateGraph(options, manifestResult.manifest)
    : undefined
  const securityChecks = validateSecurity({
    resources: graphResult?.cleanEndpoints ?? [],
    strictSecurity: options.strictSecurity,
  })
  const discoveryChecks = await validateDiscovery(options)
  const checks = [
    ...manifestResult.checks,
    ...(graphResult?.checks ?? []),
    ...securityChecks,
    ...discoveryChecks,
  ]
  const summary = summarizeChecks(checks)
  const metrics = createMetrics(checks, graphResult?.graph?.nodes?.length ?? 0)
  const conformance = getConformance(metrics, checks)
  const contentVersions = collectContentVersions(graphResult?.graph?.nodes ?? [])
  const metricsWithContentVersions: MetricsWithContentVersions = contentVersions.length > 0
    ? { ...metrics, content_versions: contentVersions }
    : metrics

  return {
    schema_version: SCHEMA_VERSION,
    target: options.target,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    conformance,
    passed: isPassed(checks, options),
    summary,
    metrics: metricsWithContentVersions,
    checks,
  }
}

/**
 * Collects `{ node_id, content_version }` for every graph node whose
 * `content.content_version` is a valid (non-empty) string — the "should
 * relay" half of the content_version contract; the "should warn when not a
 * string" half already lives in `checks/graph.ts`'s
 * `createContentVersionCheck`.
 */
function collectContentVersions(nodes: readonly AiGraphNode[]): ContentVersionEntry[] {
  const entries: ContentVersionEntry[] = []

  for (const node of nodes) {
    const version = node.content?.content_version

    if (typeof version === 'string' && version.length > 0 && node.id !== undefined) {
      entries.push({ node_id: node.id, content_version: version })
    }
  }

  return entries
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
    agent_index_found: hasPassingCheck(checks, CHECK.L2A_AGENT_INDEX_FOUND),
    agent_index_schema_valid: hasPassingCheck(checks, CHECK.L2A_AGENT_INDEX_SCHEMA_VALID),
    total_nodes: totalNodes,
    nodes_with_llm_url: nodesWithLlmUrl,
    nodes_with_content_chars: nodesWithContentChars,
    nodes_with_content_chars_mode: nodesWithContentChars,
    valid_clean_endpoints: countPassingChecks(checks, CHECK.L2A_LLM_URL_CONTENT_TYPE),
    valid_content_chars: validContentChars,
    html_leaks: countNonPassingChecks(checks, CHECK.L2A_LLM_URL_HTML_LEAK),
    secret_findings: countNonPassingChecks(checks, CHECK.SEC_SECRET_PATTERN)
      + countNonPassingChecks(checks, CHECK.SEC_PRIVATE_INFRA_PATTERN),
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
  const isLevel2a = metrics.manifest_found
    && metrics.manifest_schema_valid
    && metrics.agent_index_found
    && metrics.agent_index_schema_valid
    && metrics.total_nodes > 0
    && metrics.nodes_with_llm_url === metrics.total_nodes
    && metrics.valid_clean_endpoints === metrics.total_nodes
    && metrics.valid_content_chars === metrics.total_nodes
    && !hasMustFailure(checks)

  if (isLevel2a) {
    // T5.30 (ADR_007 D3): Level 2b (Agent Graph) checks — `L2B_GRAPH_*`,
    // shipped by T5.29's `validateGraphRelations` — only run at all when at
    // least one node declares `relations` (checks/graph.ts). A pure Level 2a
    // graph with no declared relations emits zero `L2B_*` checks, so
    // "level-2b" is only reported when those checks actually ran AND all
    // passed — never inferred from their mere absence.
    if (hasLevel2bChecks(checks) && !hasLevel2bMustFailure(checks)) {
      return 'level-2b'
    }

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

function hasLevel2bChecks(checks: readonly ValidationCheck[]): boolean {
  return checks.some((check) => check.code.startsWith('L2B_'))
}

function hasLevel2bMustFailure(checks: readonly ValidationCheck[]): boolean {
  return checks.some((check) =>
    check.code.startsWith('L2B_')
    && check.requirement === 'must'
    && check.severity === 'fail')
}
