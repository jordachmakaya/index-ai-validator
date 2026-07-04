/**
 * @filemeta
 * type: script
 * title: HTML report preview generator
 * description: Renders both the validate and scan HTML reports with realistic sample data for manual visual review, writing static files under .preview/.
 * job_ref: T3.9a_scan-finding-cta_preview-tooling
 * functions: [main]
 * classes: []
 * inputs: []
 * outputs: [packages/validator/.preview/validate-report.html, packages/validator/.preview/scan-report.html]
 * relations:
 *   - imports: packages/validator/src/utils/html-report.ts
 *   - imports: packages/validator/src/types.ts
 *   - imports: packages/validator/src/schemas.ts
 * last_update: 2026-07-04
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ScanResult } from '../src/schemas'
import type { ValidationResult } from '../src/types'
import { formatHtmlReport, formatScanHtmlReport } from '../src/utils/html-report'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const previewDir = join(scriptDir, '..', '.preview')

const sampleValidationResult: ValidationResult = {
  schema_version: '0.1',
  target: 'https://example.com',
  generated_at: '2026-07-04T09:00:37Z',
  duration_ms: 842,
  conformance: 'level-2a',
  passed: false,
  summary: {
    pass: 6,
    warn: 2,
    fail: 2,
    total: 10,
  },
  metrics: {
    manifest_found: true,
    manifest_schema_valid: true,
    agent_index_found: true,
    agent_index_schema_valid: true,
    total_nodes: 42,
    nodes_with_llm_url: 30,
    nodes_with_content_chars: 28,
    nodes_with_content_chars_mode: 28,
    valid_clean_endpoints: 30,
    valid_content_chars: 28,
    html_leaks: 1,
    secret_findings: 0,
    coverage: {
      llm_url_percent: 71,
      content_chars_percent: 67,
    },
  },
  checks: [
    {
      code: 'L1_MANIFEST_FOUND',
      severity: 'pass',
      requirement: 'must',
      message: 'AI Manifest was successfully discovered.',
      url: 'https://example.com/.well-known/index-ai.json',
    },
    {
      code: 'L1_MANIFEST_SCHEMA_VALID',
      severity: 'pass',
      requirement: 'must',
      message: 'Manifest schema validation succeeded.',
    },
    {
      code: 'L2A_AGENT_INDEX_FOUND',
      severity: 'pass',
      requirement: 'must',
      message: 'Agent Index was successfully discovered.',
      url: 'https://example.com/agent-index.json',
    },
    {
      code: 'L2A_NODE_LLM_URL_COVERAGE',
      severity: 'warn',
      requirement: 'should',
      message: 'Only 71% of nodes expose a clean llm_url endpoint.',
      fix: 'Add an llm_url field to the remaining Agent Index nodes so agents can fetch clean content.',
      docs_url: 'https://index-ai.dev/spec/level-2a#llm_url',
    },
    {
      code: 'L2A_NODE_CONTENT_CHARS_COVERAGE',
      severity: 'warn',
      requirement: 'should',
      message: 'Only 67% of nodes report content_chars.',
      fix: 'Report content_chars on every node so agents can budget context before fetching.',
      docs_url: 'https://index-ai.dev/spec/level-2a#content_chars',
    },
    {
      code: 'L2A_CLEAN_ENDPOINT_HTML_LEAK',
      severity: 'fail',
      requirement: 'must',
      message: 'A clean endpoint returned HTML markup instead of plain content.',
      url: 'https://example.com/blog/announcing-v2',
      details: { nodeId: 'blog-announcing-v2', type: 'page' },
      fix: 'Strip HTML tags and navigation chrome from the clean endpoint response.',
      docs_url: 'https://index-ai.dev/spec/level-2a#clean-endpoints',
    },
    {
      code: 'L2A_NODE_LLM_URL_REQUIRED',
      severity: 'fail',
      requirement: 'must',
      message: 'Node is missing a required llm_url.',
      details: { nodeId: 'pricing-page', type: 'page' },
      fix: 'Add an llm_url pointing to a clean, markup-free version of this page.',
      docs_url: 'https://index-ai.dev/spec/level-2a#llm_url',
    },
    {
      code: 'L1_FRESHNESS_VALID_UNTIL',
      severity: 'pass',
      requirement: 'should',
      message: 'Manifest freshness window is within bounds.',
    },
    {
      code: 'L2A_SECRET_SCAN',
      severity: 'pass',
      requirement: 'must',
      message: 'No secrets detected in clean endpoint responses.',
    },
    {
      code: 'L2A_NODE_LANGUAGE_HEURISTIC',
      severity: 'pass',
      requirement: 'heuristic',
      message: 'Declared node languages are consistent with page content.',
    },
  ],
}

const sampleScanResult: ScanResult = {
  url: 'https://example.com/',
  score: 65,
  verdict: 'Agent-readiness moderate',
  dimensions: [
    { key: 'access', score: 15, max: 20 },
    { key: 'extractability', score: 20, max: 30 },
    { key: 'citability', score: 10, max: 20 },
    { key: 'safety', score: 20, max: 20 },
    { key: 'agent_layer', score: 0, max: 10 },
  ],
  findings: [
    {
      id: 'add-llms-txt',
      severity: 'P1',
      title: 'Add a useful /llms.txt entrypoint',
      effort: 'small',
      detail: 'A /llms.txt file helps agents understand the structure and content of your site.',
    },
    {
      id: 'structured-data',
      severity: 'P2',
      title: 'Add Schema.org structured data',
      effort: 'medium',
      detail: 'Structured data helps AI agents extract information without rendering pages.',
    },
    {
      id: 'agent-layer-missing',
      severity: 'P0',
      title: 'Expose an Agent View entrypoint',
      effort: 'large',
      detail: 'No Agent View was found. Agents currently fall back to rendering full HTML pages.',
    },
  ],
  noiseRatio: 0.12,
  csrGapPercent: 15.4,
  renderedComparison: { status: 'gap' },
  engineVersion: '0.2.0',
  schemaVersion: '1.0',
}

function main(): void {
  mkdirSync(previewDir, { recursive: true })

  const validateReportPath = join(previewDir, 'validate-report.html')
  const scanReportPath = join(previewDir, 'scan-report.html')

  writeFileSync(validateReportPath, formatHtmlReport(sampleValidationResult), 'utf8')
  writeFileSync(
    scanReportPath,
    formatScanHtmlReport(sampleScanResult, 'https://agent-view.com/audit?src=cli-json&scanId=demo'),
    'utf8',
  )

  console.log(`Generated ${validateReportPath}`)
  console.log(`Generated ${scanReportPath}`)
}

main()
