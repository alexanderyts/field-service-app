import { describe, it, expect } from 'vitest'
import { formatScripture, analyzeScripture } from './scripture'

describe('formatScripture — normalize abbreviations & shape', () => {
  it.each([
    ['jn 3:16', 'John 3:16'],
    ['1 cor 13:4-7', '1 Corinthians 13:4-7'],
    ['ps 23', 'Psalms 23'],
    ['ro 5:8', 'Romans 5:8'],
  ])('normalizes %s -> %s', (input, expected) => {
    expect(formatScripture(input)).toBe(expected)
  })

  it('requires a colon before verses — a space form is left as typed', () => {
    expect(formatScripture('1 cor 13 4-7')).toBe('1 cor 13 4-7')
  })

  it('keeps a trailing bare verse grouped with the same chapter', () => {
    expect(formatScripture('john 3:16, 18')).toBe('John 3:16, 18')
  })

  it('normalizes multiple references split by a semicolon', () => {
    expect(formatScripture('jn 3:16; ro 5:8')).toBe('John 3:16; Romans 5:8')
  })

  it('leaves empty input untouched', () => {
    expect(formatScripture('')).toBe('')
  })
})

describe('analyzeScripture — recognition & fuzzy correction', () => {
  it('recognizes a valid reference', () => {
    const r = analyzeScripture('jn 3:16')
    expect(r.recognized).toBe(true)
    expect(r.formatted).toBe('John 3:16')
  })

  it('suggests a correction for a misspelled book', () => {
    const r = analyzeScripture('jonh 3:16')
    expect(r.recognized).toBe(false)
    expect(r.suggestion).toBe('John 3:16')
  })

  it('treats non-reference text as recognized (nothing to correct)', () => {
    const r = analyzeScripture('talked about hope')
    expect(r.recognized).toBe(true)
    expect(r.suggestion).toBeUndefined()
  })
})
