import { describe, it, expect } from 'vitest'
import type { TimeLog, TimeCategory } from './db'
import {
  displayGoalMin,
  isCredit,
  monthTotals,
  fmtDuration,
  serviceYearLabel,
  serviceYearBounds,
  serviceYearlyApplied,
  monthlyGoalFromWeekly,
  quickLogStrategy,
  pruneDateOverrides,
} from './timeStats'

const H = 60 // minutes per hour
function log(hours: number, category: TimeCategory, date = 0): TimeLog {
  return { id: 0, date, minutes: hours * H, category }
}

describe('isCredit', () => {
  it('treats everything except ministry as credit', () => {
    expect(isCredit('ministry')).toBe(false)
    expect(isCredit('credit')).toBe(true)
  })

  // This rule is why the v9 migration cannot move any month's applied total: every one of the
  // seven pre-0.20 categories was ALREADY credit under this same `!== 'ministry'` test, so
  // rewriting them to 'credit' changes the label and nothing else. Asserted with a runtime
  // cast because the type no longer admits those values — which is the point.
  it('still counts a pre-0.20 category as credit, so the migration is total-preserving', () => {
    const legacy: string[] = ['ldc', 'hlc', 'convention', 'assembly', 'bethel', 'other']
    for (const c of legacy) expect(isCredit(c as TimeCategory)).toBe(true)
  })
})

describe('monthTotals — the 55h credit cap', () => {
  it('applies pure ministry in full, uncapped, even past 55h', () => {
    const t = monthTotals([log(72, 'ministry')])
    expect(t).toMatchObject({ ministry: 72 * H, credit: 0, total: 72 * H, creditUsed: false, applied: 72 * H })
  })

  it('caps ministry+credit at 55h once any credit is used', () => {
    // 24h ministry + 64h credit = 88h raw, but only 55h counts
    const t = monthTotals([log(24, 'ministry'), log(64, 'credit')])
    expect(t.total).toBe(88 * H)
    expect(t.creditUsed).toBe(true)
    expect(t.applied).toBe(55 * H)
  })

  it('never lets the cap drop applied below what ministry alone earned', () => {
    // 60h ministry already exceeds the 55h cap; adding 10h credit must not reduce it
    const t = monthTotals([log(60, 'ministry'), log(10, 'credit')])
    expect(t.applied).toBe(60 * H)
  })

  it('applies everything when under the cap', () => {
    const t = monthTotals([log(10, 'ministry'), log(5, 'credit')])
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
      log(64, 'credit', new Date(2025, 9, 20).getTime()), //   + 64h credit -> capped to 55h
      log(10, 'ministry', new Date(2025, 10, 10).getTime()), // Nov 2025: 10h -> 10h
      log(100, 'ministry', new Date(2025, 7, 15).getTime()), // Aug 2025: BEFORE the year, excluded
    ]
    expect(serviceYearlyApplied(logs, 2026)).toBe(55 * H + 10 * H)
  })
})

describe('quickLogStrategy — what the minute bank is allowed to hold (F-A6)', () => {
  it('banks a ministry remainder under 30 minutes', () => {
    expect(quickLogStrategy('ministry', 2, 20)).toBe('bank')
  })

  it('asks about rounding up a ministry remainder of 30+ minutes', () => {
    expect(quickLogStrategy('ministry', 2, 45)).toBe('confirm')
  })

  it('logs a whole ministry hour with no remainder directly', () => {
    expect(quickLogStrategy('ministry', 2, 0)).toBe('whole')
  })

  // The fix itself: credit never enters the bank, at any remainder. Before this, 20 minutes of
  // credit went into the same pot as ministry minutes and came back out as whichever category
  // happened to fill it — misfiling time exactly where the 55h cap makes the split decisive.
  it('logs credit whole at every remainder, so the bank stays ministry-only', () => {
    expect(quickLogStrategy('credit', 2, 20)).toBe('whole')
    expect(quickLogStrategy('credit', 2, 45)).toBe('whole')
    expect(quickLogStrategy('credit', 0, 20)).toBe('whole')
  })

  it('does nothing for a zero duration', () => {
    expect(quickLogStrategy('ministry', 0, 0)).toBe('none')
    expect(quickLogStrategy('credit', 0, 0)).toBe('none')
  })
})

describe('pruneDateOverrides — one-off schedule overrides stop growing forever (F-C4)', () => {
  const now = new Date(2026, 8, 7) // 7 Sept 2026 -> service year 2027; previous year starts 1 Sept 2025
  const over = {
    '2024-03-10': [],          // two service years back — goes
    '2025-08-31': [],          // last day of SY2025 — goes
    '2025-09-01': [],          // first day of the previous service year — kept
    '2026-09-06': [{ start: 540, end: 720, category: 'ministry' }], // yesterday — kept
    '2027-01-15': [],          // future — kept
  }

  it('keeps this service year and the previous one, drops anything older', () => {
    expect(Object.keys(pruneDateOverrides(over, now)!).sort()).toEqual(['2025-09-01', '2026-09-06', '2027-01-15'])
  })

  it('keeps an empty override — it is what stops a submitted day from reappearing', () => {
    expect(pruneDateOverrides(over, now)!['2025-09-01']).toEqual([])
  })

  it('never drops a key it cannot parse, and passes undefined through', () => {
    expect(pruneDateOverrides({ garbage: [] }, now)).toEqual({ garbage: [] })
    expect(pruneDateOverrides(undefined, now)).toBeUndefined()
  })
})

describe('monthlyGoalFromWeekly', () => {
  it('scales weekly hours by 4.3 weeks and converts to minutes', () => {
    expect(monthlyGoalFromWeekly(10)).toBeCloseTo(10 * H * 4.3)
  })

  it('falls back to 0 for a non-finite weeklyHours instead of returning NaN', () => {
    expect(monthlyGoalFromWeekly(Number.NaN)).toBe(0)
    expect(monthlyGoalFromWeekly(undefined as unknown as number)).toBe(0)
  })
})

describe('displayGoalMin (AUDIT F048)', () => {
  it('rounds a goal up to the whole hour for display', () => {
    expect(displayGoalMin(64.5 * 60)).toBe(65 * 60)
    expect(displayGoalMin(60 * 60)).toBe(60 * 60)
    expect(displayGoalMin(0)).toBe(0)
  })
})
