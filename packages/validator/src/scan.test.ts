import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  pollScan,
  ScanRequestError,
  ScanTimeoutError,
  submitScan,
  type ScanProgressStep,
  type ScanStatus,
} from './client/scanner-client'
import type { ScanResult } from './schemas'

// TDD (T2.0): `scan.ts` does not exist yet — every test below is expected to
// fail red until the Coder job implements ScanOutcome/ScanFailedError/scanUrl.
// Design reference (authoritative, do not diverge):
// .shokunin/jobs/scan-upgrade/T2.0_scan-orchestrator_tester/JOB.md
// "Design imposé par le CTO" section.
import { ScanFailedError, scanUrl, type ScanOutcome } from './scan'

// `client/scanner-client` (T1.1, VERIFIED) is the boundary this orchestrator
// depends on. It is mocked here — not retested — because scanUrl's contract
// is orchestration (submit -> poll -> outcome/attribution/typed-failure), not
// HTTP transport (already covered by scanner-client.test.ts).
vi.mock('./client/scanner-client', async () => {
  const actual = await vi.importActual<typeof import('./client/scanner-client')>(
    './client/scanner-client',
  )

  return {
    ...actual,
    submitScan: vi.fn(),
    pollScan: vi.fn(),
  }
})

const mockedSubmitScan = vi.mocked(submitScan)
const mockedPollScan = vi.mocked(pollScan)

const SCAN_ID = '3f9d2a10-6c1e-4b7a-9e2f-8d4c5b6a7f01'
const TARGET_URL = 'https://example.com'

function buildMeta(src: 'cli-json' = 'cli-json') {
  return {
    links: {
      self: `https://agent-view.com/api/v1/scan/${SCAN_ID}`,
      shareUrl: `https://agent-view.com/scan/${SCAN_ID}`,
      audit: `https://agent-view.com/audit?src=${src}&scanId=${SCAN_ID}`,
    },
  }
}

// Real fixture values from CONTRACT_SCANNER.md §9 (done example) — same
// fixture already used by scanner-client.test.ts, not invented here.
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
  meta: buildMeta(),
}

const DONE_STATUS: ScanStatus = {
  scanId: SCAN_ID,
  status: 'done',
  submittedAt: '2026-07-02T12:00:00Z',
  completedAt: '2026-07-02T12:00:41Z',
  result: SCAN_RESULT_FIXTURE,
  meta: buildMeta(),
}

const FAILED_STATUS: ScanStatus = {
  scanId: SCAN_ID,
  status: 'failed',
  submittedAt: '2026-07-02T12:00:00Z',
  completedAt: '2026-07-02T12:00:05Z',
  failureReason: 'SCAN-002',
  meta: buildMeta(),
}

afterEach(() => {
  vi.restoreAllMocks()
  mockedSubmitScan.mockReset()
  mockedPollScan.mockReset()
})

describe('scanUrl', () => {
  test('resolves { status, auditLinks } via pollScan when submitScan returns a non-terminal (queued) status', async () => {
    mockedSubmitScan.mockResolvedValue(QUEUED_STATUS)
    mockedPollScan.mockResolvedValue(DONE_STATUS)

    const outcome: ScanOutcome = await scanUrl({ target: TARGET_URL })

    expect(mockedPollScan).toHaveBeenCalledTimes(1)
    expect(mockedPollScan).toHaveBeenCalledWith(SCAN_ID, expect.anything())
    // status is never rebuilt/mutated — strict identity with what pollScan resolved.
    expect(outcome.status).toBe(DONE_STATUS)
    // meta.links.audit keeps src=cli-json intact — the raw status is untouched.
    expect(outcome.status.meta.links.audit).toContain('src=cli-json')
    expect(outcome.auditLinks.html).toContain('src=cli-report')
    expect(outcome.auditLinks.html).toContain(`scanId=${SCAN_ID}`)
    expect(outcome.auditLinks.terminal).toContain('src=cli-terminal')
    expect(outcome.auditLinks.terminal).toContain(`scanId=${SCAN_ID}`)
  })

  test('resolves without calling pollScan when submitScan already returns a terminal done status (cache)', async () => {
    mockedSubmitScan.mockResolvedValue(DONE_STATUS)

    const outcome = await scanUrl({ target: TARGET_URL })

    expect(mockedPollScan).not.toHaveBeenCalled()
    expect(outcome.status).toBe(DONE_STATUS)
    expect(outcome.auditLinks.html).toContain('src=cli-report')
    expect(outcome.auditLinks.terminal).toContain('src=cli-terminal')
  })

  test('rejects with ScanFailedError carrying the real failureReason as code when pollScan resolves failed', async () => {
    mockedSubmitScan.mockResolvedValue(QUEUED_STATUS)
    mockedPollScan.mockResolvedValue(FAILED_STATUS)

    const error = await scanUrl({ target: TARGET_URL }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ScanFailedError)
    expect((error as ScanFailedError).code).toBe('SCAN-002')
    // Message cites the real code and is not a generic placeholder.
    expect((error as ScanFailedError).message).toContain('SCAN-002')
    expect((error as ScanFailedError).message).not.toBe('Scan failed.')
    expect((error as ScanFailedError).message.length).toBeGreaterThan('SCAN-002'.length)
  })

  test('rejects with ScanFailedError without calling pollScan when submitScan already returns a terminal failed status (cache)', async () => {
    mockedSubmitScan.mockResolvedValue(FAILED_STATUS)

    const error = await scanUrl({ target: TARGET_URL }).catch((caught: unknown) => caught)

    expect(mockedPollScan).not.toHaveBeenCalled()
    expect(error).toBeInstanceOf(ScanFailedError)
    expect((error as ScanFailedError).code).toBe('SCAN-002')
  })

  test('propagates a transport error thrown by submitScan without catching or transforming it', async () => {
    const transportError = new ScanRequestError(
      'The target URL resolves to a private/reserved address.',
      'SCAN-002',
    )
    mockedSubmitScan.mockRejectedValue(transportError)

    await expect(scanUrl({ target: TARGET_URL })).rejects.toBe(transportError)
    expect(mockedPollScan).not.toHaveBeenCalled()
  })

  test('propagates a ScanTimeoutError thrown by pollScan without catching or transforming it', async () => {
    mockedSubmitScan.mockResolvedValue(QUEUED_STATUS)
    const timeoutError = new ScanTimeoutError(
      `Scan "${SCAN_ID}" timed out — server-side budget is 90000ms.`,
    )
    mockedPollScan.mockRejectedValue(timeoutError)

    await expect(scanUrl({ target: TARGET_URL })).rejects.toBe(timeoutError)
  })

  test('forwards onProgress to pollScan unchanged — same function identity, no wrapper', async () => {
    mockedSubmitScan.mockResolvedValue(QUEUED_STATUS)
    mockedPollScan.mockResolvedValue(DONE_STATUS)
    const onProgress = vi.fn((_progress: { currentStep: ScanProgressStep }) => {})

    await scanUrl({ target: TARGET_URL, onProgress })

    expect(mockedPollScan).toHaveBeenCalledTimes(1)
    const pollOptions = mockedPollScan.mock.calls[0]?.[1]
    expect(pollOptions?.onProgress).toBe(onProgress)
  })

  test('forwards baseUrl/timeoutMs/intervalMs/budgetMs to submitScan and pollScan unchanged', async () => {
    mockedSubmitScan.mockResolvedValue(QUEUED_STATUS)
    mockedPollScan.mockResolvedValue(DONE_STATUS)

    await scanUrl({
      target: TARGET_URL,
      baseUrl: 'https://scanner.internal.test',
      timeoutMs: 5_000,
      intervalMs: 1_000,
      budgetMs: 30_000,
    })

    expect(mockedSubmitScan).toHaveBeenCalledWith(
      TARGET_URL,
      expect.objectContaining({ baseUrl: 'https://scanner.internal.test', timeoutMs: 5_000 }),
    )
    expect(mockedPollScan).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({
        baseUrl: 'https://scanner.internal.test',
        timeoutMs: 5_000,
        intervalMs: 1_000,
        budgetMs: 30_000,
      }),
    )
  })
})
