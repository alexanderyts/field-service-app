import { type TimeLog } from '../../db'

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_START = 6 * 60 // 6:00 AM
export const DAY_END = 22 * 60 // 10:00 PM
export const DAY_RANGE = DAY_END - DAY_START

/** Position (%) of a time-of-day within the visible day track, clamped to the track's
    edges — an appointment or suggested window outside 6AM–10PM would otherwise render
    with a negative/overflowing offset instead of just pinning to the nearer edge. */
export function dayTrackPct(mins: number): number {
  return Math.min(100, Math.max(0, ((mins - DAY_START) / DAY_RANGE) * 100))
}
export function fmtTime(mins: number) {
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}
export function startOfWeek(ref: Date) {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // Sunday start
  return d
}
export function fmtDayMonth(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
export function fmtDayMonthFull(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

/** Calendar-year week number (Sunday-start, week 1 = the week containing Jan 1) — deliberately
    the plain calendar week, not the JW service-year week, and computed from the full week's
    start (not whichever segment is shown), so both halves of a month-split week display the
    same number and a single-day segment still reads as "part of week N". */
export function calendarWeekNumber(weekStartMs: number): number {
  const d = new Date(weekStartMs)
  const jan1WeekStart = startOfWeek(new Date(d.getFullYear(), 0, 1)).getTime()
  return Math.round((weekStartMs - jan1WeekStart) / (7 * 24 * 60 * 60 * 1000)) + 1
}
export const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** January through December of the current calendar year — the auxiliary-pioneering
    "multiple months" picker always shows this fixed list, not a rolling window, so it
    reads the same regardless of which month someone happens to be browsing in. */
export function currentYearMonths(): { year: number; month: number; label: string }[] {
  const year = new Date().getFullYear()
  return MONTH_NAMES_LONG.map((label, month) => ({ year, month, label }))
}

/** Every distinct (year, month) touched by [startMs, endMs) — usually one, occasionally two
    when a week straddles a month boundary. */
export function monthsTouchedByRange(startMs: number, endMs: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  const seen = new Set<string>()
  for (let t = startMs; t < endMs; t += 24 * 60 * 60 * 1000) {
    const d = new Date(t)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ year: d.getFullYear(), month: d.getMonth() })
    }
  }
  return out
}
export function monthLogsFor(logs: TimeLog[], year: number, month: number): TimeLog[] {
  return logs.filter((l) => {
    const d = new Date(l.date)
    return d.getFullYear() === year && d.getMonth() === month
  })
}
/** -1 = the given month is already past, 0 = it's the current month, 1 = still ahead. */
function monthVsToday(year: number, month: number, today: Date): -1 | 0 | 1 {
  const diff = (year - today.getFullYear()) * 12 + (month - today.getMonth())
  return diff < 0 ? -1 : diff > 0 ? 1 : 0
}
export function daysLeftInMonth(year: number, month: number, today: Date): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cmp = monthVsToday(year, month, today)
  if (cmp < 0) return 0
  if (cmp > 0) return daysInMonth
  return Math.max(0, daysInMonth - today.getDate())
}

/** % of the month elapsed — a past month reads 100, a future one 0, so every month the
    schedule navigates to gets a meaningful bar instead of only the current one. */
export function monthElapsedPct(year: number, month: number, today: Date): number {
  const cmp = monthVsToday(year, month, today)
  if (cmp < 0) return 100
  if (cmp > 0) return 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Math.round((today.getDate() / daysInMonth) * 100)
}
/** Suggested weekly hours to reach a given yearly goal, evenly over a 52-week year. */
export function weeklyFromYearly(yearlyHours: number): string {
  return String(Math.round((yearlyHours / 52) * 10) / 10)
}
export function minutesToTimeInput(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}
export function timeInputToMinutes(v: string): number {
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}

/** All suggested time blocks for a weekly-schedule day, normalized. New-style entries
    store `blocks` directly; legacy entries (a single ministry window from the survey or
    older app versions) are converted on the fly — end derived from the weekly goal split
    evenly across selected days when absent — so stored data never needs a migration. A
    day that's selected but has no entry at all defaults to a 9am–3pm ministry block. */
// ── Calendar picker ──────────────────────────────────────────
export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
export const DOW_SHORT = ['S','M','T','W','T','F','S']
