import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { CHECK } from '../constants'
import type { ValidationCheck, ValidatorOptions } from '../types'
import { validateIndexAi } from '../validator'
import { validateSecurity } from './security'

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

function graphWithCleanEndpoint(path: string): Record<string, unknown> {
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
          llm_url: path,
          content_chars: 500,
          content_chars_mode: 'max',
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

function createOptions(target: string): ValidatorOptions {
  return {
    target,
    strict: false,
    strictSecurity: false,
    failOnWarn: false,
    verbose: false,
    timeoutMs: 1_000,
    maxConcurrency: 4,
    allowPrivateHosts: false,
  }
}

function baseRoutes(cleanBody: string): Record<string, RouteResponse> {
  return {
    '/': {
      contentType: 'text/html; charset=utf-8',
      headers: {
        link: '</.well-known/index-ai.json>; rel=ai-index; type=application/json',
      },
      body: '<html><head><link rel="ai-index" href="/.well-known/index-ai.json" type="application/json"></head></html>',
    },
    '/.well-known/index-ai.json': jsonRoute(validManifest()),
    '/ai-graph.json': jsonRoute(graphWithCleanEndpoint('/clean/home.md')),
    '/clean/home.md': textRoute(cleanBody, 'text/markdown; charset=utf-8'),
    '/robots.txt': textRoute('AI-Index: /.well-known/index-ai.json'),
    '/llms.txt': textRoute('- AI-Index: /.well-known/index-ai.json'),
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

function findCheck(checks: readonly ValidationCheck[], id: string): ValidationCheck {
  const check = checks.find((candidate) => candidate.code === id)

  if (!check) {
    throw new Error(`Expected check ${id} to exist`)
  }

  return check
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

describe('validateSecurity', () => {
  it('passes when clean endpoint text contains no secret or private-infra patterns', () => {
    const checks = validateSecurity({
      resources: [
        {
          source: 'http://127.0.0.1/clean/home.md',
          text: 'Clean public endpoint with no sensitive values.',
          nodeId: 'home',
        },
      ],
      strictSecurity: false,
    })

    expect(findCheck(checks, CHECK.SEC_SECRET_PATTERN).severity).toBe('pass')
    expect(findCheck(checks, CHECK.SEC_PRIVATE_INFRA_PATTERN).severity).toBe('pass')
  })

  it('fails when a secret-shaped value appears outside a Markdown code block', () => {
    const checks = validateSecurity({
      resources: [
        {
          source: 'http://127.0.0.1/clean/home.md',
          text: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456',
          nodeId: 'home',
        },
      ],
      strictSecurity: false,
    })
    const check = findCheck(checks, CHECK.SEC_SECRET_PATTERN)

    expect(check.severity).toBe('fail')
    expect(check.requirement).toBe('heuristic')
    expect(check.fix).toContain('Remove secrets')
    expect(String(check.details?.evidence)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
  })

  it('passes when a secret-shaped value appears only inside a Markdown code block', () => {
    const checks = validateSecurity({
      resources: [
        {
          source: 'http://127.0.0.1/clean/home.md',
          text: '```bash\nOPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n```',
          nodeId: 'home',
        },
      ],
      strictSecurity: false,
    })

    expect(findCheck(checks, CHECK.SEC_SECRET_PATTERN).severity).toBe('pass')
    expect(findCheck(checks, CHECK.SEC_PRIVATE_INFRA_PATTERN).severity).toBe('pass')
  })

  it('warns without failing when a sensitive env var name appears without a secret value', () => {
    const checks = validateSecurity({
      resources: [
        {
          source: 'http://127.0.0.1/clean/home.md',
          text: 'Configure SUPABASE_SERVICE_ROLE_KEY on the server only.',
          nodeId: 'home',
        },
      ],
      strictSecurity: false,
    })
    const check = findCheck(checks, CHECK.SEC_SECRET_PATTERN)

    expect(check.severity).toBe('warn')
    expect(check.message).toContain('variable-name reference')
    expect(check.message).not.toContain('secret value')
  })

  it('warns without failing when a service_role_key name appears without a secret value', () => {
    const checks = validateSecurity({
      resources: [
        {
          source: 'http://127.0.0.1/clean/home.md',
          text: 'Never expose service_role_key values in public endpoint output.',
          nodeId: 'home',
        },
      ],
      strictSecurity: false,
    })

    expect(findCheck(checks, CHECK.SEC_SECRET_PATTERN).severity).toBe('warn')
  })

  it('warns on private infrastructure references by default', () => {
    const checks = validateSecurity({
      resources: [
        {
          source: 'http://127.0.0.1/clean/home.md',
          text: 'Internal server: 192.168.1.20',
          nodeId: 'home',
        },
      ],
      strictSecurity: false,
    })
    const check = findCheck(checks, CHECK.SEC_PRIVATE_INFRA_PATTERN)

    expect(check.severity).toBe('warn')
    expect(check.fix).toContain('Remove internal IP addresses')
  })

  it('fails on private infrastructure references when strict security is enabled', () => {
    const checks = validateSecurity({
      resources: [
        {
          source: 'http://127.0.0.1/clean/home.md',
          text: 'Internal host: api.internal',
          nodeId: 'home',
        },
      ],
      strictSecurity: true,
    })

    expect(findCheck(checks, CHECK.SEC_PRIVATE_INFRA_PATTERN).severity).toBe('fail')
  })

  it('does not flag private infrastructure examples inside Markdown code blocks', () => {
    const checks = validateSecurity({
      resources: [
        {
          source: 'http://127.0.0.1/clean/home.md',
          text: '```txt\nInternal server: 192.168.1.20\n```',
          nodeId: 'home',
        },
      ],
      strictSecurity: true,
    })

    expect(findCheck(checks, CHECK.SEC_PRIVATE_INFRA_PATTERN).severity).toBe('pass')
  })

  it('makes the public validator fail when a fetched clean endpoint leaks a secret', async () => {
    const server = await startServer(baseRoutes('OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456'))

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-2a')
    expect(result.passed).toBe(false)
    expect(result.metrics.secret_findings).toBe(1)
    expect(findCheck(result.checks, CHECK.SEC_SECRET_PATTERN).severity).toBe('fail')
  })

  it('keeps private infrastructure findings as warnings unless strictSecurity is enabled', async () => {
    const server = await startServer(baseRoutes('Internal server: 192.168.1.20'))

    const defaultResult = await validateIndexAi(createOptions(server.origin))
    const strictResult = await validateIndexAi({
      ...createOptions(server.origin),
      strictSecurity: true,
    })

    expect(defaultResult.conformance).toBe('level-2a')
    expect(defaultResult.passed).toBe(true)
    expect(findCheck(defaultResult.checks, CHECK.SEC_PRIVATE_INFRA_PATTERN).severity).toBe('warn')
    expect(strictResult.conformance).toBe('level-2a')
    expect(strictResult.passed).toBe(false)
    expect(findCheck(strictResult.checks, CHECK.SEC_PRIVATE_INFRA_PATTERN).severity).toBe('fail')
  })
})
