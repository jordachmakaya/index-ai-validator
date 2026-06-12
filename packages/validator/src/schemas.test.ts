import { describe, expect, it } from 'vitest'

import { validateManifestSchema } from './schemas'

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
      shadow_layer: '/ai-graph.json',
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
        shadow_layer: 'ai-graph.json',
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

    expect(result.errors.some((error) => error.path === '/access/shadow_layer')).toBe(true)
    expect(result.errors.some((error) => error.path === '/access/llms_txt')).toBe(true)
    expect(result.errors.some((error) => error.path === '/entrypoints/0/url')).toBe(true)
  })
})
