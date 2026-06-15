import { describe, expect, it } from 'vitest'

import { validateGraphSchema, validateManifestSchema } from './schemas'

function validManifest(): Record<string, unknown> {
  return {
    spec_version: '1.0',
    manifest_version: 1,
    identity: {
      name: 'Example Site',
      description: 'A deterministic local test manifest.',
      domain: 'example.test',
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
    entrypoints: [
      {
        topic: 'overview',
        description: 'A local entrypoint used by tests.',
        url: '/guide',
      },
    ],
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
        description: 'The home page.',
        content: {
          llm_summary: 'Short summary for a clean endpoint.',
          llm_url: '/clean/home.md',
          content_chars: 35,
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

describe('validateManifestSchema', () => {
  it('accepts a valid Level 1 manifest shape', () => {
    const result = validateManifestSchema(validManifest())

    expect(result.valid).toBe(true)
    if (!result.valid) {
      throw new Error('Expected valid manifest schema result')
    }

    expect(result.manifest.spec_version).toBe('1.0')
    expect(result.manifest.identity?.name).toBe('Example Site')
  })

  it('rejects missing required fields', () => {
    const manifest = validManifest()
    delete manifest.identity

    const result = validateManifestSchema(manifest)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid manifest schema result')
    }

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: 'required',
        }),
      ]),
    )
  })

  it('rejects unsupported manifest levels when a level is provided', () => {
    const manifest = {
      ...validManifest(),
      level: 'level-3',
    }

    const result = validateManifestSchema(manifest)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid manifest schema result')
    }

    expect(result.errors.some((error) => error.path === '/level')).toBe(true)
  })

  it('rejects unsupported manifest versions', () => {
    const manifest = {
      ...validManifest(),
      spec_version: '2.0',
      manifest_version: 2,
    }

    const result = validateManifestSchema(manifest)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid manifest schema result')
    }

    expect(result.errors.some((error) => error.path === '/spec_version')).toBe(true)
    expect(result.errors.some((error) => error.path === '/manifest_version')).toBe(true)
  })

  it('rejects URL fields that are not absolute HTTP URLs or root-relative paths', () => {
    const manifest = {
      ...validManifest(),
      access: {
        agent_index: 'agent-index.json',
        llms_txt: 'mailto:robots@example.test',
      },
      entrypoints: [
        {
          topic: 'overview',
          description: 'Invalid URL reference.',
          url: 'guide',
        },
      ],
    }

    const result = validateManifestSchema(manifest)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid manifest schema result')
    }

    expect(result.errors.some((error) => error.path === '/access/agent_index')).toBe(true)
    expect(result.errors.some((error) => error.path === '/access/llms_txt')).toBe(true)
    expect(result.errors.some((error) => error.path === '/entrypoints/0/url')).toBe(true)
  })
})

describe('validateGraphSchema', () => {
  it('accepts a valid Level 2a graph shape', () => {
    const result = validateGraphSchema(validGraph())

    expect(result.valid).toBe(true)
    if (!result.valid) {
      throw new Error('Expected valid graph schema result')
    }

    expect(result.graph.spec_version).toBe('1.0')
    expect(result.graph.nodes?.[0]?.content?.llm_url).toBe('/clean/home.md')
  })

  it('rejects a graph with no nodes array', () => {
    const graph = validGraph()
    delete graph.nodes

    const result = validateGraphSchema(graph)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid graph schema result')
    }

    expect(result.errors.some((error) => error.path === '/')).toBe(true)
  })

  it('rejects the deprecated pages array', () => {
    const result = validateGraphSchema({
      ...validGraph(),
      pages: [],
    })

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid graph schema result')
    }

    expect(result.errors.some((error) => error.path === '/pages')).toBe(true)
  })

  it('rejects nodes missing clean endpoint content fields', () => {
    const graph = validGraph()
    graph.nodes = [
      {
        id: 'home',
        type: 'page',
        label: 'Home',
        description: 'The home page.',
        content: {
          llm_summary: 'Short summary.',
        },
        meta: {
          updated: '2026-06-12T00:00:00.000Z',
          refresh_frequency: 'daily',
        },
      },
    ]

    const result = validateGraphSchema(graph)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid graph schema result')
    }

    expect(result.errors.some((error) => error.path === '/nodes/0/content')).toBe(true)
  })

  it('rejects nodes missing summary_method', () => {
    const graph = validGraph()
    deleteFirstNodeContentField(graph, 'summary_method')

    const result = validateGraphSchema(graph)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid graph schema result')
    }

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/nodes/0/content',
          keyword: 'required',
        }),
      ]),
    )
  })

  it('rejects nodes missing language', () => {
    const graph = validGraph()
    deleteFirstNodeContentField(graph, 'language')

    const result = validateGraphSchema(graph)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid graph schema result')
    }

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/nodes/0/content',
          keyword: 'required',
        }),
      ]),
    )
  })

  it('rejects content_chars zero because zero is only a placeholder', () => {
    const graph = validGraph()
    graph.nodes = [
      {
        id: 'home',
        type: 'page',
        label: 'Home',
        description: 'The home page.',
        content: {
          llm_summary: 'Short summary.',
          llm_url: '/clean/home.md',
          content_chars: 0,
          content_chars_mode: 'exact',
        },
        meta: {
          updated: '2026-06-12T00:00:00.000Z',
          refresh_frequency: 'daily',
        },
      },
    ]

    const result = validateGraphSchema(graph)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid graph schema result')
    }

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/nodes/0/content/content_chars',
          keyword: 'minimum',
        }),
      ]),
    )
  })

  it('rejects decimal content_chars because counts must be integers', () => {
    const graph = validGraph()
    graph.nodes = [
      {
        id: 'home',
        type: 'page',
        label: 'Home',
        description: 'The home page.',
        content: {
          llm_summary: 'Short summary.',
          llm_url: '/clean/home.md',
          content_chars: 1.5,
          content_chars_mode: 'exact',
        },
        meta: {
          updated: '2026-06-12T00:00:00.000Z',
          refresh_frequency: 'daily',
        },
      },
    ]

    const result = validateGraphSchema(graph)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid graph schema result')
    }

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/nodes/0/content/content_chars',
          keyword: 'type',
        }),
      ]),
    )
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
