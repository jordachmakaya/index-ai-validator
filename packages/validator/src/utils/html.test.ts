import { describe, expect, it } from 'vitest'

import { detectHtmlLeak } from './html'

describe('detectHtmlLeak', () => {
  it('reports full HTML documents as hard leaks', () => {
    const result = detectHtmlLeak('<!doctype html><html><body>Hello</body></html>')

    expect(result.kind).toBe('hard')
    expect(result.evidence).toContain('<!doctype html')
  })

  it('reports hard HTML tags outside Markdown code as hard leaks', () => {
    const result = detectHtmlLeak('Intro\n<div>Rendered layout</div>\nOutro')

    expect(result.kind).toBe('hard')
    expect(result.evidence).toContain('<div')
  })

  it('ignores HTML-like examples inside fenced Markdown code', () => {
    const result = detectHtmlLeak('```html\n<div>Example only</div>\n```')

    expect(result.kind).toBe('none')
  })

  it('ignores HTML-like examples inside inline Markdown code', () => {
    const result = detectHtmlLeak('Use `<span>label</span>` only as an example.')

    expect(result.kind).toBe('none')
  })

  it('treats tolerated inline markup as a soft leak', () => {
    const result = detectHtmlLeak('Column A<br>Column B')

    expect(result.kind).toBe('soft')
    expect(result.evidence).toContain('<br')
  })
})
