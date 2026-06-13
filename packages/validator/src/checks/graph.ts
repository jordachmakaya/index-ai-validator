import { CHECK } from '../constants'
import { fetchTextWithPolicy, type HttpResult } from '../http'
import { validateGraphSchema, type SchemaValidationError } from '../schemas'
import type {
  AiGraph,
  AiGraphNode,
  IndexAiManifest,
  RequirementKind,
  Severity,
  ValidationCheck,
  ValidatorOptions,
} from '../types'
import { countContentChars } from '../utils/content-chars'
import { detectHtmlLeak } from '../utils/html'
import { runWithConcurrency } from '../utils/semaphore'
import { normalizeTarget, resolveUrl } from '../utils/url'
import { isJsonContentType } from './manifest'

type JsonParseResult =
  | {
    ok: true
    value: unknown
  }
  | {
    ok: false
    message: string
  }

export type GraphValidationResult = {
  graph?: AiGraph
  graphUrl?: string
  checks: ValidationCheck[]
}

export async function validateGraph(
  options: ValidatorOptions,
  manifest: IndexAiManifest,
): Promise<GraphValidationResult> {
  const shadowLayer = manifest.access?.shadow_layer

  if (!shadowLayer) {
    return {
      checks: [
        createCheck({
          code: CHECK.L2A_SHADOW_DECLARED,
          severity: manifest.level === 'level-2a' ? 'fail' : 'warn',
          requirement: manifest.level === 'level-2a' ? 'must' : 'should',
          message: manifest.level === 'level-2a'
            ? 'The manifest declares Level 2a but does not declare access.shadow_layer.'
            : 'The manifest does not declare a Shadow Index graph.',
          fix: 'Declare access.shadow_layer when the site intends to provide Level 2a graph validation.',
        }),
      ],
    }
  }

  const target = normalizeTarget(options.target)
  const graphUrl = resolveUrl(shadowLayer, target)
  const targetHost = new URL(target).hostname
  const graphResponse = await fetchTextWithPolicy({
    url: graphUrl,
    timeoutMs: options.timeoutMs,
    allowPrivateHosts: options.allowPrivateHosts,
    targetHost,
    accept: 'application/json',
    maxBodyBytes: 2 * 1024 * 1024,
  })
  const checks: ValidationCheck[] = [
    createCheck({
      code: CHECK.L2A_SHADOW_DECLARED,
      severity: 'pass',
      requirement: 'must',
      message: 'The manifest declares access.shadow_layer.',
      url: graphUrl,
    }),
  ]

  if (!graphResponse.ok) {
    checks.push(
      createCheck({
        code: CHECK.L2A_SHADOW_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'The declared Shadow Index graph could not be fetched.',
        url: graphUrl,
        details: createHttpFailureDetails(graphResponse),
        fix: 'Serve a reachable JSON Shadow Index graph at the access.shadow_layer URL.',
      }),
    )

    return { graphUrl, checks }
  }

  checks.push(
    createCheck({
      code: CHECK.L2A_SHADOW_FOUND,
      severity: 'pass',
      requirement: 'must',
      message: 'The declared Shadow Index graph was fetched.',
      url: graphUrl,
      details: { status: graphResponse.status },
    }),
  )
  checks.push(createGraphContentTypeCheck(graphResponse, graphUrl))

  const parsedJson = parseJson(graphResponse.text)

  if (!parsedJson.ok) {
    checks.push(
      createCheck({
        code: CHECK.L2A_SHADOW_JSON_VALID,
        severity: 'fail',
        requirement: 'must',
        message: 'The Shadow Index graph response is not valid JSON.',
        url: graphUrl,
        details: { error: parsedJson.message },
        fix: 'Return syntactically valid JSON from the Shadow Index graph URL.',
      }),
    )

    return { graphUrl, checks }
  }

  checks.push(
    createCheck({
      code: CHECK.L2A_SHADOW_JSON_VALID,
      severity: 'pass',
      requirement: 'must',
      message: 'The Shadow Index graph response is valid JSON.',
      url: graphUrl,
    }),
  )
  checks.push(createNoPagesArrayCheck(parsedJson.value, graphUrl))

  const schemaResult = validateGraphSchema(parsedJson.value)

  if (!schemaResult.valid) {
    checks.push(createSchemaFailureCheck(graphUrl, schemaResult.errors))
    return { graphUrl, checks }
  }

  checks.push(
    createCheck({
      code: CHECK.L2A_SHADOW_SCHEMA_VALID,
      severity: 'pass',
      requirement: 'must',
      message: 'The Shadow Index graph matches the Level 2a graph schema.',
      url: graphUrl,
    }),
  )
  checks.push(createTotalNodesCheck(schemaResult.graph, graphUrl))

  const nodeChecks = await validateGraphNodes({
    graph: schemaResult.graph,
    options,
    target,
    targetHost,
  })

  checks.push(...nodeChecks)

  return {
    graph: schemaResult.graph,
    graphUrl,
    checks,
  }
}

function createGraphContentTypeCheck(response: HttpResult, url: string): ValidationCheck {
  if (isJsonContentType(response.contentType)) {
    return createCheck({
      code: CHECK.L2A_SHADOW_CONTENT_TYPE,
      severity: 'pass',
      requirement: 'must',
      message: 'The Shadow Index graph is served with a JSON content type.',
      url,
      details: { content_type: response.contentType },
    })
  }

  return createCheck({
    code: CHECK.L2A_SHADOW_CONTENT_TYPE,
    severity: 'fail',
    requirement: 'must',
    message: 'The Shadow Index graph is not served with a JSON content type.',
    url,
    details: { content_type: response.contentType },
    fix: 'Serve the Shadow Index graph with Content-Type: application/json; charset=utf-8.',
  })
}

function createNoPagesArrayCheck(input: unknown, url: string): ValidationCheck {
  const hasPagesArray = typeof input === 'object'
    && input !== null
    && Array.isArray((input as { pages?: unknown }).pages)

  if (!hasPagesArray) {
    return createCheck({
      code: CHECK.L2A_NO_PAGES_ARRAY,
      severity: 'pass',
      requirement: 'must',
      message: 'The Shadow Index graph does not use the deprecated pages array.',
      url,
    })
  }

  return createCheck({
    code: CHECK.L2A_NO_PAGES_ARRAY,
    severity: 'fail',
    requirement: 'must',
    message: 'The Shadow Index graph uses the deprecated pages array.',
    url,
    fix: 'Replace the deprecated pages array with a nodes array.',
  })
}

function createSchemaFailureCheck(
  url: string,
  errors: readonly SchemaValidationError[],
): ValidationCheck {
  return createCheck({
    code: CHECK.L2A_SHADOW_SCHEMA_VALID,
    severity: 'fail',
    requirement: 'must',
    message: 'The Shadow Index graph does not match the Level 2a graph schema.',
    url,
    details: { errors },
    fix: 'Add the required Level 2a graph fields, including nodes with clean endpoint metadata.',
  })
}

function createTotalNodesCheck(graph: AiGraph, url: string): ValidationCheck {
  const declared = graph.total_nodes
  const actual = graph.nodes?.length ?? 0

  if (declared === undefined || declared === actual) {
    return createCheck({
      code: CHECK.L2A_TOTAL_NODES_MATCH,
      severity: 'pass',
      requirement: 'should',
      message: declared === undefined
        ? 'The Shadow Index graph omits total_nodes; node count was derived from nodes.'
        : 'The Shadow Index total_nodes value matches the nodes array length.',
      url,
      details: { declared, actual },
    })
  }

  return createCheck({
    code: CHECK.L2A_TOTAL_NODES_MATCH,
    severity: 'warn',
    requirement: 'should',
    message: 'The Shadow Index total_nodes value does not match the nodes array length.',
    url,
    details: { declared, actual },
    fix: 'Set total_nodes to the number of entries in nodes.',
  })
}

async function validateGraphNodes(input: {
  graph: AiGraph
  options: ValidatorOptions
  target: string
  targetHost: string
}): Promise<ValidationCheck[]> {
  const nodes = input.graph.nodes ?? []
  const groupedChecks = await runWithConcurrency(
    nodes,
    input.options.maxConcurrency,
    (node) => validateGraphNode({
      node,
      options: input.options,
      target: input.target,
      targetHost: input.targetHost,
    }),
  )

  return groupedChecks.flat()
}

async function validateGraphNode(input: {
  node: AiGraphNode
  options: ValidatorOptions
  target: string
  targetHost: string
}): Promise<ValidationCheck[]> {
  const nodeId = input.node.id ?? '(unknown)'
  const llmUrl = input.node.content?.llm_url ?? ''
  const checks: ValidationCheck[] = []
  let cleanUrl: string

  try {
    cleanUrl = resolveUrl(llmUrl, input.target)
  }
  catch (error) {
    checks.push(
      createNodeCheck({
        code: CHECK.L2A_LLM_URL_PROTOCOL,
        severity: 'fail',
        requirement: 'must',
        message: 'The graph node llm_url is not an absolute or root-relative HTTP URL.',
        nodeId,
        details: {
          llm_url: llmUrl,
          error: error instanceof Error ? error.message : String(error),
        },
        fix: 'Use an http(s) URL or a root-relative path for content.llm_url.',
      }),
    )

    return checks
  }

  checks.push(
    createNodeCheck({
      code: CHECK.L2A_LLM_URL_PROTOCOL,
      severity: 'pass',
      requirement: 'must',
      message: 'The graph node llm_url resolves to an HTTP URL.',
      nodeId,
      url: cleanUrl,
      details: { llm_url: llmUrl },
    }),
  )

  const response = await fetchTextWithPolicy({
    url: cleanUrl,
    timeoutMs: input.options.timeoutMs,
    allowPrivateHosts: input.options.allowPrivateHosts,
    targetHost: input.targetHost,
    accept: 'text/markdown,text/plain,*/*',
    maxBodyBytes: 2 * 1024 * 1024,
  })

  if (!response.ok) {
    checks.push(
      createNodeCheck({
        code: CHECK.L2A_LLM_URL_FETCH,
        severity: 'fail',
        requirement: 'must',
        message: 'The graph node clean endpoint could not be fetched.',
        nodeId,
        url: cleanUrl,
        details: createHttpFailureDetails(response),
        fix: 'Serve a reachable text/markdown or text/plain clean endpoint at content.llm_url.',
      }),
    )

    return checks
  }

  checks.push(
    createNodeCheck({
      code: CHECK.L2A_LLM_URL_FETCH,
      severity: 'pass',
      requirement: 'must',
      message: 'The graph node clean endpoint was fetched.',
      nodeId,
      url: cleanUrl,
      details: { status: response.status },
    }),
  )
  checks.push(createCleanContentTypeCheck(response, cleanUrl, nodeId))
  checks.push(createHtmlLeakCheck(response.text, cleanUrl, nodeId))
  checks.push(createContentCharsCheck(input.node, response.text, cleanUrl, nodeId))

  return checks
}

function createCleanContentTypeCheck(
  response: HttpResult,
  url: string,
  nodeId: string,
): ValidationCheck {
  if (isCleanEndpointContentType(response.contentType)) {
    return createNodeCheck({
      code: CHECK.L2A_LLM_URL_CONTENT_TYPE,
      severity: 'pass',
      requirement: 'must',
      message: 'The graph node clean endpoint is served as markdown or plain text.',
      nodeId,
      url,
      details: { content_type: response.contentType },
    })
  }

  return createNodeCheck({
    code: CHECK.L2A_LLM_URL_CONTENT_TYPE,
    severity: 'fail',
    requirement: 'must',
    message: 'The graph node clean endpoint is not served as markdown or plain text.',
    nodeId,
    url,
    details: { content_type: response.contentType },
    fix: 'Serve clean endpoints with Content-Type: text/markdown or text/plain.',
  })
}

function createHtmlLeakCheck(body: string, url: string, nodeId: string): ValidationCheck {
  const leak = detectHtmlLeak(body)

  if (leak.kind === 'hard') {
    return createNodeCheck({
      code: CHECK.L2A_LLM_URL_HTML_LEAK,
      severity: 'fail',
      requirement: 'must',
      message: 'The clean endpoint contains hard HTML leakage.',
      nodeId,
      url,
      details: { evidence: leak.evidence },
      fix: 'Serve AI-readable markdown or plain text without document/layout HTML tags.',
    })
  }

  if (leak.kind === 'soft') {
    return createNodeCheck({
      code: CHECK.L2A_LLM_URL_HTML_LEAK,
      severity: 'warn',
      requirement: 'should',
      message: 'The clean endpoint contains tolerated inline HTML markup.',
      nodeId,
      url,
      details: { evidence: leak.evidence },
      fix: 'Prefer pure markdown or plain text where possible.',
    })
  }

  return createNodeCheck({
    code: CHECK.L2A_LLM_URL_HTML_LEAK,
    severity: 'pass',
    requirement: 'must',
    message: 'The clean endpoint does not contain hard HTML leakage.',
    nodeId,
    url,
  })
}

function createContentCharsCheck(
  node: AiGraphNode,
  body: string,
  url: string,
  nodeId: string,
): ValidationCheck {
  const declared = node.content?.content_chars ?? 0
  const measured = countContentChars(body)
  const mode = node.content?.content_chars_mode ?? 'exact'

  if (mode === 'max') {
    return createNodeCheck({
      code: CHECK.L2A_CONTENT_CHARS_MAX_VALID,
      severity: measured <= declared ? 'pass' : 'fail',
      requirement: 'must',
      message: measured <= declared
        ? 'The clean endpoint content_chars value is a valid maximum.'
        : 'The clean endpoint exceeds the declared content_chars maximum.',
      nodeId,
      url,
      details: { declared, measured, mode },
      fix: measured <= declared
        ? undefined
        : 'Increase content_chars or reduce the clean endpoint text length.',
    })
  }

  return createNodeCheck({
    code: CHECK.L2A_CONTENT_CHARS_EXACT_MATCH,
    severity: measured === declared ? 'pass' : 'fail',
    requirement: 'must',
    message: measured === declared
      ? 'The clean endpoint content_chars value matches exactly.'
      : 'The clean endpoint content_chars value does not match the fetched text.',
    nodeId,
    url,
    details: { declared, measured, mode },
    fix: measured === declared
      ? undefined
      : 'Set content_chars to the Unicode NFC code point count of the clean endpoint body.',
  })
}

function isCleanEndpointContentType(contentType: string): boolean {
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''

  return mediaType === 'text/markdown' || mediaType === 'text/plain'
}

function parseJson(text: string): JsonParseResult {
  try {
    return {
      ok: true,
      value: JSON.parse(text),
    }
  }
  catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
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

function createNodeCheck(input: {
  code: string
  severity: Severity
  requirement: RequirementKind
  message: string
  nodeId: string
  url?: string | undefined
  details?: Record<string, unknown>
  fix?: string | undefined
}): ValidationCheck {
  const details = {
    node_id: input.nodeId,
    ...(input.details ?? {}),
  }

  return createCheck({
    code: input.code,
    severity: input.severity,
    requirement: input.requirement,
    message: input.message,
    url: input.url,
    details,
    fix: input.fix,
  })
}

function createCheck(input: {
  code: string
  severity: Severity
  requirement: RequirementKind
  message: string
  url?: string | undefined
  details?: Record<string, unknown>
  fix?: string | undefined
}): ValidationCheck {
  const check: ValidationCheck = {
    code: input.code,
    severity: input.severity,
    requirement: input.requirement,
    message: input.message,
  }

  if (input.url) {
    check.url = input.url
  }

  if (input.details) {
    check.details = input.details
  }

  if (input.fix) {
    check.fix = input.fix
  }

  return check
}
