/**
 * @filemeta
 * type: test
 * title: CLI integration tests
 * description: End-to-end tests for the runCli entrypoint covering validate and scan subcommands, --html report writing (explicit and default paths), --json output, and error handling.
 * job_ref: T3.2_default-report-locations_tester
 * functions: [validManifest, validGraph, completeRoutes, routesWithDiscoveryWarnings, jsonRoute, textRoute, validationResult, scanStatusDone, scanOutcome, omitOnProgress, fileExists, withTempDir, withTempCwd, parseJsonObject, expectJsonResultContract, expectObjectField, startServer, closeServer, installFailingFetch, createRoutedTarget, installFetchHostRewrite, getFetchInputUrl]
 * classes: []
 * inputs: []
 * outputs: []
 * relations:
 *   - imports: packages/validator/src/cli.ts
 *   - tests: packages/validator/src/cli.ts
 * last_update: 2026-07-05
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { CHECK, SCHEMA_VERSION } from './constants'
import { runCli, type CliScanRunner, type CliValidationRunner } from './cli'
import { ScanRequestError, ScanServerError, ScanTimeoutError, type ScanProgressStep, type ScanStatus } from './client/scanner-client'
import { ScanFailedError, type ScanOutcome } from './scan'
import type { ScanOptions, ValidationCheck, ValidationResult, ValidatorOptions } from './types'
import { countContentChars } from './utils/content-chars'

type RouteResponse = {
  readonly status?: number
  readonly contentType?: string
  readonly headers?: Record<string, string>
  readonly body: string
}

type TestServer = {
  readonly origin: string
  readonly close: () => Promise<void>
}

const servers: TestServer[] = []

function validManifest(): Record<string, unknown> {
  return {
    spec_version: '1.0',
    manifest_version: 1,
    level: 'level-2a',
    identity: {
      name: 'Example Site',
      description: 'A deterministic local test manifest.',
      domain: '127.0.0.1',
    },
    freshness: {
      content_updated_at: '2026-06-12T00:00:00.000Z',
      manifest_generated_at: '2026-06-12T00:00:00.000Z',
      refresh_frequency: 'daily',
    },
    access: {
      agent_index: '/agent-index.json',
      llms_txt: '/llms.txt',
    },
  }
}

function validGraph(cleanBody: string, llmUrl = '/clean/home.md'): Record<string, unknown> {
  return {
    generated: '2026-06-12T00:00:00.000Z',
    spec_version: '1.0',
    total_nodes: 1,
    nodes: [
      {
        id: 'home',
        type: 'page',
        label: 'Home',
        description: 'Home clean endpoint.',
        content: {
          llm_summary: 'Home summary.',
          llm_url: llmUrl,
          content_chars: countContentChars(cleanBody),
          content_chars_mode: 'exact',
          summary_method: 'manual',
          language: 'en',
        },
        meta: {
          updated: '2026-06-12T00:00:00.000Z',
          refresh_frequency: 'daily',
        },
      },
    ],
  }
}

function completeRoutes(cleanBody = 'Home clean endpoint'): Record<string, RouteResponse> {
  return {
    '/': {
      contentType: 'text/html; charset=utf-8',
      headers: {
        link: '</.well-known/index-ai.json>; rel=agent-manifest; type=application/json',
      },
      body: '<html><head><link rel="agent-manifest" href="/.well-known/index-ai.json" type="application/json"></head></html>',
    },
    '/.well-known/index-ai.json': jsonRoute(validManifest()),
    '/agent-index.json': jsonRoute(validGraph(cleanBody)),
    '/clean/home.md': textRoute(cleanBody, 'text/markdown; charset=utf-8'),
    '/robots.txt': textRoute('Agent-Manifest: /.well-known/index-ai.json'),
    '/llms.txt': textRoute('- Agent-Manifest: /.well-known/index-ai.json'),
  }
}

function routesWithDiscoveryWarnings(): Record<string, RouteResponse> {
  return {
    ...completeRoutes(),
    '/': {
      contentType: 'text/html; charset=utf-8',
      body: '<html><head></head><body>Home</body></html>',
    },
    '/robots.txt': textRoute('User-agent: *'),
    '/llms.txt': textRoute('No Agent-Manifest bridge here.'),
  }
}

function jsonRoute(value: Record<string, unknown>): RouteResponse {
  return {
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(value),
  }
}

function textRoute(body: string, contentType = 'text/plain; charset=utf-8'): RouteResponse {
  return {
    contentType,
    body,
  }
}

function validationResult(target: string, overrides?: Partial<ValidationResult>): ValidationResult {
  const passCheck: ValidationCheck = {
    code: CHECK.L1_MANIFEST_FOUND,
    severity: 'pass',
    requirement: 'must',
    message: 'Manifest found.',
    url: `${target}/.well-known/index-ai.json`,
  }
  const result: ValidationResult = {
    schema_version: SCHEMA_VERSION,
    target,
    generated_at: '2026-06-12T00:00:00.000Z',
    duration_ms: 12,
    conformance: 'level-1',
    passed: true,
    summary: {
      pass: 1,
      warn: 0,
      fail: 0,
      total: 1,
    },
    metrics: {
      manifest_found: true,
      manifest_schema_valid: true,
      agent_index_found: false,
      agent_index_schema_valid: false,
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
    },
    checks: [passCheck],
  }

  return {
    ...result,
    ...overrides,
  }
}

function scanStatusDone(overrides?: Partial<ScanStatus>): ScanStatus {
  return {
    scanId: 'scan_123',
    status: 'done',
    submittedAt: '2026-07-03T00:00:00.000Z',
    completedAt: '2026-07-03T00:00:10.000Z',
    result: {
      url: 'https://example.com',
      score: 82,
      verdict: 'good',
      dimensions: [],
      findings: [
        { id: 'F1', severity: 'P0', title: 'Missing manifest' },
        { id: 'F2', severity: 'P1', title: 'Weak clean endpoint' },
      ],
      noiseRatio: null,
      engineVersion: '1.0.0',
      schemaVersion: '1.0',
    },
    meta: {
      links: {
        self: 'https://agent-view.com/scans/scan_123',
        shareUrl: 'https://agent-view.com/s/scan_123',
        audit: 'https://agent-view.com/audit/scan_123',
      },
    },
    ...overrides,
  }
}

function scanOutcome(overrides?: Partial<ScanStatus>): ScanOutcome {
  return {
    status: scanStatusDone(overrides),
    auditLinks: {
      html: 'https://agent-view.com/audit/scan_123?src=cli-report',
      terminal: 'https://agent-view.com/audit/scan_123?src=cli-terminal',
    },
  }
}

function omitOnProgress(options: ScanOptions): Omit<ScanOptions, 'onProgress'> {
  const { onProgress, ...rest } = options

  return rest
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}

async function withTempDir<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'index-ai-cli-'))

  try {
    return await run(directory)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * Runs `run` with the process cwd temporarily switched to a fresh empty
 * temp directory, so default (cwd-relative) `--html` path resolution can be
 * exercised. Always restores the original cwd, even if `run` throws.
 */
async function withTempCwd<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'index-ai-cli-cwd-'))
  const originalCwd = process.cwd()
  process.chdir(directory)

  try {
    return await run(directory)
  }
  finally {
    process.chdir(originalCwd)
    await rm(directory, { recursive: true, force: true })
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected CLI JSON output to be an object')
  }

  return value as Record<string, unknown>
}

function expectJsonResultContract(json: Record<string, unknown>): void {
  expect(json.passed === true || json.passed === false).toBe(true)
  expect(typeof json.conformance).toBe('string')

  const summary = expectObjectField(json, 'summary')
  expect(typeof summary.pass).toBe('number')
  expect(typeof summary.warn).toBe('number')
  expect(typeof summary.fail).toBe('number')
  expect(typeof summary.total).toBe('number')

  const metrics = expectObjectField(json, 'metrics')
  expect(typeof metrics.manifest_found).toBe('boolean')
  expect(typeof metrics.agent_index_found).toBe('boolean')
  expect(typeof metrics.total_nodes).toBe('number')
  expect(Array.isArray(json.checks)).toBe(true)
}

function expectObjectField(
  object: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = object[field]

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected JSON result field "${field}" to be an object`)
  }

  return value as Record<string, unknown>
}

function startServer(routes: Record<string, RouteResponse>): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const url = request.url ?? '/'
      const route = routes[url]

      if (!route) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('not found')
        return
      }

      response.writeHead(route.status ?? 200, {
        'content-type': route.contentType ?? 'text/plain; charset=utf-8',
        ...(route.headers ?? {}),
      })
      response.end(route.body)
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        throw new Error('Expected local test server to listen on a TCP address')
      }

      const testServer = {
        origin: `http://127.0.0.1:${(address as AddressInfo).port}`,
        close: () => closeServer(server),
      }

      servers.push(testServer)
      resolve(testServer)
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

afterEach(async () => {
  const activeServers = servers.splice(0)
  await Promise.all(activeServers.map((server) => server.close()))
})

describe('runCli', () => {
  it('prints help with exit 0', async () => {
    const result = await runCli(['--help'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('Usage: index-ai [options] <url>')
    expect(result.stdout).toContain('--json')
    expect(result.stdout).toContain('--html')
    expect(result.stdout).toContain('--no-exit-code')
  })

  it('prints parseable JSON validation output and exits 0 for a passing local site', async () => {
    const server = await startServer(completeRoutes())
    const result = await runCli([server.origin, '--json'])
    const json = parseJsonObject(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(json.schema_version).toBe(SCHEMA_VERSION)
    expect(json.target).toBe(server.origin)
    expect(json.passed).toBe(true)
    expect(json.conformance).toBe('level-2a')
    expect(typeof json.duration_ms).toBe('number')
    expectJsonResultContract(json)
    expect(result.stdout).not.toContain('CLI shell')
    expect(result.stdout).not.toContain('\u001B[')
  })

  it('writes a standalone HTML report while preserving human stdout', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const warningCheck: ValidationCheck = {
        code: CHECK.DISCOVERY_HTML_LINK,
        severity: 'warn',
        requirement: 'should',
        message: 'Homepage should expose an AI discovery link.',
        url: 'https://example.com/',
        fix: 'Add a rel=agent-manifest link.',
        docs_url: 'https://docs.example.test/discovery',
        details: {
          hint: 'missing link',
        },
      }
      const validate: CliValidationRunner = async (options) => validationResult(options.target, {
        generated_at: '2026-06-12T00:00:00.000Z',
        duration_ms: 34,
        conformance: 'level-2a',
        passed: true,
        summary: {
          pass: 1,
          warn: 1,
          fail: 0,
          total: 2,
        },
        metrics: {
          ...validationResult(options.target).metrics,
          agent_index_found: true,
          total_nodes: 2,
          valid_clean_endpoints: 2,
          valid_content_chars: 2,
        },
        checks: [
          validationResult(options.target).checks[0] as ValidationCheck,
          warningCheck,
        ],
      })

      const result = await runCli(['https://example.com', '--html', reportPath], { validate })
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toContain('index-ai validation result')
      expect(html).toContain('<title>index-ai validation report</title>')
      expect(html).toContain('https://example.com')
      expect(html).toContain('2026-06-12T00:00:00.000Z')
      expect(html).toContain('34 ms')
      expect(html).toContain('level-2a')
      expect(html).toContain('Passed')
      expect(html).toContain('Summary')
      expect(html).toContain('Metrics')
      expect(html).toContain('Checks')
      expect(html).toContain('Warnings')
      expect(html).toContain(CHECK.DISCOVERY_HTML_LINK)
      expect(html).toContain('Add a rel=agent-manifest link.')
      expect(html).toContain('This report is generated by an experimental validator.')
      expect(html).toContain('index-ai is not a formal standard.')
    })
  })

  it('renders the HTML report as a branded AI-readiness product surface', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const validate: CliValidationRunner = async (options) => validationResult(options.target)

      const result = await runCli(['https://example.com', '--html', reportPath], { validate })
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(0)
      expect(html).toContain('AI-readiness report')
      expect(html).toContain('index-ai<span')
      expect(html).toContain('/</span>validator')
      expect(html).toContain('@hardmachinelabs/index-ai-validator')
      expect(html).toContain('by Jordach Makaya')
      // T5.14_html-report-level-aware: the hero copy is level-aware and
      // driven by the requested --target-level (defaults to l2a here, since
      // this test passes none) — replaces the obsolete "Agent-View LV2" /
      // "Level 1 and Level 2." wording locked in by the original T3.2 test.
      expect(html).toContain('Does this website implement the index-ai standard up to Level 2a?')
      expect(html).toContain('This report checks whether your site implements the index-ai standard up to the requested target level.')
      expect(html).toContain('PASSED')
      expect(html).toContain('CI Verdict')
      expect(html).toContain('Readiness')
      expect(html).toContain('style="width: 100%"')
      expect(html).toContain('Conformance')
      expect(html).toContain('Recommended next steps')
      expect(html).toContain('Failures')
      expect(html).toContain('Warnings')
      expect(html).toContain('Passed checks')
      expect(html).toContain('<details class="check-item pass"')
      expect(html).toContain('Metrics')
      expect(html).toContain('Resources')
      expect(html).toContain('Learn more')
      expect(html).toContain('https://jordach.dev')
      expect(html).toContain('https://jordach.dev/projects/index-ai')
      expect(html).toContain('https://jordach.dev/tools/index-ai-validator')
      expect(html).toContain('https://jordach.dev/services/ai-readable-website-audit')
      expect(html).toContain('https://jordach.dev/contact')
      expect(html).toContain('https://github.com/jordachmakaya/index-ai')
      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).not.toContain('<script')
      expect(html).toContain('This report is not legal compliance, production certification, a traffic guarantee, SEO ranking guarantee, security audit, or vulnerability scan.')
    })
  })

  it('escapes validation-derived content in the HTML report', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const failureCheck: ValidationCheck = {
        code: 'TEST_<CODE>',
        severity: 'fail',
        requirement: 'must',
        message: 'Bad <value> & "quoted" content',
        url: 'https://example.com/?q=<bad>&x="1"',
        fix: 'Replace <bad> with &lt;good&gt;',
        details: {
          raw: '<tag attr="value">unsafe</tag>',
        },
      }
      const validate: CliValidationRunner = async (options) => validationResult(
        'https://example.com/?target=<unsafe>&name="agent"',
        {
          passed: false,
          summary: {
            pass: 0,
            warn: 0,
            fail: 1,
            total: 1,
          },
          checks: [failureCheck],
        },
      )

      const result = await runCli([
        'https://example.com/?target=<unsafe>&name="agent"',
        '--html',
        reportPath,
      ], { validate })
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(1)
      expect(html).toContain('&lt;unsafe&gt;')
      expect(html).toContain('&quot;agent&quot;')
      expect(html).toContain('TEST_&lt;CODE&gt;')
      expect(html).toContain('Bad &lt;value&gt; &amp; &quot;quoted&quot; content')
      expect(html).toContain('https://example.com/?q=&lt;bad&gt;&amp;x=&quot;1&quot;')
      expect(html).toContain('&lt;tag attr=\\&quot;value\\&quot;&gt;unsafe&lt;/tag&gt;')
      expect(html).not.toContain('<unsafe>')
      expect(html).not.toContain('<tag attr="value">unsafe</tag>')
    })
  })

  it('keeps stdout JSON-only when JSON and HTML outputs are combined', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const validate: CliValidationRunner = async (options) => validationResult(options.target)

      const result = await runCli(['https://example.com', '--json', '--html', reportPath], {
        validate,
      })
      const json = parseJsonObject(result.stdout)
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe('')
      expect(json.target).toBe('https://example.com')
      expect(result.stdout).not.toContain('index-ai validation result')
      expect(result.stdout).not.toContain('<!doctype html>')
      expect(html).toContain('<!doctype html>')
      expect(html).toContain('index-ai validation report')
    })
  })

  it('renders CI verdict and readiness zero when there are no checks', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const validate: CliValidationRunner = async (options) => validationResult(options.target, {
        summary: {
          pass: 0,
          warn: 0,
          fail: 0,
          total: 0,
        },
        checks: [],
      })

      const result = await runCli(['https://example.com', '--html', reportPath], { validate })
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(0)
      expect(html).toContain('CI Verdict')
      expect(html).toContain('Readiness')
      expect(html).toContain('0%')
      expect(html).toContain('The readiness score is a human-readable progress indicator based on passed checks.')
      expect(html).toContain('The CI verdict remains Passed/Failed.')
    })
  })

  it('renders a controlled readiness score without changing JSON output', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const failureCheck: ValidationCheck = {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'Manifest missing.',
      }
      const validate: CliValidationRunner = async (options) => validationResult(options.target, {
        passed: false,
        summary: {
          pass: 1,
          warn: 0,
          fail: 1,
          total: 2,
        },
        checks: [
          validationResult(options.target).checks[0] as ValidationCheck,
          failureCheck,
        ],
      })

      const result = await runCli(['https://example.com', '--json', '--html', reportPath], {
        validate,
      })
      const json = parseJsonObject(result.stdout)
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(1)
      expect(json.summary).toStrictEqual({
        pass: 1,
        warn: 0,
        fail: 1,
        total: 2,
      })
      expect(json).not.toHaveProperty('readiness')
      expect(html).toContain('Readiness')
      expect(html).toContain('50%')
      expect(result.stdout).not.toContain('Readiness')
    })
  })

  it('renders escaped recommended next steps for known checks and limits the list to five', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const checks: ValidationCheck[] = [
        {
          code: CHECK.SEC_SECRET_PATTERN,
          severity: 'fail',
          requirement: 'heuristic',
          message: 'Secret leaked.',
        },
        {
          code: CHECK.L1_MANIFEST_FOUND,
          severity: 'fail',
          requirement: 'must',
          message: 'Manifest missing.',
        },
        {
          code: CHECK.L2A_AGENT_INDEX_FOUND,
          severity: 'fail',
          requirement: 'must',
          message: 'Agent Index missing.',
        },
        {
          code: CHECK.L2A_LLM_URL_CONTENT_TYPE,
          severity: 'fail',
          requirement: 'must',
          message: 'Clean endpoint content type invalid.',
        },
        {
          code: CHECK.L2A_CONTENT_CHARS_EXACT_MATCH,
          severity: 'fail',
          requirement: 'must',
          message: 'content_chars mismatch.',
        },
        {
          code: CHECK.DISCOVERY_LLMS_TXT_BRIDGE,
          severity: 'warn',
          requirement: 'should',
          message: 'llms.txt does not bridge to manifest.',
        },
      ]
      const validate: CliValidationRunner = async (options) => validationResult(options.target, {
        passed: false,
        summary: {
          pass: 0,
          warn: 1,
          fail: 5,
          total: 6,
        },
        checks,
      })

      const result = await runCli(['https://example.com', '--html', reportPath], { validate })
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(1)
      expect(html).toContain('Recommended next steps')
      expect(html).toContain('Remove sensitive public AI-facing content')
      expect(html).toContain('Add the AI Manifest')
      expect(html).toContain('Add the Agent Index')
      expect(html).toContain('Fix clean endpoint content types')
      expect(html).toContain('Recompute content_chars')
      expect(html).not.toContain('Link llms.txt to the AI Manifest')
    })
  })

  it('escapes recommended next step text that contains HTML examples', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const discoveryCheck: ValidationCheck = {
        code: CHECK.DISCOVERY_HTML_LINK,
        severity: 'warn',
        requirement: 'should',
        message: 'Discovery link missing.',
      }
      const validate: CliValidationRunner = async (options) => validationResult(options.target, {
        summary: {
          pass: 0,
          warn: 1,
          fail: 0,
          total: 1,
        },
        checks: [discoveryCheck],
      })

      const result = await runCli(['https://example.com', '--html', reportPath], { validate })
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(0)
      expect(html).toContain('Add the HTML discovery link')
      expect(html).toContain('&lt;link rel=&quot;agent-manifest&quot; href=&quot;/.well-known/index-ai.json&quot; type=&quot;application/json&quot;&gt;')
      expect(html).not.toContain('<link rel="agent-manifest"')
    })
  })

  it('returns exit 2 for invalid HTML report paths before validation output is printed', async () => {
    await withTempDir(async (directory) => {
      const validate: CliValidationRunner = async (options) => validationResult(options.target)
      const emptyPath = await runCli(['https://example.com', '--html', ''], { validate })
      const nonHtmlPath = await runCli(['https://example.com', '--html', join(directory, 'report.txt')], {
        validate,
      })

      expect(emptyPath.exitCode).toBe(2)
      expect(emptyPath.stdout).toBe('')
      expect(emptyPath.stderr).toContain('HTML report path must not be empty')
      expect(nonHtmlPath.exitCode).toBe(2)
      expect(nonHtmlPath.stdout).toBe('')
      expect(nonHtmlPath.stderr).toContain('HTML report path must end with .html')
    })
  })

  // NOTE (T3.2_default-report-locations): `--html` with no value was
  // previously a Commander error ("option '--html <path>' argument
  // missing"), asserted in this same block above. That is now an
  // intentional behavior change, not a broken test: `--html` becomes
  // optional-value, and no value means "use the default path". See the
  // two tests below.
  it('defaults --html with no value to .report/validate-report.html relative to cwd', async () => {
    await withTempCwd(async (directory) => {
      const validate: CliValidationRunner = async (options) => validationResult(options.target)
      const reportDir = join(directory, '.report')

      expect(await fileExists(reportDir)).toBe(false)

      const result = await runCli(['https://example.com', '--html'], { validate })
      const html = await readFile(join(reportDir, 'validate-report.html'), 'utf8')

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe('')
      expect(await fileExists(reportDir)).toBe(true)
      expect(html).toContain('<title>index-ai validation report</title>')
      expect(html).toContain('https://example.com')
    })
  })

  it('creates a missing parent directory for an explicit --html path', async () => {
    await withTempDir(async (directory) => {
      const validate: CliValidationRunner = async (options) => validationResult(options.target)
      const reportPath = join(directory, 'missing', 'nested', 'report.html')

      const result = await runCli(['https://example.com', '--html', reportPath], { validate })
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toBe('')
      expect(html).toContain('<title>index-ai validation report</title>')
      expect(html).toContain('https://example.com')
    })
  })

  it('does not run validation when the HTML report path is empty or not an HTML file', async () => {
    await withTempDir(async (directory) => {
      let validateCalls = 0
      const validate: CliValidationRunner = async (options) => {
        validateCalls += 1
        return validationResult(options.target)
      }

      const emptyPath = await runCli(['https://example.com', '--html', ''], { validate })
      const nonHtmlPath = await runCli(['https://example.com', '--html', join(directory, 'report.txt')], {
        validate,
      })

      expect(emptyPath.exitCode).toBe(2)
      expect(emptyPath.stdout).toBe('')
      expect(emptyPath.stderr).toContain('HTML report path must not be empty')
      expect(nonHtmlPath.exitCode).toBe(2)
      expect(nonHtmlPath.stdout).toBe('')
      expect(nonHtmlPath.stderr).toContain('HTML report path must end with .html')
      expect(validateCalls).toBe(0)
    })
  })

  it('returns exit 2 and keeps stdout empty when the HTML report cannot be written', async () => {
    await withTempDir(async (directory) => {
      const validate: CliValidationRunner = async (options) => validationResult(options.target)
      const directoryPathWithHtmlExtension = join(directory, 'blocked.html')
      await mkdir(directoryPathWithHtmlExtension)

      const result = await runCli([
        'https://example.com',
        '--json',
        '--html',
        directoryPathWithHtmlExtension,
      ], { validate })

      expect(result.exitCode).toBe(2)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('Failed to write HTML report')
    })
  })

  it('prints parseable JSON and exits 1 when validation fails', async () => {
    const server = await startServer({})
    const result = await runCli([server.origin, '--json'])
    const json = parseJsonObject(result.stdout)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('')
    expect(json.target).toBe(server.origin)
    expect(json.passed).toBe(false)
    expect(json.conformance).toBe('none')
    expectJsonResultContract(json)
  })

  it('keeps validation failure JSON parseable for an unreachable bad domain', async () => {
    const restoreFetch = installFailingFetch()

    try {
      const result = await runCli(['https://bad-domain.invalid', '--json'])
      const json = parseJsonObject(result.stdout)

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toBe('')
      expect(json.target).toBe('https://bad-domain.invalid')
      expect(json.passed).toBe(false)
    }
    finally {
      restoreFetch()
    }
  })

  it('forces exit 0 for validation failures when --no-exit-code is used', async () => {
    const server = await startServer({})
    const result = await runCli([server.origin, '--json', '--no-exit-code'])
    const json = parseJsonObject(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(json.passed).toBe(false)
  })

  it('returns exit 2 for missing URL usage errors before validation runs', async () => {
    const result = await runCli([])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('missing required argument')
  })

  it('returns exit 2 for invalid timeout and max concurrency values', async () => {
    const validate: CliValidationRunner = async () => {
      throw new Error('Validation should not run for invalid CLI options')
    }

    const badTimeoutZero = await runCli(['https://example.com', '--timeout', '0'], { validate })
    const badTimeoutText = await runCli(['https://example.com', '--timeout', 'abc'], { validate })
    const badConcurrencyDecimal = await runCli(['https://example.com', '--max-concurrency', '1.5'], { validate })
    const badConcurrencyZero = await runCli(['https://example.com', '--max-concurrency', '0'], { validate })

    expect(badTimeoutZero.exitCode).toBe(2)
    expect(badTimeoutZero.stderr).toContain('positive integer')
    expect(badTimeoutText.exitCode).toBe(2)
    expect(badTimeoutText.stderr).toContain('positive integer')
    expect(badConcurrencyDecimal.exitCode).toBe(2)
    expect(badConcurrencyDecimal.stderr).toContain('positive integer')
    expect(badConcurrencyZero.exitCode).toBe(2)
    expect(badConcurrencyZero.stderr).toContain('positive integer')
  })

  it('passes warning-sensitive and fetch options through to validateIndexAi', async () => {
    let capturedOptions: ValidatorOptions | undefined
    const validate: CliValidationRunner = async (options) => {
      capturedOptions = options
      return validationResult(options.target)
    }

    const result = await runCli([
      'https://example.com',
      '--json',
      '--verbose',
      '--strict',
      '--strict-security',
      '--fail-on-warn',
      '--allow-private-hosts',
      '--timeout',
      '1234',
      '--max-concurrency',
      '2',
    ], { validate })

    expect(result.exitCode).toBe(0)
    expect(capturedOptions).toEqual({
      target: 'https://example.com',
      strict: true,
      strictSecurity: true,
      failOnWarn: true,
      verbose: true,
      timeoutMs: 1234,
      maxConcurrency: 2,
      allowPrivateHosts: true,
    })
  })

  it('lets strict and fail-on-warn make warning-only local validation fail', async () => {
    const server = await startServer(routesWithDiscoveryWarnings())

    const defaultResult = await runCli([server.origin, '--json'])
    const strictResult = await runCli([server.origin, '--json', '--strict'])
    const failOnWarnResult = await runCli([server.origin, '--json', '--fail-on-warn'])

    expect(parseJsonObject(defaultResult.stdout).passed).toBe(true)
    expect(defaultResult.exitCode).toBe(0)
    expect(parseJsonObject(strictResult.stdout).passed).toBe(false)
    expect(strictResult.exitCode).toBe(1)
    expect(parseJsonObject(failOnWarnResult.stdout).passed).toBe(false)
    expect(failOnWarnResult.exitCode).toBe(1)
  })

  it('lets strict-security make private infrastructure references fail', async () => {
    const server = await startServer(completeRoutes('Internal server: 192.168.1.20'))

    const defaultResult = await runCli([server.origin, '--json'])
    const strictSecurityResult = await runCli([server.origin, '--json', '--strict-security'])

    expect(defaultResult.exitCode).toBe(0)
    expect(parseJsonObject(defaultResult.stdout).passed).toBe(true)
    expect(strictSecurityResult.exitCode).toBe(1)
    expect(parseJsonObject(strictSecurityResult.stdout).passed).toBe(false)
  })

  it('lets allow-private-hosts permit private llm_url fetches for local development', async () => {
    const privateBody = 'Private local clean endpoint.'
    const privateServer = await startServer({
      '/clean/private.md': textRoute(privateBody, 'text/markdown; charset=utf-8'),
    })
    const targetServer = await startServer({
      ...completeRoutes(),
      '/agent-index.json': jsonRoute(validGraph(privateBody, `${privateServer.origin}/clean/private.md`)),
    })
    const routedTarget = createRoutedTarget(targetServer.origin)
    const restoreFetch = installFetchHostRewrite('example.test', targetServer.origin)

    try {
      const blocked = await runCli([routedTarget, '--json'])
      const allowed = await runCli([routedTarget, '--json', '--allow-private-hosts'])

      expect(blocked.exitCode).toBe(1)
      expect(parseJsonObject(blocked.stdout).passed).toBe(false)
      expect(allowed.exitCode).toBe(0)
      expect(parseJsonObject(allowed.stdout).passed).toBe(true)
    }
    finally {
      restoreFetch()
    }
  })

  it('prints useful human output and hides passed checks unless verbose is enabled', async () => {
    const warningCheck: ValidationCheck = {
      code: CHECK.DISCOVERY_HTML_LINK,
      severity: 'warn',
      requirement: 'should',
      message: 'Homepage does not expose a discovery link.',
      url: 'https://example.com/',
      fix: 'Add a rel=agent-manifest link.',
    }
    const validate: CliValidationRunner = async (options) => validationResult(options.target, {
      summary: {
        pass: 1,
        warn: 1,
        fail: 0,
        total: 2,
      },
      checks: [
        validationResult(options.target).checks[0] as ValidationCheck,
        warningCheck,
      ],
    })

    const compact = await runCli(['https://example.com'], { validate })
    const verbose = await runCli(['https://example.com', '--verbose'], { validate })

    expect(compact.stdout).toContain('index-ai validation result')
    expect(compact.stdout).toContain('Target: https://example.com')
    expect(compact.stdout).toContain('Duration: 12 ms')
    expect(compact.stdout).toContain('Conformance: level-1')
    expect(compact.stdout).toContain('Passed: true')
    expect(compact.stdout).toContain('Warnings:')
    expect(compact.stdout).toContain(CHECK.DISCOVERY_HTML_LINK)
    expect(compact.stdout).toContain('Fix: Add a rel=agent-manifest link.')
    expect(compact.stdout).toContain('Next:')
    expect(compact.stdout).not.toContain(CHECK.L1_MANIFEST_FOUND)
    expect(verbose.stdout).toContain('Passed checks:')
    expect(verbose.stdout).toContain(CHECK.L1_MANIFEST_FOUND)
  })

  it('prints useful human output for failed validation results', async () => {
    const failureCheck: ValidationCheck = {
      code: CHECK.L2A_AGENT_INDEX_FOUND,
      severity: 'fail',
      requirement: 'must',
      message: 'Agent Index graph was not found.',
      url: 'https://example.com/agent-index.json',
      fix: 'Add access.agent_index to the AI Manifest and serve the graph.',
    }
    const validate: CliValidationRunner = async (options) => validationResult(options.target, {
      passed: false,
      conformance: 'level-1',
      summary: {
        pass: 1,
        warn: 0,
        fail: 1,
        total: 2,
      },
      checks: [
        validationResult(options.target).checks[0] as ValidationCheck,
        failureCheck,
      ],
    })

    const result = await runCli(['https://example.com'], { validate })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('Passed: false')
    expect(result.stdout).toContain('Failures:')
    expect(result.stdout).toContain(CHECK.L2A_AGENT_INDEX_FOUND)
    expect(result.stdout).toContain('Fix: Add access.agent_index to the AI Manifest and serve the graph.')
    expect(result.stdout).toContain('Fix all fail checks')
  })
})

describe('runCli scan subcommand', () => {
  it('prints the raw scanner status as JSON for scan --json', async () => {
    const outcome = scanOutcome()
    const scan: CliScanRunner = async () => outcome

    const result = await runCli(['scan', 'https://example.com', '--json'], { scan })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(`${JSON.stringify(outcome.status, null, 2)}\n`)
    expect(result.stdout).not.toContain('\u001B[')
  })

  it('prints a compact human summary for scan without --json', async () => {
    const outcome = scanOutcome()
    const scan: CliScanRunner = async () => outcome

    const result = await runCli(['scan', 'https://example.com'], { scan })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('https://example.com')
    expect(result.stdout).toContain('Score: 82')
    expect(result.stdout).toContain('Verdict: good')
    expect(result.stdout).toContain('P0: 1')
    expect(result.stdout).toContain('P1: 1')
    expect(result.stdout).toContain('P2: 0')
    expect(result.stdout.trim().startsWith('{')).toBe(false)
  })

  it('always prints the terminal audit link on stderr after a done scan, with or without --json', async () => {
    const outcome = scanOutcome()
    const scan: CliScanRunner = async () => outcome

    const withJson = await runCli(['scan', 'https://example.com', '--json'], { scan })
    const withoutJson = await runCli(['scan', 'https://example.com'], { scan })

    for (const result of [withJson, withoutJson]) {
      expect(result.stderr).toContain(outcome.auditLinks.terminal)
      expect(result.stderr).not.toContain(outcome.auditLinks.html)
    }
  })

  it('accepts --api-key without forwarding it to scan options', async () => {
    const capturedOptions: ScanOptions[] = []
    const scan: CliScanRunner = async (options) => {
      capturedOptions.push(options)
      return scanOutcome()
    }

    const withoutKey = await runCli(['scan', 'https://example.com', '--json'], { scan })
    const withKey = await runCli(
      ['scan', 'https://example.com', '--json', '--api-key', 'secret-key'],
      { scan },
    )

    expect(withoutKey.exitCode).toBe(0)
    expect(withKey.exitCode).toBe(0)
    expect(capturedOptions).toHaveLength(2)
    expect(capturedOptions[1]).not.toHaveProperty('apiKey')
    expect(omitOnProgress(capturedOptions[1] as ScanOptions)).toStrictEqual(
      omitOnProgress(capturedOptions[0] as ScanOptions),
    )
  })

  it('writes a minimal HTML report and keeps stdout JSON-only for scan --json --html', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const outcome = scanOutcome()
      const scan: CliScanRunner = async () => outcome

      const result = await runCli(
        ['scan', 'https://example.com', '--json', '--html', reportPath],
        { scan },
      )
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe(`${JSON.stringify(outcome.status, null, 2)}\n`)
      expect(html).toContain('https://example.com')
      expect(html).toContain(outcome.auditLinks.html)
      expect(html).not.toContain(outcome.auditLinks.terminal)
    })
  })

  it('rejects an invalid --html path before ever calling scan', async () => {
    await withTempDir(async (directory) => {
      let scanCalls = 0
      const scan: CliScanRunner = async () => {
        scanCalls += 1
        return scanOutcome()
      }

      const emptyPath = await runCli(['scan', 'https://example.com', '--html', ''], { scan })
      const nonHtmlPath = await runCli(
        ['scan', 'https://example.com', '--html', join(directory, 'report.txt')],
        { scan },
      )

      expect(emptyPath.exitCode).not.toBe(0)
      expect(emptyPath.stdout).toBe('')
      expect(emptyPath.stderr).toContain('HTML report path must not be empty')
      expect(nonHtmlPath.exitCode).not.toBe(0)
      expect(nonHtmlPath.stdout).toBe('')
      expect(nonHtmlPath.stderr).toContain('HTML report path must end with .html')
      expect(scanCalls).toBe(0)
    })
  })

  it('defaults scan --html with no value to .report/scan-report.html relative to cwd', async () => {
    await withTempCwd(async (directory) => {
      const outcome = scanOutcome()
      const scan: CliScanRunner = async () => outcome
      const reportDir = join(directory, '.report')

      expect(await fileExists(reportDir)).toBe(false)

      const result = await runCli(['scan', 'https://example.com', '--html'], { scan })
      const html = await readFile(join(reportDir, 'scan-report.html'), 'utf8')

      expect(result.exitCode).toBe(0)
      expect(await fileExists(reportDir)).toBe(true)
      expect(html).toContain('https://example.com')
      expect(html).toContain(outcome.auditLinks.html)
    })
  })

  it('creates a missing parent directory for an explicit scan --html path', async () => {
    await withTempDir(async (directory) => {
      const outcome = scanOutcome()
      const scan: CliScanRunner = async () => outcome
      const reportPath = join(directory, 'missing', 'nested', 'report.html')

      const result = await runCli(['scan', 'https://example.com', '--html', reportPath], { scan })
      const html = await readFile(reportPath, 'utf8')

      expect(result.exitCode).toBe(0)
      expect(html).toContain('https://example.com')
      expect(html).toContain(outcome.auditLinks.html)
    })
  })

  // T5.15_scan-json-error-shape (V2_BUG.md §BUG-2): the 3 tests below used to
  // lock `expect(result.stdout).toBe('')` for a scan error even under
  // `--json` — that was the bug (`scan <url> --json` on a real error piped
  // unparseable plain text to stdout). This is a deliberate contract change,
  // not a regression: see the Tester report's "3 rewritten tests" section
  // for old-behavior -> new-behavior -> why-not-a-regression per test.
  it('returns parseable JSON on stdout and writes no HTML report when scan rejects with ScanFailedError, under --json', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const failedError = new ScanFailedError('SCAN-001')
      const scan: CliScanRunner = async () => {
        throw failedError
      }

      const result = await runCli(
        ['scan', 'https://example.com', '--json', '--html', reportPath],
        { scan },
      )
      const json = parseJsonObject(result.stdout)

      expect(result.exitCode).not.toBe(0)
      expect(json.passed).toBe(false)
      expect(json.status).toBe('error')
      expect(typeof json.error_type).toBe('string')
      expect(json.error_type).not.toBe('')
      expect(json.message).toContain('SCAN-001')
      // stderr keeps carrying human-readable text — only stdout's contract
      // changes for --json, per JOB.md.
      expect(result.stderr).toContain('SCAN-001')
      expect(await fileExists(reportPath)).toBe(false)
    })
  })

  it('returns parseable JSON on stdout and writes no HTML report when scan rejects with a scanner transport error, under --json', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const requestError = new ScanRequestError('Scanner request failed with code SCAN-500', 'SCAN-500')
      const scan: CliScanRunner = async () => {
        throw requestError
      }

      const result = await runCli(
        ['scan', 'https://example.com', '--json', '--html', reportPath],
        { scan },
      )
      const json = parseJsonObject(result.stdout)

      expect(result.exitCode).not.toBe(0)
      expect(json.passed).toBe(false)
      expect(json.status).toBe('error')
      expect(typeof json.error_type).toBe('string')
      expect(json.error_type).not.toBe('')
      expect(json.message).toContain(requestError.message)
      expect(result.stderr).toContain(requestError.message)
      expect(await fileExists(reportPath)).toBe(false)
    })
  })

  it('returns parseable JSON on stdout when scan rejects with a poll timeout error, under --json', async () => {
    const timeoutError = new ScanTimeoutError('Scan polling timed out after 90000ms')
    const scan: CliScanRunner = async () => {
      throw timeoutError
    }

    const result = await runCli(['scan', 'https://example.com', '--json'], { scan })
    const json = parseJsonObject(result.stdout)

    expect(result.exitCode).not.toBe(0)
    expect(json.passed).toBe(false)
    expect(json.status).toBe('error')
    expect(typeof json.error_type).toBe('string')
    expect(json.error_type).not.toBe('')
    expect(json.message).toContain(timeoutError.message)
    expect(result.stderr).toContain(timeoutError.message)
  })

  it('keeps plain-text stderr and empty stdout unchanged for a scan error when --json is not set (human-mode non-regression)', async () => {
    const failedError = new ScanFailedError('SCAN-001')
    const scan: CliScanRunner = async () => {
      throw failedError
    }

    const result = await runCli(['scan', 'https://example.com'], { scan })

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('SCAN-001')
  })

  it('gives each of the network, timeout, and business-failure scan error families its own stable, distinct error_type', async () => {
    // Exact error_type string values are the Coder's choice (documented in
    // the Coder's report) — this test only proves the 3 families the bug
    // report calls out are distinguishable and stable, never pinning a
    // literal string the Coder didn't choose yet.
    const networkError = new ScanServerError(
      'Network error while calling "https://example.com": fetch failed.',
      undefined,
      true,
    )
    const timeoutError = new ScanTimeoutError('Scan polling timed out after 90000ms')
    const businessError = new ScanFailedError('SCAN-001')

    const networkScan: CliScanRunner = async () => { throw networkError }
    const timeoutScan: CliScanRunner = async () => { throw timeoutError }
    const businessScan: CliScanRunner = async () => { throw businessError }

    const networkResult = await runCli(['scan', 'https://example.com', '--json'], { scan: networkScan })
    const timeoutResult = await runCli(['scan', 'https://example.com', '--json'], { scan: timeoutScan })
    const businessResult = await runCli(['scan', 'https://example.com', '--json'], { scan: businessScan })

    const networkJson = parseJsonObject(networkResult.stdout)
    const timeoutJson = parseJsonObject(timeoutResult.stdout)
    const businessJson = parseJsonObject(businessResult.stdout)

    for (const json of [networkJson, timeoutJson, businessJson]) {
      expect(json.passed).toBe(false)
      expect(json.status).toBe('error')
      expect(typeof json.error_type).toBe('string')
      expect(json.error_type).not.toBe('')
    }

    expect(networkJson.error_type).not.toBe(timeoutJson.error_type)
    expect(timeoutJson.error_type).not.toBe(businessJson.error_type)
    expect(networkJson.error_type).not.toBe(businessJson.error_type)
  })

  it('produces stdout that is genuinely parseable JSON, not merely JSON-shaped text, for a scan network error', async () => {
    const networkError = new ScanServerError(
      'Network error while calling "https://example.com": fetch failed.',
      undefined,
      true,
    )
    const scan: CliScanRunner = async () => {
      throw networkError
    }

    const result = await runCli(['scan', 'https://example.com', '--json'], { scan })

    expect(() => JSON.parse(result.stdout)).not.toThrow()
    const parsed: unknown = JSON.parse(result.stdout)
    expect(typeof parsed).toBe('object')
    expect(parsed).not.toBeNull()
    expect(Array.isArray(parsed)).toBe(false)
  })

  it('never leaks the banner or a human scan summary into --json error output, even when isTTY is true', async () => {
    const networkError = new ScanServerError(
      'Network error while calling "https://example.com": fetch failed.',
      undefined,
      true,
    )
    const scan: CliScanRunner = async () => {
      throw networkError
    }

    const result = await runCli(['scan', 'https://example.com', '--json'], { scan, isTTY: true })

    expect(result.stdout).not.toContain('Agent View CLI')
    expect(result.stdout).not.toContain('Score:')
    expect(result.stdout).not.toContain('Verdict:')
    expect(result.stdout).not.toContain('[')
    expect(() => JSON.parse(result.stdout)).not.toThrow()
  })

  // Out of scope per V2_BUG.md §BUG-2 point 4: `validate`'s error path must
  // not change. `runCli`'s top-level catch (cli.ts:227-248) is shared by
  // both subcommands, so this pins today's plain-text/empty-stdout behavior
  // for a thrown error under `validate --json` as a regression guard against
  // an overly broad fix that reshapes the generic catch instead of scan's
  // own error handling.
  it('leaves validate --json error output (plain-text stderr, empty stdout) unchanged — this fix is scoped to scan only', async () => {
    const networkLikeError = new ScanServerError(
      'Network error while calling "https://example.com": fetch failed.',
      undefined,
      true,
    )
    const validate: CliValidationRunner = async () => {
      throw networkLikeError
    }

    const result = await runCli(['https://example.com', '--json'], { validate })

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Network error while calling')
  })

  it('writes scan progress steps to stderr in order and never to stdout', async () => {
    const outcome = scanOutcome()
    const scan: CliScanRunner = async (options) => {
      options.onProgress?.({ currentStep: 'fetch' })
      options.onProgress?.({ currentStep: 'render' })
      return outcome
    }

    const result = await runCli(['scan', 'https://example.com', '--json'], { scan })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain('Scan progress: fetch')
    expect(result.stderr).toContain('Scan progress: render')
    expect(result.stderr.indexOf('Scan progress: fetch')).toBeLessThan(
      result.stderr.indexOf('Scan progress: render'),
    )
    expect(result.stdout).not.toContain('fetch')
    expect(result.stdout).not.toContain('render')
  })

  it('forwards --timeout to ScanOptions.timeoutMs', async () => {
    let capturedOptions: ScanOptions | undefined
    const scan: CliScanRunner = async (options) => {
      capturedOptions = options
      return scanOutcome()
    }

    const result = await runCli(
      ['scan', 'https://example.com', '--json', '--timeout', '5000'],
      { scan },
    )

    expect(result.exitCode).toBe(0)
    expect(capturedOptions?.timeoutMs).toBe(5000)
  })
})

function installFailingFetch(): () => void {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => {
    throw new TypeError('getaddrinfo ENOTFOUND bad-domain.invalid')
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}

function createRoutedTarget(localOrigin: string): string {
  const url = new URL(localOrigin)
  url.hostname = 'example.test'

  return url.toString()
}

function installFetchHostRewrite(hostname: string, replacementOrigin: string): () => void {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (input, init) => {
    const inputUrl = getFetchInputUrl(input)

    if (inputUrl?.hostname === hostname) {
      const replacementUrl = new URL(replacementOrigin)
      inputUrl.protocol = replacementUrl.protocol
      inputUrl.hostname = replacementUrl.hostname
      inputUrl.port = replacementUrl.port

      return originalFetch(inputUrl, init)
    }

    return originalFetch(input, init)
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}

function getFetchInputUrl(input: Parameters<typeof fetch>[0]): URL | null {
  if (typeof input === 'string' || input instanceof URL) {
    return new URL(input)
  }

  if (input instanceof Request) {
    return new URL(input.url)
  }

  return null
}

async function readPackageVersion(): Promise<string> {
  const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version: string }

  return packageJson.version
}

// T5.2_cli-ux-fixes (Bug 1, UPGRADE_BRIEF.md §2): `validate` is not yet a
// recognized subcommand or alias, so `runCli(['validate', url, ...])`
// currently fails with a Commander usage error ("too many arguments"). This
// test is expected to fail (RED) until the Coder job adds the alias.
describe('runCli validate alias', () => {
  it('produces identical output for `index-ai validate <url>` and the bare `index-ai <url>` form', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const aliasResult = await runCli(['validate', 'https://example.com', '--json'], { validate })
    const bareResult = await runCli(['https://example.com', '--json'], { validate })

    expect(aliasResult.exitCode).toBe(bareResult.exitCode)
    expect(aliasResult.stdout).toBe(bareResult.stdout)
    expect(aliasResult.stderr).toBe(bareResult.stderr)
    expect(parseJsonObject(aliasResult.stdout)).toStrictEqual(parseJsonObject(bareResult.stdout))
  })
})

// T5.2_cli-ux-fixes (Bug 2, UPGRADE_BRIEF.md §2): `--version`/`-V` are not
// implemented at all today (no `.version()` call on the Commander program),
// so both flags currently fail as unrecognized options. Expected to fail
// (RED) until the Coder job wires up the real package.json version.
describe('runCli --version', () => {
  it('prints the real package.json version for --version, exits 0, and never runs validation', async () => {
    const version = await readPackageVersion()
    let validateCalls = 0
    const validate: CliValidationRunner = async (options) => {
      validateCalls += 1
      return validationResult(options.target)
    }

    const result = await runCli(['--version'], { validate })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(version)
    expect(validateCalls).toBe(0)
  })

  it('prints the real package.json version for the -V short flag, exits 0, and never runs validation', async () => {
    const version = await readPackageVersion()
    let validateCalls = 0
    const validate: CliValidationRunner = async (options) => {
      validateCalls += 1
      return validationResult(options.target)
    }

    const result = await runCli(['-V'], { validate })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(version)
    expect(validateCalls).toBe(0)
  })
})

// T5.2_cli-ux-fixes (Bug 3, UPGRADE_BRIEF.md §2): `--html` writes the report
// correctly today but prints nothing confirming the path. Expected to fail
// (RED) until the Coder job adds a one-line confirmation to stdout, for both
// `validate --html` and `scan --html`, default and explicit paths alike.
describe('runCli --html confirmation message', () => {
  it('prints a confirmation line citing the explicit path after validate --html writes successfully', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const validate: CliValidationRunner = async (options) => validationResult(options.target)

      const result = await runCli(['https://example.com', '--html', reportPath], { validate })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(reportPath)
    })
  })

  it('prints a confirmation line citing the default path after validate --html with no value writes successfully', async () => {
    await withTempCwd(async (directory) => {
      const validate: CliValidationRunner = async (options) => validationResult(options.target)
      const expectedPath = join(directory, '.report', 'validate-report.html')

      const result = await runCli(['https://example.com', '--html'], { validate })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(expectedPath)
    })
  })

  it('prints a confirmation line citing the explicit path after scan --html writes successfully', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const outcome = scanOutcome()
      const scan: CliScanRunner = async () => outcome

      const result = await runCli(['scan', 'https://example.com', '--html', reportPath], { scan })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(reportPath)
    })
  })

  it('prints a confirmation line citing the default path after scan --html with no value writes successfully', async () => {
    await withTempCwd(async (directory) => {
      const outcome = scanOutcome()
      const scan: CliScanRunner = async () => outcome
      const expectedPath = join(directory, '.report', 'scan-report.html')

      const result = await runCli(['scan', 'https://example.com', '--html'], { scan })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(expectedPath)
    })
  })
})

// T5.2_cli-ux-fixes (Bug 4, UPGRADE_BRIEF.md §2): `--help` currently lists
// `scan` as a bare Commands: entry with no explicit framing that
// `index-ai <url>` / `index-ai validate <url>` is the other, default mode.
// These assertions require the two keywords in distinct, mode-naming
// contexts (not just raw substring presence, which the current bugged
// output already satisfies for "scan"). Expected to fail (RED) until the
// Coder job rewrites the help text.
describe('runCli --help two-mode framing', () => {
  it('explains index-ai validate <url> as the default mode, distinct from index-ai scan <url>', async () => {
    const result = await runCli(['--help'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/index-ai\s+validate\s*<url>/)
    expect(result.stdout).toMatch(/index-ai\s+scan\s*<url>/)
  })
})

// T5.6_target-level-cli-wiring: wires --target-level (l1/l2a; l2b reserved)
// onto the default/validate option chain, plus a minimal inline
// "Requested target level" / "Achieved level" summary line in human stdout.
// Scope is intentionally narrow — no grouped-by-level report yet (T5.7) and
// no level-aware --json fields yet (T5.8). RED until the Coder job wires the
// option in cli.ts.
describe('runCli --target-level option', () => {
  it('accepts --target-level l1 and prints the requested level', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const result = await runCli(['https://example.com', '--target-level', 'l1'], { validate })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('Requested target level: Level 1')
  })

  it('defaults --target-level to l2a, matching an explicit --target-level l2a', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const withoutFlag = await runCli(['https://example.com'], { validate })
    const withFlag = await runCli(['https://example.com', '--target-level', 'l2a'], { validate })

    expect(withoutFlag.exitCode).toBe(0)
    expect(withFlag.exitCode).toBe(0)
    expect(withoutFlag.stdout).toContain('Requested target level: Level 2a')
    expect(withFlag.stdout).toContain('Requested target level: Level 2a')
    expect(withoutFlag.stdout).toBe(withFlag.stdout)
  })

  it('rejects --target-level l2b with a dev-friendly not-yet-available message', async () => {
    const validate: CliValidationRunner = async () => {
      throw new Error('Validation should not run when the target level is rejected')
    }

    const result = await runCli(['https://example.com', '--target-level', 'l2b'], { validate })

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Level 2b')
    expect(result.stderr).toContain('not yet available')
  })

  it('rejects an invalid --target-level value citing the value and the accepted options', async () => {
    const validate: CliValidationRunner = async () => {
      throw new Error('Validation should not run when the target level is rejected')
    }

    const result = await runCli(['https://example.com', '--target-level', 'bogus'], { validate })

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('"bogus"')
    expect(result.stderr).toContain('l1')
    expect(result.stderr).toContain('l2a')
  })

  it('prints Achieved level: l2a for a site that fully passes l2a', async () => {
    const passingChecks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'pass',
        requirement: 'must',
        message: 'Manifest found.',
      },
      {
        code: CHECK.L2A_AGENT_INDEX_FOUND,
        severity: 'pass',
        requirement: 'must',
        message: 'Agent Index graph found.',
      },
    ]
    const validate: CliValidationRunner = async (options) => validationResult(options.target, {
      conformance: 'level-2a',
      passed: true,
      summary: { pass: 2, warn: 0, fail: 0, total: 2 },
      checks: passingChecks,
    })

    const result = await runCli(['https://example.com', '--target-level', 'l2a'], { validate })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Achieved level: Level 2a')
  })

  it('prints Achieved level: none when l1 has a blocking failure', async () => {
    const failingChecks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'Manifest not found.',
      },
    ]
    const validate: CliValidationRunner = async (options) => validationResult(options.target, {
      conformance: 'none',
      passed: false,
      summary: { pass: 0, warn: 0, fail: 1, total: 1 },
      checks: failingChecks,
    })

    const result = await runCli(['https://example.com', '--target-level', 'l1'], { validate })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('Achieved level: none')
  })

  it('does not expose --target-level on the scan subcommand', async () => {
    const result = await runCli(['scan', '--help'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('--target-level')
  })

  it('keeps --json output valid parseable JSON when combined with --target-level', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const result = await runCli(
      ['https://example.com', '--json', '--target-level', 'l1'],
      { validate },
    )
    const json = parseJsonObject(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(json.target).toBe('https://example.com')
    expectJsonResultContract(json)
  })

  // T5.8_target-level-json-output: adds requested_level/tested_levels/
  // achieved_level/failed_level/level_results to --json output. RED until
  // the Coder job composes these 5 fields onto the JSON result in cli.ts.
  it('adds level-aware JSON fields for --target-level l1 when l1 fails', async () => {
    const failingChecks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'Manifest not found.',
      },
    ]
    const validate: CliValidationRunner = async (options) => validationResult(options.target, {
      conformance: 'none',
      passed: false,
      summary: { pass: 0, warn: 0, fail: 1, total: 1 },
      checks: failingChecks,
    })

    const result = await runCli(
      ['https://example.com', '--target-level', 'l1', '--json'],
      { validate },
    )
    const json = parseJsonObject(result.stdout)

    expect(result.exitCode).toBe(1)
    expect(json.requested_level).toBe('l1')
    expect(json.tested_levels).toStrictEqual(['l1'])
    expect(json.achieved_level).toBe('none')
    expect(json.failed_level).toBe('l1')

    const levelResults = expectObjectField(json, 'level_results')
    expect(Object.keys(levelResults)).toStrictEqual(['l1'])
    expect(levelResults.l1).toStrictEqual({ label: 'Level 1', status: 'tested', pass: 0, warn: 0, fail: 1 })
  })

  it('cascade-skips l2a in level_results for --target-level l2a when l1 fails', async () => {
    const failingChecks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'Manifest not found.',
      },
    ]
    const validate: CliValidationRunner = async (options) => validationResult(options.target, {
      conformance: 'none',
      passed: false,
      summary: { pass: 0, warn: 0, fail: 1, total: 1 },
      checks: failingChecks,
    })

    const result = await runCli(
      ['https://example.com', '--target-level', 'l2a', '--json'],
      { validate },
    )
    const json = parseJsonObject(result.stdout)

    expect(json.tested_levels).toStrictEqual(['l1', 'l2a'])
    expect(json.failed_level).toBe('l1')

    const levelResults = expectObjectField(json, 'level_results')
    expect(levelResults.l2a).toStrictEqual({
      label: 'Level 2a',
      status: 'skipped',
      reason: 'Level 1 failed',
    })
  })

  it('reports achieved_level l2a and a null failed_level for --target-level l2a when everything passes', async () => {
    const passingChecks: ValidationCheck[] = [
      {
        code: CHECK.L1_MANIFEST_FOUND,
        severity: 'pass',
        requirement: 'must',
        message: 'Manifest found.',
      },
      {
        code: CHECK.L2A_AGENT_INDEX_FOUND,
        severity: 'pass',
        requirement: 'must',
        message: 'Agent Index graph found.',
      },
    ]
    const validate: CliValidationRunner = async (options) => validationResult(options.target, {
      conformance: 'level-2a',
      passed: true,
      summary: { pass: 2, warn: 0, fail: 0, total: 2 },
      checks: passingChecks,
    })

    const result = await runCli(
      ['https://example.com', '--target-level', 'l2a', '--json'],
      { validate },
    )
    const json = parseJsonObject(result.stdout)

    expect(json.achieved_level).toBe('l2a')
    expect(json.failed_level).toBeNull()

    const levelResults = expectObjectField(json, 'level_results')
    expect(levelResults.l1).toStrictEqual({ label: 'Level 1', status: 'tested', pass: 1, warn: 0, fail: 0 })
    expect(levelResults.l2a).toStrictEqual({ label: 'Level 2a', status: 'tested', pass: 1, warn: 0, fail: 0 })
    expect(result.stdout).not.toContain('skipped')
  })

  // Note: there is deliberately no "--target-level l2b --json" case here.
  // parseTargetLevel (cli.ts, T5.6) still rejects l2b at the CLI parser
  // layer — locked, unchanged behavior per UPGRADE_BRIEF.md §4 ("don't
  // expose l2b until implemented"), already covered by the pre-existing
  // 'rejects --target-level l2b...' test above. Since the JSON composition
  // added by this job is a private function local to cli.ts (no exported
  // unit-testable entry point), l2b's 3-level JSON shape is not reachable
  // through the public CLI surface this sprint — mirrors T5.7's own
  // precedent, where l2b's cascade is only exercised via format.test.ts's
  // direct unit calls to formatHumanResult, never through the CLI binary.
  it('adds the 5 level-aware JSON fields for the default --target-level (l2a) alongside the existing JSON contract', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const result = await runCli(['https://example.com', '--json'], { validate })
    const json = parseJsonObject(result.stdout)

    expect(result.exitCode).toBe(0)
    expectJsonResultContract(json)
    expect(json.requested_level).toBe('l2a')
    expect(json.tested_levels).toStrictEqual(['l1', 'l2a'])
    expect(typeof json.achieved_level).toBe('string')
    expect(json.failed_level === null || typeof json.failed_level === 'string').toBe(true)

    const levelResults = expectObjectField(json, 'level_results')
    expect(Object.keys(levelResults)).toStrictEqual(['l1', 'l2a'])
  })
})

// T5.14_html-report-level-aware (V2_BUG.md §BUG-1): `validate --html`
// currently writes a report with the obsolete "Agent-View LV2" / "Level 1
// and Level 2" hero copy and no level-aware content at all, because
// `writeHtmlReport` never receives `options.targetLevel`. This end-to-end
// test reproduces the human's own acceptance test from V2_BUG.md
// (`Select-String -Pattern "Requested target level|Tested levels|Achieved
// level|Failed level|Level 2a|skipped"` finds matches; `Select-String
// -Pattern "LV2|Level 2[^a]"` finds none). RED until the Coder job plumbs
// `options.targetLevel` through `writeHtmlReport` -> `formatHtmlReport`.
describe('runCli validate --html level-aware content (T5.14_html-report-level-aware)', () => {
  it('writes an HTML report with level-aware content and no obsolete wording when l1 fails under --target-level l2a', async () => {
    await withTempDir(async (directory) => {
      const reportPath = join(directory, 'report.html')
      const failingChecks: ValidationCheck[] = [
        {
          code: CHECK.L1_MANIFEST_FOUND,
          severity: 'fail',
          requirement: 'must',
          message: 'Manifest not found.',
        },
      ]
      const validate: CliValidationRunner = async (options) => validationResult(options.target, {
        conformance: 'none',
        passed: false,
        summary: { pass: 0, warn: 0, fail: 1, total: 1 },
        checks: failingChecks,
      })

      const result = await runCli(
        ['https://example.com', '--target-level', 'l2a', '--html', reportPath, '--no-exit-code'],
        { validate },
      )
      const html = await readFile(reportPath, 'utf8')

      // Level-aware content is present.
      expect(result.exitCode).toBe(0)
      expect(html).toMatch(/Requested target level|Tested levels|Achieved level|Failed level/)
      expect(html).toContain('Level 2a')
      expect(html.toLowerCase()).toContain('skipped')

      // Obsolete wording is absent.
      expect(html).not.toContain('LV2')
      expect(html).not.toMatch(/Level 2[^ab]/)
    })
  })
})

// T5.10_cli-branding-banner: adds an "Agent View CLI" ASCII banner to
// human-facing --help output (main program + scan --help) and the default
// human validation report, gated on a new injectable `isTTY` dependency, plus
// an injectable `spinner` dependency (CliScanSpinner: start/step/stop) driven
// from the existing `ScanOptions.onProgress` callback during `scan`. Locked
// design (JOB.md): the banner must never appear in --json output or when
// `isTTY` is false/absent (default testable state stays non-TTY-like, which
// is why none of the ~1738 pre-existing tests above inject `isTTY` and none
// of them see a banner). RED until the Coder job adds `isTTY`/`spinner` to
// `CliRunDependencies` and wires `buildBanner()`/`CliScanSpinner` into
// `cli.ts`.
describe('runCli branding banner + scan spinner', () => {
  it('does not print the banner in human validation output when isTTY is not provided', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const result = await runCli(['https://example.com'], { validate })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('Agent View CLI')
  })

  it('prints the Agent View CLI banner before the human validation report when isTTY is true', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const result = await runCli(['https://example.com'], { validate, isTTY: true })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Agent View CLI')
    expect(result.stdout).toContain('index-ai validation result')
    expect(result.stdout.indexOf('Agent View CLI')).toBeLessThan(
      result.stdout.indexOf('index-ai validation result'),
    )
  })

  it('never prints the banner in --json output even when isTTY is true, and keeps stdout parseable JSON', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const result = await runCli(['https://example.com', '--json'], { validate, isTTY: true })
    const json = parseJsonObject(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('Agent View CLI')
    expectJsonResultContract(json)
  })

  it('does not print the banner in human validation output when isTTY is explicitly false', async () => {
    const validate: CliValidationRunner = async (options) => validationResult(options.target)

    const result = await runCli(['https://example.com'], { validate, isTTY: false })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('Agent View CLI')
  })

  it('prints the Agent View CLI banner in --help when isTTY is true, and omits it when isTTY is false', async () => {
    const withTty = await runCli(['--help'], { isTTY: true })
    const withoutTty = await runCli(['--help'], { isTTY: false })

    expect(withTty.exitCode).toBe(0)
    expect(withTty.stdout).toContain('Agent View CLI')
    expect(withoutTty.exitCode).toBe(0)
    expect(withoutTty.stdout).not.toContain('Agent View CLI')
  })

  it('prints the Agent View CLI banner in scan --help when isTTY is true, and omits it when isTTY is false', async () => {
    const withTty = await runCli(['scan', '--help'], { isTTY: true })
    const withoutTty = await runCli(['scan', '--help'], { isTTY: false })

    expect(withTty.exitCode).toBe(0)
    expect(withTty.stdout).toContain('Agent View CLI')
    expect(withoutTty.exitCode).toBe(0)
    expect(withoutTty.stdout).not.toContain('Agent View CLI')
  })

  it('drives the injected spinner through start, ordered step calls, and stop during a TTY human scan', async () => {
    const callOrder: string[] = []
    const outcome = scanOutcome()
    const scan: CliScanRunner = async (options) => {
      callOrder.push('scan:start')
      options.onProgress?.({ currentStep: 'fetch' })
      options.onProgress?.({ currentStep: 'render' })
      options.onProgress?.({ currentStep: 'score' })
      callOrder.push('scan:end')
      return outcome
    }
    const spinner = {
      start: vi.fn(() => callOrder.push('spinner:start')),
      step: vi.fn((currentStep: ScanProgressStep) => callOrder.push(`spinner:step:${currentStep}`)),
      stop: vi.fn(() => callOrder.push('spinner:stop')),
    }

    const result = await runCli(['scan', 'https://example.com'], { scan, spinner, isTTY: true })

    expect(result.exitCode).toBe(0)
    expect(spinner.start).toHaveBeenCalledTimes(1)
    expect(spinner.stop).toHaveBeenCalledTimes(1)
    expect(spinner.step).toHaveBeenNthCalledWith(1, 'fetch')
    expect(spinner.step).toHaveBeenNthCalledWith(2, 'render')
    expect(spinner.step).toHaveBeenNthCalledWith(3, 'score')
    expect(callOrder).toStrictEqual([
      'spinner:start',
      'scan:start',
      'spinner:step:fetch',
      'spinner:step:render',
      'spinner:step:score',
      'scan:end',
      'spinner:stop',
    ])
  })

  it('never drives the injected spinner in --json or non-TTY scan runs, and keeps the legacy stderr progress lines', async () => {
    const outcome = scanOutcome()
    const scenarios: readonly { readonly label: string; readonly argv: readonly string[]; readonly isTTY: boolean }[] = [
      { label: '--json with isTTY true', argv: ['scan', 'https://example.com', '--json'], isTTY: true },
      { label: 'isTTY false without --json', argv: ['scan', 'https://example.com'], isTTY: false },
    ]

    for (const scenario of scenarios) {
      const scan: CliScanRunner = async (options) => {
        options.onProgress?.({ currentStep: 'fetch' })
        options.onProgress?.({ currentStep: 'render' })
        return outcome
      }
      const spinner = {
        start: vi.fn(),
        step: vi.fn(),
        stop: vi.fn(),
      }

      const result = await runCli(scenario.argv, { scan, spinner, isTTY: scenario.isTTY })

      expect(result.exitCode).toBe(0)
      expect(spinner.start).not.toHaveBeenCalled()
      expect(spinner.step).not.toHaveBeenCalled()
      expect(spinner.stop).not.toHaveBeenCalled()
      expect(result.stderr).toContain('Scan progress: fetch')
      expect(result.stderr).toContain('Scan progress: render')
    }
  })

  it('runs scan without crashing when no isTTY or spinner dependency is provided, matching pre-existing behavior', async () => {
    const outcome = scanOutcome()
    const scan: CliScanRunner = async (options) => {
      options.onProgress?.({ currentStep: 'fetch' })
      return outcome
    }

    const result = await runCli(['scan', 'https://example.com'], { scan })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('Agent View CLI')
    expect(result.stderr).toContain('Scan progress: fetch')
  })
})
