import { describe, it, expect } from 'vitest'
import { sameAddress } from './address'

const base = { street: '123 Main St', city: 'Brandon', state: 'Mississippi', zip: '39042' }

describe('sameAddress', () => {
  it('matches an identical address', () => {
    expect(sameAddress(base, { ...base })).toBe(true)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(sameAddress(base, { street: '  123 MAIN st ', city: 'brandon', state: 'MISSISSIPPI', zip: ' 39042' })).toBe(true)
  })

  it('ignores collapsed inner whitespace', () => {
    expect(sameAddress(base, { ...base, street: '123   Main    St' })).toBe(true)
  })

  it('treats a missing field and an empty one as the same', () => {
    expect(sameAddress({ street: 'x' }, { street: 'x', city: '', state: undefined, zip: '  ' })).toBe(true)
    expect(sameAddress({}, { street: '', city: '', state: '', zip: '' })).toBe(true)
  })

  it.each([
    ['street', { street: '124 Main St' }],
    ['city', { city: 'Pearl' }],
    ['state', { state: 'Alabama' }],
    ['zip', { zip: '39043' }],
  ])('detects a real change to %s', (_field, patch) => {
    expect(sameAddress(base, { ...base, ...patch })).toBe(false)
  })

  it('detects a field being cleared', () => {
    expect(sameAddress(base, { ...base, zip: '' })).toBe(false)
  })

  it('detects a field being added', () => {
    expect(sameAddress({ street: '123 Main St' }, base)).toBe(false)
  })
})
