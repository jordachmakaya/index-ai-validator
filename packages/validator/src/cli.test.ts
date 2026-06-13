import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { CHECK, SCHEMA_VERSION } from './constants'
import { runCli, type CliValidationRunner } from './cli'
import type { ValidationCheck, ValidationResult, ValidatorOptions } from './types'
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
      shadow_layer: '/ai-graph.json',
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
        link: '</.well-known/index-ai.json>; rel=ai-index; type=application/json',
      },
      body: '<html><head><link rel="ai-index" href="/.well-known/index-ai.json" type="application/json"></head></html>',
    },
    '/.well-known/index-ai.json': jsonRoute(validManifest()),
    '/ai-graph.json': jsonRoute(validGraph(cleanBody)),
    '/clean/home.md': textRoute(cleanBody, 'text/markdown; charset=utf-8'),
    '/robots.txt': textRoute('AI-Index: /.well-known/index-ai.json'),
    '/llms.txt': textRoute('- AI-Index: /.well-known/index-ai.json'),
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
    '/llms.txt': textRoute('No AI-Index bridge here.'),
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
    },
    checks: [passCheck],
  }

  return {
    ...result,
    ...overrides,
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
  expect(typeof metrics.shadow_layer_found).toBe('boolean')
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
      '/ai-graph.json': jsonRoute(validGraph(privateBody, `${privateServer.origin}/clean/private.md`)),
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
      fix: 'Add a rel=ai-index link.',
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
    expect(compact.stdout).toContain('Fix: Add a rel=ai-index link.')
    expect(compact.stdout).toContain('Next:')
    expect(compact.stdout).not.toContain(CHECK.L1_MANIFEST_FOUND)
    expect(verbose.stdout).toContain('Passed checks:')
    expect(verbose.stdout).toContain(CHECK.L1_MANIFEST_FOUND)
  })

  it('prints useful human output for failed validation results', async () => {
    const failureCheck: ValidationCheck = {
      code: CHECK.L2A_SHADOW_FOUND,
      severity: 'fail',
      requirement: 'must',
      message: 'Shadow Index graph was not found.',
      url: 'https://example.com/ai-graph.json',
      fix: 'Add access.shadow_layer to the AI Manifest and serve the graph.',
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
    expect(result.stdout).toContain(CHECK.L2A_SHADOW_FOUND)
    expect(result.stdout).toContain('Fix: Add access.shadow_layer to the AI Manifest and serve the graph.')
    expect(result.stdout).toContain('Fix all fail checks')
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
