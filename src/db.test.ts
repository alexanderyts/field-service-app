import { describe, it, expect } from 'vitest'
import { compareHouseNumbers, uniqueStreetName, commonLocationLabel, resolveStreetEntry, type StreetEntry } from './db'

describe('compareHouseNumbers — walk order', () => {
  it('sorts by leading number, not lexically', () => {
    const sorted = ['10', '2', '1', '11'].sort(compareHouseNumbers)
    expect(sorted).toEqual(['1', '2', '10', '11'])
  })

  it('orders a bare number before its lettered units, and units among themselves', () => {
    const sorted = ['10B', '10', '10A', '11'].sort(compareHouseNumbers)
    expect(sorted).toEqual(['10', '10A', '10B', '11'])
  })

  it('places purely-alphabetic entries after numbered ones', () => {
    expect(compareHouseNumbers('A', '5')).toBeGreaterThan(0)
    expect(compareHouseNumbers('5', 'A')).toBeLessThan(0)
  })
})

describe('uniqueStreetName — (2)/(3) signifier for like names', () => {
  it('returns the base name when it is free', () => {
    expect(uniqueStreetName('Main St', [])).toBe('Main St')
    expect(uniqueStreetName('Main St', ['Oak Ave'])).toBe('Main St')
  })

  it('suffixes the next free number when the name is taken', () => {
    expect(uniqueStreetName('Main St', ['Main St'])).toBe('Main St (2)')
    expect(uniqueStreetName('Main St', ['Main St', 'Main St (2)'])).toBe('Main St (3)')
  })

  it('is case-insensitive and trims', () => {
    expect(uniqueStreetName('  Main St ', ['main st'])).toBe('Main St (2)')
  })

  it('fills the lowest available gap', () => {
    expect(uniqueStreetName('Main St', ['Main St', 'Main St (3)'])).toBe('Main St (2)')
  })
})

describe('commonLocationLabel', () => {
  it('returns the most common "City, ST" among streets', () => {
    const label = commonLocationLabel([
      { city: 'Jackson', state: 'MS' },
      { city: 'Jackson', state: 'MS' },
      { city: 'Clinton', state: 'MS' },
    ])
    expect(label).toBe('Jackson, MS')
  })

  it('omits the state when absent', () => {
    expect(commonLocationLabel([{ city: 'Jackson' }])).toBe('Jackson')
  })

  it('returns undefined when no street has a city', () => {
    expect(commonLocationLabel([{ state: 'MS' }, {}])).toBeUndefined()
    expect(commonLocationLabel([])).toBeUndefined()
  })
})

describe('resolveStreetEntry — entryId first, name fallback', () => {
  const entry = (id: number, name: string): StreetEntry => ({ id, name, houses: [], createdAt: 0 })
  const entries = [entry(1, 'Main St'), entry(2, 'Main St (2)'), entry(3, 'Oak Ave')]

  it('resolves by the explicit entryId link', () => {
    expect(resolveStreetEntry({ entryId: 2, name: 'anything' }, entries)?.id).toBe(2)
  })

  it('falls back to a case-insensitive name match when no id is set', () => {
    expect(resolveStreetEntry({ name: 'oak ave' }, entries)?.id).toBe(3)
  })

  it('falls back to name when the entryId is dangling', () => {
    expect(resolveStreetEntry({ entryId: 999, name: 'Main St' }, entries)?.id).toBe(1)
  })

  it('returns undefined when nothing matches', () => {
    expect(resolveStreetEntry({ name: 'Nowhere Rd' }, entries)).toBeUndefined()
  })
})
