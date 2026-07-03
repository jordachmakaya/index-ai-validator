/**
 * @filemeta
 * type: utility
 * title: Audit URL attribution rewriter
 * description: Rewrites the src query param of a scanner-provided audit URL to attribute it to the CLI report or terminal context.
 * job_ref: T1.2_attribution-module
 * functions: [rewriteAttributionSrc]
 * classes: [InvalidAuditUrlError]
 * inputs: [auditUrl, src]
 * outputs: [rewritten audit URL string]
 * relations:
 *   - tested_by: packages/validator/src/utils/attribution.test.ts
 * last_update: 2026-07-03
 */

export type AttributionSrc = 'cli-json' | 'cli-report' | 'cli-terminal'

export class InvalidAuditUrlError extends Error {
  override name = 'InvalidAuditUrlError'

  constructor(input: string, options?: ErrorOptions) {
    super(
      `Invalid audit URL: "${input}". Expected the absolute audit URL already received from the scanner in meta.links.audit, for example https://agent-view.com/audit?src=cli-json&scanId=3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01.`,
      options,
    )
  }
}

export function rewriteAttributionSrc(
  auditUrl: string,
  src: Exclude<AttributionSrc, 'cli-json'>,
): string {
  const parsed = parseAbsoluteAuditUrl(auditUrl)
  parsed.searchParams.set('src', src)

  return parsed.toString()
}

function parseAbsoluteAuditUrl(input: string): URL {
  try {
    return new URL(input)
  }
  catch (error) {
    throw new InvalidAuditUrlError(input, { cause: error })
  }
}
