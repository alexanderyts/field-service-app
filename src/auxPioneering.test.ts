import { describe, it, expect } from 'vitest'
import {
  auxTargetHoursFor,
  suggestedWeeklyHours,
  remainingWeeksInMonth,
  auxMonthKey,
  normalizeAuxConfig,
  type AuxConfig,
} from './auxPioneering'

const base: AuxConfig = { enabled: false, mode: null, targetHours: 30, weeklyHours: 7, months: [], monthTargets: {} }

describe('normalizeAuxConfig', () => {
  it('passes a valid config through unchanged', () => {
    const valid: AuxConfig = {
      enabled: true,
      mode: 'multiple-months',
      targetHours: 15,
      weeklyHours: 3.5,
      months: ['2026-6', '2026-7'],
      monthTargets: { '2026-6': 30 },
    }
    expect(normalizeAuxConfig(valid)).toEqual(valid)
  })

  it.each([null, undefined, 'a string', 42, []])('falls back entirely on %o', (input) => {
    expect(normalizeAuxConfig(input)).toEqual(base)
  })

  // The regression this function exists for: a present-but-wrong field used to overwrite
  // its default, so `months.includes(…)` threw on the next render.
  it('defaults months to an empty array when it is not an array', () => {
    expect(normalizeAuxConfig({ months: null }).months).toEqual([])
    expect(normalizeAuxConfig({ months: 'nope' }).months).toEqual([])
    expect(() => auxTargetHoursFor(normalizeAuxConfig({ enabled: true, mode: 'this-month', months: null }), 2026, 6))
      .not.toThrow()
  })

  it('drops non-string month entries', () => {
    expect(normalizeAuxConfig({ months: ['2026-6', 7, null, '2026-8'] }).months).toEqual(['2026-6', '2026-8'])
  })

  it('rejects an unrecognized mode', () => {
    expect(normalizeAuxConfig({ mode: 'every-other-tuesday' }).mode).toBeNull()
    expect(normalizeAuxConfig({ mode: 'continuous' }).mode).toBe('continuous')
  })

  it('only accepts 15 or 30 as a target', () => {
    expect(normalizeAuxConfig({ targetHours: 20 }).targetHours).toBe(30)
    expect(normalizeAuxConfig({ targetHours: '15' }).targetHours).toBe(30)
    expect(normalizeAuxConfig({ targetHours: 15 }).targetHours).toBe(15)
  })

  it('rejects a non-finite or negative weeklyHours', () => {
    expect(normalizeAuxConfig({ weeklyHours: Number.NaN }).weeklyHours).toBe(7)
    expect(normalizeAuxConfig({ weeklyHours: -3 }).weeklyHours).toBe(7)
    expect(normalizeAuxConfig({ weeklyHours: 0 }).weeklyHours).toBe(0)
  })

  it('keeps only valid monthTargets entries', () => {
    expect(normalizeAuxConfig({ monthTargets: { '2026-6': 15, '2026-7': 99, '2026-8': null } }).monthTargets)
      .toEqual({ '2026-6': 15 })
    expect(normalizeAuxConfig({ monthTargets: 'nope' }).monthTargets).toEqual({})
  })

  it('drops unknown fields', () => {
    expect(normalizeAuxConfig({ enabled: true, injected: 'x' })).toEqual({ ...base, enabled: true })
  })
})

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
