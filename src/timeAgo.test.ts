import { describe, it, expect } from 'vitest'
import { formatTimeAgo } from './timeAgo'

const NOW = new Date(2026, 7, 12, 12, 0, 0).getTime()
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const ago = (ms: number) => formatTimeAgo(NOW - ms, NOW)

describe('formatTimeAgo', () => {
  it('reads anything under a minute as "just now"', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(30 * SEC)).toBe('just now')
    expect(ago(59 * SEC)).toBe('just now')
  })

  it('steps to minutes at 60 seconds', () => {
    expect(ago(60 * SEC)).toBe('1 minute ago')
    expect(ago(5 * MIN)).toBe('5 minutes ago')
    expect(ago(59 * MIN)).toBe('59 minutes ago')
  })

  it('steps to hours at 60 minutes', () => {
    expect(ago(HOUR)).toBe('1 hour ago')
    expect(ago(23 * HOUR)).toBe('23 hours ago')
  })

  it('names a single day "yesterday"', () => {
    expect(ago(DAY)).toBe('yesterday')
    expect(ago(DAY + 5 * HOUR)).toBe('yesterday')
  })

  it('counts days up to a week', () => {
    expect(ago(2 * DAY)).toBe('2 days ago')
    expect(ago(6 * DAY)).toBe('6 days ago')
  })

  it('counts whole weeks up to a month', () => {
    expect(ago(7 * DAY)).toBe('1 week ago')
    expect(ago(13 * DAY)).toBe('1 week ago')
    expect(ago(21 * DAY)).toBe('3 weeks ago')
    expect(ago(29 * DAY)).toBe('4 weeks ago')
  })

  it('counts whole months up to a year', () => {
    expect(ago(30 * DAY)).toBe('1 month ago')
    expect(ago(89 * DAY)).toBe('2 months ago')
    expect(ago(364 * DAY)).toBe('12 months ago')
  })

  it('counts years beyond that', () => {
    expect(ago(365 * DAY)).toBe('1 year ago')
    expect(ago(800 * DAY)).toBe('2 years ago')
  })

  // A clock moved backwards (timezone change, manual adjustment, a file stamped in the
  // future) must not render "in 3 days" or "-1 days ago" on a reassurance line.
  it('reads a future timestamp as "just now" rather than going negative', () => {
    expect(formatTimeAgo(NOW + 5 * DAY, NOW)).toBe('just now')
    expect(formatTimeAgo(NOW + 1, NOW)).toBe('just now')
  })

  it('never says "1 days" or "1 weeks"', () => {
    const samples = [60 * SEC, HOUR, 7 * DAY, 30 * DAY, 365 * DAY]
    for (const ms of samples) expect(ago(ms)).not.toMatch(/\b1 \w+s ago\b/)
  })
})
