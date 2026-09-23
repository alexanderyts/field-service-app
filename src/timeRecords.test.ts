import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type SchedulePrefs, type TimeLog } from './db'
import { clearDay, logTime, logWithBank, redeemMinuteBank, submitPlanned } from './timeRecords'
import { getMinuteBank, setMinuteBank } from './settings'
import { addToBank } from './timeStats'

// Time writes that used to be inline in ScheduleMain (AUDIT F051). Plain Node has no
// localStorage, so the minute bank's key lives in a Map here.
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
})

const day = new Date(2026, 8, 15)
const planEveryDay: SchedulePrefs = { id: 1, completedSurvey: true, daysOut: [0, 1, 2, 3, 4, 5, 6], weeklyHours: 42, yearlyHours: 600 }
const logs = () => db.timeLogs.toArray() as Promise<TimeLog[]>

beforeEach(async () => {
  store.clear()
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
})

describe('addToBank', () => {
  it('rolls every full hour out and keeps the rest', () => {
    expect(addToBank(20, 30)).toEqual({ bank: 50, autoHour: false })
    expect(addToBank(50, 30)).toEqual({ bank: 20, autoHour: true })
    expect(addToBank(0, 60)).toEqual({ bank: 0, autoHour: true })
  })
})

describe('logTime', () => {
  it('writes one row at local noon, keeping the timer interval and a trimmed note', async () => {
    await logTime({ date: day, minutes: 95, category: 'ministry', activityNote: '  Cart ', interval: { startedAt: 1, endedAt: 2 } })
    const [row] = await logs()
    expect(new Date(row.date).getHours()).toBe(12)
    expect(row).toMatchObject({ minutes: 95, category: 'ministry', activityNote: 'Cart', startedAt: 1, endedAt: 2 })
  })
  it('writes nothing for zero minutes', async () => {
    await logTime({ date: day, minutes: 0, category: 'ministry' })
    expect(await logs()).toHaveLength(0)
  })
})

describe('logWithBank', () => {
  it('logs the whole hours and banks the minutes', async () => {
    const r = await logWithBank({ date: day, hours: 2, extraMinutes: 25, category: 'ministry' })
    expect(r).toEqual({ before: 0, after: 25 })
    expect((await logs()).map((l) => l.minutes)).toEqual([120])
    expect(getMinuteBank()).toBe(25)
  })
  it('a bank reaching 60 logs one extra hour, in the same write as the whole hours', async () => {
    setMinuteBank(45)
    const r = await logWithBank({ date: day, hours: 1, extraMinutes: 30, category: 'ministry' })
    expect(r).toEqual({ before: 45, after: 15 })
    expect((await logs()).map((l) => l.minutes).sort()).toEqual([60, 60])
    expect(getMinuteBank()).toBe(15)
  })
  it('if the write fails, neither row lands and the bank is untouched', async () => {
    setMinuteBank(45)
    const add = db.timeLogs.add.bind(db.timeLogs)
    let calls = 0
    db.timeLogs.add = ((row: TimeLog) => (++calls === 2 ? Promise.reject(new Error('killed')) : add(row))) as typeof db.timeLogs.add
    try {
      await expect(logWithBank({ date: day, hours: 1, extraMinutes: 30, category: 'ministry' })).rejects.toThrow()
    } finally {
      db.timeLogs.add = add as typeof db.timeLogs.add
    }
    expect(await logs()).toHaveLength(0)
    expect(getMinuteBank()).toBe(45)
  })
})

describe('redeemMinuteBank', () => {
  it('logs exactly the banked minutes and empties the bank', async () => {
    setMinuteBank(35)
    expect(await redeemMinuteBank(day)).toBe(35)
    expect((await logs()).map((l) => l.minutes)).toEqual([35])
    expect(getMinuteBank()).toBe(0)
  })
  it('does nothing when the bank is empty', async () => {
    expect(await redeemMinuteBank(day)).toBe(0)
    expect(await logs()).toHaveLength(0)
  })
})

describe('submitPlanned', () => {
  it('logs every planned block and takes the day off the plan', async () => {
    await db.schedulePrefs.put({ ...planEveryDay, dateOverrides: { '2026-09-15': [{ start: 540, end: 660, category: 'ministry' }, { start: 780, end: 840, category: 'credit' }] } })
    await submitPlanned(1, day)
    expect((await logs()).map((l) => [l.minutes, l.category])).toEqual([[120, 'ministry'], [60, 'credit']])
    expect((await db.schedulePrefs.get(1))!.dateOverrides!['2026-09-15']).toEqual([])
    await submitPlanned(1, day)
    expect(await logs()).toHaveLength(2)
  })
  it('one block: logs it and leaves the others planned', async () => {
    await db.schedulePrefs.put({ ...planEveryDay, dateOverrides: { '2026-09-15': [{ start: 540, end: 660, category: 'ministry' }, { start: 780, end: 840, category: 'credit' }] } })
    await submitPlanned(1, day, 0)
    expect((await logs()).map((l) => l.minutes)).toEqual([120])
    expect((await db.schedulePrefs.get(1))!.dateOverrides!['2026-09-15']).toEqual([{ start: 780, end: 840, category: 'credit' }])
  })
})

describe('clearDay', () => {
  it("deletes that day's time only and hides its plan for that date", async () => {
    await db.schedulePrefs.put(planEveryDay)
    await logTime({ date: day, minutes: 60, category: 'ministry' })
    await logTime({ date: new Date(2026, 8, 16), minutes: 30, category: 'ministry' })
    await clearDay(1, day)
    expect((await logs()).map((l) => l.minutes)).toEqual([30])
    expect((await db.schedulePrefs.get(1))!.dateOverrides).toEqual({ '2026-09-15': [] })
  })
})
