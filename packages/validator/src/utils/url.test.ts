import { describe, expect, test } from 'vitest'

import {
  UnsupportedProtocolError,
  isHttpUrl,
  isLocalhost,
  isPrivateHost,
  normalizeTarget,
  resolveUrl,
  sameOrigin,
} from './url'

describe('normalizeTarget', () => {
  test('strips hash and search values', () => {
    expect(normalizeTarget('https://example.com/path?draft=true#section')).toBe(
      'https://example.com/path',
    )
  })

  test('removes a trailing slash from non-root paths', () => {
    expect(normalizeTarget('https://example.com/docs/')).toBe(
      'https://example.com/docs',
    )
  })

  test('accepts http and https URLs', () => {
    expect(normalizeTarget('http://example.com')).toBe('http://example.com/')
    expect(normalizeTarget('https://example.com')).toBe('https://example.com/')
    expect(isHttpUrl('http://example.com')).toBe(true)
    expect(isHttpUrl('https://example.com')).toBe(true)
  })

  test('rejects non-http protocols', () => {
    expect(() => normalizeTarget('ftp://example.com/file.txt')).toThrow(
      UnsupportedProtocolError,
    )
    expect(isHttpUrl('ftp://example.com/file.txt')).toBe(false)
  })
})

describe('resolveUrl', () => {
  test('resolves relative paths against the target URL', () => {
    expect(resolveUrl('/ai-graph.json', 'https://example.com/docs/page')).toBe(
      'https://example.com/ai-graph.json',
    )
  })
})

describe('sameOrigin', () => {
  test('detects matching origins', () => {
    expect(
      sameOrigin('https://example.com/a', 'https://example.com/b?x=1'),
    ).toBe(true)
  })

  test('detects different origins', () => {
    expect(sameOrigin('https://example.com', 'https://docs.example.com')).toBe(
      false,
    )
  })
})

describe('isLocalhost', () => {
  test('matches local hostnames and loopback addresses', () => {
    expect(isLocalhost('localhost')).toBe(true)
    expect(isLocalhost('127.0.0.1')).toBe(true)
    expect(isLocalhost('::1')).toBe(true)
  })
})

describe('isPrivateHost', () => {
  test('detects private and local hosts', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('10.0.0.1')).toBe(true)
    expect(isPrivateHost('172.16.0.1')).toBe(true)
    expect(isPrivateHost('172.31.255.255')).toBe(true)
    expect(isPrivateHost('192.168.1.1')).toBe(true)
    expect(isPrivateHost('169.254.169.254')).toBe(true)
  })

  test('does not treat a public hostname as private', () => {
    expect(isPrivateHost('example.com')).toBe(false)
  })
})
