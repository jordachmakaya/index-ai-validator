import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { describe, expect, test } from 'vitest'

import { fetchTextWithPolicy } from './http'

type TestServer = {
  origin: string
  close: () => Promise<void>
}

describe('fetchTextWithPolicy', () => {
  test('returns a stable successful text result', async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('hello index-ai')
    })

    try {
      const result = await fetchTextWithPolicy({
        url: `${server.origin}/ok`,
        timeoutMs: 1_000,
        targetHost: 'localhost',
      })

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(result.contentType).toContain('text/plain')
      expect(result.text).toBe('hello index-ai')
      expect(result.error).toBeUndefined()
    }
    finally {
      await server.close()
    }
  })

  test('returns a stable timeout result', async () => {
    const server = await startServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/plain' })
        response.end('late')
      }, 75)
    })

    try {
      const result = await fetchTextWithPolicy({
        url: `${server.origin}/slow`,
        timeoutMs: 10,
        targetHost: 'localhost',
      })

      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe('HTTP_TIMEOUT')
      expect(result.text).toBe('')
    }
    finally {
      await server.close()
    }
  })

  test('returns a stable redirect-limit result without exceeding the cap', async () => {
    let requestCount = 0
    const server = await startServer((request, response) => {
      requestCount += 1

      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const step = getRedirectStep(url.pathname)

      response.writeHead(302, { location: `/redirect/${step + 1}` })
      response.end()
    })

    try {
      const result = await fetchTextWithPolicy({
        url: `${server.origin}/redirect/0`,
        timeoutMs: 1_000,
        maxRedirects: 2,
        targetHost: 'localhost',
      })

      expect(result.ok).toBe(false)
      expect(result.error?.code).toBe('HTTP_REDIRECT_LIMIT')
      expect(result.redirects).toHaveLength(3)
      expect(requestCount).toBe(3)
    }
    finally {
      await server.close()
    }
  })

  test('returns a stable blocked result for private hosts when target is not local', async () => {
    const result = await fetchTextWithPolicy({
      url: 'http://127.0.0.1:1/private',
      timeoutMs: 1_000,
      targetHost: 'example.com',
    })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('HTTP_PRIVATE_HOST_BLOCKED')
    expect(result.status).toBe(0)
  })
})

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
    server.close(error => {
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

function getRedirectStep(pathname: string): number {
  const lastSegment = pathname.split('/').at(-1) ?? '0'
  const parsed = Number(lastSegment)

  return Number.isFinite(parsed) ? parsed : 0
}
