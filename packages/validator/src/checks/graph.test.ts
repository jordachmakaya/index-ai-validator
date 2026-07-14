import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { CHECK } from '../constants'
import { countContentChars } from '../utils/content-chars'
import type { ValidationCheck, ValidatorOptions } from '../types'
import { validateIndexAi } from '../validator'

// T5.27: check codes for content_sha256 / content_version are not yet
// registered in ../constants (that's the Coder's job for this sprint) — the
// literal codes here are the RED-state contract the Coder implements against.
const CONTENT_SHA256_CHECK = 'L2A_CONTENT_SHA256_MATCH'
const CONTENT_VERSION_CHECK = 'L2A_CONTENT_VERSION_TYPE'
const CONTENT_DRIFT_MESSAGE = 'content drift — declared content_sha256 does not match content served at llm_url'

// T5.29: Level 2b DAG relation check codes are not yet registered in
// ../constants (Coder job for this sprint) — literal codes here are the
// RED-state contract the Coder implements against. These are graph-level
// checks (one per graph, not per node), so tests use findCheck, not
// findCheckForNode.
const ROOT_EXISTS_CHECK = 'L2B_GRAPH_ROOT_EXISTS'
const RELATION_PAIR_EXISTS_CHECK = 'L2B_GRAPH_RELATION_PAIR_EXISTS'
const BIDIRECTIONAL_CHECK = 'L2B_GRAPH_BIDIRECTIONAL'
const ACYCLIC_CHECK = 'L2B_GRAPH_ACYCLIC'
const NO_ORPHANS_CHECK = 'L2B_GRAPH_NO_ORPHANS'

function computeContentSha256(text: string): string {
  return createHash('sha256').update(text.normalize('NFC'), 'utf-8').digest('hex')
}

type RouteResponse = {
  readonly status?: number
  readonly contentType?: string
  readonly body: string
}

type TestServer = {
  readonly origin: string
  readonly close: () => Promise<void>
}

// T5.29: relations shape is not yet declared on AiGraphNode (types.ts) —
// this is the RED-state contract the Coder implements against. Field lives
// at the node level (sibling of `content`/`meta`), not nested under
// `content`, per IMPLEMENTATION_PLAN.md L797-799.
type GraphNodeRelations = {
  readonly parent?: string | null
  readonly children?: readonly string[]
  readonly related?: readonly string[]
}

type GraphNodeInput = {
  readonly id: string
  readonly llmUrl: string
  readonly contentChars: number
  readonly contentCharsMode: 'exact' | 'max'
  readonly contentSha256?: string
  readonly contentVersion?: unknown
  readonly relations?: GraphNodeRelations
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
        ...(node.contentSha256 === undefined ? {} : { content_sha256: node.contentSha256 }),
        ...(node.contentVersion === undefined ? {} : { content_version: node.contentVersion }),
      },
      meta: {
        updated: '2026-06-12T00:00:00.000Z',
        refresh_frequency: 'daily',
      },
      ...(node.relations === undefined ? {} : { relations: node.relations }),
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
      '/agent-index.json': graphRoute(graph),
      '/clean/markdown.md': textRoute(markdown, 'text/markdown; charset=utf-8'),
      '/clean/plain.txt': textRoute(plain, 'text/plain; charset=utf-8'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.passed).toBe(true)
    expect(result.conformance).toBe('level-2a')
    expect(result.metrics.agent_index_found).toBe(true)
    expect(result.metrics.agent_index_schema_valid).toBe(true)
    expect(result.metrics.total_nodes).toBe(2)
    expect(result.metrics.nodes_with_llm_url).toBe(2)
    expect(result.metrics.valid_clean_endpoints).toBe(2)
    expect(result.metrics.valid_content_chars).toBe(2)
    expect(findCheck(result.checks, CHECK.L2A_AGENT_INDEX_FOUND).severity).toBe('pass')
    expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_CONTENT_TYPE, 'markdown').severity).toBe('pass')
    expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_CONTENT_TYPE, 'plain').severity).toBe('pass')
  })

  it('reports a missing declared graph without losing Level 1 conformance', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_AGENT_INDEX_FOUND).severity).toBe('fail')
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
      '/agent-index.json': graphRoute(graph, 'text/plain; charset=utf-8'),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_AGENT_INDEX_CONTENT_TYPE).severity).toBe('fail')
  })

  it('reports malformed graph JSON before schema validation', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': {
        body: '{"nodes":',
      },
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_AGENT_INDEX_JSON_VALID).severity).toBe('fail')
    expect(result.checks.some((check) => check.code === CHECK.L2A_AGENT_INDEX_SCHEMA_VALID)).toBe(false)
  })

  it('reports invalid graph schema', async () => {
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute({
        generated: '2026-06-12T00:00:00.000Z',
        spec_version: '1.0',
      }),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheck(result.checks, CHECK.L2A_AGENT_INDEX_SCHEMA_VALID).severity).toBe('fail')
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
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L2A_AGENT_INDEX_SCHEMA_VALID)

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
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L2A_AGENT_INDEX_SCHEMA_VALID)

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
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L2A_AGENT_INDEX_SCHEMA_VALID)

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
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute('Hello'),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const schemaCheck = findCheck(result.checks, CHECK.L2A_AGENT_INDEX_SCHEMA_VALID)

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
      '/agent-index.json': graphRoute(graph),
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
      '/agent-index.json': graphRoute(graph),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-1')
    expect(findCheckForNode(result.checks, CHECK.L2A_LLM_URL_PROTOCOL, 'home').severity).toBe('fail')
  })

  it('blocks private llm_url hosts by default for non-local targets', async () => {
    const targetServer = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graphWithNodes([
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
      '/agent-index.json': graphRoute(graphWithNodes([
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
      '/agent-index.json': graphRoute(graph),
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
      '/agent-index.json': graphRoute(graph),
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
      '/agent-index.json': graphRoute(graph),
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
      '/agent-index.json': graphRoute(graph),
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
      '/agent-index.json': graphRoute(graph),
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
      '/agent-index.json': graphRoute(graph),
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
      '/agent-index.json': graphRoute(graph),
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
      '/agent-index.json': graphRoute(graph),
      '/clean/accent.md': textRoute('e\u0301'),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(findCheckForNode(result.checks, CHECK.L2A_CONTENT_CHARS_EXACT_MATCH, 'accent').severity).toBe('pass')
  })
})

describe('content_sha256 and content_version validation (T5.27)', () => {
  it('accepts content_sha256 (64 hex chars) and content_version (string) in the graph schema', async () => {
    const body = 'Schema acceptance content body.'
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: countContentChars(body),
        contentCharsMode: 'exact',
        contentSha256: computeContentSha256(body),
        contentVersion: 'git:abc123',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(findCheck(result.checks, CHECK.L2A_AGENT_INDEX_SCHEMA_VALID).severity).toBe('pass')
    expect(result.conformance).toBe('level-2a')
  })

  it('passes the content_sha256 check when the declared hash matches the fetched content (exact mode)', async () => {
    const body = 'Hash-matched clean endpoint content.'
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: countContentChars(body),
        contentCharsMode: 'exact',
        contentSha256: computeContentSha256(body),
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(findCheckForNode(result.checks, CONTENT_SHA256_CHECK, 'home').severity).toBe('pass')
  })

  it('fails the content_sha256 check with the contractual drift message when the hash does not match (exact mode)', async () => {
    const body = 'Content actually served at llm_url.'
    const declaredSha256 = computeContentSha256('Completely different declared content.')
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: countContentChars(body),
        contentCharsMode: 'exact',
        contentSha256: declaredSha256,
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const check = findCheckForNode(result.checks, CONTENT_SHA256_CHECK, 'home')

    expect(check.severity).toBe('fail')
    expect(check.requirement).toBe('must')
    expect(check.message).toBe(CONTENT_DRIFT_MESSAGE)
  })

  it('ignores content_sha256 in max mode, even when the declared hash is wrong', async () => {
    const body = 'Max mode content — hash must not be checked here.'
    const wrongSha256 = computeContentSha256('An unrelated declared string.')
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: 1_000,
        contentCharsMode: 'max',
        contentSha256: wrongSha256,
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.passed).toBe(true)
    expect(
      result.checks.some((check) =>
        check.details?.node_id === 'home'
        && check.code === CONTENT_SHA256_CHECK
        && check.severity === 'fail'),
    ).toBe(false)
  })

  it('passes when content_sha256 is absent, even in exact mode', async () => {
    const body = 'No hash declared for this clean endpoint.'
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
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.passed).toBe(true)
    expect(
      result.checks.some((check) =>
        check.details?.node_id === 'home'
        && check.code === CONTENT_SHA256_CHECK
        && check.severity === 'fail'),
    ).toBe(false)
  })

  it('passes when content_version is a string', async () => {
    const body = 'Versioned clean endpoint content.'
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: countContentChars(body),
        contentCharsMode: 'exact',
        contentVersion: 'git:abc123',
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.passed).toBe(true)
    expect(
      result.checks.some((check) =>
        check.details?.node_id === 'home'
        && check.code === CONTENT_VERSION_CHECK
        && check.severity === 'warn'),
    ).toBe(false)
  })

  it('warns when content_version is not a string', async () => {
    const body = 'Bad version type clean endpoint content.'
    const graph = graphWithNodes([
      {
        id: 'home',
        llmUrl: '/clean/home.md',
        contentChars: countContentChars(body),
        contentCharsMode: 'exact',
        contentVersion: 42,
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const check = findCheckForNode(result.checks, CONTENT_VERSION_CHECK, 'home')

    expect(check.severity).toBe('warn')
    expect(check.requirement).toBe('should')
  })
})

describe('Level 2b DAG relations validation (T5.29)', () => {
  it('passes all Level 2b relation checks for a valid DAG (root, bidirectional parent/children, no cycle, no orphans)', async () => {
    const rootBody = 'Root node content.'
    const child1Body = 'Child 1 node content.'
    const child2Body = 'Child 2 node content.'
    const graph = graphWithNodes([
      {
        id: 'root',
        llmUrl: '/clean/root.md',
        contentChars: countContentChars(rootBody),
        contentCharsMode: 'exact',
        relations: { parent: null, children: ['child1', 'child2'] },
      },
      {
        id: 'child1',
        llmUrl: '/clean/child1.md',
        contentChars: countContentChars(child1Body),
        contentCharsMode: 'exact',
        relations: { parent: 'root', children: [] },
      },
      {
        id: 'child2',
        llmUrl: '/clean/child2.md',
        contentChars: countContentChars(child2Body),
        contentCharsMode: 'exact',
        relations: { parent: 'root', children: [], related: ['child1'] },
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/root.md': textRoute(rootBody),
      '/clean/child1.md': textRoute(child1Body),
      '/clean/child2.md': textRoute(child2Body),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(findCheck(result.checks, ROOT_EXISTS_CHECK).severity).toBe('pass')
    expect(findCheck(result.checks, RELATION_PAIR_EXISTS_CHECK).severity).toBe('pass')
    expect(findCheck(result.checks, BIDIRECTIONAL_CHECK).severity).toBe('pass')
    expect(findCheck(result.checks, ACYCLIC_CHECK).severity).toBe('pass')
    expect(findCheck(result.checks, NO_ORPHANS_CHECK).severity).toBe('pass')
  })

  it('fails the acyclic check with the involved ids in details when relations form a direct cycle', async () => {
    const aBody = 'Node A content.'
    const bBody = 'Node B content.'
    const graph = graphWithNodes([
      {
        id: 'a',
        llmUrl: '/clean/a.md',
        contentChars: countContentChars(aBody),
        contentCharsMode: 'exact',
        relations: { parent: 'b', children: ['b'] },
      },
      {
        id: 'b',
        llmUrl: '/clean/b.md',
        contentChars: countContentChars(bBody),
        contentCharsMode: 'exact',
        relations: { parent: 'a', children: ['a'] },
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/a.md': textRoute(aBody),
      '/clean/b.md': textRoute(bBody),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const check = findCheck(result.checks, ACYCLIC_CHECK)

    expect(check.severity).toBe('fail')
    expect(check.requirement).toBe('must')
    expect(check.message.toLowerCase()).toContain('cycle')
    expect(check.details).toEqual(
      expect.objectContaining({
        cycle_ids: expect.arrayContaining(['a', 'b']),
      }),
    )
  })

  it('fails the no-orphans check with the missing id in details when children references a nonexistent node', async () => {
    const rootBody = 'Root with a ghost child reference.'
    const graph = graphWithNodes([
      {
        id: 'root',
        llmUrl: '/clean/root.md',
        contentChars: countContentChars(rootBody),
        contentCharsMode: 'exact',
        relations: { parent: null, children: ['ghost'] },
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/root.md': textRoute(rootBody),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const check = findCheck(result.checks, NO_ORPHANS_CHECK)

    expect(check.severity).toBe('fail')
    expect(check.requirement).toBe('must')
    expect(check.details).toEqual(
      expect.objectContaining({
        orphan_ids: expect.arrayContaining(['ghost']),
      }),
    )
  })

  it('fails the root-existence check when no node declares relations.parent: null', async () => {
    const aBody = 'Node A content, no explicit root declared.'
    const bBody = 'Node B content, declares no relations at all.'
    const graph = graphWithNodes([
      {
        id: 'a',
        llmUrl: '/clean/a.md',
        contentChars: countContentChars(aBody),
        contentCharsMode: 'exact',
        relations: { parent: 'b', children: [] },
      },
      {
        id: 'b',
        llmUrl: '/clean/b.md',
        contentChars: countContentChars(bBody),
        contentCharsMode: 'exact',
        // no `relations` field at all on this node — still, no node in the
        // graph explicitly declares parent: null, so root existence fails.
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/a.md': textRoute(aBody),
      '/clean/b.md': textRoute(bBody),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const check = findCheck(result.checks, ROOT_EXISTS_CHECK)

    expect(check.severity).toBe('fail')
    expect(check.requirement).toBe('must')
  })

  it('fails the bidirectional-consistency check when a declared child does not point its parent back', async () => {
    const aBody = 'Parent node content.'
    const bBody = 'Child node content with an inconsistent parent.'
    const graph = graphWithNodes([
      {
        id: 'a',
        llmUrl: '/clean/a.md',
        contentChars: countContentChars(aBody),
        contentCharsMode: 'exact',
        relations: { parent: null, children: ['b'] },
      },
      {
        id: 'b',
        llmUrl: '/clean/b.md',
        contentChars: countContentChars(bBody),
        contentCharsMode: 'exact',
        relations: { children: [] }, // parent omitted — does not point back to 'a'
      },
    ])
    const server = await startServer({
      '/.well-known/index-ai.json': manifestRoute(),
      '/agent-index.json': graphRoute(graph),
      '/clean/a.md': textRoute(aBody),
      '/clean/b.md': textRoute(bBody),
    })

    const result = await validateIndexAi(createOptions(server.origin))
    const check = findCheck(result.checks, BIDIRECTIONAL_CHECK)

    expect(check.severity).toBe('fail')
    expect(check.requirement).toBe('must')
  })

  it('does not emit any Level 2b relation check for a pure Level 2a graph with no relations fields, and stays level-2a conformant', async () => {
    const body = 'Pure Level 2a clean endpoint, no relations declared anywhere.'
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
      '/agent-index.json': graphRoute(graph),
      '/clean/home.md': textRoute(body),
    })

    const result = await validateIndexAi(createOptions(server.origin))

    expect(result.conformance).toBe('level-2a')
    expect(result.checks.some((check) => check.code.startsWith('L2B_'))).toBe(false)
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
