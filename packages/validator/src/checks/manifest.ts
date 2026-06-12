import {
  CHECK,
  MANIFEST_CANONICAL_PATH,
  MANIFEST_FALLBACK_PATH,
} from '../constants'
import { fetchTextWithPolicy, type HttpResult } from '../http'
import { validateManifestSchema, type SchemaValidationError } from '../schemas'
import type {
  IndexAiManifest,
  RequirementKind,
  Severity,
  ValidationCheck,
  ValidatorOptions,
} from '../types'
import { normalizeTarget } from '../utils/url'

export type ManifestValidationResult = {
  manifest?: IndexAiManifest
  manifestUrl?: string
  checks: ValidationCheck[]
}

type ManifestCandidate = {
  response: HttpResult
  url: string
  fallbackUsed: boolean
}

type JsonParseResult =
  | {
    ok: true
    value: unknown
  }
  | {
    ok: false
    message: string
  }

export async function validateManifest(
  options: ValidatorOptions,
): Promise<ManifestValidationResult> {
  const target = normalizeTarget(options.target)
  const targetHost = new URL(target).hostname
  const canonicalUrl = new URL(MANIFEST_CANONICAL_PATH, target).toString()
  const fallbackUrl = new URL(MANIFEST_FALLBACK_PATH, target).toString()
  const canonicalResponse = await fetchManifestUrl(canonicalUrl, options, targetHost)
  const candidate = canonicalResponse.ok
    ? { response: canonicalResponse, url: canonicalUrl, fallbackUsed: false }
    : await getFallbackCandidate(fallbackUrl, options, targetHost)

  if (!candidate) {
    return {
      checks: [
        createCheck({
          code: CHECK.L1_MANIFEST_FOUND,
          severity: 'fail',
          requirement: 'must',
          message: 'No index-ai manifest was found at the canonical or fallback manifest path.',
          url: canonicalUrl,
          details: createMissingManifestDetails(canonicalResponse),
          fix: 'Publish a valid index-ai manifest at /.well-known/index-ai.json.',
        }),
      ],
    }
  }

  return validateManifestCandidate(candidate)
}

export function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''

  return mediaType === 'application/json' || mediaType.endsWith('+json')
}

async function getFallbackCandidate(
  fallbackUrl: string,
  options: ValidatorOptions,
  targetHost: string,
): Promise<ManifestCandidate | null> {
  const fallbackResponse = await fetchManifestUrl(fallbackUrl, options, targetHost)

  if (!fallbackResponse.ok) {
    return null
  }

  return {
    response: fallbackResponse,
    url: fallbackUrl,
    fallbackUsed: true,
  }
}

async function fetchManifestUrl(
  url: string,
  options: ValidatorOptions,
  targetHost: string,
): Promise<HttpResult> {
  return fetchTextWithPolicy({
    url,
    timeoutMs: options.timeoutMs,
    allowPrivateHosts: options.allowPrivateHosts,
    targetHost,
    accept: 'application/json',
    maxBodyBytes: 50 * 1024,
  })
}

function validateManifestCandidate(candidate: ManifestCandidate): ManifestValidationResult {
  const checks: ValidationCheck[] = [
    createCheck({
      code: CHECK.L1_MANIFEST_FOUND,
      severity: 'pass',
      requirement: 'must',
      message: candidate.fallbackUsed
        ? 'An index-ai manifest was found at the fallback path.'
        : 'An index-ai manifest was found at the canonical path.',
      url: candidate.url,
    }),
  ]

  if (candidate.fallbackUsed) {
    checks.push(
      createCheck({
        code: CHECK.L1_FALLBACK_MATCH,
        severity: 'warn',
        requirement: 'should',
        message: 'The manifest was served from /index-ai.json because the canonical path was unavailable.',
        url: candidate.url,
        fix: 'Serve the manifest from /.well-known/index-ai.json for Level 1 conformance.',
      }),
    )
  }

  checks.push(createContentTypeCheck(candidate.response, candidate.url))

  const parsedJson = parseJson(candidate.response.text)

  if (!parsedJson.ok) {
    checks.push(
      createCheck({
        code: CHECK.L1_MANIFEST_JSON_VALID,
        severity: 'fail',
        requirement: 'must',
        message: 'The index-ai manifest response is not valid JSON.',
        url: candidate.url,
        details: { error: parsedJson.message },
        fix: 'Return a syntactically valid JSON document from the manifest URL.',
      }),
    )

    return { checks }
  }

  checks.push(
    createCheck({
      code: CHECK.L1_MANIFEST_JSON_VALID,
      severity: 'pass',
      requirement: 'must',
      message: 'The index-ai manifest response is valid JSON.',
      url: candidate.url,
    }),
  )

  const schemaResult = validateManifestSchema(parsedJson.value)

  if (!schemaResult.valid) {
    checks.push(createSchemaFailureCheck(candidate.url, schemaResult.errors))

    return { checks }
  }

  checks.push(
    createCheck({
      code: CHECK.L1_MANIFEST_SCHEMA_VALID,
      severity: 'pass',
      requirement: 'must',
      message: 'The index-ai manifest matches the Level 1 manifest schema.',
      url: candidate.url,
    }),
  )
  checks.push(createDomainMatchCheck(schemaResult.manifest, candidate.url))

  return {
    manifest: schemaResult.manifest,
    manifestUrl: candidate.url,
    checks,
  }
}

function createContentTypeCheck(response: HttpResult, url: string): ValidationCheck {
  if (isJsonContentType(response.contentType)) {
    return createCheck({
      code: CHECK.L1_MANIFEST_CONTENT_TYPE,
      severity: 'pass',
      requirement: 'must',
      message: 'The index-ai manifest is served with a JSON content type.',
      url,
      details: { content_type: response.contentType },
    })
  }

  return createCheck({
    code: CHECK.L1_MANIFEST_CONTENT_TYPE,
    severity: 'fail',
    requirement: 'must',
    message: 'The index-ai manifest is not served with a JSON content type.',
    url,
    details: { content_type: response.contentType },
    fix: 'Serve the manifest with Content-Type: application/json; charset=utf-8.',
  })
}

function createSchemaFailureCheck(
  url: string,
  errors: readonly SchemaValidationError[],
): ValidationCheck {
  return createCheck({
    code: CHECK.L1_MANIFEST_SCHEMA_VALID,
    severity: 'fail',
    requirement: 'must',
    message: 'The index-ai manifest does not match the Level 1 manifest schema.',
    url,
    details: { errors },
    fix: 'Add the required Level 1 manifest fields and ensure versions and URL fields are valid.',
  })
}

function createDomainMatchCheck(manifest: IndexAiManifest, url: string): ValidationCheck {
  const targetHostname = new URL(url).hostname.toLowerCase()
  const manifestDomain = manifest.identity?.domain?.trim().toLowerCase()

  if (!manifestDomain) {
    return createCheck({
      code: CHECK.L1_DOMAIN_MATCH,
      severity: 'warn',
      requirement: 'should',
      message: 'The index-ai manifest does not declare identity.domain.',
      url,
      fix: 'Set identity.domain to the public hostname that serves this manifest.',
    })
  }

  if (manifestDomain === targetHostname) {
    return createCheck({
      code: CHECK.L1_DOMAIN_MATCH,
      severity: 'pass',
      requirement: 'should',
      message: 'The manifest identity.domain matches the manifest host.',
      url,
      details: {
        domain: manifestDomain,
        host: targetHostname,
      },
    })
  }

  return createCheck({
    code: CHECK.L1_DOMAIN_MATCH,
    severity: 'warn',
    requirement: 'should',
    message: 'The manifest identity.domain does not match the manifest host.',
    url,
    details: {
      domain: manifestDomain,
      host: targetHostname,
    },
    fix: 'Use the same hostname in identity.domain as the site serving the manifest.',
  })
}

function parseJson(text: string): JsonParseResult {
  try {
    return {
      ok: true,
      value: JSON.parse(text),
    }
  }
  catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

function createMissingManifestDetails(response: HttpResult): Record<string, unknown> {
  const details: Record<string, unknown> = {
    canonical_status: response.status,
  }

  if (response.error) {
    details.error_code = response.error.code
    details.error_message = response.error.message
  }

  return details
}

function createCheck(input: {
  code: string
  severity: Severity
  requirement: RequirementKind
  message: string
  url?: string
  details?: Record<string, unknown>
  fix?: string
}): ValidationCheck {
  const check: ValidationCheck = {
    code: input.code,
    severity: input.severity,
    requirement: input.requirement,
    message: input.message,
  }

  if (input.url) {
    check.url = input.url
  }

  if (input.details) {
    check.details = input.details
  }

  if (input.fix) {
    check.fix = input.fix
  }

  return check
}
