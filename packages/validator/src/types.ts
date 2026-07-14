/**
 * @filemeta
 * type: type-definition
 * title: Shared validator types
 * description: Defines the ValidationResult contract, its supporting types, and the additive TargetLevelResultJson shape used by --json output.
 * job_ref: T5.8_target-level-json-output
 * functions: []
 * classes: []
 * inputs: []
 * outputs: [ValidationResult, ValidatorOptions, ValidationCheck, LevelResult, TargetLevelResultJson, AiGraphNodeRelations]
 * relations:
 *   - used_by: packages/validator/src/cli.ts
 *   - used_by: packages/validator/src/validator.ts
 *   - used_by: packages/validator/src/utils/format.ts
 *   - used_by: packages/validator/src/utils/target-level.ts
 *   - used_by: packages/validator/src/checks/graph.ts
 * last_update: 2026-07-13
 */

import type { ScanProgressStep } from './client/scanner-client'

export type Severity = 'pass' | 'warn' | 'fail'

export type RequirementKind = 'must' | 'should' | 'heuristic' | 'experimental'

export type ConformanceLevel =
  | 'none'
  | 'level-1'
  | 'level-2a'
  | 'level-2b'
  | 'level-3'

export type ValidatorOptions = {
  target: string
  strict: boolean
  strictSecurity: boolean
  failOnWarn: boolean
  verbose: boolean
  timeoutMs: number
  maxConcurrency: number
  allowPrivateHosts: boolean
}

export type ValidationCheck = {
  code: string
  severity: Severity
  requirement: RequirementKind
  message: string
  url?: string
  details?: Record<string, unknown>
  fix?: string
  docs_url?: string
}

export type ValidationSummary = {
  pass: number
  warn: number
  fail: number
  total: number
}

export type ValidationMetrics = {
  manifest_found: boolean
  manifest_schema_valid: boolean
  agent_index_found: boolean
  agent_index_schema_valid: boolean
  total_nodes: number
  nodes_with_llm_url: number
  nodes_with_content_chars: number
  nodes_with_content_chars_mode: number
  valid_clean_endpoints: number
  valid_content_chars: number
  html_leaks: number
  secret_findings: number
  coverage: {
    llm_url_percent: number
    content_chars_percent: number
  }
}

export type ValidationResult = {
  schema_version: '0.1'
  target: string
  generated_at: string
  duration_ms: number
  conformance: ConformanceLevel
  passed: boolean
  summary: ValidationSummary
  metrics: ValidationMetrics
  checks: ValidationCheck[]
}

export type IndexAiManifest = {
  $schema?: string
  spec_version?: string
  manifest_version?: number
  level?: 'level-1' | 'level-2a'
  identity?: {
    name?: string
    description?: string
    domain?: string
    category?: string[]
    language?: string[]
    geo?: Record<string, unknown>
  }
  publisher?: {
    name?: string
    role?: string
    contact?: string
    verification_hint?: string
  }
  freshness?: {
    content_updated_at?: string
    manifest_generated_at?: string
    refresh_frequency?: string
    valid_until?: string
    cache_max_age_seconds?: number
  }
  policy?: Record<string, unknown>
  entrypoints?: Array<{
    topic?: string
    description?: string
    url?: string
    params?: string[]
  }>
  access?: {
    agent_index?: string
    llms_txt?: string
    mcp_server?: string
    mcp_auth?: string
    mcp_tools?: string[]
  }
  llm_instructions?: string
}

export type AiGraph = {
  $schema?: string
  generated?: string
  spec_version?: string
  total_nodes?: number
  pages?: unknown
  nodes?: AiGraphNode[]
}

export type AiGraphNodeRelations = {
  parent?: string | null
  children?: readonly string[]
  related?: readonly string[]
}

export type AiGraphNode = {
  id?: string
  type?: string
  label?: string
  description?: string
  content?: {
    llm_summary?: string
    llm_url?: string
    content_chars?: number
    content_chars_mode?: 'exact' | 'max'
    summary_method?: 'truncate' | 'llm' | 'manual' | string
    language?: string
    content_sha256?: string
    content_version?: unknown
  }
  meta?: {
    updated?: string
    refresh_frequency?: string
    count?: number
  }
  relations?: AiGraphNodeRelations
}

export type ScanOptions = {
  target: string
  baseUrl?: string
  timeoutMs?: number
  intervalMs?: number
  budgetMs?: number
  onProgress?: (progress: { currentStep: ScanProgressStep }) => void
}

export type TargetLevel = 'l1' | 'l2a' | 'l2b'

export type LevelStatus = 'tested' | 'skipped'

export type LevelResult = {
  level: TargetLevel
  status: LevelStatus
  pass: number
  warn: number
  fail: number
  reason?: string
}

/**
 * The JSON-shaped rendering of a single `LevelResult` entry, keyed by
 * `TargetLevel` under `level_results` in `--json` output (see cli.ts's
 * `buildLevelAwareJson`). Additive to `ValidationResult` — composed onto the
 * JSON object by spread, never merged into the type itself.
 */
export type TargetLevelResultJson =
  | { label: string; status: 'tested'; pass: number; warn: number; fail: number }
  | { label: string; status: 'skipped'; reason: string }
