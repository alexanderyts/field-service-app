import { describe, it, expect } from 'vitest'
import { milestoneReached, paceStatus, paceDeltaMin } from './milestones'

const GOAL = 60 * 60 // 60h in minutes

describe('milestoneReached', () => {
  it('reports the milestone a log crosses', () => {
    expect(milestoneReached(14 * 60, 15 * 60, GOAL)).toBe(25)
    expect(milestoneReached(29 * 60, 31 * 60, GOAL)).toBe(50)
    expect(milestoneReached(59 * 60, 60 * 60, GOAL)).toBe(100)
  })
  it('reports the highest when one log crosses several', () => {
    expect(milestoneReached(0, 50 * 60, GOAL)).toBe(75)
  })
  it('is silent when nothing was crossed, progress fell, or there is no goal', () => {
    expect(milestoneReached(15 * 60, 20 * 60, GOAL)).toBeNull()
    expect(milestoneReached(20 * 60, 10 * 60, GOAL)).toBeNull()
    expect(milestoneReached(0, 100, 0)).toBeNull()
  })
  it('does not re-fire for time already past a milestone', () => {
    expect(milestoneReached(16 * 60, 17 * 60, GOAL)).toBeNull()
  })
})

describe('paceStatus', () => {
  it('reads done at or past the goal', () => {
    expect(paceStatus(GOAL, GOAL, 50)).toBe('done')
  })
  it('reads on pace within a few points of the elapsed share', () => {
    expect(paceStatus(30 * 60, GOAL, 50)).toBe('on-pace')
    expect(paceStatus(32 * 60, GOAL, 50)).toBe('on-pace')
  })
  it('reads ahead or behind outside that band', () => {
    expect(paceStatus(40 * 60, GOAL, 50)).toBe('ahead')
    expect(paceStatus(20 * 60, GOAL, 50)).toBe('behind')
  })
  it('reads not started with nothing logged early in the month, or with no goal', () => {
    expect(paceStatus(0, GOAL, 3)).toBe('not-started')
    expect(paceStatus(0, 0, 50)).toBe('not-started')
    expect(paceStatus(0, GOAL, 40)).toBe('behind')
  })
})

describe('paceDeltaMin', () => {
  it('is the signed gap to the elapsed share of the goal', () => {
    expect(paceDeltaMin(40 * 60, GOAL, 50)).toBe(10 * 60)
    expect(paceDeltaMin(20 * 60, GOAL, 50)).toBe(-10 * 60)
    expect(paceDeltaMin(5, 0, 50)).toBe(0)
  })
})
