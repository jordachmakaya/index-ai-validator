import { CHECK } from '../constants'
import type { RequirementKind, Severity, ValidationCheck } from '../types'
import { stripMarkdownCode } from '../utils/html'

export type SecurityResource = {
  source: string
  text: string
  nodeId?: string
}

type SecurityPattern = {
  code: string
  label: string
  pattern: RegExp
}

const SECRET_VALUE_PATTERNS: readonly SecurityPattern[] = [
  { code: 'openai', label: 'Potential OpenAI API key', pattern: /sk-[a-zA-Z0-9_-]{20,}/ },
  { code: 'github', label: 'Potential GitHub token', pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { code: 'gitlab', label: 'Potential GitLab token', pattern: /glpat-[A-Za-z0-9_-]{20,}/ },
  { code: 'stripe', label: 'Potential Stripe key', pattern: /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}/ },
  { code: 'aws', label: 'Potential AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
  { code: 'google', label: 'Potential Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { code: 'private-key', label: 'Potential private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { code: 'jwt', label: 'Potential JWT token', pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/ },
  { code: 'password', label: 'Potential password assignment', pattern: /\b(password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/i },
]

const SENSITIVE_NAME_PATTERNS: readonly SecurityPattern[] = [
  { code: 'supabase-service-role-env', label: 'Sensitive Supabase service role variable-name reference', pattern: /\bSUPABASE_SERVICE_ROLE_KEY\b/i },
  { code: 'service-role-key', label: 'Sensitive service role variable-name reference', pattern: /\bservice[_-]?role[_-]?key\b/i },
]

const PRIVATE_INFRA_PATTERNS: readonly SecurityPattern[] = [
  { code: 'private-ipv4-10', label: 'Potential private IPv4 address', pattern: /\b10(?:\.\d{1,3}){3}\b/ },
  { code: 'private-ipv4-172', label: 'Potential private IPv4 address', pattern: /\b172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}\b/ },
  { code: 'private-ipv4-192', label: 'Potential private IPv4 address', pattern: /\b192\.168(?:\.\d{1,3}){2}\b/ },
  { code: 'localhost', label: 'Potential localhost/internal reference', pattern: /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i },
  { code: 'private-host', label: 'Potential private internal hostname', pattern: /\b[a-z0-9-]+\.(internal|local|lan)\b/i },
]

export function validateSecurity(input: {
  resources: readonly SecurityResource[]
  strictSecurity: boolean
}): ValidationCheck[] {
  return input.resources.flatMap((resource) => [
    ...createSecretPatternChecks(resource),
    ...createPrivateInfraChecks(resource, input.strictSecurity),
  ])
}

function createSecretPatternChecks(resource: SecurityResource): ValidationCheck[] {
  const outsideCode = stripMarkdownCode(resource.text)
  const outsideFindings = findPatternMatches(outsideCode, SECRET_VALUE_PATTERNS)

  if (outsideFindings.length > 0) {
    return outsideFindings.map((finding) =>
      createCheck({
        code: CHECK.SEC_SECRET_PATTERN,
        severity: 'fail',
        requirement: 'heuristic',
        message: `${finding.pattern.label} found in public AI-facing content.`,
        resource,
        details: {
          pattern: finding.pattern.code,
          evidence: redactEvidence(finding.evidence),
        },
        fix: 'Remove secrets, credentials, and token values from public AI-facing endpoints.',
      }))
  }

  const sensitiveNameFindings = findPatternMatches(outsideCode, SENSITIVE_NAME_PATTERNS)

  if (sensitiveNameFindings.length > 0) {
    return sensitiveNameFindings.map((finding) =>
      createCheck({
        code: CHECK.SEC_SECRET_PATTERN,
        severity: 'warn',
        requirement: 'heuristic',
        message: `${finding.pattern.label} found in public AI-facing content.`,
        resource,
        details: {
          pattern: finding.pattern.code,
          reference: finding.evidence,
        },
        fix: 'Avoid naming sensitive backend environment variables in public AI-facing content unless the reference is necessary.',
      }))
  }

  return [
    createCheck({
      code: CHECK.SEC_SECRET_PATTERN,
      severity: 'pass',
      requirement: 'heuristic',
      message: 'No obvious secret-shaped values were found in the public AI-facing content.',
      resource,
    }),
  ]
}

function createPrivateInfraChecks(
  resource: SecurityResource,
  strictSecurity: boolean,
): ValidationCheck[] {
  const outsideCode = stripMarkdownCode(resource.text)
  const findings = findPatternMatches(outsideCode, PRIVATE_INFRA_PATTERNS)

  if (findings.length > 0) {
    return findings.map((finding) =>
      createCheck({
        code: CHECK.SEC_PRIVATE_INFRA_PATTERN,
        severity: strictSecurity ? 'fail' : 'warn',
        requirement: 'heuristic',
        message: `${finding.pattern.label} found in public AI-facing content.`,
        resource,
        details: {
          pattern: finding.pattern.code,
          evidence: redactEvidence(finding.evidence),
        },
        fix: 'Remove internal IP addresses, localhost references, and private hostnames from public AI-facing endpoints.',
      }))
  }

  return [
    createCheck({
      code: CHECK.SEC_PRIVATE_INFRA_PATTERN,
      severity: 'pass',
      requirement: 'heuristic',
      message: 'No private infrastructure references were found in the public AI-facing content.',
      resource,
    }),
  ]
}

function findPatternMatches(
  text: string,
  patterns: readonly SecurityPattern[],
): Array<{ pattern: SecurityPattern; evidence: string }> {
  const matches: Array<{ pattern: SecurityPattern; evidence: string }> = []

  for (const pattern of patterns) {
    const match = pattern.pattern.exec(text)

    if (match?.[0]) {
      matches.push({
        pattern,
        evidence: match[0],
      })
    }
  }

  return matches
}

function redactEvidence(value: string): string {
  if (value.length <= 8) {
    return '[redacted]'
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function createCheck(input: {
  code: string
  severity: Severity
  requirement: RequirementKind
  message: string
  resource: SecurityResource
  details?: Record<string, unknown>
  fix?: string | undefined
}): ValidationCheck {
  const details = {
    ...(input.resource.nodeId ? { node_id: input.resource.nodeId } : {}),
    ...(input.details ?? {}),
  }

  const check: ValidationCheck = {
    code: input.code,
    severity: input.severity,
    requirement: input.requirement,
    message: input.message,
    url: input.resource.source,
  }

  if (Object.keys(details).length > 0) {
    check.details = details
  }

  if (input.fix) {
    check.fix = input.fix
  }

  return check
}
