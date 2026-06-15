import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { CHECK } from '../constants'
import type { ValidationCheck, ValidatorOptions } from '../types'
import { validateIndexAi } from '../validator'
import { validateManifest } from './manifest'

type RouteResponse = {
  readonly status?: number
  readonly contentType?: string
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
        'content-type': route.contentType ?? 'application/json; charset=utf-8',
      })
      response.end(route.body)
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        throw new Error('Expected local test server to listen on a TCP address')
      }

      const testServer = {
        origin: `http://127.0.0.1:${address.port}`,
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

describe('validateManifest', () => {
  it('passes Level 1 manifest checks for a valid canonical manifest', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': {
        body: JSON.stringify(validManifest()),
      },
    })

    const result = await validateManifest(createOptions(server.origin))

    expect(result.manifest?.spec_version).toBe('1.0')
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_FOUND).severity).toBe('pass')
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_CONTENT_TYPE).severity).toBe('pass')
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_JSON_VALID).severity).toBe('pass')
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_SCHEMA_VALID).severity).toBe('pass')
    expect(findCheck(result.checks, CHECK.L1_DOMAIN_MATCH).severity).toBe('pass')
  })

  it('reports a missing manifest when canonical and fallback paths are unavailable', async () => {
    const server = await startServer({})

    const result = await validateManifest(createOptions(server.origin))

    expect(result.manifest).toBeUndefined()
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_FOUND).severity).toBe('fail')
  })

  it('uses the fallback manifest path with a warning when canonical is missing', async () => {
    const server = await startServer({
      '/index-ai.json': {
        body: JSON.stringify(validManifest()),
      },
    })

    const result = await validateManifest(createOptions(server.origin))

    expect(result.manifest?.spec_version).toBe('1.0')
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_FOUND).severity).toBe('pass')
    expect(findCheck(result.checks, CHECK.L1_FALLBACK_MATCH).severity).toBe('warn')
  })

  it('reports wrong manifest content type without hiding JSON and schema results', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': {
        contentType: 'text/plain; charset=utf-8',
        body: JSON.stringify(validManifest()),
      },
    })

    const result = await validateManifest(createOptions(server.origin))

    expect(findCheck(result.checks, CHECK.L1_MANIFEST_CONTENT_TYPE).severity).toBe('fail')
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_JSON_VALID).severity).toBe('pass')
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_SCHEMA_VALID).severity).toBe('pass')
  })

  it('reports malformed JSON before schema validation', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': {
        body: '{"spec_version":',
      },
    })

    const result = await validateManifest(createOptions(server.origin))

    expect(result.manifest).toBeUndefined()
    expect(findCheck(result.checks, CHECK.L1_MANIFEST_JSON_VALID).severity).toBe('fail')
    expect(result.checks.some((check) => check.code === CHECK.L1_MANIFEST_SCHEMA_VALID)).toBe(false)
  })

  it('maps schema errors into an actionable manifest check', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': {
        body: JSON.stringify({
          spec_version: '1.0',
          manifest_version: 1,
        }),
      },
    })

    const result = await validateManifest(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L1_MANIFEST_SCHEMA_VALID)

    expect(schemaCheck.severity).toBe('fail')
    expect(schemaCheck.fix).toContain('required Level 1 manifest fields')
  })

  it('warns when manifest identity.domain does not match the manifest host', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': {
        body: JSON.stringify({
          ...validManifest(),
          identity: {
            name: 'Example Site',
            description: 'A deterministic local test manifest.',
            domain: 'example.test',
          },
        }),
      },
    })

    const result = await validateManifest(createOptions(server.origin))

    expect(findCheck(result.checks, CHECK.L1_DOMAIN_MATCH).severity).toBe('warn')
  })

  it('returns Level 1 conformance from the public validator entrypoint', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': {
        body: JSON.stringify({
          ...validManifest(),
          access: {
            llms_txt: '/llms.txt',
          },
        }),
      },
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.passed).toBe(true)
    expect(result.conformance).toBe('level-1')
    expect(result.metrics.manifest_found).toBe(true)
    expect(result.metrics.manifest_schema_valid).toBe(true)
  })
})
