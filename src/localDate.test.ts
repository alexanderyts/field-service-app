import { describe, it, expect } from 'vitest'
import { fmtDateTime, fmtLocalDate, parseLocalDate, combineDateTime, localDateAfter, roundedTimeStr } from './localDate'

describe('fmtDateTime (AUDIT F048)', () => {
  const ts = new Date(2025, 7, 5, 14, 25, 39).getTime()
  it('shows date, hour and minute — never seconds', () => {
    const out = fmtDateTime(ts, 'en-US')
    expect(out).toBe('8/5/2025, 2:25 PM')
    expect(out).not.toMatch(/:39/)
  })
})

describe('local date round trip', () => {
  it('parses and formats YYYY-MM-DD in local time', () => {
    expect(fmtLocalDate(parseLocalDate('2026-03-08'))).toBe('2026-03-08')
    const ts = combineDateTime('2026-03-08', '09:30')
    const d = new Date(ts)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 2, 8, 9, 30])
  })
})

describe('return-visit quick dates', () => {
  const at = new Date(2026, 8, 30, 14, 52).getTime()
  it('steps calendar days across a month end', () => {
    expect(localDateAfter(1, at)).toBe('2026-10-01')
    expect(localDateAfter(7, at)).toBe('2026-10-07')
    expect(localDateAfter(14, at)).toBe('2026-10-14')
  })
  it('rounds the time to a quarter hour and never past 23:45', () => {
    expect(roundedTimeStr(at)).toBe('14:45')
    expect(roundedTimeStr(new Date(2026, 8, 30, 14, 53).getTime())).toBe('15:00')
    expect(roundedTimeStr(new Date(2026, 8, 30, 23, 58).getTime())).toBe('23:45')
  })
})
