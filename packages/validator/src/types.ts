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
  shadow_layer_found: boolean
  shadow_layer_schema_valid: boolean
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
    shadow_layer?: string
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
  }
  meta?: {
    updated?: string
    refresh_frequency?: string
    count?: number
  }
}
