/**
 * @filemeta
 * type: adapter
 * title: Scanner HTTP client
 * description: Submits and polls Agent View scans over HTTP, mapping contract error codes and validating done results against the vendored ScanResult schema.
 * job_ref: T1.1_scanner-client
 * functions: [submitScan, pollScan]
 * classes: [ScanRequestError, ScanNotFoundError, ScanExpiredError, ScanRateLimitError, ScanServerError, ScanTimeoutError, ScanResultSchemaError, ScanResponseShapeError]
 * inputs: [url, scanId, SubmitScanOptions, PollScanOptions]
 * outputs: [ScanStatus]
 * relations:
 *   - imports: packages/validator/src/schemas.ts
 *   - imports: packages/validator/src/constants.ts
 *   - tested_by: packages/validator/src/client/scanner-client.test.ts
 * last_update: 2026-07-02
 */
import { DEFAULT_TIMEOUT_MS, PACKAGE_NAME } from '../constants'
import { type SchemaValidationError, type ScanResult, validateScanResult } from '../schemas'

const DEFAULT_BASE_URL = 'https://agent-view.com'
const DEFAULT_POLL_INTERVAL_MS = 2_000
const DEFAULT_POLL_BUDGET_MS = 90_000
const DEFAULT_RETRY_AFTER_MS = 1_000

const SCAN_STATUSES = ['queued', 'running', 'done', 'failed'] as const
const SCAN_PROGRESS_STEPS = ['fetch', 'robots', 'render', 'checks', 'score'] as const

export type ScanProgressStep = (typeof SCAN_PROGRESS_STEPS)[number]

export type ScanStatus = {
  scanId: string
  status: (typeof SCAN_STATUSES)[number]
  submittedAt: string
  completedAt: string | null
  progress?: { currentStep: ScanProgressStep }
  failureReason?: string
  result?: ScanResult
  meta: {
    links: {
      self: string
      shareUrl: string
      audit: string
    }
  }
}

export type SubmitScanOptions = {
  baseUrl?: string
  timeoutMs?: number
}

export type PollScanOptions = {
  baseUrl?: string
  timeoutMs?: number
  intervalMs?: number
  budgetMs?: number
  onProgress?: (progress: { currentStep: string }) => void
}

// Contract-mapped errors (CONTRACT_SCANNER.md §7) carry the server's `code`
// (e.g. SCAN-001) alongside the exact `message`, factual and displayable as-is.

export class ScanRequestError extends Error {
  override readonly name = 'ScanRequestError'

  constructor(message: string, readonly code: string) {
    super(message)
  }
}

export class ScanNotFoundError extends Error {
  override readonly name = 'ScanNotFoundError'

  constructor(message: string, readonly code: string) {
    super(message)
  }
}

export class ScanExpiredError extends Error {
  override readonly name = 'ScanExpiredError'

  constructor(message: string, readonly code: string) {
    super(message)
  }
}

export class ScanRateLimitError extends Error {
  override readonly name = 'ScanRateLimitError'

  constructor(message: string, readonly code: string) {
    super(message)
  }
}

export class ScanServerError extends Error {
  override readonly name = 'ScanServerError'

  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

// Client-side conditions — no contract `code`, distinct from the server error
// taxonomy above.

export class ScanTimeoutError extends Error {
  override readonly name = 'ScanTimeoutError'

  constructor(message: string) {
    super(message)
  }
}

export class ScanResultSchemaError extends Error {
  override readonly name = 'ScanResultSchemaError'

  constructor(message: string, readonly errors: SchemaValidationError[]) {
    super(message)
  }
}

export class ScanResponseShapeError extends Error {
  override readonly name = 'ScanResponseShapeError'

  constructor(message: string) {
    super(message)
  }
}

export async function submitScan(url: string, options: SubmitScanOptions = {}): Promise<ScanStatus> {
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const payload = await performScanRequest('POST', `${baseUrl}/api/v1/scan`, timeoutMs, { url, channel: 'cli' })

  return parseScanStatus(payload)
}

export async function pollScan(scanId: string, options: PollScanOptions = {}): Promise<ScanStatus> {
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const budgetMs = options.budgetMs ?? DEFAULT_POLL_BUDGET_MS
  const url = `${baseUrl}/api/v1/scan/${scanId}`
  const deadline = Date.now() + budgetMs

  for (;;) {
    if (Date.now() >= deadline) {
      throw new ScanTimeoutError(`Scan "${scanId}" timed out — server-side budget is ${budgetMs}ms.`)
    }

    const payload = await performScanRequest('GET', url, timeoutMs)
    const status = parseScanStatus(payload)

    if (status.status === 'done' || status.status === 'failed') {
      return status
    }

    if (status.progress) {
      options.onProgress?.(status.progress)
    }

    await sleep(intervalMs)
  }
}

function resolveBaseUrl(explicitBaseUrl?: string): string {
  return explicitBaseUrl ?? process.env.INDEX_AI_SCANNER_URL ?? DEFAULT_BASE_URL
}

type HttpMethod = 'GET' | 'POST'
type SubmitScanRequestBody = { url: string; channel: 'cli' }
type ApiError = { code: string; message: string }

// Single call-site for both submitScan/pollScan: one 429 retry (respecting
// Retry-After), then the shared status-code -> typed-error mapping. Not
// duplicated per endpoint (api-resilience: bounded retry, no backoff engine).
async function performScanRequest(
  method: HttpMethod,
  url: string,
  timeoutMs: number,
  body?: SubmitScanRequestBody,
): Promise<unknown> {
  const response = await fetchScan(method, url, timeoutMs, body)

  if (response.status === 429) {
    const retryAfterMs = readRetryAfterMs(response)
    // Drain the discarded response body before retrying: an unconsumed body
    // can stall a pooled keep-alive connection and hang the next request on
    // the same socket.
    await response.text()
    await sleep(retryAfterMs)
    const retryResponse = await fetchScan(method, url, timeoutMs, body)
    return resolveResponseBody(retryResponse, url)
  }

  return resolveResponseBody(response, url)
}

async function fetchScan(
  method: HttpMethod,
  url: string,
  timeoutMs: number,
  body?: SubmitScanRequestBody,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'user-agent': `${PACKAGE_NAME}/0.1 (+https://agent-view.com)`,
      },
      signal: controller.signal,
      // `exactOptionalPropertyTypes` forbids `body: undefined` (RequestInit's
      // `body` is `BodyInit | null`, not `| undefined`) — omit the key
      // entirely for bodyless GETs instead of assigning it undefined.
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }
  catch (error) {
    if (isAbortError(error)) {
      throw new ScanTimeoutError(`Request to "${url}" timed out after ${timeoutMs}ms.`)
    }

    throw new ScanServerError(`Network error while calling "${url}": ${formatUnknownError(error)}.`)
  }
  finally {
    clearTimeout(timeout)
  }
}

async function resolveResponseBody(response: Response, url: string): Promise<unknown> {
  const payload = await parseJsonBody(response, url)

  if (response.ok) {
    return payload
  }

  throwForErrorResponse(response.status, toApiError(payload, url))
}

function throwForErrorResponse(status: number, apiError: ApiError): never {
  switch (status) {
    case 400:
      throw new ScanRequestError(apiError.message, apiError.code)
    case 404:
      throw new ScanNotFoundError(apiError.message, apiError.code)
    case 410:
      throw new ScanExpiredError(appendRescanSuggestion(apiError.message), apiError.code)
    case 429:
      throw new ScanRateLimitError(apiError.message, apiError.code)
    default:
      throw new ScanServerError(apiError.message, apiError.code)
  }
}

// Test #10 (CONTRACT_SCANNER.md §4): the client must suggest a re-scan even
// when the server's own message doesn't mention one.
function appendRescanSuggestion(message: string): string {
  if (/re-?scan/i.test(message)) {
    return message
  }

  return `${message} Consider requesting a new scan (re-scan) for this URL.`
}

function toApiError(payload: unknown, url: string): ApiError {
  if (isApiErrorShape(payload)) {
    return payload
  }

  return {
    code: 'SCAN-UNKNOWN',
    message: `Scanner API at "${url}" returned an error response without a valid code/message body.`,
  }
}

function isApiErrorShape(payload: unknown): payload is ApiError {
  return (
    typeof payload === 'object'
    && payload !== null
    && typeof (payload as Record<string, unknown>).code === 'string'
    && typeof (payload as Record<string, unknown>).message === 'string'
  )
}

async function parseJsonBody(response: Response, url: string): Promise<unknown> {
  try {
    return await response.json() as unknown
  }
  catch (error) {
    throw new ScanServerError(`Received a non-JSON response from "${url}": ${formatUnknownError(error)}.`)
  }
}

function readRetryAfterMs(response: Response): number {
  const header = response.headers.get('retry-after')
  const seconds = header === null ? Number.NaN : Number(header)

  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_RETRY_AFTER_MS
  }

  return seconds * 1_000
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

// --- ScanStatus envelope validation (engineering-rules: never trust an HTTP
// response's shape). Delegates the `result` payload entirely to
// `validateScanResult` (T1.0) — no duplicated tolerance/version logic here.

function parseScanStatus(payload: unknown): ScanStatus {
  const envelope = requireRecord(payload, 'scan status response')
  const scanId = requireString(envelope.scanId, 'scanId')
  const status = requireEnum(envelope.status, SCAN_STATUSES, 'status')
  const submittedAt = requireString(envelope.submittedAt, 'submittedAt')
  const completedAt = requireNullableString(envelope.completedAt, 'completedAt')
  const meta = parseMeta(envelope.meta)

  const scanStatus: ScanStatus = {
    scanId,
    status,
    submittedAt,
    completedAt,
    meta,
  }

  const progress = parseOptionalProgress(envelope.progress)

  if (progress) {
    scanStatus.progress = progress
  }

  if (typeof envelope.failureReason === 'string') {
    scanStatus.failureReason = envelope.failureReason
  }

  if (envelope.result !== undefined) {
    scanStatus.result = parseScanResultOrThrow(envelope.result)
  }

  return scanStatus
}

function parseScanResultOrThrow(value: unknown): ScanResult {
  const validation = validateScanResult(value)

  if (validation.valid) {
    return validation.result
  }

  throw new ScanResultSchemaError(
    'The scanner returned a "done" result that does not match the ScanResult schema this CLI version supports '
    + '(e.g. an incompatible major schemaVersion) — update the CLI rather than trust a partial parse.',
    validation.errors,
  )
}

function parseMeta(value: unknown): ScanStatus['meta'] {
  const meta = requireRecord(value, 'meta')
  const links = requireRecord(meta.links, 'meta.links')

  return {
    links: {
      self: requireString(links.self, 'meta.links.self'),
      shareUrl: requireString(links.shareUrl, 'meta.links.shareUrl'),
      audit: requireString(links.audit, 'meta.links.audit'),
    },
  }
}

function parseOptionalProgress(value: unknown): { currentStep: ScanProgressStep } | null {
  if (value === undefined) {
    return null
  }

  const progress = requireRecord(value, 'progress')

  return { currentStep: requireEnum(progress.currentStep, SCAN_PROGRESS_STEPS, 'progress.currentStep') }
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new ScanResponseShapeError(`Expected ${context} to be a JSON object in the scanner response.`)
  }

  return value as Record<string, unknown>
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ScanResponseShapeError(`Expected "${field}" to be a string in the scanner response.`)
  }

  return value
}

function requireNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null
  }

  return requireString(value, field)
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T
  }

  throw new ScanResponseShapeError(`Unexpected "${field}" value "${String(value)}" in the scanner response.`)
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
