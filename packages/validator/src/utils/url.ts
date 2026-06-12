import { isIP } from 'node:net'

const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export class InvalidTargetUrlError extends Error {
  override name = 'InvalidTargetUrlError'

  constructor(input: string, options?: ErrorOptions) {
    super(
      `Invalid target URL: "${input}". Provide an absolute http or https URL, for example https://example.com.`,
      options,
    )
  }
}

export class UnsupportedProtocolError extends Error {
  override name = 'UnsupportedProtocolError'

  constructor(input: string, protocol: string) {
    super(
      `Unsupported URL protocol for "${input}": "${protocol}". The validator only supports http and https URLs.`,
    )
  }
}

export function normalizeTarget(input: string): string {
  const parsed = parseAbsoluteUrl(input)
  assertHttpProtocol(parsed, input)

  parsed.hash = ''
  parsed.search = ''

  if (parsed.pathname !== '/') {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  }

  return parsed.toString()
}

export function resolveUrl(input: string, base: string | URL): string {
  const resolved = new URL(input, base)
  assertHttpProtocol(resolved, input)

  return resolved.toString()
}

export function sameOrigin(left: string | URL, right: string | URL): boolean {
  const leftUrl = new URL(left)
  const rightUrl = new URL(right)

  return leftUrl.origin === rightUrl.origin
}

export function isHttpUrl(input: string): boolean {
  try {
    return HTTP_PROTOCOLS.has(new URL(input).protocol)
  }
  catch {
    return false
  }
}

export function isPrivateHost(input: string): boolean {
  return isPrivateHostname(extractHostname(input))
}

export function isPrivateHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname)

  if (isLocalhost(host)) return true
  if (host.endsWith('.local')) return true
  if (host.endsWith('.internal')) return true
  if (host.endsWith('.lan')) return true

  const ipVersion = isIP(host)

  if (ipVersion === 4) {
    return isPrivateIpv4(host)
  }

  if (ipVersion === 6) {
    return isPrivateIpv6(host)
  }

  return false
}

export function isLocalhost(hostname: string): boolean {
  const host = normalizeHostname(hostname)

  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function parseAbsoluteUrl(input: string): URL {
  try {
    return new URL(input)
  }
  catch (error) {
    throw new InvalidTargetUrlError(input, { cause: error })
  }
}

function assertHttpProtocol(url: URL, input: string): void {
  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    throw new UnsupportedProtocolError(input, url.protocol)
  }
}

function extractHostname(input: string): string {
  const trimmed = input.trim()

  if (isIP(trimmed) !== 0) {
    return trimmed
  }

  if (trimmed.startsWith('[')) {
    const closingBracketIndex = trimmed.indexOf(']')
    return closingBracketIndex === -1
      ? trimmed
      : trimmed.slice(1, closingBracketIndex)
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`)
    return url.hostname
  }
  catch {
    return trimmed
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().replace(/^\[/, '').replace(/\]$/, '').toLowerCase()
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(part => Number(part))
  const [first, second] = parts

  if (first === undefined || second === undefined) {
    return false
  }

  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254)
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase()

  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
}
