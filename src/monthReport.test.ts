import { describe, expect, it } from 'vitest'
import type { TimeLog } from './db'
import { buildMonthReport, dueReportMonth, hasSomethingToReport, reportText } from './monthReport'
import { roleReportsHours } from './schedulePrefsRole'
import type { AuxConfig } from './auxPioneering'

const at = (d: number, m = 8, y = 2026) => new Date(y, m, d, 12).getTime()
const log = (minutes: number, day = 5, extra: Partial<TimeLog> = {}): TimeLog =>
  ({ id: 0, date: at(day), minutes, category: 'ministry', ...extra }) as TimeLog

const people = [
  { id: 1, name: 'Zoe', status: 'bible-study' as const },
  { id: 2, name: 'Adam', status: 'bible-study' as const },
  { id: 3, name: 'Carl', status: 'bible-study' as const },
  { id: 4, name: 'Dana', status: 'interested' as const },
]
const base = { logs: [] as TimeLog[], calls: [], people, showHours: true, ticked: false, year: 2026, month: 8 }

describe('buildMonthReport', () => {
  it('reports whole Ministry hours and keeps the leftover minutes apart', () => {
    const r = buildMonthReport({ ...base, logs: [log(120), log(95), log(60, 3, { date: at(3, 7) })] })
    expect([r.hours, r.leftoverMin]).toEqual([3, 35])
  })

  it('participation: the tick, or any time, or any call — even a not-at-home', () => {
    expect(buildMonthReport(base).participated).toBe(false)
    expect(buildMonthReport({ ...base, ticked: true })).toMatchObject({ participated: true, participationImplied: false })
    expect(buildMonthReport({ ...base, logs: [log(30)] })).toMatchObject({ participated: true, participationImplied: true })
    expect(buildMonthReport({ ...base, calls: [{ personId: 4, date: at(9), notHome: true }] }).participated).toBe(true)
    // Activity in another month says nothing about this one.
    expect(buildMonthReport({ ...base, calls: [{ personId: 4, date: at(9, 7) }] }).participated).toBe(false)
  })

  it('counts only Bible studies actually visited that month, names sorted', () => {
    const r = buildMonthReport({
      ...base,
      calls: [
        { personId: 1, date: at(2) },
        { personId: 2, date: at(20) },
        { personId: 3, date: at(4), notHome: true }, // not conducted
        { personId: 4, date: at(4) }, // not a study
        { personId: 3, date: at(30, 7) }, // other month
      ],
    })
    expect(r.bibleStudies).toBe(2)
    expect(r.bibleStudyNames).toEqual(['Adam', 'Zoe'])
    expect(r.studiesNotVisited).toEqual(['Carl'])
  })

  it('puts credit in the comments with what earned it, once each', () => {
    const r = buildMonthReport({
      ...base,
      logs: [log(300, 2, { category: 'credit', activityNote: 'LDC' }), log(120, 9, { category: 'credit', activityNote: 'ldc ' }), log(60, 10, { category: 'credit', activityNote: 'Assembly' })],
    })
    expect(r.hours).toBe(0)
    expect(r.creditMin).toBe(480)
    expect(r.comments).toBe('Credit hours: 8h (LDC, Assembly)')
  })

  it('a publisher report has no hours and no credit comment', () => {
    const r = buildMonthReport({ ...base, showHours: false, logs: [log(600), log(60, 2, { category: 'credit' })] })
    expect(r.comments).toBe('')
    expect(reportText(r, 'September 2026')).toBe('Service report — September 2026\nShared in the ministry: Yes\nBible studies: 0')
  })
})

describe('reportText', () => {
  it('follows the form: shared, studies, hours, comments', () => {
    const r = buildMonthReport({ ...base, calls: [{ personId: 1, date: at(2) }], logs: [log(125), log(60, 3, { category: 'credit' })] })
    expect(reportText(r, 'September 2026')).toBe(
      'Service report — September 2026\nShared in the ministry: Yes\nBible studies: 1\nHours: 2\nComments: Credit hours: 1h'
    )
  })
  it('hasSomethingToReport: participation or a study', () => {
    expect(hasSomethingToReport(buildMonthReport(base))).toBe(false)
    expect(hasSomethingToReport(buildMonthReport({ ...base, ticked: true }))).toBe(true)
  })
})

describe('roleReportsHours', () => {
  const aux = (months: string[]): AuxConfig =>
    ({ enabled: true, mode: 'multiple-months', months, monthTargets: {}, targetHours: 30, weeklyHours: 7 }) as unknown as AuxConfig
  const off = { enabled: false, mode: null } as unknown as AuxConfig
  it('pioneers always; a publisher never, whatever their personal goal', () => {
    expect(roleReportsHours('pioneer', off, 2026, 8)).toBe(true)
    expect(roleReportsHours('publisher', off, 2026, 8)).toBe(false)
  })
  it('an auxiliary pioneer only in their months', () => {
    expect(roleReportsHours('auxiliary', aux(['2026-8']), 2026, 8)).toBe(true)
    expect(roleReportsHours('auxiliary', aux(['2026-8']), 2026, 9)).toBe(false)
  })
})

describe('dueReportMonth', () => {
  const never = () => false
  const always = () => true
  it('on days 1–10, last month is due until it is marked submitted', () => {
    expect(dueReportMonth(new Date(2026, 9, 1), never, always)).toEqual({ year: 2026, month: 8 })
    expect(dueReportMonth(new Date(2026, 9, 10), never, always)).toEqual({ year: 2026, month: 8 })
    expect(dueReportMonth(new Date(2026, 9, 11), never, always)).toBeNull()
    expect(dueReportMonth(new Date(2026, 9, 3), always, always)).toBeNull()
  })
  it('January asks for December of the year before; a month with no activity is never due', () => {
    expect(dueReportMonth(new Date(2027, 0, 2), never, always)).toEqual({ year: 2026, month: 11 })
    expect(dueReportMonth(new Date(2027, 0, 2), never, never)).toBeNull()
  })
})
