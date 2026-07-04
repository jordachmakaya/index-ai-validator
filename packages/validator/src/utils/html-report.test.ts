/**
 * @filemeta
 * type: test
 * title: HTML report format tests
 * description: Unit tests for HTML report generation functions ensuring branding compliance, structural integrity, and Plain Speech constraints.
 * job_ref: T3.9a_scan-finding-cta_tester
 * functions: [makeScanResult]
 * classes: []
 * inputs: []
 * outputs: []
 * relations:
 *   - imports: packages/validator/src/utils/html-report.ts
 * last_update: 2026-07-04
 */

import { describe, expect, it } from 'vitest'

import type { ScanResult } from '../schemas'
import type { ValidationResult } from '../types'
import { formatHtmlReport, formatScanHtmlReport } from './html-report'

describe('formatHtmlReport', () => {
  const targetUrl = 'https://example.com'

  const fakeResult: ValidationResult = {
    schema_version: '0.1',
    target: targetUrl,
    generated_at: '2026-07-04T09:00:37Z',
    duration_ms: 125,
    conformance: 'level-1',
    passed: false,
    summary: {
      pass: 3,
      warn: 1,
      fail: 1,
      total: 4,
    },
    metrics: {
      manifest_found: true,
      manifest_schema_valid: true,
      agent_index_found: false,
      agent_index_schema_valid: false,
      total_nodes: 10,
      nodes_with_llm_url: 5,
      nodes_with_content_chars: 5,
      nodes_with_content_chars_mode: 5,
      valid_clean_endpoints: 4,
      valid_content_chars: 4,
      html_leaks: 0,
      secret_findings: 0,
      coverage: {
        llm_url_percent: 50,
        content_chars_percent: 50,
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
        message: 'Schema validation succeeded.',
      },
      {
        code: 'L2A_AGENT_INDEX_FOUND',
        severity: 'warn',
        requirement: 'should',
        message: 'Agent Index discovery warning.',
        url: 'https://example.com/agent-index.json',
        fix: 'Fix the warning details.',
      },
      {
        code: 'L2A_NODE_LLM_URL_REQUIRED',
        severity: 'fail',
        requirement: 'must',
        message: 'Node LLM URL is missing.',
        details: { nodeId: 'blog-post-1', type: 'page' },
      },
    ],
  }

  it('preserves content semantic and contains score, targets, and checks details', () => {
    // Act
    const html = formatHtmlReport(fakeResult)

    // Assert
    expect(html).toContain('75%')
    expect(html).toContain(targetUrl)

    // Checks presence
    expect(html).toContain('L1_MANIFEST_FOUND')
    expect(html).toContain('AI Manifest was successfully discovered.')
    expect(html).toContain('L1_MANIFEST_SCHEMA_VALID')
    expect(html).toContain('Schema validation succeeded.')
    expect(html).toContain('L2A_AGENT_INDEX_FOUND')
    expect(html).toContain('Agent Index discovery warning.')
    expect(html).toContain('L2A_NODE_LLM_URL_REQUIRED')
    expect(html).toContain('Node LLM URL is missing.')

    // Check requirements and severity badges
    expect(html).toContain('must')
    expect(html).toContain('should')
    expect(html).toContain('pass')
    expect(html).toContain('warn')
    expect(html).toContain('fail')
  })

  it('contains design token CSS variables from BRANDING.md', () => {
    // Act
    const html = formatHtmlReport(fakeResult)

    // Assert
    expect(html).toContain('--bg: #010102;')
    expect(html).toContain('--surface-1: #0f1011;')
    expect(html).toContain('--surface-2: #141516;')
    expect(html).toContain('--hairline: #23252a;')
    expect(html).toContain('--blue: #3b82f6;')
    expect(html).toContain('--pass: #10b981;')
    expect(html).toContain('--warn: #f59e0b;')
    expect(html).toContain('--fail: #ef4444;')
  })

  it('includes google fonts Outfit and Inter, and configures them in styles', () => {
    // Act
    const html = formatHtmlReport(fakeResult)

    // Assert
    // Check loading via Google Fonts links
    expect(html).toContain('fonts.googleapis.com')
    expect(html).toContain('family=Outfit')
    expect(html).toContain('family=Inter')

    // Check usage in style block (e.g. font-family)
    expect(html).toMatch(/font-family:[^;]*['"]?Outfit['"]?/i)
    expect(html).toMatch(/font-family:[^;]*['"]?Inter['"]?/i)
  })

  it('applies negative tracking to headings and title elements', () => {
    // Act
    const html = formatHtmlReport(fakeResult)

    // Assert
    // Outfit headers or hero-title or h1/h2/h3 must have negative letter-spacing
    expect(html).toMatch(/\.hero-title\s*{[^}]*letter-spacing:\s*-[0-9.]+(px|em)/i)
    expect(html).toMatch(/(h1|h2|h3|\.section-title|\.logo)\s*{[^}]*letter-spacing:\s*-[0-9.]+(px|em)/i)
  })
})

describe('formatScanHtmlReport', () => {
  const targetUrl = 'https://example.com/'

  const fakeScanResult: ScanResult = {
    url: targetUrl,
    score: 35,
    verdict: 'Agent-readiness blocked or weak',
    dimensions: [
      { key: 'access', score: 0, max: 20 },
      { key: 'extractability', score: 15, max: 30 },
      { key: 'citability', score: 0, max: 20 },
      { key: 'safety', score: 20, max: 20 },
      { key: 'agent_layer', score: 0, max: 10 },
    ],
    findings: [
      {
        id: 'restore-public-access',
        severity: 'P0',
        title: 'Restore public access for the audited URL',
        effort: 'medium',
      },
      {
        id: 'add-llms-txt',
        severity: 'P1',
        title: 'Add a useful /llms.txt entrypoint',
        effort: 'small',
      },
    ],
    noiseRatio: 0.9952,
    csrGapPercent: 98.1,
    renderedComparison: { status: 'severe-gap' },
    engineVersion: '1.0.0',
    schemaVersion: '1.0',
  }

  it('preserves structure and contains target URL, score, verdict, and findings details', () => {
    // Act
    const html = formatScanHtmlReport(fakeScanResult)

    // Assert
    expect(html).toContain(targetUrl)
    expect(html).toContain('35%')
    expect(html).toContain('Agent-readiness blocked or weak')
    expect(html).toContain('restore-public-access')
    expect(html).toContain('Restore public access for the audited URL')
    expect(html).toContain('add-llms-txt')
    expect(html).toContain('Add a useful /llms.txt entrypoint')
  })

  it('generates contextual CTA recommendations corresponding to branding score ranges', () => {
    // Arrange
    const successResult: ScanResult = { ...fakeScanResult, score: 85 }
    const warnResult: ScanResult = { ...fakeScanResult, score: 65 }
    const dangerResult: ScanResult = { ...fakeScanResult, score: 25 }

    // Act
    const successHtml = formatScanHtmlReport(successResult)
    const warnHtml = formatScanHtmlReport(warnResult)
    const dangerHtml = formatScanHtmlReport(dangerResult)

    // Assert
    // Success: Positive message about AI readiness
    expect(successHtml).toMatch(/(ready|prepared|preparation|positive|success)/i)
    // Warn: Suggestion for improvement/optimization
    expect(warnHtml).toMatch(/(improve|optimize|suggestion|warning|optimization)/i)
    // Danger: Critical alert about AI unreadability
    expect(dangerHtml).toMatch(/(critical|danger|unreadability|unreadable|blocked)/i)
  })

  it('rewrites the audit link with src=cli-report attribution', () => {
    // Arrange
    const auditUrl = 'https://agent-view.com/audit?src=cli-json&scanId=123'

    // Act
    const html = formatScanHtmlReport(fakeScanResult, auditUrl)

    // Assert
    expect(html).toContain('src=cli-report')
    expect(html).not.toContain('src=cli-json')
  })

  it('respects Plain Speech and contains no banned words or exclamation marks in UI text', () => {
    // Act
    const html = formatScanHtmlReport(fakeScanResult)

    // Assert
    // Strip HTML tags for clean UI text validation
    const uiText = html.replace(/<[^>]*>/g, ' ')

    // Banned words
    const banned = ['premier', 'meilleur', 'révolutionnaire', 'best', 'revolutionary', 'please', 'sorry', 'oops']
    for (const word of banned) {
      expect(uiText.toLowerCase()).not.toContain(word)
    }

    // Exclamation mark check (ignoring HTML entities/tags)
    expect(uiText).not.toContain('!')
  })
})

// ---------------------------------------------------------------------------
// Helper — builds a minimal valid ScanResult with override support
// ---------------------------------------------------------------------------
function makeScanResult(overrides: Partial<{
  findings: Array<{
    id: string
    severity: 'P0' | 'P1' | 'P2'
    title: string
    effort?: 'small' | 'medium' | 'large'
    detail?: string
    fix_url?: string
  }>
  dimensions: Array<{ key: string; score: number; max: number }>
}> = {}): import('../schemas').ScanResult {
  return {
    url: 'https://example.com/',
    score: 82,
    verdict: 'Agent-ready',
    dimensions: overrides.dimensions ?? [
      { key: 'access', score: 18, max: 20 },
      { key: 'extractability', score: 28, max: 30 },
      { key: 'citability', score: 18, max: 20 },
      { key: 'safety', score: 18, max: 20 },
      { key: 'agent_layer', score: 0, max: 10 },
    ],
    findings: overrides.findings ?? [],
    noiseRatio: null,
    engineVersion: '1.0.0',
    schemaVersion: '1.0',
  } as import('../schemas').ScanResult
}

// ---------------------------------------------------------------------------
// RED tests — T3.9a_scan-finding-cta
// These tests are expected to FAIL until the implementation is added.
// ---------------------------------------------------------------------------
describe('formatScanHtmlReport — findings CTA', () => {
  it('renders a fix link when the finding has a fix_url', () => {
    const result = makeScanResult({
      findings: [
        {
          id: 'add-llms-txt',
          severity: 'P1',
          title: 'Add a useful /llms.txt entrypoint',
          effort: 'small',
          detail: 'A /llms.txt file helps agents.',
          fix_url: 'https://docs.example.com/llms-txt'
        }
      ]
    })
    const html = formatScanHtmlReport(result, 'https://agent-view.com/audit?src=cli-json')
    expect(html).toContain('href="https://docs.example.com/llms-txt"')
  })

  it('does not render a fix link when the finding has no fix_url', () => {
    const result = makeScanResult({
      findings: [
        {
          id: 'add-llms-txt',
          severity: 'P1',
          title: 'Add a useful /llms.txt entrypoint',
          effort: 'small',
          detail: 'A /llms.txt file helps agents.'
          // no fix_url
        }
      ]
    })
    const html = formatScanHtmlReport(result, 'https://agent-view.com/audit?src=cli-json')
    // Should not contain a dangling empty href
    expect(html).not.toContain('href=""')
    expect(html).not.toContain('href="undefined"')
  })

  it('renders agent-view.com CTA when agent_layer score is 0', () => {
    const result = makeScanResult({
      dimensions: [
        { key: 'access', score: 18, max: 20 },
        { key: 'extractability', score: 28, max: 30 },
        { key: 'citability', score: 18, max: 20 },
        { key: 'safety', score: 18, max: 20 },
        { key: 'agent_layer', score: 0, max: 10 }
      ]
    })
    const html = formatScanHtmlReport(result, 'https://agent-view.com/audit?src=cli-json')
    expect(html).toContain('agent-view.com')
    expect(html).toContain('href="https://agent-view.com"')
  })

  it('does not render agent-view.com CTA when agent_layer score is high', () => {
    const result = makeScanResult({
      dimensions: [
        { key: 'access', score: 18, max: 20 },
        { key: 'extractability', score: 28, max: 30 },
        { key: 'citability', score: 18, max: 20 },
        { key: 'safety', score: 18, max: 20 },
        { key: 'agent_layer', score: 7, max: 10 }
      ]
    })
    const html = formatScanHtmlReport(result, 'https://agent-view.com/audit?src=cli-json')
    // The CTA pointing to agent-view.com root must not be present
    // (the audit link containing agent-view.com is expected, but not the promo CTA)
    expect(html).not.toContain('href="https://agent-view.com"')
  })

  it('does not use marketing superlatives in agent_layer CTA text', () => {
    const result = makeScanResult({
      dimensions: [
        { key: 'access', score: 10, max: 20 },
        { key: 'extractability', score: 10, max: 30 },
        { key: 'citability', score: 5, max: 20 },
        { key: 'safety', score: 10, max: 20 },
        { key: 'agent_layer', score: 0, max: 10 }
      ]
    })
    const html = formatScanHtmlReport(result, 'https://agent-view.com/audit?src=cli-json')
    const banned = ['best', 'revolutionary', 'premier', 'amazing', 'powerful', 'leading', 'world-class']
    for (const word of banned) {
      expect(html.toLowerCase()).not.toContain(word)
    }
  })
})
