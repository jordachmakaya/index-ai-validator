import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { CHECK } from '../constants'
import type { ValidationCheck, ValidatorOptions } from '../types'
import { validateIndexAi } from '../validator'
import { validateDiscovery } from './discovery'

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

function validGraph(): Record<string, unknown> {
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
          llm_url: '/clean/home.md',
          content_chars: 19,
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

function completeRoutes(homeRoute: RouteResponse): Record<string, RouteResponse> {
  return {
    '/': homeRoute,
    '/.well-known/index-ai.json': jsonRoute(validManifest()),
    '/agent-index.json': jsonRoute(validGraph()),
    '/clean/home.md': textRoute('Home clean endpoint'),
    '/robots.txt': textRoute('Agent-Manifest: /.well-known/index-ai.json'),
    '/llms.txt': textRoute('- Agent-Manifest: /.well-known/index-ai.json'),
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

describe('validateDiscovery', () => {
  it('passes all discovery hint checks when homepage, robots.txt, and llms.txt advertise Agent-Manifest', async () => {
    const server = await startServer(completeRoutes({
      body: '<html><head><link rel="agent-manifest" href="/.well-known/index-ai.json" type="application/json"></head></html>',
      contentType: 'text/html; charset=utf-8',
      headers: {
        link: '</.well-known/index-ai.json>; rel=agent-manifest; type=application/json',
      },
    }))

    const checks = await validateDiscovery(createOptions(server.origin))

    expect(findCheck(checks, CHECK.DISCOVERY_HTML_LINK).severity).toBe('pass')
    expect(findCheck(checks, CHECK.DISCOVERY_HTTP_LINK_HEADER).severity).toBe('pass')
    expect(findCheck(checks, CHECK.DISCOVERY_ROBOTS_AI_INDEX).severity).toBe('pass')
    expect(findCheck(checks, CHECK.DISCOVERY_LLMS_TXT_CONTENT_TYPE).severity).toBe('pass')
    expect(findCheck(checks, CHECK.DISCOVERY_LLMS_TXT_BRIDGE).severity).toBe('pass')
  })

  it('warns for a bare site without discovery hints', async () => {
    const server = await startServer({
      '/': textRoute('<html><head></head><body>Home</body></html>', 'text/html; charset=utf-8'),
    })

    const checks = await validateDiscovery(createOptions(server.origin))

    expect(findCheck(checks, CHECK.DISCOVERY_HTML_LINK).severity).toBe('warn')
    expect(findCheck(checks, CHECK.DISCOVERY_HTTP_LINK_HEADER).severity).toBe('warn')
    expect(findCheck(checks, CHECK.DISCOVERY_ROBOTS_AI_INDEX).severity).toBe('warn')
    expect(findCheck(checks, CHECK.DISCOVERY_LLMS_TXT_BRIDGE).severity).toBe('warn')
  })

  it('warns when llms.txt is served with the wrong content type', async () => {
    const server = await startServer({
      '/': textRoute('<link rel="agent-manifest" href="/.well-known/index-ai.json">', 'text/html; charset=utf-8'),
      '/robots.txt': textRoute('Agent-Manifest: /.well-known/index-ai.json'),
      '/llms.txt': textRoute('- Agent-Manifest: /.well-known/index-ai.json', 'text/html; charset=utf-8'),
    })

    const checks = await validateDiscovery(createOptions(server.origin))

    expect(findCheck(checks, CHECK.DISCOVERY_LLMS_TXT_CONTENT_TYPE).severity).toBe('warn')
    expect(findCheck(checks, CHECK.DISCOVERY_LLMS_TXT_BRIDGE).severity).toBe('pass')
  })

  it('keeps structural conformance while failOnWarn makes discovery warnings fail the global verdict', async () => {
    const server = await startServer(completeRoutes({
      body: '<html><head></head><body>Home</body></html>',
      contentType: 'text/html; charset=utf-8',
    }))
    const options = {
      ...createOptions(server.origin),
      failOnWarn: true,
    }

    const result = await validateIndexAi(options)

    expect(result.conformance).toBe('level-2a')
    expect(result.passed).toBe(false)
    expect(findCheck(result.checks, CHECK.DISCOVERY_HTML_LINK).severity).toBe('warn')
  })

  it('keeps discovery warnings as warnings while strict makes the global verdict fail', async () => {
    const server = await startServer(completeRoutes({
      body: '<html><head></head><body>Home</body></html>',
      contentType: 'text/html; charset=utf-8',
    }))
    const options = {
      ...createOptions(server.origin),
      strict: true,
    }

    const result = await validateIndexAi(options)

    expect(result.conformance).toBe('level-2a')
    expect(result.passed).toBe(false)
    expect(findCheck(result.checks, CHECK.DISCOVERY_HTML_LINK).severity).toBe('warn')
  })
})
