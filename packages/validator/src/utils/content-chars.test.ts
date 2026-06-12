import { describe, expect, test } from 'vitest'

import { countChars, countContentChars } from './content-chars'

describe('countContentChars', () => {
  test('counts ASCII code points', () => {
    expect(countContentChars('abc')).toBe(3)
  })

  test('counts a composed accented character as one code point', () => {
    expect(countContentChars('\u00E9')).toBe(1)
  })

  test('normalizes decomposed accents before counting', () => {
    const decomposed = 'e\u0301'

    expect(decomposed.length).toBe(2)
    expect(countContentChars(decomposed)).toBe(1)
  })

  test('counts emoji by code point instead of UTF-16 length', () => {
    const rocket = '\u{1F680}'

    expect(rocket.length).toBe(2)
    expect(countContentChars(rocket)).toBe(1)
  })

  test('ignores a leading byte order mark', () => {
    expect(countContentChars('\uFEFFabc')).toBe(3)
  })

  test('keeps countChars as an alias for countContentChars', () => {
    expect(countChars('abc')).toBe(countContentChars('abc'))
  })
})
