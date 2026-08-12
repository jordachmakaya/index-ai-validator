import { createHash } from 'node:crypto'

import { CHECK } from '../constants'
import { fetchTextWithPolicy, type HttpResult } from '../http'
import { validateGraphSchema, type SchemaValidationError } from '../schemas'
import type { SecurityResource } from './security'
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
  cleanEndpoints?: SecurityResource[]
  checks: ValidationCheck[]
}

type NodeValidationResult = {
  checks: ValidationCheck[]
  cleanEndpoints: SecurityResource[]
}

export async function validateGraph(
  options: ValidatorOptions,
  manifest: IndexAiManifest,
): Promise<GraphValidationResult> {
  const agentIndex = manifest.access?.agent_index

  if (!agentIndex) {
    return {
      checks: [
        createCheck({
          code: CHECK.L2A_AGENT_INDEX_DECLARED,
          severity: manifest.level === 'level-2a' ? 'fail' : 'warn',
          requirement: manifest.level === 'level-2a' ? 'must' : 'should',
          message: manifest.level === 'level-2a'
            ? 'The manifest declares Level 2a but does not declare access.agent_index.'
            : 'The manifest does not declare an Agent Index graph.',
          fix: 'Declare access.agent_index when the site intends to provide Level 2a graph validation.',
        }),
      ],
    }
  }

  const target = normalizeTarget(options.target)
  const graphUrl = resolveUrl(agentIndex, target)
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
      code: CHECK.L2A_AGENT_INDEX_DECLARED,
      severity: 'pass',
      requirement: 'must',
      message: 'The manifest declares access.agent_index.',
      url: graphUrl,
    }),
  ]

  if (!graphResponse.ok) {
    checks.push(
      createCheck({
        code: CHECK.L2A_AGENT_INDEX_FOUND,
        severity: 'fail',
        requirement: 'must',
        message: 'The declared Agent Index graph could not be fetched.',
        url: graphUrl,
        details: createHttpFailureDetails(graphResponse),
        fix: 'Serve a reachable JSON Agent Index graph at the access.agent_index URL.',
      }),
    )

    return { graphUrl, checks }
  }

  checks.push(
    createCheck({
      code: CHECK.L2A_AGENT_INDEX_FOUND,
      severity: 'pass',
      requirement: 'must',
      message: 'The declared Agent Index graph was fetched.',
      url: graphUrl,
      details: { status: graphResponse.status },
    }),
  )
  checks.push(createGraphContentTypeCheck(graphResponse, graphUrl))

  const parsedJson = parseJson(graphResponse.text)

  if (!parsedJson.ok) {
    checks.push(
      createCheck({
        code: CHECK.L2A_AGENT_INDEX_JSON_VALID,
        severity: 'fail',
        requirement: 'must',
        message: 'The Agent Index graph response is not valid JSON.',
        url: graphUrl,
        details: { error: parsedJson.message },
        fix: 'Return syntactically valid JSON from the Agent Index graph URL.',
      }),
    )

    return { graphUrl, checks }
  }

  checks.push(
    createCheck({
      code: CHECK.L2A_AGENT_INDEX_JSON_VALID,
      severity: 'pass',
      requirement: 'must',
      message: 'The Agent Index graph response is valid JSON.',
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
      code: CHECK.L2A_AGENT_INDEX_SCHEMA_VALID,
      severity: 'pass',
      requirement: 'must',
      message: 'The Agent Index graph matches the Level 2a graph schema.',
      url: graphUrl,
    }),
  )
  checks.push(createTotalNodesCheck(schemaResult.graph, graphUrl))

  const nodeResult = await validateGraphNodes({
    graph: schemaResult.graph,
    options,
    target,
    targetHost,
  })

  checks.push(...nodeResult.checks)
  checks.push(...validateGraphRelations(schemaResult.graph, graphUrl))

  return {
    graph: schemaResult.graph,
    graphUrl,
    cleanEndpoints: nodeResult.cleanEndpoints,
    checks,
  }
}

function createGraphContentTypeCheck(response: HttpResult, url: string): ValidationCheck {
  if (isJsonContentType(response.contentType)) {
    return createCheck({
      code: CHECK.L2A_AGENT_INDEX_CONTENT_TYPE,
      severity: 'pass',
      requirement: 'must',
      message: 'The Agent Index graph is served with a JSON content type.',
      url,
      details: { content_type: response.contentType },
    })
  }

  return createCheck({
    code: CHECK.L2A_AGENT_INDEX_CONTENT_TYPE,
    severity: 'fail',
    requirement: 'must',
    message: 'The Agent Index graph is not served with a JSON content type.',
    url,
    details: { content_type: response.contentType },
    fix: 'Serve the Agent Index graph with Content-Type: application/json; charset=utf-8.',
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
      message: 'The Agent Index graph does not use the deprecated pages array.',
      url,
    })
  }

  return createCheck({
    code: CHECK.L2A_NO_PAGES_ARRAY,
    severity: 'fail',
    requirement: 'must',
    message: 'The Agent Index graph uses the deprecated pages array.',
    url,
    fix: 'Replace the deprecated pages array with a nodes array.',
  })
}

function createSchemaFailureCheck(
  url: string,
  errors: readonly SchemaValidationError[],
): ValidationCheck {
  return createCheck({
    code: CHECK.L2A_AGENT_INDEX_SCHEMA_VALID,
    severity: 'fail',
    requirement: 'must',
    message: 'The Agent Index graph does not match the Level 2a graph schema.',
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
        ? 'The Agent Index graph omits total_nodes; node count was derived from nodes.'
        : 'The Agent Index total_nodes value matches the nodes array length.',
      url,
      details: { declared, actual },
    })
  }

  return createCheck({
    code: CHECK.L2A_TOTAL_NODES_MATCH,
    severity: 'warn',
    requirement: 'should',
    message: 'The Agent Index total_nodes value does not match the nodes array length.',
    url,
    details: { declared, actual },
    fix: 'Set total_nodes to the number of entries in nodes.',
  })
}

type RelationsEdge = {
  readonly parent: string
  readonly child: string
}

type BidirectionalResult = {
  readonly validPairCount: number
  readonly inconsistentPairs: readonly RelationsEdge[]
}

/**
 * Graph-level Level 2b DAG structural validation (T5.29), driven by the
 * optional node-level `relations` field. Only runs at all if at least one
 * node in the graph declares `relations` — a pure Level 2a graph (no node
 * declares it) must emit zero `L2B_GRAPH_*` checks, so existing L2a-only
 * integrations stay unaffected.
 */
function validateGraphRelations(graph: AiGraph, url: string): ValidationCheck[] {
  const nodes = graph.nodes ?? []
  const hasRelations = nodes.some((node) => node.relations !== undefined)

  if (!hasRelations) {
    return []
  }

  const nodeIds = new Set<string>()
  const nodesById = new Map<string, AiGraphNode>()

  for (const node of nodes) {
    if (node.id !== undefined) {
      nodeIds.add(node.id)
      nodesById.set(node.id, node)
    }
  }

  const bidirectional = computeBidirectionalConsistency(nodes, nodesById)
  const orphanIds = computeOrphanIds(nodes, nodeIds)
  const cycleIds = computeCycle(nodes, nodeIds)

  return [
    createRootExistsCheck(nodes, url),
    createRelationPairExistsCheck(bidirectional.validPairCount, url),
    createBidirectionalCheck(bidirectional.inconsistentPairs, url),
    createAcyclicCheck(cycleIds, url),
    createNoOrphansCheck(orphanIds, url),
  ]
}

function createRootExistsCheck(nodes: readonly AiGraphNode[], url: string): ValidationCheck {
  const rootIds = nodes
    .filter((node) => node.relations?.parent === null)
    .map((node) => node.id)
    .filter((id): id is string => id !== undefined)

  if (rootIds.length > 0) {
    return createCheck({
      code: CHECK.L2B_GRAPH_ROOT_EXISTS,
      severity: 'pass',
      requirement: 'must',
      message: 'The graph declares at least one root node (relations.parent: null).',
      url,
      details: { root_ids: rootIds },
    })
  }

  return createCheck({
    code: CHECK.L2B_GRAPH_ROOT_EXISTS,
    severity: 'fail',
    requirement: 'must',
    message: 'The graph does not declare any root node with relations.parent explicitly set to null.',
    url,
    fix: 'Set relations.parent to null on the node that has no parent in the DAG.',
  })
}

/**
 * A parent/child pair is bidirectionally consistent only when BOTH
 * directions agree: the parent's relations.children lists the child, AND
 * the child's relations.parent points back to the parent. Checking only the
 * forward direction (walking each node's own relations.children) misses a
 * node that fabricates a relations.parent claim which the named parent never
 * reciprocates — that asymmetric edge is only reachable by also walking the
 * reverse direction (each node's relations.parent). Candidate pairs are
 * gathered from both directions into one deduped map (keyed by
 * `${parent}::${child}`) before being judged, so a pair referenced from only
 * one side is still evaluated, and a pair referenced from both sides is
 * judged — and reported, if inconsistent — exactly once.
 */
function computeBidirectionalConsistency(
  nodes: readonly AiGraphNode[],
  nodesById: ReadonlyMap<string, AiGraphNode>,
): BidirectionalResult {
  const candidatePairs = new Map<string, RelationsEdge>()

  for (const node of nodes) {
    const parentId = node.id

    if (parentId === undefined) {
      continue
    }

    for (const childId of node.relations?.children ?? []) {
      candidatePairs.set(`${parentId}::${childId}`, { parent: parentId, child: childId })
    }
  }

  for (const node of nodes) {
    const childId = node.id
    const parentId = node.relations?.parent

    if (childId === undefined || parentId === undefined || parentId === null) {
      continue
    }

    candidatePairs.set(`${parentId}::${childId}`, { parent: parentId, child: childId })
  }

  let validPairCount = 0
  const inconsistentPairs: RelationsEdge[] = []

  for (const edge of candidatePairs.values()) {
    const parentNode = nodesById.get(edge.parent)
    const childNode = nodesById.get(edge.child)
    const forwardOk = parentNode?.relations?.children?.includes(edge.child) ?? false
    const reverseOk = childNode?.relations?.parent === edge.parent

    if (forwardOk && reverseOk) {
      validPairCount += 1
    }
    else {
      inconsistentPairs.push(edge)
    }
  }

  return { validPairCount, inconsistentPairs }
}

function createRelationPairExistsCheck(validPairCount: number, url: string): ValidationCheck {
  if (validPairCount > 0) {
    return createCheck({
      code: CHECK.L2B_GRAPH_RELATION_PAIR_EXISTS,
      severity: 'pass',
      requirement: 'must',
      message: 'The graph declares at least one bidirectionally consistent parent/children relation pair.',
      url,
      details: { valid_pair_count: validPairCount },
    })
  }

  return createCheck({
    code: CHECK.L2B_GRAPH_RELATION_PAIR_EXISTS,
    severity: 'fail',
    requirement: 'must',
    message: 'The graph does not declare any bidirectionally consistent parent/children relation pair.',
    url,
    fix: 'Declare at least one node whose relations.children entry points to a node that declares relations.parent back to it.',
  })
}

function createBidirectionalCheck(
  inconsistentPairs: readonly RelationsEdge[],
  url: string,
): ValidationCheck {
  if (inconsistentPairs.length === 0) {
    return createCheck({
      code: CHECK.L2B_GRAPH_BIDIRECTIONAL,
      severity: 'pass',
      requirement: 'must',
      message: 'Every declared parent/children relation is bidirectionally consistent.',
      url,
    })
  }

  return createCheck({
    code: CHECK.L2B_GRAPH_BIDIRECTIONAL,
    severity: 'fail',
    requirement: 'must',
    message: 'Some declared children do not point relations.parent back to the node that declares them.',
    url,
    details: { inconsistent_pairs: inconsistentPairs },
    fix: 'Set relations.parent on each child node to the id of the node that lists it in relations.children.',
  })
}

function computeOrphanIds(nodes: readonly AiGraphNode[], nodeIds: ReadonlySet<string>): readonly string[] {
  const orphanIds = new Set<string>()

  for (const node of nodes) {
    const referencedIds: readonly string[] = [
      ...(node.relations?.children ?? []),
      ...(node.relations?.related ?? []),
    ]

    for (const id of referencedIds) {
      if (!nodeIds.has(id)) {
        orphanIds.add(id)
      }
    }
  }

  return [...orphanIds]
}

function createNoOrphansCheck(orphanIds: readonly string[], url: string): ValidationCheck {
  if (orphanIds.length === 0) {
    return createCheck({
      code: CHECK.L2B_GRAPH_NO_ORPHANS,
      severity: 'pass',
      requirement: 'must',
      message: 'Every id referenced in relations.children or relations.related exists in the graph.',
      url,
    })
  }

  return createCheck({
    code: CHECK.L2B_GRAPH_NO_ORPHANS,
    severity: 'fail',
    requirement: 'must',
    message: 'Some ids referenced in relations.children or relations.related do not exist in the graph.',
    url,
    details: { orphan_ids: orphanIds },
    fix: 'Remove the dangling reference, or add the missing node to the graph.',
  })
}

/**
 * Builds a directed edge set from both relations.children (parent -> child)
 * and relations.parent (parent -> this node, so a cycle expressed purely
 * through parent pointers is still caught even without a matching children
 * entry) and runs a DFS cycle detector over it. Edges referencing an id
 * absent from the graph are simply never visited here (orphan detection is a
 * separate check).
 */
function computeCycle(
  nodes: readonly AiGraphNode[],
  nodeIds: ReadonlySet<string>,
): readonly string[] | undefined {
  const adjacency = new Map<string, Set<string>>()

  const addEdge = (from: string, to: string): void => {
    const existing = adjacency.get(from)

    if (existing) {
      existing.add(to)
    }
    else {
      adjacency.set(from, new Set([to]))
    }
  }

  for (const node of nodes) {
    const id = node.id

    if (id === undefined) {
      continue
    }

    for (const childId of node.relations?.children ?? []) {
      addEdge(id, childId)
    }

    const parentId = node.relations?.parent

    if (parentId !== undefined && parentId !== null) {
      addEdge(parentId, id)
    }
  }

  return findCycle([...nodeIds], adjacency)
}

type NodeColor = 'white' | 'gray' | 'black'

/**
 * Classic DFS cycle detector using a three-color scheme: white (unvisited),
 * gray (on the current recursion stack), black (fully explored). A back edge
 * to a gray node means the current DFS stack, from that node onward, forms
 * the cycle — generalizes to cycles of any length, not just direct 2-node
 * mutual references.
 */
function findCycle(
  nodeIds: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): readonly string[] | undefined {
  const colors = new Map<string, NodeColor>(nodeIds.map((id) => [id, 'white'] as const))
  const stack: string[] = []

  const visit = (id: string): readonly string[] | undefined => {
    colors.set(id, 'gray')
    stack.push(id)

    for (const neighbor of adjacency.get(id) ?? []) {
      const neighborColor = colors.get(neighbor)

      if (neighborColor === 'gray') {
        const cycleStart = stack.indexOf(neighbor)
        return stack.slice(cycleStart)
      }

      if (neighborColor === 'white') {
        const found = visit(neighbor)

        if (found) {
          return found
        }
      }
    }

    colors.set(id, 'black')
    stack.pop()

    return undefined
  }

  for (const id of nodeIds) {
    if (colors.get(id) === 'white') {
      const found = visit(id)

      if (found) {
        return found
      }
    }
  }

  return undefined
}

function createAcyclicCheck(cycleIds: readonly string[] | undefined, url: string): ValidationCheck {
  if (cycleIds === undefined) {
    return createCheck({
      code: CHECK.L2B_GRAPH_ACYCLIC,
      severity: 'pass',
      requirement: 'must',
      message: 'The graph relations form an acyclic parent/children structure.',
      url,
    })
  }

  return createCheck({
    code: CHECK.L2B_GRAPH_ACYCLIC,
    severity: 'fail',
    requirement: 'must',
    message: 'A cycle was detected in the graph relations.',
    url,
    details: { cycle_ids: cycleIds },
    fix: 'Break the cycle by removing or correcting one of the parent/children relations involved.',
  })
}

async function validateGraphNodes(input: {
  graph: AiGraph
  options: ValidatorOptions
  target: string
  targetHost: string
}): Promise<NodeValidationResult> {
  const nodes = input.graph.nodes ?? []
  const groupedResults = await runWithConcurrency(
    nodes,
    input.options.maxConcurrency,
    (node) => validateGraphNode({
      node,
      options: input.options,
      target: input.target,
      targetHost: input.targetHost,
    }),
  )

  return {
    checks: groupedResults.flatMap((result) => result.checks),
    cleanEndpoints: groupedResults.flatMap((result) => result.cleanEndpoints),
  }
}

async function validateGraphNode(input: {
  node: AiGraphNode
  options: ValidatorOptions
  target: string
  targetHost: string
}): Promise<NodeValidationResult> {
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

    return { checks, cleanEndpoints: [] }
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

    return { checks, cleanEndpoints: [] }
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

  const contentSha256Check = createContentSha256Check(input.node, response.text, cleanUrl, nodeId)

  if (contentSha256Check) {
    checks.push(contentSha256Check)
  }

  const contentVersionCheck = createContentVersionCheck(input.node, nodeId)

  if (contentVersionCheck) {
    checks.push(contentVersionCheck)
  }

  return {
    checks,
    cleanEndpoints: [
      {
        source: cleanUrl,
        text: response.text,
        nodeId,
      },
    ],
  }
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

function createContentSha256Check(
  node: AiGraphNode,
  body: string,
  url: string,
  nodeId: string,
): ValidationCheck | undefined {
  const mode = node.content?.content_chars_mode ?? 'exact'
  const declared = node.content?.content_sha256

  if (mode !== 'exact' || declared === undefined) {
    return undefined
  }

  const measured = createHash('sha256').update(body.normalize('NFC'), 'utf8').digest('hex')

  if (measured.toLowerCase() === declared.toLowerCase()) {
    return createNodeCheck({
      code: CHECK.L2A_CONTENT_SHA256_MATCH,
      severity: 'pass',
      requirement: 'must',
      message: 'The clean endpoint content_sha256 value matches the fetched content.',
      nodeId,
      url,
      details: { declared, measured },
    })
  }

  return createNodeCheck({
    code: CHECK.L2A_CONTENT_SHA256_MATCH,
    severity: 'fail',
    requirement: 'must',
    message: 'content drift — declared content_sha256 does not match content served at llm_url',
    nodeId,
    url,
    details: { declared, measured },
    fix: 'Update content_sha256 to match the current clean endpoint body, or update the served content.',
  })
}

function createContentVersionCheck(node: AiGraphNode, nodeId: string): ValidationCheck | undefined {
  const version = node.content?.content_version

  if (version === undefined || typeof version === 'string') {
    return undefined
  }

  return createNodeCheck({
    code: CHECK.L2A_CONTENT_VERSION_TYPE,
    severity: 'warn',
    requirement: 'should',
    message: 'The clean endpoint content_version value should be a string.',
    nodeId,
    details: { content_version: version },
    fix: 'Set content_version to a string identifier, such as a git hash or semantic version.',
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
