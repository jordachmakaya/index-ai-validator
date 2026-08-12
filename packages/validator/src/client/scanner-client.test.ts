import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { version } from '../../package.json'
import type { ScanResult } from '../schemas'
import {
  pollScan,
  ScanExpiredError,
  ScanNotFoundError,
  ScanRateLimitError,
  ScanRequestError,
  ScanResultSchemaError,
  ScanServerError,
  ScanTimeoutError,
  submitScan,
  type ScanStatus,
} from './scanner-client'

// TDD (T1.1): `client/scanner-client.ts` does not exist yet. Every test below
// is expected to fail red until the Coder job implements submitScan/pollScan.
// Contract reference: .shokunin/brief/outbound/CONTRACT_SCANNER.md

const SCAN_ID = '3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01'
const TARGET_URL = 'https://example.com'

function buildMeta(scanId: string) {
  return {
    links: {
      self: `https://agent-view.com/api/v1/scan/${scanId}`,
      shareUrl: `https://agent-view.com/scan/${scanId}`,
      audit: `https://agent-view.com/audit?src=cli-json&scanId=${scanId}`,
    },
  }
}

// Real fixture values from CONTRACT_SCANNER.md §9 (done example).
const SCAN_RESULT_FIXTURE: ScanResult = {
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

const QUEUED_STATUS: ScanStatus = {
  scanId: SCAN_ID,
  status: 'queued',
  submittedAt: '2026-07-02T12:00:00Z',
  completedAt: null,
  meta: buildMeta(SCAN_ID),
}

const RUNNING_STATUS: ScanStatus = {
  scanId: SCAN_ID,
  status: 'running',
  submittedAt: '2026-07-02T12:00:00Z',
  completedAt: null,
  progress: { currentStep: 'render' },
  meta: buildMeta(SCAN_ID),
}

const DONE_STATUS: ScanStatus = {
  scanId: SCAN_ID,
  status: 'done',
  submittedAt: '2026-07-02T12:00:00Z',
  completedAt: '2026-07-02T12:00:41Z',
  result: SCAN_RESULT_FIXTURE,
  meta: buildMeta(SCAN_ID),
}

const FAILED_STATUS: ScanStatus = {
  scanId: SCAN_ID,
  status: 'failed',
  submittedAt: '2026-07-02T12:00:00Z',
  completedAt: '2026-07-02T12:00:05Z',
  failureReason: 'SCAN-002',
  meta: buildMeta(SCAN_ID),
}

const SCAN_001_ERROR = {
  code: 'SCAN-001',
  message: 'The URL "not-a-valid-url" is not a valid http(s) URL.',
}

const SCAN_404_ERROR = {
  code: 'SCAN-404',
  message: 'No scan exists for this scanId.',
}

// Deliberately does NOT mention "re-scan" — proves the client adds that
// suggestion itself rather than merely forwarding the server message.
const SCAN_410_ERROR = {
  code: 'SCAN-410',
  message: 'This scan record has been purged after the 90-day retention window.',
}

const SCAN_429_ERROR = {
  code: 'SCAN-429',
  message: 'Rate limit exceeded for this IP.',
}

const SCAN_500_ERROR = {
  code: 'SCAN-500',
  message: 'Internal scanner error.',
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('submitScan', () => {
  test('resolves with the typed queued ScanStatus on a 202', async () => {
    const server = await startServer((_request, response) => {
      sendJson(response, 202, QUEUED_STATUS)
    })

    try {
      const result = await submitScan(TARGET_URL, { baseUrl: server.origin })

      expect(result.scanId).toBe(SCAN_ID)
      expect(result.status).toBe('queued')
      expect(result.meta.links.audit).toContain(SCAN_ID)
    }
    finally {
      await server.close()
    }
  })

  test('treats a 200 cache response identically to a 202, reading scanId/status the same way', async () => {
    const server = await startServer((_request, response) => {
      sendJson(response, 200, DONE_STATUS)
    })

    try {
      const result = await submitScan(TARGET_URL, { baseUrl: server.origin })

      expect(result.scanId).toBe(SCAN_ID)
      expect(result.status).toBe('done')
      expect(result.result?.score).toBe(35)
    }
    finally {
      await server.close()
    }
  })

  test('always sends { url, channel: "cli" } in the request body', async () => {
    let receivedMethod: string | undefined
    let receivedPath: string | undefined
    let receivedBody: unknown

    const server = await startServer(async (request, response) => {
      receivedMethod = request.method
      receivedPath = request.url
      receivedBody = await readJsonBody(request)
      sendJson(response, 202, QUEUED_STATUS)
    })

    try {
      await submitScan(TARGET_URL, { baseUrl: server.origin })

      expect(receivedMethod).toBe('POST')
      expect(receivedPath).toBe('/api/v1/scan')
      expect(receivedBody).toStrictEqual({ url: TARGET_URL, channel: 'cli' })
    }
    finally {
      await server.close()
    }
  })

  test('rejects with a typed ScanRequestError carrying the exact contract message on a 400', async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify(SCAN_001_ERROR))
    })

    try {
      await submitScan(TARGET_URL, { baseUrl: server.origin })
      expect.unreachable('submitScan should have rejected on a 400 response')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ScanRequestError)
      expect((error as Error).message).toBe(SCAN_001_ERROR.message)
    }
    finally {
      await server.close()
    }
  })

  test('retries once after a 429 with Retry-After and succeeds if the retry lands', async () => {
    // Real timers on purpose: faking global setTimeout also breaks Node's
    // real fetch (undici), which relies on it internally for connection
    // management — the retry's real fetch would never resolve. A tiny real
    // Retry-After keeps the wait ~0ms while still proving the client
    // actually honors the header (fixture detail, not a behavior weakening).
    let requestCount = 0

    const server = await startServer((_request, response) => {
      requestCount += 1

      if (requestCount === 1) {
        response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' })
        response.end(JSON.stringify(SCAN_429_ERROR))
        return
      }

      sendJson(response, 202, QUEUED_STATUS)
    })

    try {
      const result = await submitScan(TARGET_URL, { baseUrl: server.origin })

      expect(result.status).toBe('queued')
      expect(requestCount).toBe(2)
    }
    finally {
      await server.close()
    }
  })
})

describe('pollScan', () => {
  test('polls running with progress.currentStep then resolves on done, stopping immediately at the terminal state', async () => {
    let requestCount = 0

    const server = await startServer((_request, response) => {
      requestCount += 1

      if (requestCount === 1) {
        sendJson(response, 200, RUNNING_STATUS)
        return
      }

      sendJson(response, 200, DONE_STATUS)
    })

    const progressUpdates: Array<{ currentStep: string }> = []

    try {
      const result = await pollScan(SCAN_ID, {
        baseUrl: server.origin,
        intervalMs: 5,
        onProgress: progress => progressUpdates.push(progress),
      })

      expect(progressUpdates).toStrictEqual([{ currentStep: 'render' }])
      expect(result.status).toBe('done')
      expect(result.result?.score).toBe(35)
      expect(requestCount).toBe(2)
    }
    finally {
      await server.close()
    }
  })

  test('resolves immediately on a failed terminal state without any further poll', async () => {
    let requestCount = 0

    const server = await startServer((_request, response) => {
      requestCount += 1
      sendJson(response, 200, FAILED_STATUS)
    })

    try {
      const result = await pollScan(SCAN_ID, { baseUrl: server.origin, intervalMs: 5 })

      expect(result.status).toBe('failed')
      expect(result.failureReason).toBe('SCAN-002')
      expect(requestCount).toBe(1)
    }
    finally {
      await server.close()
    }
  })

  test('fails cleanly with ScanRateLimitError when the retry also gets a 429 (no infinite loop, no multi-attempt backoff)', async () => {
    // Real timers on purpose: see the matching comment on the submitScan
    // 429-retry test above — fake timers break undici's real fetch, hanging
    // the retry indefinitely. A tiny real Retry-After keeps this fast.
    let requestCount = 0

    const server = await startServer((_request, response) => {
      requestCount += 1
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' })
      response.end(JSON.stringify(SCAN_429_ERROR))
    })

    try {
      await expect(pollScan(SCAN_ID, { baseUrl: server.origin })).rejects.toBeInstanceOf(ScanRateLimitError)

      expect(requestCount).toBe(2)
    }
    finally {
      await server.close()
    }
  })

  test('rejects immediately with ScanNotFoundError on a 404, without retrying', async () => {
    let requestCount = 0

    const server = await startServer((_request, response) => {
      requestCount += 1
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify(SCAN_404_ERROR))
    })

    try {
      await expect(pollScan(SCAN_ID, { baseUrl: server.origin })).rejects.toBeInstanceOf(ScanNotFoundError)
      expect(requestCount).toBe(1)
    }
    finally {
      await server.close()
    }
  })

  test('rejects immediately with ScanExpiredError suggesting a re-scan on a 410', async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(410, { 'content-type': 'application/json' })
      response.end(JSON.stringify(SCAN_410_ERROR))
    })

    try {
      await pollScan(SCAN_ID, { baseUrl: server.origin })
      expect.unreachable('pollScan should have rejected on a 410 response')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ScanExpiredError)
      expect((error as Error).message).toMatch(/re-?scan/i)
    }
    finally {
      await server.close()
    }
  })

  test('rejects immediately with ScanServerError on a 500', async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify(SCAN_500_ERROR))
    })

    try {
      await expect(pollScan(SCAN_ID, { baseUrl: server.origin })).rejects.toBeInstanceOf(ScanServerError)
    }
    finally {
      await server.close()
    }
  })

  test('gives up after the 90s server-side polling budget without looping forever', async () => {
    vi.useFakeTimers()

    const server = await startServer((_request, response) => {
      sendJson(response, 200, RUNNING_STATUS)
    })

    try {
      const resultPromise = pollScan(SCAN_ID, {
        baseUrl: server.origin,
        intervalMs: 2_000,
        budgetMs: 90_000,
      })

      const assertion = expect(resultPromise).rejects.toBeInstanceOf(ScanTimeoutError)

      await vi.advanceTimersByTimeAsync(95_000)
      await assertion
    }
    finally {
      await server.close()
    }
  })

  test('validates a done result against the vendored ScanResult schema and exposes it typed as-is', async () => {
    const server = await startServer((_request, response) => {
      sendJson(response, 200, DONE_STATUS)
    })

    try {
      const result = await pollScan(SCAN_ID, { baseUrl: server.origin })

      expect(result.status).toBe('done')
      expect(result.result).toStrictEqual(SCAN_RESULT_FIXTURE)
    }
    finally {
      await server.close()
    }
  })

  test('rejects a done result with an incompatible major schema version with an explicit error, never a silent partial parse', async () => {
    const incompatibleDoneStatus: ScanStatus = {
      ...DONE_STATUS,
      result: { ...SCAN_RESULT_FIXTURE, schemaVersion: '2.0' },
    }

    const server = await startServer((_request, response) => {
      sendJson(response, 200, incompatibleDoneStatus)
    })

    try {
      await pollScan(SCAN_ID, { baseUrl: server.origin })
      expect.unreachable('pollScan should have rejected on an incompatible schemaVersion')
    }
    catch (error) {
      expect(error).toBeInstanceOf(ScanResultSchemaError)
      expect(error).not.toBeInstanceOf(ScanServerError)
      expect(error).not.toBeInstanceOf(ScanRequestError)
    }
    finally {
      await server.close()
    }
  })

  test('tolerates an unknown additive field on the done result without raising an error', async () => {
    const toleratedDoneStatus: ScanStatus = {
      ...DONE_STATUS,
      result: { ...SCAN_RESULT_FIXTURE, newField: true } as ScanResult,
    }

    const server = await startServer((_request, response) => {
      sendJson(response, 200, toleratedDoneStatus)
    })

    try {
      const result = await pollScan(SCAN_ID, { baseUrl: server.origin })

      expect(result.status).toBe('done')
      expect(result.result?.score).toBe(35)
    }
    finally {
      await server.close()
    }
  })

  // T5.0: pollScan's `for (;;)` loop currently has no protection against a
  // one-off transient network error mid-poll (DNS hiccup, connection reset)
  // — it propagates immediately and kills the whole scan, even though the
  // very next poll would have succeeded within budget. Destroying the socket
  // before any response is sent (no HTTP status at all) is what makes
  // undici's real fetch() surface a generic network TypeError, matching the
  // real-world failure this test protects against. RED until the Coder job
  // adds a tolerance for exactly one such hiccup per poll.
  test('tolerates one transient network error mid-poll and still resolves on the next successful poll', async () => {
    let requestCount = 0

    const server = await startServer((request, response) => {
      requestCount += 1

      if (requestCount === 1) {
        request.socket.destroy()
        return
      }

      sendJson(response, 200, DONE_STATUS)
    })

    try {
      const result = await pollScan(SCAN_ID, { baseUrl: server.origin, intervalMs: 5 })

      expect(result.status).toBe('done')
      expect(result.result?.score).toBe(35)
      expect(requestCount).toBe(2)
    }
    finally {
      await server.close()
    }
  })

  test('sends the correct user-agent header containing version and Agent View home page', async () => {
    let capturedUserAgent: string | undefined
    const server = await startServer((request, response) => {
      capturedUserAgent = request.headers['user-agent']
      sendJson(response, 201, QUEUED_STATUS)
    })

    try {
      await submitScan(TARGET_URL, { baseUrl: server.origin, timeoutMs: 1_000 })
      expect(capturedUserAgent).toBe(`@hardmachinelabs/index-ai-validator/${version} (+https://agent-view.com)`)
    }
    finally {
      await server.close()
    }
  })
})

type TestServer = {
  origin: string
  close: () => Promise<void>
}

function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<TestServer> {
  const server = createServer(handler)

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!isAddressInfo(address)) {
        reject(new Error('Expected the test server to listen on an ephemeral TCP port.'))
        return
      }

      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => closeServer(server),
      })
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function isAddressInfo(address: AddressInfo | string | null): address is AddressInfo {
  return address !== null && typeof address !== 'string'
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      }
      catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
    request.on('error', reject)
  })
}
