import { isHttpUrl, isLocalhost, isPrivateHostname, resolveUrl } from './utils/url'

const DEFAULT_ACCEPT_HEADER = 'application/json,text/markdown,text/plain,text/html,*/*'
const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])

export type HttpErrorCode =
  | 'HTTP_UNSUPPORTED_PROTOCOL'
  | 'HTTP_PRIVATE_HOST_BLOCKED'
  | 'HTTP_TIMEOUT'
  | 'HTTP_REDIRECT_LIMIT'
  | 'HTTP_NETWORK_ERROR'

export type HttpError = {
  code: HttpErrorCode
  message: string
}

export type HttpResult = {
  url: string
  finalUrl: string
  status: number
  ok: boolean
  contentType: string
  headers: Headers
  text: string
  redirects: string[]
  truncated: boolean
  error?: HttpError
}

export type FetchTextOptions = {
  url: string
  timeoutMs: number
  maxRedirects?: number
  allowPrivateHosts?: boolean
  targetHost?: string
  accept?: string
  maxBodyBytes?: number
}

export async function fetchTextWithPolicy(input: FetchTextOptions): Promise<HttpResult> {
  if (!isHttpUrl(input.url)) {
    return failedHttpResult(
      input.url,
      'HTTP_UNSUPPORTED_PROTOCOL',
      `Unsupported URL protocol for "${input.url}". The validator only supports http and https URLs.`,
    )
  }

  const redirects: string[] = []
  let currentUrl = input.url
  const maxRedirects = input.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const maxBodyBytes = input.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

  for (;;) {
    const currentHost = new URL(currentUrl).hostname
    const privateHostError = getPrivateHostError(input, currentHost)

    if (privateHostError) {
      return failedHttpResult(input.url, privateHostError.code, privateHostError.message, {
        finalUrl: currentUrl,
        redirects,
      })
    }

    const response = await fetchOnce(currentUrl, input)

    if (!response.ok) {
      return failedHttpResult(input.url, response.error.code, response.error.message, {
        finalUrl: currentUrl,
        redirects,
      })
    }

    const redirectLocation = getRedirectLocation(response.value)

    if (redirectLocation) {
      const nextUrl = resolveRedirectUrl(redirectLocation, currentUrl)

      if (!isHttpUrl(nextUrl)) {
        return failedHttpResult(
          input.url,
          'HTTP_UNSUPPORTED_PROTOCOL',
          `Redirected to unsupported protocol from "${currentUrl}" to "${nextUrl}". The validator only supports http and https URLs.`,
          { finalUrl: nextUrl, redirects },
        )
      }

      redirects.push(nextUrl)

      if (redirects.length > maxRedirects) {
        return failedHttpResult(
          input.url,
          'HTTP_REDIRECT_LIMIT',
          `Too many redirects for "${input.url}". Maximum allowed redirects: ${maxRedirects}.`,
          { finalUrl: nextUrl, redirects },
        )
      }

      currentUrl = nextUrl
      continue
    }

    const body = await readResponseBody(response.value, maxBodyBytes)

    return {
      url: input.url,
      finalUrl: currentUrl,
      status: response.value.status,
      ok: response.value.ok,
      contentType: response.value.headers.get('content-type') ?? '',
      headers: response.value.headers,
      text: body.text,
      redirects,
      truncated: body.truncated,
    }
  }
}

type FetchOnceResult =
  | { ok: true; value: Response }
  | { ok: false; error: HttpError }

async function fetchOnce(url: string, input: FetchTextOptions): Promise<FetchOnceResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: input.accept ?? DEFAULT_ACCEPT_HEADER,
        'User-Agent': '@index-ai/validator/0.1',
      },
      redirect: 'manual',
      signal: controller.signal,
    })

    return { ok: true, value: response }
  }
  catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        error: {
          code: 'HTTP_TIMEOUT',
          message: `Request timed out after ${input.timeoutMs} ms while fetching "${url}". Increase --timeout or verify the endpoint responds promptly.`,
        },
      }
    }

    return {
      ok: false,
      error: {
        code: 'HTTP_NETWORK_ERROR',
        message: `Network error while fetching "${url}": ${formatUnknownError(error)}.`,
      },
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

function getRedirectLocation(response: Response): string | null {
  if (!REDIRECT_STATUS_CODES.has(response.status)) {
    return null
  }

  return response.headers.get('location')
}

function resolveRedirectUrl(location: string, currentUrl: string): string {
  try {
    return resolveUrl(location, currentUrl)
  }
  catch {
    return location
  }
}

function getPrivateHostError(
  input: FetchTextOptions,
  hostname: string,
): HttpError | null {
  const allowPrivateHosts = input.allowPrivateHosts ?? false
  const targetIsLocal = input.targetHost ? isLocalhost(input.targetHost) : false

  if (allowPrivateHosts || targetIsLocal || !isPrivateHostname(hostname)) {
    return null
  }

  return {
    code: 'HTTP_PRIVATE_HOST_BLOCKED',
    message: `Blocked private host "${hostname}" while fetching "${input.url}". Use --allow-private-hosts only for trusted local development targets.`,
  }
}

async function readResponseBody(
  response: Response,
  maxBodyBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    return { text: '', truncated: false }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''

  for (;;) {
    const readResult = await reader.read()

    if (readResult.done) {
      text += decoder.decode()
      return { text, truncated: false }
    }

    const chunk = readResult.value
    const remainingBytes = maxBodyBytes - bytesRead

    if (chunk.byteLength > remainingBytes) {
      if (remainingBytes > 0) {
        text += decoder.decode(chunk.slice(0, remainingBytes))
      }

      await reader.cancel()
      return { text, truncated: true }
    }

    bytesRead += chunk.byteLength
    text += decoder.decode(chunk, { stream: true })
  }
}

function failedHttpResult(
  url: string,
  code: HttpErrorCode,
  message: string,
  options?: {
    finalUrl?: string
    redirects?: string[]
  },
): HttpResult {
  return {
    url,
    finalUrl: options?.finalUrl ?? url,
    status: 0,
    ok: false,
    contentType: '',
    headers: new Headers(),
    text: '',
    redirects: options?.redirects ?? [],
    truncated: false,
    error: { code, message },
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
