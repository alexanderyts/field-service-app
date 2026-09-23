process.env.TZ = 'America/New_York'

import { describe, expect, it } from 'vitest'
import { addDays, daysLeftInMonth, monthsTouchedByRange, startOfWeek } from './dates'
import { fmtLocalDate } from '../../localDate'

// US DST in 2026: clocks go forward Sun Mar 8 and back Sun Nov 1. A day stepped by a flat
// 24 h lands on the wrong date across either change (AUDIT F049).
describe('addDays across daylight-saving changes', () => {
  it('runs in a zone that has DST (guards the test itself)', () => {
    expect(new Date(2026, 10, 1).getTimezoneOffset()).not.toBe(new Date(2026, 10, 2).getTimezoneOffset())
  })

  it('the week of Nov 1 (fall back) has seven distinct days, Sunday to Saturday', () => {
    const start = startOfWeek(new Date(2026, 10, 4)).getTime()
    const days = Array.from({ length: 7 }, (_, i) => fmtLocalDate(new Date(addDays(start, i))))
    expect(days).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
  })

  it('the week of Mar 8 (spring forward) has seven distinct days', () => {
    const start = startOfWeek(new Date(2026, 2, 10)).getTime()
    const days = Array.from({ length: 7 }, (_, i) => fmtLocalDate(new Date(addDays(start, i))))
    expect(days).toEqual(['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14'])
  })

  it('keeps midnight at midnight and steps whole weeks and backwards', () => {
    const start = startOfWeek(new Date(2026, 9, 28)).getTime() // Sun Oct 25
    const next = new Date(addDays(start, 7))
    expect(fmtLocalDate(next)).toBe('2026-11-01')
    expect(next.getHours()).toBe(0)
    expect(fmtLocalDate(new Date(addDays(new Date(2026, 2, 9).getTime(), -1)))).toBe('2026-03-08')
    expect(new Date(addDays(new Date(2026, 2, 9).getTime(), -1)).getHours()).toBe(0)
  })

  it('keeps the wall-clock time of a timestamp', () => {
    const t = new Date(2026, 9, 31, 14, 30).getTime()
    const d = new Date(addDays(t, 1))
    expect([fmtLocalDate(d), d.getHours(), d.getMinutes()]).toEqual(['2026-11-01', 14, 30])
  })
})

describe('monthsTouchedByRange', () => {
  it('a week that ends on the spring-forward day still touches only its own months', () => {
    const start = startOfWeek(new Date(2026, 2, 1)).getTime() // Sun Mar 1
    expect(monthsTouchedByRange(start, addDays(start, 7))).toEqual([{ year: 2026, month: 2 }])
  })

  it('a split week lists both months in order', () => {
    const oct = startOfWeek(new Date(2026, 9, 29)).getTime() // Sun Oct 25, ends on fall-back day
    expect(monthsTouchedByRange(oct, addDays(oct, 7))).toEqual([{ year: 2026, month: 9 }])
    const sep = startOfWeek(new Date(2026, 8, 30)).getTime() // Sun Sep 27
    expect(monthsTouchedByRange(sep, addDays(sep, 7))).toEqual([{ year: 2026, month: 8 }, { year: 2026, month: 9 }])
  })
})

describe('daysLeftInMonth counts today (AUDIT F058)', () => {
  it('the 1st has the whole month; the last day still has itself', () => {
    expect(daysLeftInMonth(2026, 8, new Date(2026, 8, 1))).toBe(30)
    expect(daysLeftInMonth(2026, 8, new Date(2026, 8, 23))).toBe(8)
    expect(daysLeftInMonth(2026, 8, new Date(2026, 8, 30))).toBe(1)
  })
  it('a past month has none, a future month all of its days', () => {
    expect(daysLeftInMonth(2026, 7, new Date(2026, 8, 5))).toBe(0)
    expect(daysLeftInMonth(2026, 9, new Date(2026, 8, 5))).toBe(31)
  })
})
