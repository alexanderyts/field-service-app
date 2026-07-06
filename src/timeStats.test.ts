import { describe, it, expect } from 'vitest'
import type { TimeLog, TimeCategory } from './db'
import {
  isCredit,
  monthTotals,
  fmtDuration,
  serviceYearLabel,
  serviceYearBounds,
  serviceYearlyApplied,
  monthlyGoalFromWeekly,
} from './timeStats'

const H = 60 // minutes per hour
function log(hours: number, category: TimeCategory, date = 0): TimeLog {
  return { id: 0, date, minutes: hours * H, category }
}

describe('isCredit', () => {
  it('treats everything except ministry as credit', () => {
    expect(isCredit('ministry')).toBe(false)
    for (const c of ['ldc', 'hlc', 'convention', 'assembly', 'bethel', 'other'] as TimeCategory[]) {
      expect(isCredit(c)).toBe(true)
    }
  })
})

describe('monthTotals — the 55h credit cap', () => {
  it('applies pure ministry in full, uncapped, even past 55h', () => {
    const t = monthTotals([log(72, 'ministry')])
    expect(t).toMatchObject({ ministry: 72 * H, credit: 0, total: 72 * H, creditUsed: false, applied: 72 * H })
  })

  it('caps ministry+credit at 55h once any credit is used', () => {
    // 24h ministry + 64h credit = 88h raw, but only 55h counts
    const t = monthTotals([log(24, 'ministry'), log(64, 'ldc')])
    expect(t.total).toBe(88 * H)
    expect(t.creditUsed).toBe(true)
    expect(t.applied).toBe(55 * H)
  })

  it('never lets the cap drop applied below what ministry alone earned', () => {
    // 60h ministry already exceeds the 55h cap; adding 10h credit must not reduce it
    const t = monthTotals([log(60, 'ministry'), log(10, 'ldc')])
    expect(t.applied).toBe(60 * H)
  })

  it('applies everything when under the cap', () => {
    const t = monthTotals([log(10, 'ministry'), log(5, 'ldc')])
    expect(t.applied).toBe(15 * H)
    expect(t.creditUsed).toBe(true)
  })

  it('handles an empty month', () => {
    expect(monthTotals([])).toEqual({ ministry: 0, credit: 0, total: 0, creditUsed: false, applied: 0 })
  })
})

describe('fmtDuration', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h'],
    [90, '1h 30m'],
    [120, '2h'],
    [125, '2h 5m'],
  ])('formats %i minutes as %s', (mins, expected) => {
    expect(fmtDuration(mins)).toBe(expected)
  })
})

describe('service year (Sept 1 – Aug 31, labeled by ending year)', () => {
  it('labels months on the right side of the September boundary', () => {
    expect(serviceYearLabel(new Date(2025, 8, 1))).toBe(2026) // Sept 2025 -> SY2026
    expect(serviceYearLabel(new Date(2026, 6, 5))).toBe(2026) // Jul 2026 -> SY2026
    expect(serviceYearLabel(new Date(2025, 7, 31))).toBe(2025) // Aug 2025 -> SY2025
  })

  it('bounds SY2026 from Sept 1 2025 to Aug 31 2026', () => {
    const { start, end } = serviceYearBounds(2026)
    expect(new Date(start)).toEqual(new Date(2025, 8, 1))
    expect(new Date(end)).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999))
  })

  it('sums applied per-month with the cap, excluding out-of-year logs', () => {
    const logs: TimeLog[] = [
      log(24, 'ministry', new Date(2025, 9, 15).getTime()), // Oct 2025: 24h ministry
      log(64, 'ldc', new Date(2025, 9, 20).getTime()), //      + 64h credit -> capped to 55h
      log(10, 'ministry', new Date(2025, 10, 10).getTime()), // Nov 2025: 10h -> 10h
      log(100, 'ministry', new Date(2025, 7, 15).getTime()), // Aug 2025: BEFORE the year, excluded
    ]
    expect(serviceYearlyApplied(logs, 2026)).toBe(55 * H + 10 * H)
  })
})

describe('monthlyGoalFromWeekly', () => {
  it('scales weekly hours by 4.3 weeks and converts to minutes', () => {
    expect(monthlyGoalFromWeekly(10)).toBeCloseTo(10 * H * 4.3)
  })
})
