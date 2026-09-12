import { describe, it, expect } from 'vitest'
import { viewportDeficit } from './viewportFix'

// AUDIT 6.1: the launch-viewport shortfall on installed iOS. Only the pure calc is tested;
// the installer is DOM glue verified on device.
describe('viewportDeficit', () => {
  it('is 0 in a browser tab (not standalone)', () => {
    expect(viewportDeficit(896, 780, 414, false)).toBe(0)
  })
  it('is 0 in landscape even when standalone', () => {
    expect(viewportDeficit(414, 380, 896, true)).toBe(0)
  })
  it('reports a plausible portrait shortfall', () => {
    expect(viewportDeficit(896, 834, 414, true)).toBe(62)
  })
  it('ignores an implausibly large gap (not the launch bug)', () => {
    expect(viewportDeficit(896, 400, 414, true)).toBe(0)
  })
  it('is 0 once the viewport has been corrected (inner == screen)', () => {
    expect(viewportDeficit(896, 896, 414, true)).toBe(0)
  })
})
