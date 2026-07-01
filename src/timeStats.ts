import type { TimeLog, TimeCategory } from './db'

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

/** Ministry/credit split + capped contribution for a single month's logs. */
export function monthTotals(logs: TimeLog[]): MonthTotals {
  let ministry = 0
  let credit = 0
  for (const l of logs) {
    if (isCredit(l.category)) credit += l.minutes
    else ministry += l.minutes
  }
  const total = ministry + credit
  const creditUsed = credit > 0
  // If any credit hours were claimed this month, only up to 55h of the combined
  // total counts toward the yearly goal. With no credit, all ministry hours count.
  const applied = creditUsed ? Math.min(total, CREDIT_CAP_MIN) : total
  return { ministry, credit, total, creditUsed, applied }
}

/** Total minutes applied toward the yearly goal, summed month-by-month with the cap. */
export function yearlyApplied(logs: TimeLog[], year: number): number {
  const byMonth = new Map<number, TimeLog[]>()
  for (const l of logs) {
    const d = new Date(l.date)
    if (d.getFullYear() !== year) continue
    const m = d.getMonth()
    const arr = byMonth.get(m) ?? []
    arr.push(l)
    byMonth.set(m, arr)
  }
  let applied = 0
  for (const monthLogs of byMonth.values()) {
    applied += monthTotals(monthLogs).applied
  }
  return applied
}

/** Running total (ministry + credit) for the given year, no cap. */
export function yearlyTotals(logs: TimeLog[], year: number) {
  return monthTotals(logs.filter((l) => new Date(l.date).getFullYear() === year))
}
