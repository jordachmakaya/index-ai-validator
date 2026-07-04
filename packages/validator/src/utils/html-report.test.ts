import { describe, expect, it } from 'vitest'

import type { ValidationResult } from '../types'
import { formatHtmlReport } from './html-report'

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
