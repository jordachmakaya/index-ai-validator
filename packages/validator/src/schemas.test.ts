import { describe, expect, it } from 'vitest'

import { validateGraphSchema, validateManifestSchema, validateScanResult } from './schemas'

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

// Real "done" fixture from CONTRACT_SCANNER.md §9 (result section).
function validScanResult(): Record<string, unknown> {
  return {
    url: 'https://example.com/',
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

describe('validateScanResult', () => {
  it('accepts the real done fixture from CONTRACT_SCANNER.md §9', () => {
    const result = validateScanResult(validScanResult())

    expect(result.valid).toBe(true)
    if (!result.valid) {
      throw new Error('Expected valid scan result')
    }

    expect(result.result.url).toBe('https://example.com/')
    expect(result.result.schemaVersion).toBe('1.0')
  })

  it('returns an explicit error instead of throwing when a required field is missing', () => {
    const payload = validScanResult()
    delete payload.score

    expect(() => validateScanResult(payload)).not.toThrow()

    const result = validateScanResult(payload)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid scan result')
    }

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/score',
          keyword: 'required',
        }),
      ]),
    )
  })

  it('rejects a dimensions array that does not contain exactly the 5 expected keys', () => {
    const payload = validScanResult()
    payload.dimensions = [
      { key: 'access', score: 0, max: 20 },
      { key: 'extractability', score: 15, max: 30 },
      { key: 'citability', score: 0, max: 20 },
      { key: 'safety', score: 20, max: 20 },
      // agent_layer intentionally omitted — only 4 of the 5 required keys present.
    ]

    const result = validateScanResult(payload)

    expect(result.valid).toBe(false)
    if (result.valid) {
      throw new Error('Expected invalid scan result')
    }

    expect(result.errors.some((error) => error.path.startsWith('/dimensions'))).toBe(true)
  })

  it('tolerates an unknown additive field without raising an error', () => {
    const payload = {
      ...validScanResult(),
      newField: true,
    }

    const result = validateScanResult(payload)

    expect(result.valid).toBe(true)
  })

  it('rejects a major schemaVersion mismatch with an error distinct from a missing-field error', () => {
    const versionMismatchPayload = {
      ...validScanResult(),
      schemaVersion: '2.0',
    }
    const missingFieldPayload = validScanResult()
    delete missingFieldPayload.score

    const versionResult = validateScanResult(versionMismatchPayload)
    const missingFieldResult = validateScanResult(missingFieldPayload)

    expect(versionResult.valid).toBe(false)
    expect(missingFieldResult.valid).toBe(false)
    if (versionResult.valid || missingFieldResult.valid) {
      throw new Error('Expected both scan results to be invalid')
    }

    const versionError = versionResult.errors.find((error) => error.path === '/schemaVersion')

    expect(versionError).toBeDefined()
    expect(versionError?.keyword).not.toBe('required')
    expect(missingFieldResult.errors.some((error) => error.path === '/schemaVersion')).toBe(false)
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
