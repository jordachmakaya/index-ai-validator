import { CHECK } from '../constants'
import { fetchTextWithPolicy, type HttpResult } from '../http'
import type { RequirementKind, Severity, ValidationCheck, ValidatorOptions } from '../types'

const MANIFEST_PATH = '/.well-known/index-ai.json'

export async function validateDiscovery(options: ValidatorOptions): Promise<ValidationCheck[]> {
  const targetHost = new URL(options.target).hostname
  const [homeResponse, robotsResponse, llmsResponse] = await Promise.all([
    fetchTextWithPolicy({
      url: new URL('/', options.target).toString(),
      timeoutMs: options.timeoutMs,
      allowPrivateHosts: options.allowPrivateHosts,
      targetHost,
      accept: 'text/html,*/*',
    }),
    fetchTextWithPolicy({
      url: new URL('/robots.txt', options.target).toString(),
      timeoutMs: options.timeoutMs,
      allowPrivateHosts: options.allowPrivateHosts,
      targetHost,
      accept: 'text/plain,*/*',
    }),
    fetchTextWithPolicy({
      url: new URL('/llms.txt', options.target).toString(),
      timeoutMs: options.timeoutMs,
      allowPrivateHosts: options.allowPrivateHosts,
      targetHost,
      accept: 'text/plain,*/*',
    }),
  ])

  return [
    ...createHomeDiscoveryChecks(homeResponse),
    createRobotsCheck(robotsResponse),
    ...createLlmsTxtChecks(llmsResponse),
  ]
}

function createHomeDiscoveryChecks(response: HttpResult): ValidationCheck[] {
  if (!response.ok) {
    const details = createHttpFailureDetails(response)

    return [
      createCheck({
        code: CHECK.DISCOVERY_HTTP_LINK_HEADER,
        severity: 'warn',
        requirement: 'should',
        message: 'The homepage could not be fetched to inspect the HTTP Link discovery hint.',
        url: response.finalUrl,
        details,
        fix: 'Serve the homepage successfully and include a Link header with rel="agent-manifest".',
      }),
      createCheck({
        code: CHECK.DISCOVERY_HTML_LINK,
        severity: 'warn',
        requirement: 'should',
        message: 'The homepage could not be fetched to inspect the HTML agent-manifest link.',
        url: response.finalUrl,
        details,
        fix: 'Serve the homepage successfully and add <link rel="agent-manifest" href="/.well-known/index-ai.json"> in the head.',
      }),
    ]
  }

  return [
    createHttpLinkHeaderCheck(response),
    createHtmlLinkCheck(response),
  ]
}

function createHttpLinkHeaderCheck(response: HttpResult): ValidationCheck {
  const linkHeader = response.headers.get('link') ?? ''

  if (hasAiIndexLinkHeader(linkHeader)) {
    return createCheck({
      code: CHECK.DISCOVERY_HTTP_LINK_HEADER,
      severity: 'pass',
      requirement: 'should',
      message: 'The homepage HTTP Link header advertises rel="agent-manifest".',
      url: response.finalUrl,
      details: { link_header: linkHeader },
    })
  }

  return createCheck({
    code: CHECK.DISCOVERY_HTTP_LINK_HEADER,
    severity: 'warn',
    requirement: 'should',
    message: 'The homepage HTTP Link header does not advertise rel="agent-manifest".',
    url: response.finalUrl,
    fix: 'Add a Link header such as </.well-known/index-ai.json>; rel="agent-manifest"; type="application/json".',
  })
}

function createHtmlLinkCheck(response: HttpResult): ValidationCheck {
  if (hasAiIndexHtmlLink(response.text)) {
    return createCheck({
      code: CHECK.DISCOVERY_HTML_LINK,
      severity: 'pass',
      requirement: 'should',
      message: 'The homepage HTML contains a rel="agent-manifest" link.',
      url: response.finalUrl,
    })
  }

  return createCheck({
    code: CHECK.DISCOVERY_HTML_LINK,
    severity: 'warn',
    requirement: 'should',
    message: 'The homepage HTML does not contain a rel="agent-manifest" link.',
    url: response.finalUrl,
    fix: 'Add <link rel="agent-manifest" href="/.well-known/index-ai.json" type="application/json"> to the homepage head.',
  })
}

function createRobotsCheck(response: HttpResult): ValidationCheck {
  if (!response.ok) {
    return createCheck({
      code: CHECK.DISCOVERY_ROBOTS_AI_INDEX,
      severity: 'warn',
      requirement: 'should',
      message: 'robots.txt could not be fetched for the Agent-Manifest discovery hint.',
      url: response.finalUrl,
      details: createHttpFailureDetails(response),
      fix: 'Serve /robots.txt and include Agent-Manifest: /.well-known/index-ai.json as a discovery hint.',
    })
  }

  if (hasRobotsAiIndex(response.text)) {
    return createCheck({
      code: CHECK.DISCOVERY_ROBOTS_AI_INDEX,
      severity: 'pass',
      requirement: 'should',
      message: 'robots.txt contains an Agent-Manifest discovery hint.',
      url: response.finalUrl,
    })
  }

  return createCheck({
    code: CHECK.DISCOVERY_ROBOTS_AI_INDEX,
    severity: 'warn',
    requirement: 'should',
    message: 'robots.txt does not contain an Agent-Manifest discovery hint.',
    url: response.finalUrl,
    fix: 'Add Agent-Manifest: /.well-known/index-ai.json to robots.txt as a discovery hint.',
  })
}

function createLlmsTxtChecks(response: HttpResult): ValidationCheck[] {
  if (!response.ok) {
    const details = createHttpFailureDetails(response)

    return [
      createCheck({
        code: CHECK.DISCOVERY_LLMS_TXT_CONTENT_TYPE,
        severity: 'warn',
        requirement: 'should',
        message: '/llms.txt could not be fetched to inspect its content type.',
        url: response.finalUrl,
        details,
        fix: 'Serve /llms.txt as text/plain; charset=utf-8.',
      }),
      createCheck({
        code: CHECK.DISCOVERY_LLMS_TXT_BRIDGE,
        severity: 'warn',
        requirement: 'should',
        message: '/llms.txt could not be fetched to inspect the Agent-Manifest bridge.',
        url: response.finalUrl,
        details,
        fix: 'Serve /llms.txt and reference /.well-known/index-ai.json from it.',
      }),
    ]
  }

  return [
    createLlmsTxtContentTypeCheck(response),
    createLlmsTxtBridgeCheck(response),
  ]
}

function createLlmsTxtContentTypeCheck(response: HttpResult): ValidationCheck {
  if (isPlainTextContentType(response.contentType)) {
    return createCheck({
      code: CHECK.DISCOVERY_LLMS_TXT_CONTENT_TYPE,
      severity: 'pass',
      requirement: 'should',
      message: '/llms.txt is served as plain text.',
      url: response.finalUrl,
      details: { content_type: response.contentType },
    })
  }

  return createCheck({
    code: CHECK.DISCOVERY_LLMS_TXT_CONTENT_TYPE,
    severity: 'warn',
    requirement: 'should',
    message: '/llms.txt is not served as plain text.',
    url: response.finalUrl,
    details: { content_type: response.contentType },
    fix: 'Serve /llms.txt with Content-Type: text/plain; charset=utf-8.',
  })
}

function createLlmsTxtBridgeCheck(response: HttpResult): ValidationCheck {
  if (hasLlmsTxtBridge(response.text)) {
    return createCheck({
      code: CHECK.DISCOVERY_LLMS_TXT_BRIDGE,
      severity: 'pass',
      requirement: 'should',
      message: '/llms.txt references the AI Manifest.',
      url: response.finalUrl,
    })
  }

  return createCheck({
    code: CHECK.DISCOVERY_LLMS_TXT_BRIDGE,
    severity: 'warn',
    requirement: 'should',
    message: '/llms.txt does not reference the AI Manifest.',
    url: response.finalUrl,
    fix: 'Add an Agent-Manifest entry that references /.well-known/index-ai.json.',
  })
}

function hasAiIndexLinkHeader(value: string): boolean {
  return /rel=(?:"agent-manifest"|'agent-manifest'|agent-manifest)/i.test(value)
    && value.includes(MANIFEST_PATH)
}

function hasAiIndexHtmlLink(value: string): boolean {
  return /<link\b(?=[^>]*\brel=["']agent-manifest["'])(?=[^>]*\bhref=["'][^"']*index-ai\.json["'])[^>]*>/i.test(value)
}

function hasRobotsAiIndex(value: string): boolean {
  return /^Agent-Manifest:\s*(?:https?:\/\/\S+)?\/\.well-known\/index-ai\.json\s*$/im.test(value)
}

function hasLlmsTxtBridge(value: string): boolean {
  return value.includes(MANIFEST_PATH) || /^-?\s*Agent-Manifest:/im.test(value)
}

function isPlainTextContentType(contentType: string): boolean {
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''

  return mediaType === 'text/plain'
}

function createHttpFailureDetails(response: HttpResult): Record<string, unknown> {
  const details: Record<string, unknown> = {
    status: response.status,
    final_url: response.finalUrl,
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
  url: string
  details?: Record<string, unknown>
  fix?: string | undefined
}): ValidationCheck {
  const check: ValidationCheck = {
    code: input.code,
    severity: input.severity,
    requirement: input.requirement,
    message: input.message,
    url: input.url,
  }

  if (input.details) {
    check.details = input.details
  }

  if (input.fix) {
    check.fix = input.fix
  }

  return check
}
