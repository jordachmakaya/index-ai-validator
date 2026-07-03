/**
 * @filemeta
 * type: schema
 * title: index-ai and scan-result schema validators
 * description: Compiles and runs AJV validation for the manifest, graph, and vendored ScanResult JSON schemas, returning typed valid/invalid results.
 * job_ref: T1.0_pin-scanner-schema
 * functions: [validateManifestSchema, validateGraphSchema, validateScanResult, formatAjvErrors]
 * classes: []
 * inputs: [unknown manifest payload, unknown graph payload, unknown scan result payload]
 * outputs: [ManifestSchemaValidationResult, GraphSchemaValidationResult, ScanResultSchemaValidationResult]
 * relations:
 *   - reads: schemas/scan-result.schema.json
 *   - tested_by: schemas.test.ts
 * last_update: 2026-07-02
 */
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'

import scanResultJsonSchema from './schemas/scan-result.schema.json'
import type { AiGraph, IndexAiManifest } from './types'

export type SchemaValidationError = {
  path: string
  keyword: string
  message: string
}

export type ManifestSchemaValidationResult =
  | {
    valid: true
    manifest: IndexAiManifest
  }
  | {
    valid: false
    errors: SchemaValidationError[]
  }

export type GraphSchemaValidationResult =
  | {
    valid: true
    graph: AiGraph
  }
  | {
    valid: false
    errors: SchemaValidationError[]
  }

export type ScanDimensionKey = 'access' | 'extractability' | 'citability' | 'safety' | 'agent_layer'

export type ScanResult = {
  url: string
  score: number
  verdict: string
  dimensions: Array<{
    key: ScanDimensionKey
    score: number
    max: number
  }>
  findings: Array<{
    id: string
    severity: 'P0' | 'P1' | 'P2'
    title: string
    detail?: string
    effort?: 'small' | 'medium' | 'large'
  }>
  noiseRatio: number | null
  csrGapPercent?: number | null
  renderedComparison?: {
    status: 'match' | 'gap' | 'severe-gap' | 'unknown'
  }
  engineVersion: string
  schemaVersion: string
}

export type ScanResultSchemaValidationResult =
  | {
    valid: true
    result: ScanResult
  }
  | {
    valid: false
    errors: SchemaValidationError[]
  }

const URL_REFERENCE_PATTERN = '^(https?://|/)'

const urlReferenceSchema = {
  type: 'string',
  minLength: 1,
  pattern: URL_REFERENCE_PATTERN,
} as const

export const manifestSchema = {
  $id: 'https://index-ai.dev/schemas/index-ai-manifest.v1.json',
  type: 'object',
  required: ['spec_version', 'manifest_version', 'identity', 'freshness'],
  additionalProperties: true,
  properties: {
    $schema: { type: 'string', minLength: 1 },
    spec_version: { const: '1.0' },
    manifest_version: { const: 1 },
    level: { enum: ['level-1', 'level-2a'] },
    identity: {
      type: 'object',
      required: ['name', 'description'],
      additionalProperties: true,
      properties: {
        name: { type: 'string', minLength: 1 },
        description: { type: 'string', minLength: 1 },
        domain: { type: 'string', minLength: 1 },
        category: {
          type: 'array',
          items: {
            type: 'string',
            pattern: '^[a-z0-9-]+$',
          },
        },
        language: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        geo: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    publisher: {
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string', minLength: 1 },
        role: { type: 'string', minLength: 1 },
        contact: { type: 'string', minLength: 1 },
        verification_hint: { type: 'string', minLength: 1 },
      },
    },
    freshness: {
      type: 'object',
      additionalProperties: true,
      properties: {
        content_updated_at: { type: 'string', minLength: 1 },
        manifest_generated_at: { type: 'string', minLength: 1 },
        refresh_frequency: {
          enum: ['continuous', 'daily', 'weekly', 'monthly', 'static'],
        },
        valid_until: { type: 'string', minLength: 1 },
        cache_max_age_seconds: {
          type: 'number',
          minimum: 0,
        },
      },
    },
    policy: {
      type: 'object',
      additionalProperties: true,
    },
    entrypoints: {
      type: 'array',
      items: {
        type: 'object',
        required: ['topic', 'description', 'url'],
        additionalProperties: true,
        properties: {
          topic: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          url: urlReferenceSchema,
          params: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    access: {
      type: 'object',
      additionalProperties: true,
      properties: {
        agent_index: urlReferenceSchema,
        llms_txt: urlReferenceSchema,
        mcp_server: urlReferenceSchema,
        mcp_auth: { type: 'string', minLength: 1 },
        mcp_tools: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    },
    llm_instructions: {
      type: 'string',
      maxLength: 500,
    },
  },
} as const

export const graphSchema = {
  $id: 'https://index-ai.dev/schemas/index-ai-graph.v1.json',
  type: 'object',
  required: ['generated', 'spec_version', 'nodes'],
  additionalProperties: true,
  properties: {
    $schema: { type: 'string', minLength: 1 },
    generated: { type: 'string', minLength: 1 },
    spec_version: { const: '1.0' },
    total_nodes: {
      type: 'number',
      minimum: 0,
    },
    pages: false,
    nodes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'type', 'label', 'description', 'content', 'meta'],
        additionalProperties: true,
        properties: {
          id: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          content: {
            type: 'object',
            required: [
              'llm_summary',
              'llm_url',
              'content_chars',
              'content_chars_mode',
              'summary_method',
              'language',
            ],
            additionalProperties: true,
            properties: {
              llm_summary: { type: 'string', minLength: 1 },
              llm_url: { type: 'string', minLength: 1 },
              content_chars: {
                type: 'integer',
                minimum: 1,
              },
              content_chars_mode: { enum: ['exact', 'max'] },
              summary_method: { enum: ['manual', 'truncate', 'llm'] },
              language: { type: 'string', minLength: 1 },
            },
          },
          meta: {
            type: 'object',
            required: ['updated', 'refresh_frequency'],
            additionalProperties: true,
            properties: {
              updated: { type: 'string', minLength: 1 },
              refresh_frequency: { type: 'string', minLength: 1 },
              count: {
                type: 'number',
                minimum: 0,
              },
            },
          },
        },
      },
    },
  },
} as const

let cachedManifestValidator: ValidateFunction<IndexAiManifest> | null = null
let cachedGraphValidator: ValidateFunction<AiGraph> | null = null
let cachedScanResultValidator: ValidateFunction<ScanResult> | null = null

export function validateManifestSchema(input: unknown): ManifestSchemaValidationResult {
  const validate = getManifestValidator()

  if (validate(input)) {
    return {
      valid: true,
      manifest: input,
    }
  }

  return {
    valid: false,
    errors: formatAjvErrors(validate.errors),
  }
}

export function validateGraphSchema(input: unknown): GraphSchemaValidationResult {
  const validate = getGraphValidator()

  if (validate(input)) {
    return {
      valid: true,
      graph: input,
    }
  }

  return {
    valid: false,
    errors: formatAjvErrors(validate.errors),
  }
}

export function validateScanResult(payload: unknown): ScanResultSchemaValidationResult {
  const validate = getScanResultValidator()

  if (validate(payload)) {
    return {
      valid: true,
      result: payload,
    }
  }

  return {
    valid: false,
    // Unlike the manifest/graph readers, the scanner CLI needs the exact
    // missing field on required-field errors (e.g. `/score`), not just the
    // parent object path, so callers can point users at the field directly.
    errors: formatAjvErrors(validate.errors, { appendMissingPropertyToRequiredPath: true }),
  }
}

export function formatAjvErrors(
  errors: readonly ErrorObject[] | null | undefined,
  options?: { appendMissingPropertyToRequiredPath?: boolean },
): SchemaValidationError[] {
  return (errors ?? []).map((error) => {
    const message = error.message ?? `Schema validation failed for ${error.keyword}.`
    const missingProperty =
      options?.appendMissingPropertyToRequiredPath && error.keyword === 'required'
        ? readMissingProperty(error)
        : null

    return {
      path: missingProperty ? `${error.instancePath}/${missingProperty}` : error.instancePath || '/',
      keyword: error.keyword,
      message,
    }
  })
}

function readMissingProperty(error: ErrorObject): string | null {
  const params = error.params as { missingProperty?: unknown } | undefined
  const missingProperty = params?.missingProperty

  return typeof missingProperty === 'string' ? missingProperty : null
}

function getManifestValidator(): ValidateFunction<IndexAiManifest> {
  cachedManifestValidator ??= createManifestValidator()

  return cachedManifestValidator
}

function getGraphValidator(): ValidateFunction<AiGraph> {
  cachedGraphValidator ??= createGraphValidator()

  return cachedGraphValidator
}

function getScanResultValidator(): ValidateFunction<ScanResult> {
  cachedScanResultValidator ??= createScanResultValidator()

  return cachedScanResultValidator
}

function createManifestValidator(): ValidateFunction<IndexAiManifest> {
  return createValidator().compile<IndexAiManifest>(manifestSchema)
}

function createGraphValidator(): ValidateFunction<AiGraph> {
  return createValidator().compile<AiGraph>(graphSchema)
}

function createScanResultValidator(): ValidateFunction<ScanResult> {
  return createValidator().compile<ScanResult>(scanResultJsonSchema)
}

function createValidator(): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
  })

  addFormats(ajv)

  return ajv
}
