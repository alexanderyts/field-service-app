import { describe, it, expect } from 'vitest'
import {
  auxTargetHoursFor,
  suggestedWeeklyHours,
  remainingWeeksInMonth,
  auxMonthKey,
  type AuxConfig,
} from './auxPioneering'

const base: AuxConfig = { enabled: false, mode: null, targetHours: 30, weeklyHours: 7, months: [], monthTargets: {} }

describe('auxTargetHoursFor', () => {
  it('is null when disabled', () => {
    expect(auxTargetHoursFor(base, 2026, 6)).toBeNull()
  })

  it('is 30 every month when continuous', () => {
    expect(auxTargetHoursFor({ ...base, enabled: true, mode: 'continuous' }, 2026, 0)).toBe(30)
  })

  it('applies the target only to selected months for this-month', () => {
    const cfg: AuxConfig = { ...base, enabled: true, mode: 'this-month', targetHours: 15, months: [auxMonthKey(2026, 6)] }
    expect(auxTargetHoursFor(cfg, 2026, 6)).toBe(15)
    expect(auxTargetHoursFor(cfg, 2026, 7)).toBeNull()
  })

  it('uses per-month targets for multiple-months, falling back to targetHours', () => {
    const cfg: AuxConfig = {
      ...base,
      enabled: true,
      mode: 'multiple-months',
      targetHours: 15,
      months: [auxMonthKey(2026, 6), auxMonthKey(2026, 7)],
      monthTargets: { [auxMonthKey(2026, 6)]: 30 },
    }
    expect(auxTargetHoursFor(cfg, 2026, 6)).toBe(30) // explicit
    expect(auxTargetHoursFor(cfg, 2026, 7)).toBe(15) // fallback to targetHours
  })
})

describe('suggestedWeeklyHours — nearest half hour', () => {
  it.each([
    [30, 7],
    [15, 3.5],
  ])('suggests %ih/mo -> %ih/wk', (target, expected) => {
    expect(suggestedWeeklyHours(target)).toBe(expected)
  })
})

describe('remainingWeeksInMonth', () => {
  it('returns 0 once today is past the month end', () => {
    expect(remainingWeeksInMonth(new Date(2026, 7, 1), 2026, 6)).toBe(0) // Aug 1, asking about July
  })

  it('counts every Sun–Sat block touching the month from its start', () => {
    const weeks = remainingWeeksInMonth(new Date(2026, 6, 1), 2026, 6) // full July 2026
    expect(weeks).toBeGreaterThanOrEqual(4)
    expect(weeks).toBeLessThanOrEqual(6)
  })
})
