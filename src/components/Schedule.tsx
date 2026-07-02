import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Appointment, type SchedulePrefs, type TimeCategory, type TimeLog } from '../db'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../categories'
import {
  effectiveMonthlyGoalMin,
  fmtDuration,
  isCredit,
  monthTotals,
  serviceYearLabel,
  serviceYearRangeLabel,
  serviceYearlyApplied,
  serviceYearlyTotals,
} from '../timeStats'
import ConfirmDialog from './ConfirmDialog'
import ModalPortal from '../ModalPortal'
import { type AuxConfig, type AuxMode, auxMonthKey, getAuxConfig, isAuxMonth, saveAuxConfig, suggestedWeeklyHours } from '../auxPioneering'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DAY_START = 6 * 60 // 6:00 AM
const DAY_END = 22 * 60 // 10:00 PM
const DAY_RANGE = DAY_END - DAY_START

/** Position (%) of a time-of-day within the visible day track, clamped to the track's
    edges — an appointment or suggested window outside 6AM–10PM would otherwise render
    with a negative/overflowing offset instead of just pinning to the nearer edge. */
function dayTrackPct(mins: number): number {
  return Math.min(100, Math.max(0, ((mins - DAY_START) / DAY_RANGE) * 100))
}

function fmtTime(mins: number) {
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

function startOfWeek(ref: Date) {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // Sunday start
  return d
}

function fmtDayMonth(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtDayMonthFull(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

/** Calendar-year week number (Sunday-start, week 1 = the week containing Jan 1) — deliberately
    the plain calendar week, not the JW service-year week, and computed from the full week's
    start (not whichever segment is shown), so both halves of a month-split week display the
    same number and a single-day segment still reads as "part of week N". */
function calendarWeekNumber(weekStartMs: number): number {
  const d = new Date(weekStartMs)
  const jan1WeekStart = startOfWeek(new Date(d.getFullYear(), 0, 1)).getTime()
  return Math.round((weekStartMs - jan1WeekStart) / (7 * 24 * 60 * 60 * 1000)) + 1
}

/** Parses a `YYYY-MM-DD` (from a date input) as a local date, avoiding the UTC-midnight shift. */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Formats a Date as `YYYY-MM-DD` using local time — the inverse of parseLocalDate. Do not
    use `toISOString().slice(0,10)` here, since that converts to UTC first and rolls the date
    to tomorrow for anyone west of UTC in the evening. */
function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MONTH_NAMES_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** The 12 months starting with the current one, rolling into next year as needed — used for
    month pickers so a month never becomes unselectable just because it's in the next
    calendar year (e.g. planning January's auxiliary pioneering while browsing in November). */
function rollingTwelveMonths(now: Date): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    out.push({ year: d.getFullYear(), month: d.getMonth(), label: MONTH_NAMES_LONG[d.getMonth()] })
  }
  return out
}

/** Every distinct (year, month) touched by [startMs, endMs) — usually one, occasionally two
    when a week straddles a month boundary. */
function monthsTouchedByRange(startMs: number, endMs: number): { year: number; month: number }[] {
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


function monthLogsFor(logs: TimeLog[], year: number, month: number): TimeLog[] {
  return logs.filter((l) => {
    const d = new Date(l.date)
    return d.getFullYear() === year && d.getMonth() === month
  })
}

function daysLeftInMonth(year: number, month: number, today: Date): number | null {
  if (today.getFullYear() !== year || today.getMonth() !== month) return null
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Math.max(0, daysInMonth - today.getDate())
}

/** % of the month elapsed so far — only meaningful for the actual current month. */
function monthElapsedPct(year: number, month: number, today: Date): number | null {
  if (today.getFullYear() !== year || today.getMonth() !== month) return null
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return Math.round((today.getDate() / daysInMonth) * 100)
}

// ── Non-pioneer monthly participation (localStorage, keyed by "YYYY-M") ───────
// A non-pioneer with no goal and not auxiliary pioneering doesn't track hours at all —
// just whether they went out in service that month, once, not per-day.
function monthlyKey(year: number, month: number) { return `${year}-${month}` }

function getParticipatedMonth(year: number, month: number): boolean {
  try {
    const map = JSON.parse(localStorage.getItem('fieldservice_participated_months') ?? '{}')
    return !!map[monthlyKey(year, month)]
  } catch { return false }
}

function setParticipatedMonth(year: number, month: number, participated: boolean) {
  try {
    const map = JSON.parse(localStorage.getItem('fieldservice_participated_months') ?? '{}')
    map[monthlyKey(year, month)] = participated
    localStorage.setItem('fieldservice_participated_months', JSON.stringify(map))
  } catch { /* localStorage unavailable — won't persist */ }
}

export default function Schedule({ onGoToContact }: { onGoToContact: (personId: number) => void }) {
  const prefs = useLiveQuery(() => db.schedulePrefs.toArray(), [])

  if (prefs === undefined) return <div className="view" />

  const current = prefs[0]
  if (!current || !current.completedSurvey) {
    return <Survey existing={current} onDone={() => {}} />
  }

  return (
    <ScheduleMain
      prefs={current}
      onRedo={async () => { await db.schedulePrefs.update(current.id, { completedSurvey: false }) }}
      onGoToContact={onGoToContact}
    />
  )
}

/** Suggested weekly hours to reach a given yearly goal, evenly over a 52-week year. */
function weeklyFromYearly(yearlyHours: number): string {
  return String(Math.round((yearlyHours / 52) * 10) / 10)
}

function minutesToTimeInput(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function timeInputToMinutes(v: string): number {
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}

function Survey({ existing, onDone }: { existing?: SchedulePrefs; onDone: () => void }) {
  // Matches db.ts's documented default: a legacy record that predates this field is
  // treated as a pioneer everywhere else in the app, so redoing the survey on one
  // should start pre-answered the same way instead of looking unanswered. A brand-new
  // user (no existing record at all) gets no default — they must answer explicitly.
  const [isPioneer, setIsPioneer] = useState<boolean | null>(existing ? (existing.isPioneer ?? true) : null)
  const [creditYes, setCreditYes] = useState<boolean | null>(
    existing ? localStorage.getItem('fieldservice_credit_hours') === 'yes' : null
  )
  // Days start unselected either way — this is a plan the person builds, not a default
  // guessed on their behalf.
  const [daysOut, setDaysOut] = useState<number[]>(existing?.daysOut ?? [])
  const [daySchedule, setDaySchedule] = useState<Record<number, { start: number; end?: number }>>(existing?.daySchedule ?? {})
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [yearlyHours, setYearlyHours] = useState(String(existing?.yearlyHours ?? 600))
  const [weeklyHours, setWeeklyHours] = useState(() => (existing ? String(existing.weeklyHours) : weeklyFromYearly(600)))
  // Once the person types into "hours per week" directly, stop overwriting it whenever
  // the yearly goal changes — otherwise their manual edit would keep getting clobbered.
  const [weeklyTouched, setWeeklyTouched] = useState(!!existing)
  const [goalPeriod, setGoalPeriod] = useState<'none' | 'monthly' | 'yearly'>(existing?.goalPeriod ?? 'none')

  function handleYearlyChange(v: string) {
    setYearlyHours(v)
    if (!weeklyTouched) setWeeklyHours(weeklyFromYearly(Number(v) || 0))
  }

  function handleWeeklyChange(v: string) {
    setWeeklyHours(v)
    setWeeklyTouched(true)
  }

  function saveDayStart(startTime: string) {
    if (editingDay == null) return
    setDaysOut((prev) => (prev.includes(editingDay) ? prev : [...prev, editingDay].sort()))
    setDaySchedule((prev) => ({ ...prev, [editingDay]: { start: timeInputToMinutes(startTime) } }))
    setEditingDay(null)
  }

  function removeDay() {
    if (editingDay == null) return
    setDaysOut((prev) => prev.filter((x) => x !== editingDay))
    setDaySchedule((prev) => {
      const next = { ...prev }
      delete next[editingDay]
      return next
    })
    setEditingDay(null)
  }

  const collectsSchedule = isPioneer === true || (isPioneer === false && goalPeriod !== 'none')

  async function save() {
    if (isPioneer == null) return
    const record: Omit<SchedulePrefs, 'id'> = {
      completedSurvey: true,
      isPioneer,
      daysOut: collectsSchedule ? daysOut : [],
      daySchedule: collectsSchedule ? daySchedule : {},
      weeklyHours: collectsSchedule ? Number(weeklyHours) || 0 : 0,
      yearlyHours: isPioneer || goalPeriod === 'yearly' ? Number(yearlyHours) || 0 : 0,
      goalPeriod: isPioneer ? 'none' : goalPeriod,
    }
    // Non-pioneers never count credit hours; pioneers answered the question above.
    localStorage.setItem('fieldservice_credit_hours', isPioneer && creditYes ? 'yes' : 'no')
    if (existing) {
      await db.schedulePrefs.update(existing.id, record)
    } else {
      await db.schedulePrefs.add(record as SchedulePrefs)
    }
    onDone()
  }

  const readyToShowRest = isPioneer === false || (isPioneer === true && creditYes !== null)

  return (
    <div className="view">
      <h2 className="applet-title">Plan Your Schedule</h2>
      <p className="subtitle">Answer a few questions and we'll build a suggested weekly schedule for you.</p>

      <div className="card">
        <h4>Are you regular pioneering?</h4>
        <div className="row">
          <button className={isPioneer === true ? '' : 'secondary'} onClick={() => setIsPioneer(true)}>
            Yes, I'm a pioneer
          </button>
          <button className={isPioneer === false ? '' : 'secondary'} onClick={() => { setIsPioneer(false); setCreditYes(null) }}>
            Not right now
          </button>
        </div>
      </div>

      {isPioneer === true && (
        <div className="card">
          <h4>Would you like to count credit hours?</h4>
          <p className="muted" style={{ marginTop: -6 }}>
            LDC, Convention, Assembly, Bethel, and Other — in addition to ministry time.
          </p>
          <div className="row">
            <button className={creditYes === true ? '' : 'secondary'} onClick={() => setCreditYes(true)}>Yes</button>
            <button className={creditYes === false ? '' : 'secondary'} onClick={() => setCreditYes(false)}>No</button>
          </div>
        </div>
      )}

      {readyToShowRest && isPioneer === false && (
        <div className="card">
          <h4>
            Set a personal goal? <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(optional)</span>
          </h4>
          <div className="row">
            <button className={goalPeriod === 'none' ? '' : 'secondary'} onClick={() => setGoalPeriod('none')}>No goal</button>
            <button className={goalPeriod === 'monthly' ? '' : 'secondary'} onClick={() => setGoalPeriod('monthly')}>Monthly</button>
            <button className={goalPeriod === 'yearly' ? '' : 'secondary'} onClick={() => setGoalPeriod('yearly')}>Yearly</button>
          </div>
        </div>
      )}

      {readyToShowRest && collectsSchedule && (
        <div className="card">
          <h4>Which days do you want to go out in service?</h4>
          <p className="muted" style={{ marginTop: -6 }}>Tap a day to set (or change) what time you want to start.</p>
          <div className="day-toggle">
            {DAYS.map((d, i) => (
              <button key={i} className={daysOut.includes(i) ? 'chip active' : 'chip'} onClick={() => setEditingDay(i)}>
                {d}
                {daysOut.includes(i) && daySchedule[i] && (
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 500 }}>{fmtTime(daySchedule[i].start)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {readyToShowRest && isPioneer === true && (
        <div className="card">
          <h4>How much time do you want each week?</h4>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Yearly goal (hrs)</span>
              <input type="number" min="0" value={yearlyHours} onChange={(e) => handleYearlyChange(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Hours per week</span>
              <input type="number" min="0" value={weeklyHours} onChange={(e) => handleWeeklyChange(e.target.value)} />
            </label>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Weekly hours are suggested from your yearly goal — feel free to adjust.
          </p>
        </div>
      )}

      {readyToShowRest && isPioneer === false && goalPeriod !== 'none' && (
        <div className="card">
          <h4>How much time do you want each week?</h4>
          <div className="field-row">
            {goalPeriod === 'yearly' && (
              <label className="field">
                <span className="field-label">Yearly goal (hrs)</span>
                <input type="number" min="0" value={yearlyHours} onChange={(e) => handleYearlyChange(e.target.value)} />
              </label>
            )}
            <label className="field">
              <span className="field-label">Hours per week</span>
              <input type="number" min="0" value={weeklyHours} onChange={(e) => handleWeeklyChange(e.target.value)} />
            </label>
          </div>
        </div>
      )}

      {readyToShowRest && (
        <>
          {collectsSchedule && daysOut.length === 0 && (
            <p className="muted" style={{ fontSize: 13, margin: '-4px 0 6px' }}>
              No days picked — that's fine, you can build a schedule later. For now this'll just track your hours.
            </p>
          )}
          <button onClick={save}>Build My Schedule</button>
        </>
      )}

      {editingDay != null && (
        <TimeInputModal
          title={`What time do you want to start on ${DAY_NAMES_FULL[editingDay]}?`}
          initialStart={minutesToTimeInput(daySchedule[editingDay]?.start ?? 9 * 60)}
          showEnd={false}
          onSave={saveDayStart}
          onRemove={daysOut.includes(editingDay) ? removeDay : undefined}
          onClose={() => setEditingDay(null)}
        />
      )}
    </div>
  )
}

function ScheduleMain({
  prefs,
  onRedo,
  onGoToContact,
}: {
  prefs: SchedulePrefs
  onRedo: () => void
  onGoToContact: (personId: number) => void
}) {
  const logs = useLiveQuery(() => db.timeLogs.orderBy('date').reverse().toArray(), []) ?? []
  const appointments = useLiveQuery(() => db.appointments.orderBy('date').toArray(), []) ?? []
  const now = new Date()
  const thisWeekStartMs = startOfWeek(now).getTime()

  const [weekOpen, setWeekOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  // When the navigated week straddles a month boundary, this picks which of the two
  // months' days are "active" (the other side fades) — null means "use the natural
  // default" (today's month, for the current week; the earlier month, for a navigated
  // one). Explicitly set only by the prev/next week-nav buttons flipping within a
  // straddling week; cleared whenever weekOffset changes some other way (jump-to-current,
  // jump-to-return-visit) so that week starts at its own natural default again.
  const [segmentOverride, setSegmentOverride] = useState<number | null>(null)
  const [highlightTs, setHighlightTs] = useState<number | null>(null)
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<number | null>(null)
  const [visibleLogCount, setVisibleLogCount] = useState(4)
  const [showCalendarView, setShowCalendarView] = useState(false)
  const [dayModalFor, setDayModalFor] = useState<number | null>(null)

  const weekStartMs = thisWeekStartMs + weekOffset * 7 * 24 * 60 * 60 * 1000
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000

  function jumpToNextReturnVisit() {
    const next = appointments.filter((a) => a.date >= Date.now()).sort((a, b) => a.date - b.date)[0]
    if (!next) return
    const targetWeekStart = startOfWeek(new Date(next.date)).getTime()
    setSegmentOverride(null)
    setWeekOffset(Math.round((targetWeekStart - thisWeekStartMs) / (7 * 24 * 60 * 60 * 1000)))
    setWeekOpen(true)
    setHighlightTs(next.date)
  }

  const isPioneer = prefs.isPioneer ?? true // missing on records saved before this field existed
  const [auxConfig, setAuxConfigState] = useState<AuxConfig>(() => getAuxConfig())
  function updateAuxConfig(next: AuxConfig) {
    setAuxConfigState(next)
    saveAuxConfig(next)
  }

  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []

  // Whether TODAY (not whatever week is navigated below) is a month this non-pioneer is
  // auxiliary pioneering — decides whether Add Time or the simple monthly checkbox shows.
  const currentlyAux = !isPioneer && isAuxMonth(auxConfig, now.getFullYear(), now.getMonth())
  const nonPioneerTracksHours = !isPioneer && (prefs.goalPeriod === 'monthly' || prefs.goalPeriod === 'yearly' || currentlyAux)

  // Top progress card tracks whichever week is navigated below — not always "today" — so
  // the month/year context at the top actually follows what the person is looking at.
  let weekMinistry = 0
  let weekCredit = 0
  for (const l of logs) {
    if (l.date >= weekStartMs && l.date < weekEndMs) {
      if (isCredit(l.category)) weekCredit += l.minutes
      else weekMinistry += l.minutes
    }
  }
  const weekTotal = weekMinistry + weekCredit

  // touchedMonths is chronological (day-by-day from weekStartMs), so [0] is always the
  // earlier month and [1] (if present) the later one — a week can touch at most 2.
  const touchedMonths = monthsTouchedByRange(weekStartMs, weekEndMs)
  const isSplitWeek = touchedMonths.length > 1
  const todaySegment = touchedMonths.findIndex((m) => m.year === now.getFullYear() && m.month === now.getMonth())
  const defaultSegment = weekOffset === 0 && todaySegment >= 0 ? todaySegment : 0
  const segment = isSplitWeek ? (segmentOverride ?? defaultSegment) : 0
  const primaryMonth = touchedMonths[segment] ?? touchedMonths[0]
  const monthYearLabel = `${MONTH_NAMES_LONG[primaryMonth.month]} ${primaryMonth.year}`
  // Only meaningful for a split week — the exact day range within it that belongs to
  // whichever month is currently shown, for the "June 28 – 30" style partial label.
  const segmentBoundaryMs = (() => {
    if (!isSplitWeek) return weekStartMs
    let boundary = weekStartMs
    for (let t = weekStartMs; t < weekEndMs; t += 24 * 60 * 60 * 1000) {
      const d = new Date(t)
      if (d.getFullYear() === touchedMonths[0].year && d.getMonth() === touchedMonths[0].month) {
        boundary = t + 24 * 60 * 60 * 1000
      } else break
    }
    return boundary
  })()
  const segmentStartMs = isSplitWeek && segment === 1 ? segmentBoundaryMs : weekStartMs
  const segmentEndMs = isSplitWeek && segment === 0 ? segmentBoundaryMs : weekEndMs

  // Landing on a fresh week (not flipping segments within the current one) always
  // starts fresh — the natural default is recomputed above from weekOffset/todaySegment.
  function goToWeekOffset(next: number) {
    setSegmentOverride(null)
    setWeekOffset(next)
  }

  function goNextWeek() {
    if (isSplitWeek && segment === 0) {
      setSegmentOverride(1)
    } else {
      // Entering a new week forward always starts at its earlier month, if it splits.
      setSegmentOverride(0)
      setWeekOffset((o) => o + 1)
    }
    setHighlightTs(null)
  }

  function goPrevWeek() {
    if (isSplitWeek && segment === 1) {
      setSegmentOverride(0)
    } else {
      // Entering a new week backward lands on its later month first, if it splits —
      // the natural "last thing before where you were," matching chronological order.
      const prevOffset = weekOffset - 1
      const prevStart = thisWeekStartMs + prevOffset * 7 * 24 * 60 * 60 * 1000
      const prevMonths = monthsTouchedByRange(prevStart, prevStart + 7 * 24 * 60 * 60 * 1000)
      setSegmentOverride(prevMonths.length > 1 ? 1 : null)
      setWeekOffset(prevOffset)
    }
    setHighlightTs(null)
  }

  // How many days remain in the month being viewed — only meaningful when that's the
  // actual current month, since a past/future navigated week isn't "the month you live in".
  const monthDaysLeft = daysLeftInMonth(primaryMonth.year, primaryMonth.month, now)
  const monthElapsedPctVal = monthElapsedPct(primaryMonth.year, primaryMonth.month, now)

  // Non-pioneer, no goal, not auxiliary pioneering this month — no hours involved at all,
  // just a monthly checkbox plus a couple of easy, encouraging stats. Kept as React state
  // (not read fresh each render) so toggling it in the collapsed box below immediately
  // updates the summary line up here too.
  const [participatedThisMonth, setParticipatedThisMonthState] = useState(() => getParticipatedMonth(primaryMonth.year, primaryMonth.month))
  useEffect(() => {
    setParticipatedThisMonthState(getParticipatedMonth(primaryMonth.year, primaryMonth.month))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryMonth.year, primaryMonth.month])
  function updateParticipated(participated: boolean) {
    setParticipatedThisMonthState(participated)
    setParticipatedMonth(primaryMonth.year, primaryMonth.month, participated)
  }

  const contactsThisMonth = people.filter((p) => {
    const d = new Date(p.createdAt)
    return d.getFullYear() === primaryMonth.year && d.getMonth() === primaryMonth.month
  }).length
  const scripturesThisMonth = calls.filter((c) => {
    if (!c.scriptures?.trim()) return false
    const d = new Date(c.date)
    return d.getFullYear() === primaryMonth.year && d.getMonth() === primaryMonth.month
  }).length

  // Only the "primary" month/service-year is ever shown (never both touched ones at
  // once) — a straddling week just fades out the other month's day buttons instead of
  // stacking a second progress bar, so the card is always exactly the height one month's
  // worth of content needs, with no reserved dead space for a month that isn't shown.
  const monthProgress = (() => {
    const { year, month } = primaryMonth
    const stats = monthTotals(monthLogsFor(logs, year, month))
    const goalMin = effectiveMonthlyGoalMin(prefs, auxConfig, year, month)
    return {
      year,
      month,
      applied: stats.applied,
      goalMin,
      pct: goalMin ? Math.min(100, Math.round((stats.applied / goalMin) * 100)) : 0,
    }
  })()

  // Navigated week (for the suggested-week section, which can page forward/back)
  const perDayCat: Partial<Record<TimeCategory, number>>[] = Array.from({ length: 7 }, () => ({}))
  const perDayAppointments: { title: string; date: number }[][] = Array.from({ length: 7 }, () => [])
  for (const l of logs) {
    if (l.date >= weekStartMs && l.date < weekEndMs) {
      const dow = new Date(l.date).getDay()
      perDayCat[dow][l.category] = (perDayCat[dow][l.category] ?? 0) + l.minutes
    }
  }
  for (const a of appointments) {
    if (a.date >= weekStartMs && a.date < weekEndMs) {
      perDayAppointments[new Date(a.date).getDay()].push({ title: a.title, date: a.date })
    }
  }
  const weekCategoriesUsed = CATEGORY_ORDER.filter((cat) => perDayCat.some((day) => (day[cat] ?? 0) > 0))

  // Service year (Sept–Aug): running total (all hours) + capped amount applied toward
  // the goal, for the "primary" service year only. A service-year boundary (Sept 1) is
  // always also a month boundary, so it's always a subset of the month-split cases
  // above — deriving it straight from primaryMonth keeps the two perfectly consistent
  // without a separate segment concept for service years.
  const weeklyGoalMin = prefs.weeklyHours * 60
  const yearlyGoalMin = prefs.yearlyHours * 60
  const primaryServiceYear = serviceYearLabel(new Date(primaryMonth.year, primaryMonth.month, 1))
  const yearProgress = (() => {
    const label = primaryServiceYear
    const stats = serviceYearlyTotals(logs, label)
    const applied = serviceYearlyApplied(logs, label)
    return {
      label,
      stats,
      applied,
      pct: yearlyGoalMin ? Math.min(100, Math.round((applied / yearlyGoalMin) * 100)) : 0,
      rawPct: yearlyGoalMin ? Math.min(100, (stats.total / yearlyGoalMin) * 100) : 0,
      remainingMin: Math.max(0, yearlyGoalMin - applied),
    }
  })()

  // A day's suggested window: whatever was explicitly saved for it, or (for the end time)
  // derived live from the weekly goal split evenly across the selected days — so it stays
  // right even as days are added/removed, instead of going stale like a stored value would.
  const sessionMinutes = prefs.daysOut.length ? (prefs.weeklyHours * 60) / prefs.daysOut.length : 0
  function daySessionWindow(day: number): { start: number; end: number } {
    const entry = prefs.daySchedule?.[day]
    const start = entry?.start ?? DAY_START
    const end = Math.max(start, entry?.end ?? Math.min(DAY_END, start + sessionMinutes))
    return { start, end }
  }

  async function saveDayWindow(day: number, startStr: string, endStr: string) {
    const nextDaysOut = prefs.daysOut.includes(day) ? prefs.daysOut : [...prefs.daysOut, day].sort()
    const nextSchedule = { ...(prefs.daySchedule ?? {}), [day]: { start: timeInputToMinutes(startStr), end: timeInputToMinutes(endStr) } }
    await db.schedulePrefs.update(prefs.id, { daysOut: nextDaysOut, daySchedule: nextSchedule })
    setDayModalFor(null)
  }

  function dayDateFor(day: number): Date {
    return new Date(weekStartMs + day * 24 * 60 * 60 * 1000)
  }

  // Whether a day in the navigated week falls in the month the progress card is
  // currently showing (monthProgress) — false for the "other side" of a week that
  // straddles a month boundary, so those day buttons can be faded instead of implying
  // they count toward the month shown above.
  function isDayInShownMonth(day: number): boolean {
    const d = dayDateFor(day)
    return d.getFullYear() === monthProgress.year && d.getMonth() === monthProgress.month
  }

  // Logging service time for a specific day, right from the day-tap modal — mirrors
  // AddTime's own save/banking rules (1-29 leftover minutes bank automatically; 30-59
  // asks to round up) so time logged this way is never treated differently.
  const [quickLogConfirm, setQuickLogConfirm] = useState<
    { day: number; hours: number; minutes: number; category: TimeCategory; otherNote: string } | null
  >(null)

  async function saveQuickLog(day: number, totalMin: number, category: TimeCategory, otherNote: string) {
    if (totalMin <= 0) return
    const d = dayDateFor(day)
    d.setHours(12, 0, 0, 0)
    const note = category === 'other' && otherNote.trim() ? otherNote.trim() : undefined
    await db.timeLogs.add({ date: d.getTime(), minutes: totalMin, category, note } as TimeLog)
  }

  async function bankQuickLogMinutes(day: number, h: number, m: number, category: TimeCategory, otherNote: string) {
    let bank = getMinuteBank() + m
    const autoHour = bank >= 60
    if (autoHour) bank -= 60
    saveMinuteBank(bank)
    if (autoHour) {
      const d = dayDateFor(day)
      d.setHours(12, 0, 0, 0)
      await db.timeLogs.add({ date: d.getTime(), minutes: 60, category, note: 'Added from minute bank' } as TimeLog)
    }
    if (h > 0) await saveQuickLog(day, h * 60, category, otherNote)
  }

  function quickLogTime(day: number, h: number, m: number, category: TimeCategory, otherNote: string) {
    if (h === 0 && m === 0) return
    if (m === 0) {
      saveQuickLog(day, h * 60, category, otherNote).then(() => setDayModalFor(null))
      return
    }
    if (m >= 30) {
      setQuickLogConfirm({ day, hours: h, minutes: m, category, otherNote })
      return
    }
    bankQuickLogMinutes(day, h, m, category, otherNote).then(() => setDayModalFor(null))
  }

  const weekMinistryPct = weeklyGoalMin ? Math.min(100, (weekMinistry / weeklyGoalMin) * 100) : 0
  const weekCreditPct = weeklyGoalMin ? Math.min(100 - weekMinistryPct, (weekCredit / weeklyGoalMin) * 100) : 0

  // A pioneer can build a schedule with no days and no weekly target at all — in that
  // case a "this week vs. weekly goal" bar is meaningless, so it's skipped in favor of
  // the month/year bars below. Re-adding a day (from the weekly calendar) or a weekly
  // target (by redoing the survey) brings it back automatically, since both flow into
  // this same flag.
  const hasSchedule = prefs.daysOut.length > 0 || weeklyGoalMin > 0

  const minuteBank = getMinuteBank()

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="applet-title">Schedule</h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {minuteBank > 0 && (
            <div className="minute-bank-pill">
              <span>⏱ {minuteBank}m banked</span>
              <div className="minute-bank-track">
                <div className="minute-bank-fill" style={{ width: `${(minuteBank / 60) * 100}%` }} />
              </div>
            </div>
          )}
          <button className="secondary small" onClick={onRedo}>Redo survey</button>
        </div>
      </div>

      <div className="card highlight">
        <div className="goal-row" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span>{monthYearLabel}</span>
        </div>

        {isPioneer ? (
          hasSchedule ? (
            <>
              <div className="goal-row">
                <span>{weekOffset === 0 ? 'This week' : `Week of ${fmtDayMonth(weekStartMs)}`}</span>
                <strong>
                  {fmtDuration(weekTotal)} / {fmtDuration(weeklyGoalMin)}
                </strong>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>Ministry + credit hours logged this week, toward your weekly goal.</p>
              <div className="progress-bar split">
                <div className="progress-fill ministry" style={{ width: `${weekMinistryPct}%` }} />
                <div className="progress-fill credit" style={{ width: `${weekCreditPct}%` }} />
              </div>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>
              No weekly schedule set yet — here's your progress for the month and year below.
            </p>
          )
        ) : (
          <>
            {/* Reserves the same height whether or not this block is showing (it only
                shows when the navigated week's month is today's actual month) — otherwise
                the aux pioneering checkbox below jumps up/down as you navigate weeks away
                from the current one. */}
            <div style={monthElapsedPctVal == null ? { visibility: 'hidden' } : undefined} aria-hidden={monthElapsedPctVal == null || undefined}>
              <div className="goal-row">
                <span>Days left in {MONTH_NAMES_LONG[primaryMonth.month]}</span>
                <strong>{monthDaysLeft ?? 0} day{monthDaysLeft === 1 ? '' : 's'} left</strong>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>How far through the current month you are — not tied to any goal.</p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${monthElapsedPctVal ?? 0}%` }} />
              </div>
            </div>

            <AuxPioneeringBox config={auxConfig} onChange={updateAuxConfig} />
          </>
        )}

        {(isPioneer || nonPioneerTracksHours) && (
          <>
            <div style={{ marginTop: 10 }}>
              <div className="goal-row">
                <span>{MONTH_NAMES_LONG[monthProgress.month]}</span>
                <strong>{fmtDuration(monthProgress.applied)} / {fmtDuration(monthProgress.goalMin)}</strong>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>
                {!isPioneer && currentlyAux && monthProgress.year === now.getFullYear() && monthProgress.month === now.getMonth()
                  ? 'Hours logged this month toward your auxiliary pioneering target.'
                  : 'Hours logged this month toward your monthly goal.'}
              </p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${monthProgress.pct}%` }} />
              </div>
            </div>

            {(isPioneer || prefs.goalPeriod === 'yearly') && (
              <div style={{ marginTop: 10 }}>
                <div className="goal-row">
                  <span>Service year <span className="muted" style={{ fontSize: 11 }}>({serviceYearRangeLabel(yearProgress.label)})</span></span>
                  <strong>
                    {fmtDuration(yearProgress.applied)} / {fmtDuration(yearlyGoalMin)}
                  </strong>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>
                  Hours applied toward your yearly goal{isPioneer ? ' (credit hours capped at 55h/month)' : ''} — the lighter fill shows everything logged, uncapped.
                </p>
                <div className="progress-bar">
                  <div className="progress-fill raw" style={{ width: `${yearProgress.rawPct}%` }} />
                  <div className="progress-fill" style={{ width: `${yearProgress.pct}%` }} />
                </div>
                {isPioneer && (
                  <div className="legend tight">
                    <span><i className="sw ministry" /> Ministry {fmtDuration(yearProgress.stats.ministry)}</span>
                    <span><i className="sw credit" /> Credit {fmtDuration(yearProgress.stats.credit)}</span>
                  </div>
                )}
                {yearProgress.stats.total > yearProgress.applied && (
                  <p className="muted">
                    {fmtDuration(yearProgress.stats.total)} logged in total this service year — 55h/mo credit cap applies.
                  </p>
                )}
                <p className="goal-remaining">
                  {yearProgress.remainingMin > 0
                    ? `${fmtDuration(yearProgress.remainingMin)} left to reach your yearly goal`
                    : yearlyGoalMin > 0 ? '🎉 Yearly goal reached!' : ''}
                </p>
              </div>
            )}
          </>
        )}

        {!isPioneer && !nonPioneerTracksHours && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p className="muted">
              {participatedThisMonth ? '✓ Participated in the ministry this month' : 'Not yet recorded for this month'}
            </p>
            <p className="muted">👋 {contactsThisMonth} contact{contactsThisMonth === 1 ? '' : 's'} recorded this month</p>
            <p className="muted">📖 {scripturesThisMonth} scripture{scripturesThisMonth === 1 ? '' : 's'} shared this month</p>
          </div>
        )}
      </div>

      {/* Collapsible week view, with navigation between weeks */}
      <div className="card">
        <h4 style={{ margin: 0 }}>Weekly Schedule</h4>
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
          Your suggested ministry days and times, plus anything already logged this week.
        </p>
        <div className="week-nav">
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation()
              goPrevWeek()
            }}
            title="Previous"
          >
            ‹
          </button>
          <button className="collapse-header week-nav-label" onClick={() => setWeekOpen((o) => !o)}>
            <span>
              <strong>
                {segmentEndMs - segmentStartMs <= 24 * 60 * 60 * 1000
                  ? fmtDayMonthFull(segmentStartMs)
                  : `${fmtDayMonth(segmentStartMs)} – ${fmtDayMonth(segmentEndMs - 86400000)}`}
              </strong>
              <span className="muted"> · Week {calendarWeekNumber(weekStartMs)}</span>
              {weekOffset === 0 && segment === defaultSegment && <span className="muted"> · This week</span>}
            </span>
            <span className="chevron">{weekOpen ? '▾' : '▸'}</span>
          </button>
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation()
              goNextWeek()
            }}
            title="Next"
          >
            ›
          </button>
        </div>

        {!weekOpen ? (
          <div className="week-mini">
            {DAYS.map((d, i) => {
              const isService = prefs.daysOut.includes(i)
              const logged = Object.values(perDayCat[i]).reduce((a, b) => a + b, 0)
              const hasVisit = perDayAppointments[i].length > 0
              return (
                <div
                  key={i}
                  className={`mini-day${isService ? ' service' : ''}${logged > 0 ? ' done' : ''}${isDayInShownMonth(i) ? '' : ' faded'}`}
                  onClick={() => setWeekOpen(true)}
                  style={{ cursor: 'pointer' }}
                  title={isDayInShownMonth(i) ? undefined : `Part of ${MONTH_NAMES_LONG[dayDateFor(i).getMonth()]} — not the month shown above`}
                >
                  {d[0]}
                  {hasVisit && <span className="mini-day-dot" title="Return visit scheduled" />}
                </div>
              )
            })}
          </div>
        ) : (
          <>
            {(weekOffset !== 0 || segment !== defaultSegment) && (
              <button className="secondary small" onClick={() => { goToWeekOffset(0); setHighlightTs(null) }}>
                Jump to current week
              </button>
            )}
            <button className="secondary small" onClick={jumpToNextReturnVisit}>
              Jump to next return visit
            </button>
            <div className="week-grid">
              {DAYS.map((d, i) => {
                const isService = prefs.daysOut.includes(i)
                const dayEntries = CATEGORY_ORDER.map((cat) => [cat, perDayCat[i][cat] ?? 0] as const).filter(
                  ([, min]) => min > 0
                )
                const logged = dayEntries.reduce((sum, [, min]) => sum + min, 0)
                // Normally scaled to the visible day range, but if logged time ever exceeds
                // it (e.g. a long convention day plus other categories), scale to the actual
                // total instead — otherwise every segment past the edge would pile up at 100%.
                const trackScale = Math.max(DAY_RANGE, logged)
                const dayDate = new Date(weekStartMs + i * 24 * 60 * 60 * 1000)
                const isToday = dayDate.toDateString() === now.toDateString()
                const isHighlighted = highlightTs != null && new Date(highlightTs).toDateString() === dayDate.toDateString()
                const dayAppts = perDayAppointments[i]
                const window = daySessionWindow(i)
                let cum = 0
                const inShownMonth = isDayInShownMonth(i)
                return (
                  <div
                    key={i}
                    className={`day-row${isToday ? ' today' : ''}${isHighlighted ? ' jump-highlight' : ''}${inShownMonth ? '' : ' faded'}`}
                    onClick={() => setDayModalFor(i)}
                    style={{ cursor: 'pointer' }}
                    title={inShownMonth ? undefined : `Part of ${MONTH_NAMES_LONG[dayDate.getMonth()]} — not the month shown above`}
                  >
                    <div className="day-label">
                      <span>{d}</span>
                      <span className="day-num">{dayDate.getDate()}</span>
                    </div>
                    <div className="day-track">
                      {isService && (() => {
                        const left = dayTrackPct(window.start)
                        const right = dayTrackPct(window.end)
                        return (
                          <div
                            className="slot-suggested"
                            style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
                            title={`${fmtTime(window.start)} – ${fmtTime(window.end)}`}
                          />
                        )
                      })()}
                      {dayEntries.map(([cat, min]) => {
                        const left = (cum / trackScale) * 100
                        cum += min
                        return (
                          <div
                            key={cat}
                            className={`slot-logged ${cat}`}
                            style={{ left: `${left}%`, width: `${(min / trackScale) * 100}%` }}
                            title={`${CATEGORY_LABELS[cat]} · ${fmtDuration(min)}`}
                          />
                        )
                      })}
                      {dayAppts.map((a, idx) => {
                        const apptMins = new Date(a.date).getHours() * 60 + new Date(a.date).getMinutes()
                        return (
                          <div
                            key={idx}
                            className="slot-appt"
                            style={{ left: `${dayTrackPct(apptMins)}%` }}
                            title={`${a.title} · ${fmtTime(apptMins)}`}
                          />
                        )
                      })}
                    </div>
                    <div className="day-logged">{logged > 0 ? fmtDuration(logged) : ''}</div>
                  </div>
                )
              })}
            </div>
            <div className="legend">
              <span><i className="sw suggested" /> Suggested</span>
              {weekCategoriesUsed.map((cat) => (
                <span key={cat}><i className={`sw ${cat}`} /> {CATEGORY_LABELS[cat]}</span>
              ))}
              <span><i className="sw appt" /> Return Visit</span>
            </div>
            <button className="secondary small" data-tutorial="calendar-view-btn" onClick={() => setShowCalendarView(true)}>
              📅 See calendar view
            </button>
          </>
        )}
      </div>

      {showCalendarView && (
        <ScheduleCalendarView prefs={prefs} appointments={appointments} logs={logs} onClose={() => setShowCalendarView(false)} />
      )}

      {/* Collapsible add time — pioneers and hours-tracking non-pioneers log hours;
          everyone else just checks a single box off once a month */}
      {isPioneer || nonPioneerTracksHours ? (
        <AddTime open={addOpen} onToggle={() => setAddOpen((o) => !o)} onAdded={() => setAddOpen(false)} />
      ) : (
        <MonthlyParticipationBox
          open={addOpen}
          onToggle={() => setAddOpen((o) => !o)}
          month={primaryMonth.month}
          participated={participatedThisMonth}
          onChange={updateParticipated}
        />
      )}

      <ReturnVisits onGoToContact={onGoToContact} />

      {(isPioneer || nonPioneerTracksHours) && (
        <div className="card">
          <h4>Recent Entries</h4>
          <ul className="list">
            {logs.slice(0, visibleLogCount).map((l) => (
              <li key={l.id} className="list-item">
                <div>
                  <span className={`cat-dot ${isCredit(l.category) ? 'credit' : 'ministry'}`} />
                  <strong>{fmtDuration(l.minutes)}</strong> · {CATEGORY_LABELS[l.category]}
                  {l.note ? ` — ${l.note}` : ''}
                  <div className="muted">
                    {new Date(l.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <button className="danger small" onClick={() => setConfirmDeleteLogId(l.id)}>
                  Delete
                </button>
              </li>
            ))}
            {logs.length === 0 && <p className="muted">No time logged yet.</p>}
          </ul>
          {visibleLogCount < logs.length && (
            <button className="secondary small" onClick={() => setVisibleLogCount((n) => n + 4)}>
              See more
            </button>
          )}
          <ConfirmDialog
            open={confirmDeleteLogId != null}
            title="Delete this time entry?"
            message="This can't be undone."
            onConfirm={() => {
              if (confirmDeleteLogId != null) db.timeLogs.delete(confirmDeleteLogId)
              setConfirmDeleteLogId(null)
            }}
            onCancel={() => setConfirmDeleteLogId(null)}
          />
        </div>
      )}

      {dayModalFor != null && (
        <DayActionModal
          dayLabel={DAY_NAMES_FULL[dayModalFor]}
          dateLabel={fmtDayMonth(dayDateFor(dayModalFor).getTime())}
          isSuggestedDay={prefs.daysOut.includes(dayModalFor)}
          currentWindow={daySessionWindow(dayModalFor)}
          onSaveWindow={(start, end) => saveDayWindow(dayModalFor, start, end)}
          onLogTime={(h, m, category, otherNote) => quickLogTime(dayModalFor, h, m, category, otherNote)}
          onClose={() => setDayModalFor(null)}
        />
      )}

      {quickLogConfirm && (
        <ConfirmDialog
          open
          title="Round up to the next hour?"
          message={`You entered ${quickLogConfirm.hours}h ${quickLogConfirm.minutes}m. Round up to ${quickLogConfirm.hours + 1}h?`}
          confirmLabel="Yes, round up"
          cancelLabel="No, bank the minutes"
          tone="primary"
          onConfirm={async () => {
            const { day, hours, category, otherNote } = quickLogConfirm
            setQuickLogConfirm(null)
            await saveQuickLog(day, (hours + 1) * 60, category, otherNote)
            setDayModalFor(null)
          }}
          onCancel={async () => {
            const { day, hours, minutes, category, otherNote } = quickLogConfirm
            setQuickLogConfirm(null)
            await bankQuickLogMinutes(day, hours, minutes, category, otherNote)
            setDayModalFor(null)
          }}
        />
      )}
    </div>
  )
}

/** A small modal for picking a start time (Survey) or a start/end window (Schedule tab's
    "edit suggested schedule"), with an optional "remove this day" action. */
function TimeInputModal({
  title,
  initialStart,
  initialEnd,
  showEnd,
  onSave,
  onRemove,
  onClose,
}: {
  title: string
  initialStart: string
  initialEnd?: string
  showEnd: boolean
  onSave: (start: string, end?: string) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd ?? initialStart)

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3>{title}</h3>
          <div className={showEnd ? 'field-row' : undefined}>
            <label className="field">
              <span className="field-label">Start time</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            {showEnd && (
              <label className="field">
                <span className="field-label">End time</span>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            )}
          </div>
          {showEnd && timeInputToMinutes(end) <= timeInputToMinutes(start) && (
            <p className="muted" style={{ fontSize: 13 }}>⚠ End time must be after start time.</p>
          )}
          <button
            onClick={() => onSave(start, showEnd ? end : undefined)}
            disabled={showEnd && timeInputToMinutes(end) <= timeInputToMinutes(start)}
          >
            Save
          </button>
          {onRemove && (
            <button className="danger" onClick={onRemove}>Remove this day</button>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

/** Opens from clicking a day in the expanded weekly schedule: add/edit that day's
    suggested ministry window, or log actual service time against that specific date
    (right here, without leaving for the separate Add Time panel). */
function DayActionModal({
  dayLabel,
  dateLabel,
  isSuggestedDay,
  currentWindow,
  onSaveWindow,
  onLogTime,
  onClose,
}: {
  dayLabel: string
  dateLabel: string
  isSuggestedDay: boolean
  currentWindow: { start: number; end: number }
  onSaveWindow: (start: string, end: string) => void
  onLogTime: (hours: number, minutes: number, category: TimeCategory, otherNote: string) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<'menu' | 'window' | 'logTime'>('menu')
  const [start, setStart] = useState(minutesToTimeInput(currentWindow.start))
  const [end, setEnd] = useState(minutesToTimeInput(currentWindow.end))
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [category, setCategory] = useState<TimeCategory>('ministry')
  const [otherNote, setOtherNote] = useState('')

  const creditEnabled = localStorage.getItem('fieldservice_credit_hours') === 'yes'
  const availableCats: TimeCategory[] = creditEnabled
    ? ['ministry', 'ldc', 'convention', 'assembly', 'bethel', 'other']
    : ['ministry', 'other']
  const effectiveCategory = availableCats.includes(category) ? category : 'ministry'

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <div style={{ marginTop: -6 }}>
            <h3 style={{ margin: 0 }}>{dayLabel}</h3>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{dateLabel}</p>
          </div>

          {step === 'menu' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setStep('window')}>
                {isSuggestedDay ? 'Edit Suggested Schedule' : 'Add Suggested Service Time'}
              </button>
              <button className="secondary" onClick={() => setStep('logTime')}>
                Add Service Time for This Day
              </button>
            </div>
          )}

          {step === 'window' && (
            <>
              <p className="muted" style={{ margin: 0 }}>Pick a window of time for the ministry on this day.</p>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Start time</span>
                  <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">End time</span>
                  <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </label>
              </div>
              {timeInputToMinutes(end) <= timeInputToMinutes(start) && (
                <p className="muted" style={{ fontSize: 13 }}>⚠ End time must be after start time.</p>
              )}
              <button onClick={() => onSaveWindow(start, end)} disabled={timeInputToMinutes(end) <= timeInputToMinutes(start)}>
                Save
              </button>
            </>
          )}

          {step === 'logTime' && (
            <>
              <div className="hours-minutes-row">
                <label className="field">
                  <span className="field-label">Hours</span>
                  <input type="number" min="0" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">Minutes</span>
                  <input type="number" min="0" max="59" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </label>
              </div>
              <div className="field">
                <span className="field-label">Category</span>
                <div className="cat-pills">
                  {availableCats.map((cat) => (
                    <button
                      key={cat}
                      className={`chip${effectiveCategory === cat ? ' active' : ''}`}
                      onClick={() => setCategory(cat)}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>
              {effectiveCategory === 'other' && (
                <label className="field">
                  <span className="field-label">Type of ministry</span>
                  <input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} placeholder="e.g. Letter writing, Cart witnessing…" />
                </label>
              )}
              <button
                onClick={() => onLogTime(Math.max(0, Number(hours) || 0), Math.min(59, Math.max(0, Number(minutes) || 0)), effectiveCategory, otherNote)}
                disabled={Number(hours) === 0 && Number(minutes) === 0}
              >
                Save Time
              </button>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

// ── Minute bank (localStorage) ──────────────────────────────
function getMinuteBank() { return parseInt(localStorage.getItem('fieldservice_minute_bank') ?? '0', 10) || 0 }
function saveMinuteBank(v: number) { localStorage.setItem('fieldservice_minute_bank', String(Math.max(0, v))) }

// ── Calendar picker ──────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_SHORT = ['S','M','T','W','T','F','S']

function CalendarPicker({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const today = new Date()
  const [vy, vm, vd] = value.split('-').map(Number) // selected Y, M(1-based), D
  const [viewYear, setViewYear] = useState(vy)
  const [viewMonth, setViewMonth] = useState(vm - 1) // 0-indexed

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function selectDay(day: number) {
    const str = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange(str)
    onClose()
  }

  const startDow = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-header">
          <button className="icon-btn" onClick={prevMonth}>‹</button>
          <strong>{MONTH_NAMES[viewMonth]} {viewYear}</strong>
          <button className="icon-btn" onClick={nextMonth}>›</button>
        </div>
        <div className="cal-grid">
          {DOW_SHORT.map((h, i) => <span key={i} className="cal-dow">{h}</span>)}
          {cells.map((day, i) =>
            day === null ? <span key={`e${i}`} /> : (
              <button
                key={day}
                className={[
                  'cal-day',
                  day === vd && viewMonth === vm - 1 && viewYear === vy ? 'selected' : '',
                  day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear() ? 'today' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => selectDay(day)}
              >
                {day}
              </button>
            )
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Read-only schedule calendar view (suggested days + return visits) ────────
function ScheduleCalendarView({
  prefs,
  appointments,
  logs,
  onClose,
}: {
  prefs: SchedulePrefs
  appointments: Appointment[]
  logs: TimeLog[]
  onClose: () => void
}) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11) }
    else setViewMonth((m) => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0) }
    else setViewMonth((m) => m + 1)
  }

  const startDow = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const apptsByDay = new Map<number, Appointment[]>()
  for (const a of appointments) {
    const d = new Date(a.date)
    if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
      const arr = apptsByDay.get(d.getDate()) ?? []
      arr.push(a)
      apptsByDay.set(d.getDate(), arr)
    }
  }
  const monthAppts = Array.from(apptsByDay.entries()).sort((a, b) => a[0] - b[0])

  const ministryDays = new Set<number>()
  for (const l of logs) {
    if (l.category !== 'ministry') continue
    const d = new Date(l.date)
    if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) ministryDays.add(d.getDate())
  }

  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cal-modal cal-modal-view" onClick={(e) => e.stopPropagation()}>
        <div className="cal-header">
          <button className="icon-btn" onClick={prevMonth}>‹</button>
          <strong>{MONTH_NAMES[viewMonth]} {viewYear}</strong>
          <button className="icon-btn" onClick={nextMonth}>›</button>
        </div>
        <div className="cal-grid">
          {DOW_SHORT.map((h, i) => <span key={i} className="cal-dow">{h}</span>)}
          {cells.map((day, i) => {
            if (day === null) return <span key={`e${i}`} />
            const isService = prefs.daysOut.includes(new Date(viewYear, viewMonth, day).getDay())
            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
            const hasMinistry = ministryDays.has(day)
            const dayAppts = apptsByDay.get(day) ?? []
            return (
              <div
                key={day}
                className={['cal-day-view', isService ? 'service' : '', hasMinistry ? 'ministry-logged' : '', isToday ? 'today' : ''].filter(Boolean).join(' ')}
                title={[hasMinistry ? 'Ministry time logged' : '', ...dayAppts.map((a) => a.title)].filter(Boolean).join(', ')}
              >
                {day}
                {dayAppts.length > 0 && <span className="cal-day-appt-dot" />}
              </div>
            )
          })}
        </div>

        <div className="legend">
          <span><i className="sw suggested" /> Suggested day</span>
          <span><i className="sw ministry" /> Ministry logged</span>
          <span><i className="sw appt" /> Return visit</span>
        </div>

        {monthAppts.length > 0 && (
          <div className="cal-appt-list">
            <h4 style={{ marginBottom: 2 }}>Return Visits This Month</h4>
            {monthAppts.map(([day, appts]) =>
              appts.map((a, idx) => (
                <div key={`${day}-${idx}`} className="cal-appt-row">
                  <strong>{MONTH_NAMES[viewMonth].slice(0, 3)} {day}</strong> — {a.title}
                  <span className="muted"> · {new Date(a.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
              ))
            )}
          </div>
        )}

        <button className="secondary" onClick={onClose}>Close</button>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Numpad ───────────────────────────────────────────────────
function NumPad({ initialValue, label, max, onConfirm, onClose }: {
  initialValue: string; label: string; max?: number; onConfirm: (v: string) => void; onClose: () => void
}) {
  const [input, setInput] = useState(initialValue === '0' ? '' : initialValue)

  function press(d: string) {
    const next = (input + d).replace(/^0+/, '') || ''
    if (max !== undefined && Number(next) > max) return
    setInput(next)
  }
  function back() { setInput(p => p.length <= 1 ? '' : p.slice(0, -1)) }
  function confirm() { onConfirm(input || '0'); onClose() }

  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal numpad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="numpad-display">
          <span className="numpad-label">{label}</span>
          <span className="numpad-value">{input || '0'}</span>
        </div>
        <div className="numpad-grid">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} className="numpad-key" onClick={() => press(d)}>{d}</button>
          ))}
          <button className="numpad-key" onClick={back}>⌫</button>
          <button className="numpad-key" onClick={() => press('0')}>0</button>
          <button className="numpad-key done" onClick={confirm}>✓</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

function AddTime({
  open,
  onToggle,
  onAdded,
}: {
  open: boolean
  onToggle: () => void
  onAdded: () => void
}) {
  const [date, setDate] = useState(() => fmtLocalDate(new Date()))
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [category, setCategory] = useState<TimeCategory>('ministry')
  const [otherNote, setOtherNote] = useState('')
  const [note, setNote] = useState('')
  const [showCal, setShowCal] = useState(false)
  const [numPad, setNumPad] = useState<'hours' | 'minutes' | null>(null)
  const [showRoundUp, setShowRoundUp] = useState(false)

  useEffect(() => {
    // Re-sync whenever the panel opens — AddTime never unmounts, so without this a stale
    // manual edit from a prior open would still be showing the next time it's reopened.
    if (open) setDate(fmtLocalDate(new Date()))
  }, [open])

  const creditEnabled = localStorage.getItem('fieldservice_credit_hours') === 'yes'
  const availableCats: TimeCategory[] = creditEnabled
    ? ['ministry', 'ldc', 'convention', 'assembly', 'bethel', 'other']
    : ['ministry', 'other']

  // Reset to ministry if current category isn't visible
  const effectiveCategory = availableCats.includes(category) ? category : 'ministry'

  const parsedDate = parseLocalDate(date)
  const displayDate = parsedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })

  async function commitSave(totalMin: number) {
    if (totalMin <= 0) return
    const d = parseLocalDate(date)
    d.setHours(12, 0, 0, 0)
    const finalNote = (effectiveCategory === 'other' && otherNote.trim()) ? otherNote.trim() : (note || undefined)
    await db.timeLogs.add({ date: d.getTime(), minutes: totalMin, category: effectiveCategory, note: finalNote } as TimeLog)
    setHours('0'); setMinutes('0'); setNote(''); setOtherNote('')
    onAdded()
  }

  async function handleRoundUpYes() {
    setShowRoundUp(false)
    await commitSave((Number(hours) + 1) * 60)
  }

  // Banks the leftover minutes (localStorage) and saves the whole-hours part, if any.
  async function bankMinutesAndSave(h: number, m: number) {
    // Compute new bank and save BEFORE any await that might trigger re-render
    let bank = getMinuteBank() + m
    const autoHour = bank >= 60
    if (autoHour) bank -= 60
    saveMinuteBank(bank)

    if (autoHour) {
      const d = parseLocalDate(date)
      d.setHours(12, 0, 0, 0)
      await db.timeLogs.add({ date: d.getTime(), minutes: 60, category: effectiveCategory, note: 'Added from minute bank' } as TimeLog)
    }

    if (h > 0) {
      await commitSave(h * 60)
    } else {
      setHours('0'); setMinutes('0'); setNote(''); setOtherNote('')
      onAdded()
    }
  }

  async function handleRoundUpNo() {
    setShowRoundUp(false)
    await bankMinutesAndSave(Number(hours), Number(minutes))
  }

  function handleSave() {
    const h = Number(hours)
    const m = Number(minutes)
    if (h === 0 && m === 0) return
    if (m === 0) { commitSave(h * 60); return }
    if (m >= 30) { setShowRoundUp(true); return }
    // 1–29 leftover minutes are banked automatically, no need to ask.
    bankMinutesAndSave(h, m)
  }

  return (
    <>
      <div className="card">
        <button className="collapse-header" onClick={onToggle}>
          <strong>Add Time</strong>
          <span className="add-plus">{open ? '×' : '+'}</span>
        </button>

        {open && (
          <div className="add-time-body">
            {/* Date */}
            <div className="field">
              <span className="field-label">Date</span>
              <button className="date-display-btn" onClick={() => setShowCal(true)}>
                <span>{displayDate}</span>
                <span>📅</span>
              </button>
            </div>

            {/* Hours & Minutes numpad buttons — always side-by-side; these are custom
                buttons (not native inputs) so they don't need the phone-width stacking
                that .field-row applies for native date/time overflow. */}
            <div className="hours-minutes-row">
              <div className="field">
                <span className="field-label">Hours</span>
                <button className="numpad-display-btn" onClick={() => setNumPad('hours')}>{hours}</button>
              </div>
              <div className="field">
                <span className="field-label">Minutes</span>
                <button className="numpad-display-btn" onClick={() => setNumPad('minutes')}>{minutes}</button>
              </div>
            </div>

            {/* Category pills */}
            <div className="field">
              <span className="field-label">Category</span>
              <div className="cat-pills">
                {availableCats.map(cat => (
                  <button
                    key={cat}
                    className={`chip${effectiveCategory === cat ? ' active' : ''}`}
                    onClick={() => setCategory(cat)}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* Other: type of ministry */}
            {effectiveCategory === 'other' && (
              <label className="field">
                <span className="field-label">Type of ministry</span>
                <input value={otherNote} onChange={(e) => setOtherNote(e.target.value)} placeholder="e.g. Letter writing, Cart witnessing…" />
              </label>
            )}

            <label className="field">
              <span className="field-label">Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            <button onClick={handleSave} disabled={Number(hours) === 0 && Number(minutes) === 0}>
              Save Entry
            </button>
          </div>
        )}
      </div>

      {showCal && <CalendarPicker value={date} onChange={setDate} onClose={() => setShowCal(false)} />}

      {numPad === 'hours' && (
        <NumPad initialValue={hours} label="Hours" onConfirm={setHours} onClose={() => setNumPad(null)} />
      )}
      {numPad === 'minutes' && (
        <NumPad initialValue={minutes} label="Minutes" max={59} onConfirm={setMinutes} onClose={() => setNumPad(null)} />
      )}

      <ConfirmDialog
        open={showRoundUp}
        title="Round up to the next hour?"
        message={`You entered ${hours}h ${minutes}m. Round up to ${Number(hours) + 1}h?`}
        confirmLabel="Yes, round up"
        cancelLabel="No, bank the minutes"
        tone="primary"
        onConfirm={handleRoundUpYes}
        onCancel={handleRoundUpNo}
      />
    </>
  )
}

/**
 * The non-pioneer equivalent of AddTime for anyone not tracking real hours — checking
 * the box off is the whole interaction, once a month, no hours or dates involved.
 */
function MonthlyParticipationBox({
  open,
  onToggle,
  month,
  participated,
  onChange,
}: {
  open: boolean
  onToggle: () => void
  month: number
  participated: boolean
  onChange: (participated: boolean) => void
}) {
  return (
    <div className="card">
      <button className="collapse-header" onClick={onToggle}>
        <strong>Participation in the Ministry</strong>
        <span className="add-plus">{open ? '×' : '+'}</span>
      </button>

      {open && (
        <div className="add-time-body">
          <label className="checkbox-row">
            <input type="checkbox" checked={participated} onChange={(e) => onChange(e.target.checked)} />
            <strong>I participated in the ministry in {MONTH_NAMES_LONG[month]}</strong>
          </label>

          {participated && (
            <div className="highlight-box" style={{ textAlign: 'center' }}>
              <strong style={{ fontSize: 16 }}>🎉 You did it!</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>Every visit makes a difference. Keep it up!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const EMPTY_MONTH_TARGETS: Record<string, 15 | 30> = {}

/** The auxiliary-pioneering checkbox and its one-time setup flow, shown at the top of a
    non-pioneer's progress card. */
function AuxPioneeringBox({ config, onChange }: { config: AuxConfig; onChange: (cfg: AuxConfig) => void }) {
  const [configuring, setConfiguring] = useState(false)
  const [mode, setMode] = useState<AuxMode | null>(config.mode)
  const [targetHours, setTargetHours] = useState<15 | 30>(config.targetHours)
  const [weeklyHours, setWeeklyHours] = useState(String(config.weeklyHours || suggestedWeeklyHours(config.targetHours)))
  const [months, setMonths] = useState<string[]>(config.months)
  const [monthTargets, setMonthTargets] = useState<Record<string, 15 | 30>>(config.monthTargets ?? EMPTY_MONTH_TARGETS)

  // The checkbox reads as checked while actively configuring even though nothing's been
  // saved yet (onChange only fires on Save/disable) — otherwise it'd visually snap back
  // to unchecked the instant it's tapped, since config.enabled hasn't caught up yet.
  const checkboxChecked = configuring || config.enabled

  function resetDraft() {
    setMode(config.mode)
    setTargetHours(config.targetHours)
    setWeeklyHours(String(config.weeklyHours || suggestedWeeklyHours(config.targetHours)))
    setMonths(config.months)
    setMonthTargets(config.monthTargets ?? EMPTY_MONTH_TARGETS)
  }

  function toggleEnabled(checked: boolean) {
    if (checked) {
      setConfiguring(true)
      setMode(null)
    } else {
      onChange({ enabled: false, mode: null, targetHours: 30, weeklyHours: 7, months: [], monthTargets: {} })
      setConfiguring(false)
    }
  }

  function cancelConfiguring() {
    resetDraft()
    setConfiguring(false)
  }

  function chooseMode(m: AuxMode) {
    setMode(m)
    const target = m === 'continuous' ? 30 : targetHours
    setTargetHours(target)
    setWeeklyHours(String(suggestedWeeklyHours(target)))
  }

  /** Assigns a month to the 15h or 30h group (moving it out of the other group if present). */
  function setMonthTarget(key: string, hours: 15 | 30) {
    setMonths((prev) => (prev.includes(key) ? prev : [...prev, key].sort()))
    setMonthTargets((prev) => ({ ...prev, [key]: hours }))
  }

  function removeMonth(key: string) {
    setMonths((prev) => prev.filter((k) => k !== key))
    setMonthTargets((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function save() {
    if (!mode) return
    const now = new Date()
    const finalMonths = mode === 'this-month' ? [auxMonthKey(now.getFullYear(), now.getMonth())] : mode === 'multiple-months' ? months : []
    onChange({
      enabled: true,
      mode,
      targetHours,
      weeklyHours: Number(weeklyHours) || suggestedWeeklyHours(targetHours),
      months: finalMonths,
      monthTargets: mode === 'multiple-months' ? monthTargets : {},
    })
    setConfiguring(false)
  }

  const summary = config.enabled
    ? config.mode === 'continuous'
      ? '30h/mo · Continuous'
      : config.mode === 'this-month'
        ? `${config.targetHours}h/mo · This month`
        : `${config.months.length} month${config.months.length === 1 ? '' : 's'} selected`
    : null

  return (
    <div style={{ marginTop: 10 }}>
      <label className="checkbox-row">
        <input type="checkbox" checked={checkboxChecked} onChange={(e) => toggleEnabled(e.target.checked)} />
        <strong>Auxiliary pioneering</strong>
      </label>

      {summary && !configuring && (
        <p className="muted" style={{ fontSize: 12, margin: '2px 0 0 24px' }}>
          {summary}
          <button className="secondary small" style={{ marginLeft: 8 }} onClick={() => setConfiguring(true)}>Edit</button>
        </p>
      )}

      {configuring && (
        <div className="highlight-box" style={{ marginTop: 8, position: 'relative' }}>
          <button
            className="icon-btn close-x"
            style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, fontSize: 16 }}
            onClick={cancelConfiguring}
            title="Close without saving"
          >
            ×
          </button>

          {mode === null ? (
            <>
              <p style={{ margin: '0 24px 8px 0' }}>Is this just for this month, multiple months, or continuous?</p>
              <div className="row">
                <button onClick={() => chooseMode('this-month')}>This month</button>
                <button onClick={() => chooseMode('multiple-months')}>Multiple months</button>
                <button onClick={() => chooseMode('continuous')}>Continuous</button>
              </div>
            </>
          ) : (
            <>
              {mode === 'this-month' && (
                <div className="field" style={{ marginBottom: 10 }}>
                  <span className="field-label">Monthly target</span>
                  <div className="row">
                    <button className={targetHours === 15 ? '' : 'secondary'} onClick={() => { setTargetHours(15); setWeeklyHours(String(suggestedWeeklyHours(15))) }}>15h/mo</button>
                    <button className={targetHours === 30 ? '' : 'secondary'} onClick={() => { setTargetHours(30); setWeeklyHours(String(suggestedWeeklyHours(30))) }}>30h/mo</button>
                  </div>
                </div>
              )}

              {mode === 'continuous' && (
                <p className="muted" style={{ marginBottom: 10 }}>Continuous auxiliary pioneers aim for 30 hours a month.</p>
              )}

              {mode === 'multiple-months' && (
                <>
                  <p className="muted" style={{ margin: '0 0 8px' }}>Tap each month into the target that applies to it.</p>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <span className="field-label">15 hours/month</span>
                    <div className="day-toggle">
                      {rollingTwelveMonths(new Date()).map(({ year, month, label }) => {
                        const key = auxMonthKey(year, month)
                        const active = months.includes(key) && monthTargets[key] === 15
                        return (
                          <button
                            key={key}
                            className={active ? 'chip active' : 'chip'}
                            onClick={() => (active ? removeMonth(key) : setMonthTarget(key, 15))}
                          >
                            {label.slice(0, 3)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <span className="field-label">30 hours/month</span>
                    <div className="day-toggle">
                      {rollingTwelveMonths(new Date()).map(({ year, month, label }) => {
                        const key = auxMonthKey(year, month)
                        const active = months.includes(key) && monthTargets[key] === 30
                        return (
                          <button
                            key={key}
                            className={active ? 'chip active' : 'chip'}
                            onClick={() => (active ? removeMonth(key) : setMonthTarget(key, 30))}
                          >
                            {label.slice(0, 3)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              <label className="field" style={{ marginBottom: 10 }}>
                <span className="field-label">Suggested hours per week</span>
                <input type="number" min="0" step="0.5" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
              </label>

              <button onClick={save} disabled={mode === 'multiple-months' && months.length === 0}>
                Save
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ContactPicker({
  people,
  personId,
  onChange,
}: {
  people: { id: number; name: string; street?: string }[]
  personId: number | null
  onChange: (id: number | null) => void
}) {
  const selected = people.find((p) => p.id === personId)
  const [query, setQuery] = useState(selected?.name ?? '')
  const [open, setOpen] = useState(false)

  const matches =
    query.trim().length === 0
      ? people.slice(0, 8)
      : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)

  function pick(p: { id: number; name: string } | null) {
    onChange(p?.id ?? null)
    setQuery(p?.name ?? '')
    setOpen(false)
  }

  return (
    <div className="combobox">
      <input
        placeholder="Search contacts…"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          if (personId != null) onChange(null)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="combobox-list">
          <div className="combobox-option muted" onMouseDown={() => pick(null)}>
            — None —
          </div>
          {matches.map((p) => (
            <div key={p.id} className="combobox-option" onMouseDown={() => pick(p)}>
              {p.name}
              {p.street && <span className="muted"> · {p.street}</span>}
            </div>
          ))}
          {matches.length === 0 && <div className="combobox-option muted">No matches</div>}
        </div>
      )}
    </div>
  )
}

function ReturnVisits({ onGoToContact }: { onGoToContact: (personId: number) => void }) {
  const appointments = useLiveQuery(() => db.appointments.orderBy('date').toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')
  const [personId, setPersonId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  async function add() {
    if (!personId || !date) return
    const person = people.find((p) => p.id === personId)
    const [h, m] = time.split(':').map(Number)
    const d = parseLocalDate(date)
    d.setHours(h, m, 0, 0)
    await db.appointments.add({
      title: `Return Visit${person ? ` — ${person.name}` : ''}`,
      date: d.getTime(),
      durationMinutes: 30,
      personId,
      notes: notes || undefined,
    } as Appointment)
    setDate('')
    setNotes('')
    setPersonId(null)
    setOpen(false)
  }

  const upcoming = appointments.filter((a) => a.date >= Date.now())

  return (
    <div className="card">
      <button className="collapse-header" onClick={() => setOpen((o) => !o)}>
        <strong>Upcoming Return Visits</strong>
        <span className="add-plus">{open ? '×' : '+'}</span>
      </button>

      {open && (
        <div className="add-time-body">
          <label className="field">
            <span className="field-label">Contact</span>
            <ContactPicker people={people} personId={personId} onChange={setPersonId} />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button onClick={add} disabled={!personId || !date}>
            Schedule Return Visit
          </button>
        </div>
      )}

      <ul className="list">
        {upcoming.map((a) => {
          const person = people.find((p) => p.id === a.personId)
          return (
            <li key={a.id} className="list-item visit-item">
              <div className="visit-info">
                <strong>{person?.name ?? a.title}</strong>
                <div className="muted">{new Date(a.date).toLocaleString()}</div>
                {a.notes && <div className="muted">{a.notes}</div>}
              </div>
              <div className="visit-actions">
                {person && (
                  <button className="secondary small" onClick={() => onGoToContact(person.id)}>
                    Go to contact
                  </button>
                )}
                <button className="danger small" onClick={() => setConfirmDeleteId(a.id)}>
                  Delete
                </button>
              </div>
            </li>
          )
        })}
        {upcoming.length === 0 && <p className="muted">No return visits scheduled. Set one here or while logging a call.</p>}
      </ul>

      <ConfirmDialog
        open={confirmDeleteId != null}
        title="Delete this return visit?"
        message="This can't be undone."
        onConfirm={() => {
          if (confirmDeleteId != null) db.appointments.delete(confirmDeleteId)
          setConfirmDeleteId(null)
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
