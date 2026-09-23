import type { Call, Person, TimeLog } from './db'
import { fmtDuration, isCredit } from './timeStats'

/**
 * The monthly Service Report, as it is handed to the congregation (typed into NW Publisher or
 * the paper slip): Shared in the ministry · Bible studies · Hours · Comments — in that order,
 * and nothing else (CONTEXT.md › Reporting). Pure, so every figure the person copies is tested.
 */
export interface MonthReport {
  year: number
  month: number
  /** Ticked, or implied by any time or any call logged in the month. */
  participated: boolean
  /** True when participation comes from logged activity, not only the tick — the toggle can't
      turn it off then. */
  participationImplied: boolean
  /** Contacts marked as a Bible study who were actually visited (a call, not a not-at-home)
      in the month. Counting today's statuses made every past month show today's number. */
  bibleStudies: number
  bibleStudyNames: string[]
  /** Marked as a Bible study but with no visit logged this month, so not counted — shown so
      an undercount is visible and fixable (log the visit) rather than silent. */
  studiesNotVisited: string[]
  /** Pioneers, and auxiliary pioneers in their months. A publisher's personal goal is for
      them, not the report. */
  showHours: boolean
  /** Whole hours of Ministry. */
  hours: number
  /** Ministry minutes past the last whole hour — not reported this month. */
  leftoverMin: number
  creditMin: number
  /** Suggested text for the Comments box: credit hours and what earned them. Empty when there
      is nothing to say. */
  comments: string
}

function inMonth(ts: number, year: number, month: number): boolean {
  const d = new Date(ts)
  return d.getFullYear() === year && d.getMonth() === month
}

export function buildMonthReport(input: {
  logs: TimeLog[]
  calls: Pick<Call, 'personId' | 'date' | 'notHome'>[]
  people: Pick<Person, 'id' | 'name' | 'status'>[]
  showHours: boolean
  /** The month's participation tick, if set. */
  ticked: boolean
  year: number
  month: number
}): MonthReport {
  const { year, month, showHours } = input
  const logs = input.logs.filter((l) => inMonth(l.date, year, month))
  const calls = input.calls.filter((c) => inMonth(c.date, year, month))

  let ministryMin = 0
  let creditMin = 0
  const creditNotes: string[] = []
  for (const l of logs) {
    if (isCredit(l.category)) {
      creditMin += l.minutes
      const note = l.activityNote?.trim()
      if (note && !creditNotes.some((n) => n.toLowerCase() === note.toLowerCase())) creditNotes.push(note)
    } else {
      ministryMin += l.minutes
    }
  }

  const participationImplied = logs.some((l) => l.minutes > 0) || calls.length > 0
  const visited = new Set(calls.filter((c) => !c.notHome).map((c) => c.personId))
  const byName = (a: string, b: string) => a.localeCompare(b)
  const marked = input.people.filter((p) => p.status === 'bible-study')
  const studies = marked.filter((p) => visited.has(p.id)).map((p) => p.name).sort(byName)
  const studiesNotVisited = marked.filter((p) => !visited.has(p.id)).map((p) => p.name).sort(byName)

  const comments = showHours && creditMin > 0
    ? `Credit hours: ${fmtDuration(creditMin)}${creditNotes.length ? ` (${creditNotes.join(', ')})` : ''}`
    : ''

  return {
    year,
    month,
    participated: input.ticked || participationImplied,
    participationImplied,
    bibleStudies: studies.length,
    bibleStudyNames: studies,
    studiesNotVisited,
    showHours,
    hours: Math.floor(ministryMin / 60),
    leftoverMin: ministryMin % 60,
    creditMin,
    comments,
  }
}

/** Whether there is anything to hand in — a month with no activity has no report to share. */
export function hasSomethingToReport(r: MonthReport): boolean {
  return r.participated || r.bibleStudies > 0
}

/** The plain-text report, in the form's order, for Share / Copy all. */
export function reportText(r: MonthReport, monthLabel: string): string {
  const lines = [
    `Service report — ${monthLabel}`,
    `Shared in the ministry: ${r.participated ? 'Yes' : 'No'}`,
    `Bible studies: ${r.bibleStudies}`,
  ]
  if (r.showHours) lines.push(`Hours: ${r.hours}`)
  if (r.comments) lines.push(`Comments: ${r.comments}`)
  return lines.join('\n')
}

/**
 * Which month's report to lead with on `today`: during the first ten days, last month's —
 * while it hasn't been marked submitted and there is something to report. Otherwise null
 * (the Report tab then opens on the current month, and the Service tab shows no banner).
 */
export const REPORT_DUE_DAYS = 10
export function dueReportMonth(
  today: Date,
  isSubmitted: (year: number, month: number) => boolean,
  hasActivity: (year: number, month: number) => boolean
): { year: number; month: number } | null {
  if (today.getDate() > REPORT_DUE_DAYS) return null
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const y = prev.getFullYear()
  const m = prev.getMonth()
  if (isSubmitted(y, m) || !hasActivity(y, m)) return null
  return { year: y, month: m }
}
