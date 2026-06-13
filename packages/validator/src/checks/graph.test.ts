import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { CHECK } from '../constants'
import { countContentChars } from '../utils/content-chars'
import type { ValidationCheck, ValidatorOptions } from '../types'
import { validateIndexAi } from '../validator'

type RouteResponse = {
  readonly status?: number
  readonly contentType?: string
  readonly body: string
}

type TestServer = {
  readonly origin: string
  readonly close: () => Promise<void>
}

type GraphNodeInput = {
  readonly id: string
  readonly llmUrl: string
  readonly contentChars: number
  readonly contentCharsMode: 'exact' | 'max'
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

function graphWithNodes(nodes: readonly GraphNodeInput[]): Record<string, unknown> {
  return {
    generated: '2026-06-12T00:00:00.000Z',
    spec_version: '1.0',
    total_nodes: nodes.length,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: 'page',
      label: `Node ${node.id}`,
      description: `Clean endpoint test node ${node.id}.`,
      content: {
        llm_summary: `Summary for ${node.id}.`,
        llm_url: node.llmUrl,
        content_chars: node.contentChars,
        content_chars_mode: node.contentCharsMode,
        summary_method: 'manual',
        language: 'en',
      },
      meta: {
        updated: '2026-06-12T00:00:00.000Z',
        refresh_frequency: 'daily',
      },
    })),
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

function manifestRoute(): RouteResponse {
  return {
    body: JSON.stringify(validManifest()),
  }
}

function graphRoute(graph: Record<string, unknown>, contentType = 'application/json; charset=utf-8'): RouteResponse {
  return {
    contentType,
    body: JSON.stringify(graph),
  }
}

function textRoute(body: string, contentType = 'text/markdown; charset=utf-8'): RouteResponse {
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

function findCheckForNode(
  checks: readonly ValidationCheck[],
  id: string,
  nodeId: string,
): ValidationCheck {
  const check = checks.find((candidate) =>
    candidate.code === id && candidate.details?.node_id === nodeId)

  if (!check) {
    throw new Error(`Expected check ${id} for node ${nodeId} to exist`)
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

describe('Level 2a graph validation', () => {
  it('returns Level 2a conformance for a valid graph with markdown and plain clean endpoints', async () => {
    const markdown = 'Markdown clean endpoint.'
    const plain = 'Plain clean endpoint.'
    const graph = graphWithNodes([
      {
        id: 'markdown',
        llmUrl: '/clean/markdown.md',
        contentChars: countContentChars(markdown),
        contentCharsMode: 'exact',
      },
      {
        id: 'plain',
        llmUrl: '/clean/plain.txt',
        contentChars: countContentChars(plain),
        contentCharsMode: 'max',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/markdown.md': textRoute(markdown, 'text/markdown; charset=utf-8'),
      '/clean/plain.txt': textRoute(plain, 'text/plain; charset=utf-8'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.passed).toBe(true)
    expect(result.conformance).toBe('level-2a')
    expect(result.metrics.shadow_layer_found).toBe(true)
    expect(result.metrics.shadow_layer_schema_valid).toBe(true)
    expect(result.metrics.total_nodes).toBe(2)
    expect(result.metrics.nodes_with_llm_url).toBe(2)
    expect(result.metrics.valid_clean_endpoints).toBe(2)
    expect(result.metrics.valid_content_chars).toBe(2)
    expect(findCheck(result.checks, CHECK.L2A_SHADOW_FOUND).severity).toBe('pass')
    expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_CONTENT_TYPE, 'markdown').severity).toBe('pass')
    expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_CONTENT_TYPE, 'plain').severity).toBe('pass')
  })

  it('reports a missing declared graph without losing Level 1 conformance', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_SHADOW_FOUND).severity).toBe('fail')
  })

  it('reports wrong graph content type', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 5,
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph, 'text/plain; charset=utf-8'),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_SHADOW_CONTENT_TYPE).severity).toBe('fail')
  })

  it('reports malformed graph JSON before schema validation', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': {
        body: '{"nodes":',
      },
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_SHADOW_JSON_VALID).severity).toBe('fail')
    expect(result.checks.some((check) => check.code === CHECK.L2A_SHADOW_SCHEMA_VALID)).toBe(false)
  })

  it('reports invalid graph schema', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute({
        generated: '2026-06-12T00:00:00.000Z',
        spec_version: '1.0',
      }),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_SHADOW_SCHEMA_VALID).severity).toBe('fail')
  })

  it('rejects graph validation when content_chars is zero', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 0,
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L2A_SHADOW_SCHEMA_VALID)

    expect(result.conformance).toBe('level-1')
    expect(schemaCheck.severity).toBe('fail')
    expect(schemaCheck.details).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: '/nodes/0/content/content_chars',
            keyword: 'minimum',
          }),
        ]),
      }),
    )
  })

  it('rejects graph validation when content_chars is decimal', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 1.5,
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L2A_SHADOW_SCHEMA_VALID)

    expect(result.conformance).toBe('level-1')
    expect(schemaCheck.severity).toBe('fail')
    expect(schemaCheck.details).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: '/nodes/0/content/content_chars',
            keyword: 'type',
          }),
        ]),
      }),
    )
  })

  it('rejects graph validation when summary_method is missing', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 5,
        contentCharsMode: 'exact',
      },
    ])
    deleteFirstNodeContentField(graph, 'summary_method')
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L2A_SHADOW_SCHEMA_VALID)

    expect(result.conformance).toBe('level-1')
    expect(schemaCheck.severity).toBe('fail')
    expect(schemaCheck.details).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: '/nodes/0/content',
            keyword: 'required',
          }),
        ]),
      }),
    )
  })

  it('rejects graph validation when language is missing', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 5,
        contentCharsMode: 'exact',
      },
    ])
    deleteFirstNodeContentField(graph, 'language')
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L2A_SHADOW_SCHEMA_VALID)

    expect(result.conformance).toBe('level-1')
    expect(schemaCheck.severity).toBe('fail')
    expect(schemaCheck.details).toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: '/nodes/0/content',
            keyword: 'required',
          }),
        ]),
      }),
    )
  })

  it('rejects the deprecated pages array', async () => {
    const graph = {
      ...graphWithNodes([
        {
          id: 'home',
          llmUrl: '/clean/home.md',
          contentChars: 5,
          contentCharsMode: 'exact',
        },
      ]),
      pages: [],
    }
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_NO_PAGES_ARRAY).severity).toBe('fail')
  })

  it('reports invalid llm_url protocols', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: 'ftp://example.test/home.md',
        contentChars: 5,
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_PROTOCOL, 'home').severity).toBe('fail')
  })

  it('blocks private llm_url hosts by default for non-local targets', async () => {
    const targetServer = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graphWithNodes([
        {
          id: 'private',
          llmUrl: 'http://127.0.0.1:1/clean/private.md',
          contentChars: 500,
          contentCharsMode: 'max',
        },
      ])),
    })
    const routedTarget = createRoutedTarget(targetServer.origin)
    const restoreFetch = installFetchHostRewrite('example.test', targetServer.origin)

    try {
      const result = await validateIndexAi(createOptions(routedTarget))
      const fetchCheck = findCheckForNode(result.checks, CHECK.L2A_LLM_URL_FETCH, 'private')

      expect(result.passed).toBe(false)
      expect(result.conformance).toBe('level-1')
      expect(fetchCheck.severity).toBe('fail')
      expect(fetchCheck.details).toEqual(
        expect.objectContaining({
          error_code: 'HTTP_PRIVATE_HOST_BLOCKED',
        }),
      )
    }
    finally {
      restoreFetch()
    }
  })

  it('allows private llm_url hosts when allowPrivateHosts is true', async () => {
    const privateBody = 'Private local clean endpoint.'
    const privateServer = await startServer({
      '/clean/private.md': textRoute(privateBody),
    })
    const targetServer = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graphWithNodes([
        {
          id: 'private',
          llmUrl: `${privateServer.origin}/clean/private.md`,
          contentChars: countContentChars(privateBody),
          contentCharsMode: 'exact',
        },
      ])),
    })
    const routedTarget = createRoutedTarget(targetServer.origin)
    const restoreFetch = installFetchHostRewrite('example.test', targetServer.origin)

    try {
      const result = await validateIndexAi({
        ...createOptions(routedTarget),
        allowPrivateHosts: true,
      })

      expect(result.passed).toBe(true)
      expect(result.conformance).toBe('level-2a')
      expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_FETCH, 'private').severity).toBe('pass')
      expect(findCheckForNode(result.checks, CHECK.L2A_CONTENT_CHARS_EXACT_MATCH, 'private').severity).toBe('pass')
    }
    finally {
      restoreFetch()
    }
  })

  it('reports clean endpoints served with the wrong content type', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.html',
        contentChars: 5,
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.html': textRoute('Hello', 'text/html; charset=utf-8'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_CONTENT_TYPE, 'home').severity).toBe('fail')
  })

  it('reports hard HTML leaks in clean endpoint bodies', async () => {
    const html = '<!doctype html><html><body>Hello</body></html>'
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: countContentChars(html),
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute(html),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_HTML_LEAK, 'home').severity).toBe('fail')
  })

  it('passes exact content_chars when the declared count matches', async () => {
    const body = 'Exact clean text.'
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: countContentChars(body),
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(findCheckForNode(result.checks, CHECK.L2A_CONTENT_CHARS_EXACT_MATCH, 'home').severity).toBe('pass')
  })

  it('fails exact content_chars when the declared count differs', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 99,
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheckForNode(result.checks, CHECK.L2A_CONTENT_CHARS_EXACT_MATCH, 'home').severity).toBe('fail')
  })

  it('passes max content_chars when the endpoint is below the declared cap', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 10,
        contentCharsMode: 'max',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(findCheckForNode(result.checks, CHECK.L2A_CONTENT_CHARS_MAX_VALID, 'home').severity).toBe('pass')
  })

  it('fails max content_chars when the endpoint exceeds the declared cap', async () => {
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 2,
        contentCharsMode: 'max',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheckForNode(result.checks, CHECK.L2A_CONTENT_CHARS_MAX_VALID, 'home').severity).toBe('fail')
  })

  it('counts emoji as one content character for exact mode', async () => {
    const graph = graphWithNodes([
      {
        id: 'emoji',
        llmUrl: '/clean/emoji.md',
        contentChars: 1,
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/emoji.md': textRoute('🚀'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(findCheckForNode(result.checks, CHECK.L2A_CONTENT_CHARS_EXACT_MATCH, 'emoji').severity).toBe('pass')
  })

  it('normalizes decomposed accents before exact content_chars comparison', async () => {
    const graph = graphWithNodes([
      {
        id: 'accent',
        llmUrl: '/clean/accent.md',
        contentChars: 1,
        contentCharsMode: 'exact',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/ai-graph.json': graphRoute(graph),
      '/clean/accent.md': textRoute('e\u0301'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(findCheckForNode(result.checks, CHECK.L2A_CONTENT_CHARS_EXACT_MATCH, 'accent').severity).toBe('pass')
  })
})

function deleteFirstNodeContentField(graph: Record<string, unknown>, field: string): void {
  const nodes = graph.nodes

  if (!Array.isArray(nodes)) {
    throw new Error('Expected graph test fixture to include nodes')
  }

  const node = nodes[0]

  if (typeof node !== 'object' || node === null) {
    throw new Error('Expected graph test fixture node to be an object')
  }

  const content = (node as { content?: Record<string, unknown> }).content

  if (!content) {
    throw new Error('Expected graph test fixture node to include content')
  }

  delete content[field]
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
