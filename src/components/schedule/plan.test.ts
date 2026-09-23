process.env.TZ = 'America/New_York'

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type SchedulePrefs } from '../../db'
import { clearWeekSchedule, weekSuggestedMinutesExcluding } from './plan'

// Every day of the week is planned 9–3 (360 min), so a DST week that visits one day twice and
// skips another would still total 7 days — the per-date checks below are what catch F049.
const everyDay: SchedulePrefs = {
  id: 1,
  completedSurvey: true,
  daysOut: [0, 1, 2, 3, 4, 5, 6],
  weeklyHours: 42,
  yearlyHours: 600,
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 1))
  await db.open()
  await db.schedulePrefs.clear()
})
afterEach(() => vi.useRealTimers())

describe('plan across the Nov 1 2026 fall-back week', () => {
  it('excluding Saturday removes exactly one day', () => {
    const sat = new Date(2026, 10, 7)
    expect(weekSuggestedMinutesExcluding(everyDay, sat)).toBe(7 * 360)
    expect(weekSuggestedMinutesExcluding(everyDay, sat, sat)).toBe(6 * 360)
  })

  it('clearWeekSchedule clears all seven dates, Sunday to Saturday', async () => {
    await db.schedulePrefs.put(everyDay)
    await clearWeekSchedule(everyDay, new Date(2026, 10, 4))
    const after = await db.schedulePrefs.get(1)
    expect(Object.keys(after!.dateOverrides ?? {}).sort()).toEqual([
      '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    ])
  })
})
