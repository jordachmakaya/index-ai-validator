/**
 * @filemeta
 * type: service
 * title: Scan orchestrator
 * description: Submits a scan, polls it to a terminal state, and returns attribution-rewritten audit links or throws a typed failure.
 * job_ref: T2.0_scan-orchestrator
 * functions: [scanUrl]
 * classes: [ScanFailedError]
 * inputs: [ScanOptions]
 * outputs: [ScanOutcome]
 * relations:
 *   - imports: packages/validator/src/client/scanner-client.ts
 *   - imports: packages/validator/src/utils/attribution.ts
 *   - imports: packages/validator/src/types.ts
 *   - tested_by: packages/validator/src/scan.test.ts
 * last_update: 2026-07-03
 */
import {
  pollScan,
  submitScan,
  type PollScanOptions,
  type ScanStatus,
  type SubmitScanOptions,
} from './client/scanner-client'
import { rewriteAttributionSrc } from './utils/attribution'
import type { ScanOptions } from './types'

export type ScanOutcome = {
  status: ScanStatus
  auditLinks: { html: string; terminal: string }
}

// Business-logic failure carrying the server's real failureReason as `code` —
// same shape/quality bar as InvalidTargetUrlError/InvalidAuditUrlError: never a
// generic message, always actionable.
export class ScanFailedError extends Error {
  override readonly name = 'ScanFailedError'

  constructor(readonly code: string) {
    super(
      `Scan failed on the server with code "${code}". Look up "${code}" in the CONTRACT_SCANNER.md SCAN-NNN error registry to see what it means, or submit a new scan (re-scan) if the failure looks transient.`,
    )
  }
}

export async function scanUrl(options: ScanOptions): Promise<ScanOutcome> {
  const submitted = await submitScan(options.target, buildSubmitOptions(options))
  const status = isTerminalStatus(submitted)
    ? submitted
    : await pollScan(submitted.scanId, buildPollOptions(options))

  if (status.status === 'failed') {
    throw new ScanFailedError(status.failureReason ?? 'SCAN-UNKNOWN')
  }

  return {
    status,
    auditLinks: {
      html: rewriteAttributionSrc(status.meta.links.audit, 'cli-report'),
      terminal: rewriteAttributionSrc(status.meta.links.audit, 'cli-terminal'),
    },
  }
}

function isTerminalStatus(status: ScanStatus): boolean {
  return status.status === 'done' || status.status === 'failed'
}

// `exactOptionalPropertyTypes` forbids assigning an explicit `undefined` to an
// optional field — omit the key entirely when the caller didn't set it, same
// idiom already used by scanner-client.ts's fetchScan.
function buildSubmitOptions(options: ScanOptions): SubmitScanOptions {
  return {
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  }
}

function buildPollOptions(options: ScanOptions): PollScanOptions {
  return {
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.intervalMs === undefined ? {} : { intervalMs: options.intervalMs }),
    ...(options.budgetMs === undefined ? {} : { budgetMs: options.budgetMs }),
    // PollScanOptions.onProgress is declared with a looser `{ currentStep: string }`
    // param than ScanOptions.onProgress's `{ currentStep: ScanProgressStep }` —
    // pollScan only ever invokes it with a real ScanProgressStep value (see
    // parseOptionalProgress in scanner-client.ts), so this narrowing is safe.
    // Forwarded by identity here, never wrapped.
    ...(options.onProgress === undefined
      ? {}
      : { onProgress: options.onProgress as NonNullable<PollScanOptions['onProgress']> }),
  }
}
