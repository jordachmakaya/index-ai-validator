import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'

import type { IndexAiManifest } from './types'

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
        shadow_layer: urlReferenceSchema,
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

let cachedManifestValidator: ValidateFunction<IndexAiManifest> | null = null

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

export function formatAjvErrors(
  errors: readonly ErrorObject[] | null | undefined,
): SchemaValidationError[] {
  return (errors ?? []).map((error) => {
    const message = error.message ?? `Schema validation failed for ${error.keyword}.`

    return {
      path: error.instancePath || '/',
      keyword: error.keyword,
      message,
    }
  })
}

function getManifestValidator(): ValidateFunction<IndexAiManifest> {
  cachedManifestValidator ??= createManifestValidator()

  return cachedManifestValidator
}

function createManifestValidator(): ValidateFunction<IndexAiManifest> {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
  })

  addFormats(ajv)

  return ajv.compile<IndexAiManifest>(manifestSchema)
}
