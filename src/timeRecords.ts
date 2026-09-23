import { db, type TimeCategory, type TimeLog } from './db'
import { getMinuteBank, setMinuteBank } from './settings'
import { addToBank } from './timeStats'
import { blocksForDate } from './components/schedule/plan'
import { fmtLocalDate } from './localDate'

// Time-log writes that used to be inline in ScheduleMain (AUDIT F051), each one transaction and
// tested against fake-indexeddb in timeRecords.test.ts. Kept apart from records.ts because only
// the lazily-loaded Service tab needs them — records.ts ships in the startup bundle.
//
// ── Time logs ────────────────────────────────────────────────────────────────
// Every log lands at local noon of its day, so no timezone shift can move it across midnight.

export interface TimeEntry {
  date: Date
  minutes: number
  category: TimeCategory
  activityNote?: string
  /** The live timer's real interval, kept for the person's own records. */
  interval?: { startedAt: number; endedAt: number }
}

function noonOf(date: Date): number {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}

function timeLogRow(e: TimeEntry): TimeLog {
  return {
    date: noonOf(e.date),
    minutes: e.minutes,
    category: e.category,
    activityNote: e.activityNote?.trim() || undefined,
    startedAt: e.interval?.startedAt,
    endedAt: e.interval?.endedAt,
  } as TimeLog
}

export async function logTime(e: TimeEntry): Promise<void> {
  if (e.minutes <= 0) return
  await db.timeLogs.add(timeLogRow(e))
}

/**
 * Log `hours` whole and put `extraMinutes` in the minute bank; a bank that reaches 60 rolls
 * out one logged hour. Ministry only — credit is logged whole (AUDIT F-A6).
 *
 * The rolled-over hour and the whole hours are one transaction (F051: as two separate adds, a
 * crash between them re-banked minutes that had already become an hour). The bank is written
 * only after the commit, so the one gap left is a synchronous step, and failing there keeps
 * minutes rather than losing them.
 */
export async function logWithBank(e: Omit<TimeEntry, 'minutes'> & { hours: number; extraMinutes: number }): Promise<{ before: number; after: number }> {
  const before = getMinuteBank()
  const { bank, autoHour } = addToBank(before, e.extraMinutes)
  await db.transaction('rw', db.timeLogs, async () => {
    if (autoHour) await db.timeLogs.add({ date: noonOf(e.date), minutes: 60, category: e.category, note: 'Added from minute bank' } as TimeLog)
    if (e.hours > 0) await db.timeLogs.add(timeLogRow({ ...e, minutes: e.hours * 60 }))
  })
  setMinuteBank(bank)
  return { before, after: bank }
}

/** Log exactly what is in the minute bank today, as one ministry entry, and empty it. */
export async function redeemMinuteBank(today: Date): Promise<number> {
  const minutes = getMinuteBank()
  if (minutes <= 0) return 0
  await db.timeLogs.add({ date: noonOf(today), minutes, category: 'ministry', note: 'Added from minute bank' } as TimeLog)
  setMinuteBank(0)
  return minutes
}

/**
 * Log a day's planned blocks as time — all of them, or just `blockIndex` — and take them off
 * that date (a date override holding what's left), so the same plan can't be logged twice.
 * The recurring weekly pattern is untouched.
 */
export async function submitPlanned(prefsId: number, date: Date, blockIndex?: number): Promise<void> {
  await db.transaction('rw', db.timeLogs, db.schedulePrefs, async () => {
    const current = await db.schedulePrefs.get(prefsId)
    if (!current) return
    const blocks = blocksForDate(current, date)
    const chosen = blockIndex == null ? blocks : blocks[blockIndex] ? [blocks[blockIndex]] : []
    if (chosen.length === 0) return
    for (const b of chosen) {
      if (b.end > b.start) await db.timeLogs.add({ date: noonOf(date), minutes: b.end - b.start, category: b.category } as TimeLog)
    }
    const remaining = blockIndex == null ? [] : blocks.filter((_, i) => i !== blockIndex)
    await db.schedulePrefs.update(prefsId, { dateOverrides: { ...(current.dateOverrides ?? {}), [fmtLocalDate(date)]: remaining } })
  })
}

/** Delete a day's logged time and hide its planned blocks for that date only. */
export async function clearDay(prefsId: number, date: Date): Promise<void> {
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
  await db.transaction('rw', db.timeLogs, db.schedulePrefs, async () => {
    const current = await db.schedulePrefs.get(prefsId)
    await db.timeLogs.where('date').between(dayStart.getTime(), dayEnd.getTime(), true, true).delete()
    if (current && blocksForDate(current, date).length > 0) {
      await db.schedulePrefs.update(prefsId, { dateOverrides: { ...(current.dateOverrides ?? {}), [fmtLocalDate(date)]: [] } })
    }
  })
}
