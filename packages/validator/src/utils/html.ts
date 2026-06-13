export type HtmlLeakKind = 'none' | 'soft' | 'hard'

export type HtmlLeakResult = {
  kind: HtmlLeakKind
  evidence?: string
}

const HARD_HTML_PATTERNS = [
  '<!doctype html',
  '<html',
  '</html',
  '<body',
  '</body',
  '<script',
  '</script',
  '<div',
  '</div',
  '<nav',
  '</nav',
  '<main',
  '</main',
  '<section',
  '</section',
  '<article',
  '</article',
] as const

const SOFT_HTML_PATTERNS = [
  '<br',
] as const

export function detectHtmlLeak(input: string): HtmlLeakResult {
  const searchable = stripMarkdownCode(input).toLowerCase()
  const hardEvidence = findEvidence(searchable, HARD_HTML_PATTERNS)

  if (hardEvidence) {
    return {
      kind: 'hard',
      evidence: hardEvidence,
    }
  }

  const softEvidence = findEvidence(searchable, SOFT_HTML_PATTERNS)

  if (softEvidence) {
    return {
      kind: 'soft',
      evidence: softEvidence,
    }
  }

  return { kind: 'none' }
}

export function stripMarkdownCode(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
}

function findEvidence(
  input: string,
  patterns: readonly string[],
): string | null {
  return patterns.find((pattern) => input.includes(pattern)) ?? null
}
