import { describe, expect, it } from 'vitest'
import { resolveTerritoriesEnabled } from './territoriesFeature'

describe('resolveTerritoriesEnabled', () => {
  it('follows the data until the person chooses', () => {
    expect(resolveTerritoriesEnabled(null, false)).toBe(false)
    expect(resolveTerritoriesEnabled(null, true)).toBe(true)
  })
  it('the choice wins either way', () => {
    expect(resolveTerritoriesEnabled(false, true)).toBe(false)
    expect(resolveTerritoriesEnabled(true, false)).toBe(true)
  })
})
