import type { TimeLog, TimeCategory, SchedulePrefs } from './db'
import { auxTargetHoursFor, type AuxConfig } from './auxPioneering'

export const CREDIT_CAP_HOURS = 55
export const CREDIT_CAP_MIN = CREDIT_CAP_HOURS * 60

export function isCredit(category: TimeCategory) {
  return category !== 'ministry'
}

export interface MonthTotals {
  ministry: number
  credit: number
  total: number
  creditUsed: boolean
  /** Minutes that count toward the yearly goal for this month. */
  applied: number
}

/**
 * Ministry/credit split + capped contribution for a single month's logs.
 *
 * Rule: ministry hours always apply in full, however large (e.g. 72h of pure ministry
 * -> 72h applied). Credit hours (ldc, hlc, convention, assembly, bethel, other) can top
 * that up, but the combined ministry+credit total is capped at 55h toward the yearly
 * goal (e.g. 24h ministry + 64h credit = 88h raw -> only 55h applied). Ministry alone
 * is never reduced by the cap, even when it already exceeds 55h on its own — the cap
 * only limits how much *credit* can add on top, so adding a small credit entry can
 * never lower a month's applied total below what ministry alone already earned.
 * `total` always stays the uncapped raw sum, so the overage that didn't count is still
 * visible.
 */
export function monthTotals(logs: TimeLog[]): MonthTotals {
  let ministry = 0
  let credit = 0
  for (const l of logs) {
    if (isCredit(l.category)) credit += l.minutes
    else ministry += l.minutes
  }
  const total = ministry + credit
  const creditUsed = credit > 0
  const applied = creditUsed ? Math.max(ministry, Math.min(total, CREDIT_CAP_MIN)) : total
  return { ministry, credit, total, creditUsed, applied }
}

/**
 * The JW service year runs September 1 – August 31, labeled by the year it ends in
 * (e.g. Sept 2025 – Aug 2026 is service year 2026).
 */
export function serviceYearLabel(d: Date): number {
  return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear()
}

/** Start/end timestamps (inclusive) for a labeled service year — nothing carries over between years. */
export function serviceYearBounds(label: number): { start: number; end: number } {
  return {
    start: new Date(label - 1, 8, 1).getTime(),
    end: new Date(label, 7, 31, 23, 59, 59, 999).getTime(),
  }
}

export function serviceYearRangeLabel(label: number): string {
  return `Sept ${label - 1} – Aug ${label}`
}

/** Total minutes applied toward the yearly goal for a service year, summed month-by-month with the cap. */
export function serviceYearlyApplied(logs: TimeLog[], label: number): number {
  const { start, end } = serviceYearBounds(label)
  const byMonth = new Map<string, TimeLog[]>()
  for (const l of logs) {
    if (l.date < start || l.date > end) continue
    const d = new Date(l.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const arr = byMonth.get(key) ?? []
    arr.push(l)
    byMonth.set(key, arr)
  }
  let applied = 0
  for (const monthLogs of byMonth.values()) {
    applied += monthTotals(monthLogs).applied
  }
  return applied
}

export interface RawTotals {
  ministry: number
  credit: number
  total: number
}

/**
 * Running total (ministry + credit) for the given service year, no cap.
 * Only exposes the raw sums — `monthTotals`' `applied`/`creditUsed` fields don't mean
 * anything at year granularity (they'd cap the whole year at 55h instead of per-month),
 * so they're intentionally not part of this return type. Use `serviceYearlyApplied`
 * for the real, per-month-capped total that counts toward the yearly goal.
 */
export function serviceYearlyTotals(logs: TimeLog[], label: number): RawTotals {
  const { start, end } = serviceYearBounds(label)
  return monthTotals(logs.filter((l) => l.date >= start && l.date <= end))
}

/** A month's goal, derived from a weekly hours target using the average weeks/month (4.3). */
export function monthlyGoalFromWeekly(weeklyHours: number): number {
  return weeklyHours * 60 * 4.3
}

/**
 * A given month's effective hour goal, in minutes — a pioneer's (or an hours-tracking
 * non-pioneer's) is derived from their weekly target, UNLESS the month is one the person
 * is auxiliary pioneering, in which case the auxiliary target (15h or 30h) takes over
 * instead. Shared by Schedule and Reports so the two screens never disagree about the
 * goal for the same month.
 */
export function effectiveMonthlyGoalMin(prefs: Pick<SchedulePrefs, 'isPioneer' | 'weeklyHours'>, auxConfig: AuxConfig, year: number, month: number): number {
  if (!(prefs.isPioneer ?? true)) {
    const auxTarget = auxTargetHoursFor(auxConfig, year, month)
    if (auxTarget != null) return auxTarget * 60
  }
  return monthlyGoalFromWeekly(prefs.weeklyHours)
}

/** Formats minutes as compact "Xh Ym" (no decimals) — e.g. 90 -> "1h 30m", 45 -> "45m", 120 -> "2h". */
export function fmtDuration(mins: number): string {
  const total = Math.round(mins)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
