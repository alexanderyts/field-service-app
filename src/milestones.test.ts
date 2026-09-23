import { describe, it, expect } from 'vitest'
import { milestoneReached, milestoneToastText, paceStatus, paceDeltaMin, perDayToGoal, perDayWorthShowing, weekTargetIsStretch } from './milestones'

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

describe('perDayToGoal', () => {
  it('spreads what remains across the days left, rounded up', () => {
    expect(perDayToGoal(20 * 60, GOAL, 10)).toBe(4 * 60) // 40h left over 10 days = 4h/day
  })
  it('is 0 once the goal is reached', () => {
    expect(perDayToGoal(GOAL, GOAL, 5)).toBe(0)
    expect(perDayToGoal(GOAL + 60, GOAL, 5)).toBe(0)
  })
  it('puts the remainder on today when no days are left', () => {
    expect(perDayToGoal(50 * 60, GOAL, 0)).toBe(10 * 60)
  })
})

describe('milestoneToastText', () => {
  const goal = 50 * 60
  it('names the month milestone crossed', () => {
    expect(milestoneToastText({ month: 20 * 60, year: 0 }, { month: 26 * 60, year: 0 }, goal, 0, 'September')).toBe("50% of September's goal — keep going")
    expect(milestoneToastText({ month: 49 * 60, year: 0 }, { month: 50 * 60, year: 0 }, goal, 0, 'September')).toBe('🎉 September goal reached!')
  })
  it('the service-year goal wins over a month milestone', () => {
    expect(milestoneToastText({ month: 49 * 60, year: 599 * 60 }, { month: 50 * 60, year: 600 * 60 }, goal, 600 * 60, 'August')).toBe('🏆 Service-year goal reached!')
  })
  it('nothing when no line is crossed, or totals went down', () => {
    expect(milestoneToastText({ month: 26 * 60, year: 0 }, { month: 27 * 60, year: 0 }, goal, 0, 'September')).toBeNull()
    expect(milestoneToastText({ month: 30 * 60, year: 0 }, { month: 20 * 60, year: 0 }, goal, 0, 'September')).toBeNull()
  })
})

describe('tone rules (Phase 3d)', () => {
  it('a per-day figure over 3 hours is not shown', () => {
    expect(perDayWorthShowing(2 * 60)).toBe(true)
    expect(perDayWorthShowing(3 * 60)).toBe(true)
    expect(perDayWorthShowing(3 * 60 + 1)).toBe(false)
    expect(perDayWorthShowing(0)).toBe(false)
  })
  it('a week target more than 1.5× the average week is a stretch', () => {
    // 50h over 30 days ≈ 11h40m a week; 1.5× ≈ 17h30m.
    expect(weekTargetIsStretch(17 * 60, 50 * 60, 30)).toBe(false)
    expect(weekTargetIsStretch(18 * 60, 50 * 60, 30)).toBe(true)
    expect(weekTargetIsStretch(18 * 60, 0, 30)).toBe(false)
  })
})
