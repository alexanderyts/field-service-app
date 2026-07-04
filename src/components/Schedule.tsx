import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Appointment, type DayScheduleBlock, type SchedulePrefs, type TimeCategory, type TimeLog } from '../db'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../categories'
import { animateBankValue, collectAndFlyToMinuteBank } from '../minuteBankFly'
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
import { StepperNav } from './SharedBits'
import { buildAuxSlipPdf, shareAuxSlipPdf } from '../auxSlip'
import { getProfileName } from '../profile'
import {
  type AuxConfig,
  type AuxMode,
  auxMonthKey,
  auxTargetHoursFor,
  getAuxConfig,
  isAuxMonth,
  saveAuxConfig,
  suggestedWeeklyHours,
  weeklyHoursNeeded,
} from '../auxPioneering'

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

/** January through December of the current calendar year — the auxiliary-pioneering
    "multiple months" picker always shows this fixed list, not a rolling window, so it
    reads the same regardless of which month someone happens to be browsing in. */
function currentYearMonths(): { year: number; month: number; label: string }[] {
  const year = new Date().getFullYear()
  return MONTH_NAMES_LONG.map((label, month) => ({ year, month, label }))
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

/** -1 = the given month is already past, 0 = it's the current month, 1 = still ahead. */
function monthVsToday(year: number, month: number, today: Date): -1 | 0 | 1 {
  const diff = (year - today.getFullYear()) * 12 + (month - today.getMonth())
  return diff < 0 ? -1 : diff > 0 ? 1 : 0
}

function daysLeftInMonth(year: number, month: number, today: Date): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cmp = monthVsToday(year, month, today)
  if (cmp < 0) return 0
  if (cmp > 0) return daysInMonth
  return Math.max(0, daysInMonth - today.getDate())
}

/** % of the month elapsed — a past month reads 100, a future one 0, so every month the
    schedule navigates to gets a meaningful bar instead of only the current one. */
function monthElapsedPct(year: number, month: number, today: Date): number {
  const cmp = monthVsToday(year, month, today)
  if (cmp < 0) return 100
  if (cmp > 0) return 0
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
  // Set true the moment the wizard is explicitly opened (from the intro gate below, or
  // from "Redo survey") so a brand-new user sees the intro gate exactly once, while
  // redoing an already-completed survey skips straight to the wizard like it always has.
  const [wizardOpen, setWizardOpen] = useState(false)

  if (prefs === undefined) return <div className="view" />

  const current = prefs[0]

  if (!current?.completedSurvey && !wizardOpen) {
    return (
      <SurveyIntro
        onTakeSurvey={() => setWizardOpen(true)}
        onSkip={async () => {
          const blank: Omit<SchedulePrefs, 'id'> = {
            completedSurvey: true,
            isPioneer: false,
            daysOut: [],
            daySchedule: {},
            weeklyHours: 0,
            yearlyHours: 0,
            goalPeriod: 'none',
          }
          await db.schedulePrefs.add(blank as SchedulePrefs)
        }}
      />
    )
  }

  if (!current || !current.completedSurvey) {
    return <Survey existing={current} onDone={() => setWizardOpen(false)} />
  }

  return (
    <ScheduleMain
      prefs={current}
      onRedo={async () => {
        await db.schedulePrefs.update(current.id, { completedSurvey: false })
        setWizardOpen(true)
      }}
      onGoToContact={onGoToContact}
    />
  )
}

/** Shown once, only for a device with no schedulePrefs record at all yet — lets someone
    skip the multi-step wizard entirely and land on a blank, goal-less schedule instead of
    being forced through survey questions before they've decided they want one. */
function SurveyIntro({ onTakeSurvey, onSkip }: { onTakeSurvey: () => void; onSkip: () => void }) {
  return (
    <div className="view">
      <h2 className="applet-title">Plan Your Schedule</h2>
      <div className="card">
        <p>
          Would you like to take a short survey to build a custom ministry schedule? It's
          optional — you can always retake it later from the Schedule tab.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <button onClick={onTakeSurvey}>Take the Survey</button>
          <button className="secondary" onClick={onSkip}>Skip for now</button>
        </div>
      </div>
    </div>
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

/** All suggested time blocks for a weekly-schedule day, normalized. New-style entries
    store `blocks` directly; legacy entries (a single ministry window from the survey or
    older app versions) are converted on the fly — end derived from the weekly goal split
    evenly across selected days when absent — so stored data never needs a migration. A
    day that's selected but has no entry at all defaults to a 9am–3pm ministry block. */
function dayScheduleBlocks(prefs: SchedulePrefs, day: number): DayScheduleBlock[] {
  const entry = prefs.daySchedule?.[day]
  if (entry?.blocks?.length) return entry.blocks
  if (entry?.start != null) {
    const sessionMinutes = prefs.daysOut.length ? (prefs.weeklyHours * 60) / prefs.daysOut.length : 0
    const start = entry.start
    const end = Math.max(start, entry.end ?? Math.min(DAY_END, start + sessionMinutes))
    return [{ start, end, category: 'ministry' }]
  }
  if (prefs.daysOut.includes(day)) return [{ start: 9 * 60, end: 15 * 60, category: 'ministry' }]
  return []
}

// Suggested blocks for a specific calendar date: a one-off "just this day" override
// shadows the weekly plan entirely; otherwise the day-of-week's recurring blocks apply.
// Takes `prefs` explicitly (rather than closing over it) so both the weekly view
// (ScheduleMain) and the calendar view (ScheduleCalendarView) can call it directly.
function blocksForDate(prefs: SchedulePrefs, date: Date): DayScheduleBlock[] {
  const override = prefs.dateOverrides?.[fmtLocalDate(date)]
  if (override) return override
  return prefs.daysOut.includes(date.getDay()) ? dayScheduleBlocks(prefs, date.getDay()) : []
}

/** Total scheduled minutes across the Sun–Sat week containing `date`, optionally skipping
    one date (the day already being edited, so its live in-progress total can be added back
    in separately without double-counting the saved version). Powers the "week total with
    this day" context in DayActionModal for any week — the weekly view's currently
    navigated one, or an arbitrary one tapped from the calendar view. */
function weekSuggestedMinutesExcluding(prefs: SchedulePrefs, date: Date, excludeDate?: Date): number {
  const weekStart = startOfWeek(date).getTime()
  const excludeKey = excludeDate ? fmtLocalDate(excludeDate) : null
  let total = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + i * 24 * 60 * 60 * 1000)
    if (excludeKey && fmtLocalDate(d) === excludeKey) continue
    total += blocksForDate(prefs, d).reduce((s, b) => s + (b.end - b.start), 0)
  }
  return total
}

/** Clears just one week's scheduled instances — a per-date empty-blocks override for each
    of its 7 days that currently resolves to something — without touching the recurring
    daysOut/daySchedule pattern or any other week. The weekly view's "remove this day"
    taken to a whole week; reusable from either view since it takes `prefs` explicitly. */
async function clearWeekSchedule(prefs: SchedulePrefs, weekStartDate: Date) {
  const weekStart = startOfWeek(weekStartDate).getTime()
  const nextOverrides = { ...(prefs.dateOverrides ?? {}) }
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + i * 24 * 60 * 60 * 1000)
    if (blocksForDate(prefs, d).length > 0) {
      nextOverrides[fmtLocalDate(d)] = []
    }
  }
  await db.schedulePrefs.update(prefs.id, { dateOverrides: nextOverrides })
}

/** A tappable (i) icon that reveals a short explanation on demand. On touch, `onBlur`
    never fires reliably, so the bubble used to stay stuck open through scrolls and taps
    elsewhere. Instead it now smoothly fades out the moment the user interacts anywhere
    outside it — a tap/press, a scroll, or a resize — while still toggling shut if the (i)
    itself is tapped again. `open` keeps it mounted; `visible` drives the CSS fade so the
    bubble animates away rather than vanishing. */
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<number | null>(null)

  function beginClose() {
    setVisible(false)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 200)
  }

  function toggle() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (open) { beginClose(); return }
    setOpen(true)
    // Mount first, then flip visible on the next frame so the fade-in transition runs.
    requestAnimationFrame(() => setVisible(true))
  }

  useEffect(() => {
    if (!open) return
    function onOutside(e: Event) {
      // A tap/press inside the tip (the icon or the bubble) shouldn't dismiss it; scroll
      // and resize always do, since the anchored bubble would otherwise drift off-target.
      if (e.type === 'pointerdown' && wrapRef.current?.contains(e.target as Node)) return
      beginClose()
    }
    document.addEventListener('pointerdown', onOutside, true)
    window.addEventListener('scroll', onOutside, true)
    window.addEventListener('resize', onOutside)
    return () => {
      document.removeEventListener('pointerdown', onOutside, true)
      window.removeEventListener('scroll', onOutside, true)
      window.removeEventListener('resize', onOutside)
    }
  }, [open])

  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])

  return (
    <span className="info-tip" ref={wrapRef}>
      <button type="button" className="info-tip-btn" onClick={toggle} aria-label="More info">
        ⓘ
      </button>
      {open && <span className={`info-tip-bubble${visible ? '' : ' closing'}`} role="tooltip">{text}</span>}
    </span>
  )
}

/** A goal bar whose denominator is always whole hours (goals round up to the nearest
    hour) — every completed hour is fully colored, and the one currently in progress
    shows only its actual fractional fill, staying dim until it completes. */
function HourGoalBar({ appliedMin, goalMin }: { appliedMin: number; goalMin: number }) {
  const wholeHours = Math.max(1, Math.ceil(goalMin / 60))
  const completedHours = Math.floor(appliedMin / 60)
  const partialFrac = Math.min(1, (appliedMin % 60) / 60)
  return (
    <div className="hour-goal-bar">
      {Array.from({ length: wholeHours }, (_, i) => (
        <div key={i} className={`hour-seg${i < completedHours ? ' full' : ''}`}>
          {i === completedHours && partialFrac > 0 && (
            <div className="hour-seg-fill" style={{ width: `${partialFrac * 100}%` }} />
          )}
        </div>
      ))}
    </div>
  )
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
  // Same shape as SchedulePrefs.daySchedule — the survey writes simple {start,end}
  // ministry windows (normalized into blocks at read time), but redoing the survey must
  // round-trip any block-style entries built later from the Weekly Schedule untouched.
  const [daySchedule, setDaySchedule] = useState<NonNullable<SchedulePrefs['daySchedule']>>(existing?.daySchedule ?? {})
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [yearlyHours, setYearlyHours] = useState(String(existing?.yearlyHours ?? 600))
  const [weeklyHours, setWeeklyHours] = useState(() => (existing ? String(existing.weeklyHours) : weeklyFromYearly(600)))
  // Once the person types into "hours per week" directly, stop overwriting it whenever
  // the yearly goal changes — otherwise their manual edit would keep getting clobbered.
  const [weeklyTouched, setWeeklyTouched] = useState(!!existing)
  const [goalPeriod, setGoalPeriod] = useState<'none' | 'weekly' | 'monthly' | 'yearly'>(existing?.goalPeriod ?? 'none')
  // A directly-entered monthly figure, only used when goalPeriod === 'monthly'. Seeded from
  // an existing monthly goal, else from whatever the weekly target implies (×4.3).
  const [monthlyHours, setMonthlyHours] = useState(() =>
    String(existing?.monthlyHours ?? (Math.round((existing?.weeklyHours ?? 0) * 4.3) || 40))
  )

  function handleYearlyChange(v: string) {
    setYearlyHours(v)
    if (!weeklyTouched) setWeeklyHours(weeklyFromYearly(Number(v) || 0))
  }

  function handleWeeklyChange(v: string) {
    setWeeklyHours(v)
    setWeeklyTouched(true)
  }

  function saveDayWindow(startTime: string, endTime?: string) {
    if (editingDay == null) return
    setDaysOut((prev) => (prev.includes(editingDay) ? prev : [...prev, editingDay].sort()))
    setDaySchedule((prev) => ({
      ...prev,
      [editingDay]: { start: timeInputToMinutes(startTime), end: endTime ? timeInputToMinutes(endTime) : undefined },
    }))
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
    // A weekly figure is always stored (it sizes the calendar goal rings and the
    // week-schedule planning line). For a monthly goal it's derived from the entered
    // monthly figure (÷4.3); otherwise it's the weekly field directly.
    const effectiveWeekly =
      !collectsSchedule ? 0
      : isPioneer === true ? Number(weeklyFromYearly(Number(yearlyHours) || 0))
      : goalPeriod === 'monthly' ? Math.round(((Number(monthlyHours) || 0) / 4.3) * 10) / 10
      : Number(weeklyHours) || 0
    const record: Omit<SchedulePrefs, 'id'> = {
      completedSurvey: true,
      isPioneer,
      daysOut: collectsSchedule ? daysOut : [],
      daySchedule: collectsSchedule ? daySchedule : {},
      weeklyHours: effectiveWeekly,
      yearlyHours: isPioneer || goalPeriod === 'yearly' ? Number(yearlyHours) || 0 : 0,
      goalPeriod: isPioneer ? 'none' : goalPeriod,
      monthlyHours: !isPioneer && goalPeriod === 'monthly' ? Number(monthlyHours) || 0 : undefined,
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
      <p className="subtitle">Answer a few questions and we'll build your weekly schedule for you.</p>

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
            LDC, HLC, Convention, Assembly, Bethel, and Other — in addition to ministry time.
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
            <button className={goalPeriod === 'weekly' ? '' : 'secondary'} onClick={() => setGoalPeriod('weekly')}>Weekly</button>
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
            {DAYS.map((d, i) => {
              // Chip caption: the day's earliest start — first block for block-style
              // entries (built on the Weekly Schedule), legacy top-level start otherwise.
              const entry = daySchedule[i]
              const startMin = entry?.blocks?.length ? entry.blocks[0].start : entry?.start
              return (
                <button key={i} className={daysOut.includes(i) ? 'chip active' : 'chip'} onClick={() => setEditingDay(i)}>
                  {d}
                  {daysOut.includes(i) && startMin != null && (
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 500 }}>{fmtTime(startMin)}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {readyToShowRest && isPioneer === true && (
        <div className="card">
          <h4>How much time do you need for the year?</h4>
          <label className="field">
            <span className="field-label">Yearly goal (hrs)</span>
            <input type="number" min="0" value={yearlyHours} onChange={(e) => handleYearlyChange(e.target.value)} />
          </label>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            We'll work out how many hours you need each week from this, based on how many weeks are
            left in the month — no need to set a weekly figure yourself.
          </p>
        </div>
      )}

      {readyToShowRest && isPioneer === false && goalPeriod !== 'none' && (
        <div className="card">
          <h4>
            {goalPeriod === 'weekly'
              ? 'How much time do you want each week?'
              : goalPeriod === 'monthly'
                ? 'How much time do you want each month?'
                : 'How much time do you want for the year?'}
          </h4>
          <div className="field-row">
            {goalPeriod === 'weekly' && (
              <label className="field">
                <span className="field-label">Hours per week</span>
                <input type="number" min="0" value={weeklyHours} onChange={(e) => handleWeeklyChange(e.target.value)} />
              </label>
            )}
            {goalPeriod === 'monthly' && (
              <label className="field">
                <span className="field-label">Hours per month</span>
                <input type="number" min="0" value={monthlyHours} onChange={(e) => setMonthlyHours(e.target.value)} />
              </label>
            )}
            {goalPeriod === 'yearly' && (
              <>
                <label className="field">
                  <span className="field-label">Yearly goal (hrs)</span>
                  <input type="number" min="0" value={yearlyHours} onChange={(e) => handleYearlyChange(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">Hours per week</span>
                  <input type="number" min="0" value={weeklyHours} onChange={(e) => handleWeeklyChange(e.target.value)} />
                </label>
              </>
            )}
          </div>
          {goalPeriod === 'yearly' && (
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Weekly hours are suggested from your yearly goal — feel free to adjust.
            </p>
          )}
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
          title={`What time range works for ${DAY_NAMES_FULL[editingDay]}?`}
          subtitle="You'll be able to customize this further later, on the Weekly Schedule."
          initialStart={minutesToTimeInput(daySchedule[editingDay]?.start ?? 9 * 60)}
          initialEnd={minutesToTimeInput(daySchedule[editingDay]?.end ?? 15 * 60)}
          showEnd
          onSave={saveDayWindow}
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
  // Progress-bar goals are always shown rounded UP to a whole hour (a 49h40m goal reads as
  // 50h), so the target is never a fiddly fraction.
  const ceilHourMin = (min: number) => Math.ceil(min / 60) * 60

  const [progressExpanded, setProgressExpanded] = useState(false)
  // The Service Schedule window's one view state: the mini-week (collapsed), the inline
  // month calendar, or the inline week grid. The contextual bars and the header's red X
  // move between these — replacing the old separate weekOpen flag + full-screen calendar
  // modal.
  const [scheduleView, setScheduleView] = useState<'collapsed' | 'calendar' | 'week'>('collapsed')
  // The inline month-calendar's shown month/year lives here (lifted out of
  // ScheduleCalendarView) so the one shared nav bar can step months while in calendar view,
  // the same bar that steps weeks in the week/collapsed views.
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
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
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null)
  const [visibleLogCount, setVisibleLogCount] = useState(4)
  const [dayModalFor, setDayModalFor] = useState<Date | null>(null)
  const [dayModalOriginRect, setDayModalOriginRect] = useState<DOMRect | null>(null)
  // Which step the day modal opens on — 'menu' for a normal day tap, 'logTime' for the
  // header's quick "+ Add time" shortcut (which defaults to today).
  const [dayModalStep, setDayModalStep] = useState<'menu' | 'logTime'>('menu')
  // Set immediately (before the bank write/collect/fly chain even starts) so the modal's
  // other fields can start fading right away — see .time-entry-closing — while the
  // minutes field is left alone to finish its own collect animation. The modal's actual
  // morph-close only happens afterward, via closeDayModalSmoothly.
  const [dayModalClosing, setDayModalClosing] = useState(false)
  const [confirmBankRoundUp, setConfirmBankRoundUp] = useState(false)
  // The bank pill's displayed value — animated (counted up/down) rather than snapping
  // straight to whatever's in localStorage, so both the Add Time save flow and the
  // per-day quick-log flow (different code paths, same underlying bank) share one
  // consistent, always-in-sync visual.
  const [displayedBank, setDisplayedBank] = useState(() => getMinuteBank())
  // Guards the deferred setState in close-animation timeouts from firing after this view has
  // unmounted (e.g. a tab switch mid-animation) — harmless in React, but avoids the warning.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // When the Service Schedule expands (mini → week/calendar), pin its card to the top of the
  // viewport so the whole expanded view is visible without hunting for it by scrolling. The
  // progress card above scrolls off but still reflects the shown month if you scroll back up.
  const schedCardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scheduleView === 'collapsed') return
    const el = schedCardRef.current
    if (!el) return
    requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [scheduleView])
  const [bankCollapsing, setBankCollapsing] = useState(false)

  const weekStartMs = thisWeekStartMs + weekOffset * 7 * 24 * 60 * 60 * 1000
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000

  function jumpToNextReturnVisit() {
    const next = appointments.filter((a) => a.date >= Date.now()).sort((a, b) => a.date - b.date)[0]
    if (!next) return
    const targetWeekStart = startOfWeek(new Date(next.date)).getTime()
    setSegmentOverride(null)
    setWeekOffset(Math.round((targetWeekStart - thisWeekStartMs) / (7 * 24 * 60 * 60 * 1000)))
    setScheduleView('week')
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
  const territoryCompletions = useLiveQuery(() => db.territoryCompletions.toArray(), []) ?? []

  // Whether TODAY (not whatever week is navigated below) is a month this non-pioneer is
  // auxiliary pioneering — decides whether Add Time or the simple monthly checkbox shows.
  const currentlyAux = !isPioneer && isAuxMonth(auxConfig, now.getFullYear(), now.getMonth())
  const nonPioneerTracksHours = !isPioneer && (prefs.goalPeriod === 'weekly' || prefs.goalPeriod === 'monthly' || prefs.goalPeriod === 'yearly' || currentlyAux)

  // Hours still needed THIS week to hit the current month's auxiliary target by month
  // end, given what's already logged — recomputed fresh on every render from real
  // calendar math (not a flat average), so it's always representative of a mid-month
  // start, a future month with nothing logged yet, etc. Covers all three aux modes
  // (this-month/multiple-months/continuous) uniformly since it only depends on whatever
  // auxTargetHoursFor already resolved for the current month.
  const auxWeeklyGoalMin = currentlyAux
    ? weeklyHoursNeeded(
        auxTargetHoursFor(auxConfig, now.getFullYear(), now.getMonth())!,
        monthTotals(monthLogsFor(logs, now.getFullYear(), now.getMonth())).applied,
        now,
        now.getFullYear(),
        now.getMonth()
      ) * 60
    : 0

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
  // The month the top progress card reflects: normally the navigated week's month, but when
  // the inline calendar is open it follows the calendar's shown month (so stepping months
  // advances the progress window too, mirroring how progressing weeks already drives it). The
  // weekly "this week" pace line stays anchored to the real current week (see pioneerWeeklyGoalMin).
  const displayedMonth = scheduleView === 'calendar' ? { year: calYear, month: calMonth } : primaryMonth
  const monthYearLabel = `${MONTH_NAMES_LONG[displayedMonth.month]} ${displayedMonth.year}`
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

  // The shared nav's arrows step the inline calendar's month when it's the calendar view
  // that's open (they step weeks otherwise).
  function calPrevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) }
    else setCalMonth((m) => m - 1)
  }
  function calNextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) }
    else setCalMonth((m) => m + 1)
  }

  // How many days remain in the month being viewed — only meaningful when that's the
  // actual current month, since a past/future navigated week isn't "the month you live in".
  const monthDaysLeft = daysLeftInMonth(displayedMonth.year, displayedMonth.month, now)
  const monthElapsedPctVal = monthElapsedPct(displayedMonth.year, displayedMonth.month, now)

  // Non-pioneer, no goal, not auxiliary pioneering this month — no hours involved at all,
  // just a monthly checkbox plus a couple of easy, encouraging stats. Kept as React state
  // (not read fresh each render) so toggling it in the collapsed box below immediately
  // updates the summary line up here too.
  const [participatedThisMonth, setParticipatedThisMonthState] = useState(() => getParticipatedMonth(displayedMonth.year, displayedMonth.month))
  useEffect(() => {
    setParticipatedThisMonthState(getParticipatedMonth(displayedMonth.year, displayedMonth.month))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedMonth.year, displayedMonth.month])
  function updateParticipated(participated: boolean) {
    setParticipatedThisMonthState(participated)
    setParticipatedMonth(displayedMonth.year, displayedMonth.month, participated)
  }

  const contactsThisMonth = people.filter((p) => {
    const d = new Date(p.createdAt)
    return d.getFullYear() === displayedMonth.year && d.getMonth() === displayedMonth.month
  }).length
  const scripturesThisMonth = calls.filter((c) => {
    if (!c.scriptures?.trim()) return false
    const d = new Date(c.date)
    return d.getFullYear() === displayedMonth.year && d.getMonth() === displayedMonth.month
  }).length
  const territoriesThisMonth = territoryCompletions.filter((t) => {
    const d = new Date(t.completedAt)
    return d.getFullYear() === displayedMonth.year && d.getMonth() === displayedMonth.month
  }).length

  // Only the "primary" month/service-year is ever shown (never both touched ones at
  // once) — a straddling week just fades out the other month's day buttons instead of
  // stacking a second progress bar, so the card is always exactly the height one month's
  // worth of content needs, with no reserved dead space for a month that isn't shown.
  const monthProgress = (() => {
    const { year, month } = displayedMonth
    const stats = monthTotals(monthLogsFor(logs, year, month))
    const goalMin = ceilHourMin(effectiveMonthlyGoalMin(prefs, auxConfig, year, month))
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
  // A pioneer's weekly target is no longer a fixed figure they typed — it's derived from the
  // month: hours still needed this month ÷ weeks left, rounded up to the whole hour. So a slow
  // start automatically raises the weekly bar, and getting ahead lowers it. 0 once the month's
  // goal is already covered.
  const pioneerWeeklyGoalMin = ceilHourMin(
    weeklyHoursNeeded(
      effectiveMonthlyGoalMin(prefs, auxConfig, primaryMonth.year, primaryMonth.month) / 60,
      monthTotals(monthLogsFor(logs, primaryMonth.year, primaryMonth.month)).applied,
      now,
      primaryMonth.year,
      primaryMonth.month
    ) * 60
  )
  // The weekly goal that actually applies right now — a pioneer's own weekly target, or
  // (since non-pioneers don't have one) an aux-pioneering non-pioneer's configured weekly
  // hours. Used to size the calendar view's per-day goal rings and judge week-completion;
  // 0 when neither applies, since a goal-less week has nothing to measure against.
  const effectiveWeeklyGoalMin = isPioneer
    ? weeklyGoalMin
    : auxConfig.enabled
      ? auxConfig.weeklyHours * 60
      : prefs.goalPeriod === 'weekly'
        ? weeklyGoalMin
        : 0
  const primaryServiceYear = serviceYearLabel(new Date(displayedMonth.year, displayedMonth.month, 1))
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

  // Total suggested (planned) minutes across the navigated week, all block types and
  // any date overrides included — compared against the weekly goal so someone can see
  // how much of their target is already scheduled, both here and live while editing an
  // individual day's blocks.
  const suggestedWeeklyMin = Array.from({ length: 7 }, (_, d) =>
    blocksForDate(prefs, dayDateFor(d)).reduce((s, b) => s + (b.end - b.start), 0)
  ).reduce((a, b) => a + b, 0)

  function saveDayBlocks(date: Date, blocks: DayScheduleBlock[], repeatWeekly: boolean) {
    const day = date.getDay()
    const dateKey = fmtLocalDate(date)
    if (repeatWeekly) {
      const nextDaysOut = prefs.daysOut.includes(day) ? prefs.daysOut : [...prefs.daysOut, day].sort()
      // Storing only { blocks } intentionally drops any legacy start/end/credit fields
      // for this day — blocks are the authoritative shape from here on. Any one-off
      // override for this exact date is also cleared so it can't shadow the new plan.
      const nextSchedule = { ...(prefs.daySchedule ?? {}), [day]: { blocks } }
      const nextOverrides = { ...(prefs.dateOverrides ?? {}) }
      delete nextOverrides[dateKey]
      db.schedulePrefs.update(prefs.id, { daysOut: nextDaysOut, daySchedule: nextSchedule, dateOverrides: nextOverrides })
    } else {
      // "Just this day" — the weekly pattern is left completely untouched.
      const nextOverrides = { ...(prefs.dateOverrides ?? {}), [dateKey]: blocks }
      db.schedulePrefs.update(prefs.id, { dateOverrides: nextOverrides })
    }
    closeDayModalSmoothly()
  }

  // "Edit" next to the day in DayActionModal offers these as a quick way to redo a day's
  // (or the whole week's) suggested schedule without going all the way back to Redo Survey.
  function removeDaySchedule(date: Date) {
    const day = date.getDay()
    const nextDaysOut = prefs.daysOut.filter((d) => d !== day)
    const nextSchedule = { ...(prefs.daySchedule ?? {}) }
    delete nextSchedule[day]
    const nextOverrides = { ...(prefs.dateOverrides ?? {}) }
    delete nextOverrides[fmtLocalDate(date)]
    db.schedulePrefs.update(prefs.id, { daysOut: nextDaysOut, daySchedule: nextSchedule, dateOverrides: nextOverrides })
    closeDayModalSmoothly()
  }

  function clearAllSuggestedDays() {
    db.schedulePrefs.update(prefs.id, { daysOut: [], daySchedule: {}, dateOverrides: {} })
    closeDayModalSmoothly()
  }

  // Closing the day-tap modal by morphing it back down toward the day row it was opened
  // from (see dayModalOriginRect, captured at the moment that row was tapped) and fading
  // the backdrop out, rather than instantly unmounting — an instant unmount read as the
  // dimmed background suddenly flashing bright again.
  function closeDayModalSmoothly() {
    const modalEl = document.querySelector('.day-action-modal') as HTMLElement | null
    const backdropEl = document.querySelector('.day-modal-backdrop') as HTMLElement | null
    if (modalEl && dayModalOriginRect) {
      const r = modalEl.getBoundingClientRect()
      const scaleX = r.width ? dayModalOriginRect.width / r.width : 1
      const scaleY = r.height ? dayModalOriginRect.height / r.height : 1
      const tx = (dayModalOriginRect.left + dayModalOriginRect.width / 2) - (r.left + r.width / 2)
      const ty = (dayModalOriginRect.top + dayModalOriginRect.height / 2) - (r.top + r.height / 2)
      modalEl.style.setProperty('--closeTX', `${tx}px`)
      modalEl.style.setProperty('--closeTY', `${ty}px`)
      modalEl.style.setProperty('--closeSX', `${scaleX}`)
      modalEl.style.setProperty('--closeSY', `${scaleY}`)
      modalEl.classList.add('day-modal-closing')
    }
    backdropEl?.classList.add('closing')
    window.setTimeout(() => { if (mountedRef.current) setDayModalFor(null) }, 180)
  }

  function dayDateFor(day: number): Date {
    return new Date(weekStartMs + day * 24 * 60 * 60 * 1000)
  }

  // Opens the shared day-action modal, capturing the tapped element's rect so it can morph
  // back down toward it on close. `step` is 'menu' for a normal day tap, 'logTime' for the
  // header's quick-add shortcut.
  function openDayModal(date: Date, rect: DOMRect, step: 'menu' | 'logTime' = 'menu') {
    setDayModalOriginRect(rect)
    setDayModalClosing(false)
    setDayModalStep(step)
    setDayModalFor(date)
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
    { date: Date; hours: number; minutes: number; category: TimeCategory; otherNote: string; originEl?: HTMLElement } | null
  >(null)

  async function saveQuickLog(date: Date, totalMin: number, category: TimeCategory, otherNote: string) {
    if (totalMin <= 0) return
    const d = new Date(date)
    d.setHours(12, 0, 0, 0)
    const note = category === 'other' && otherNote.trim() ? otherNote.trim() : undefined
    await db.timeLogs.add({ date: d.getTime(), minutes: totalMin, category, note } as TimeLog)
  }

  // Logs a scheduled day's planned blocks as real time entries (one per block, by category)
  // so a day someone actually worked as planned counts toward their report without re-typing
  // it. Reached from the day modal's "Submit Scheduled Time".
  async function submitScheduledTime(date: Date, blocks: DayScheduleBlock[]) {
    const d = new Date(date)
    d.setHours(12, 0, 0, 0)
    for (const b of blocks) {
      const min = b.end - b.start
      if (min > 0) await db.timeLogs.add({ date: d.getTime(), minutes: min, category: b.category } as TimeLog)
    }
  }

  // Clears one day completely — deletes that date's logged time entries AND hides its
  // scheduled instance (an empty date-override, leaving the recurring weekly pattern intact).
  // Reached from the ✕ on each week-view day row.
  const [confirmClearDay, setConfirmClearDay] = useState<Date | null>(null)
  async function clearDay(date: Date) {
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
    const ids = logs.filter((l) => l.date >= dayStart.getTime() && l.date <= dayEnd.getTime()).map((l) => l.id)
    if (ids.length) await db.timeLogs.bulkDelete(ids)
    if (blocksForDate(prefs, date).length > 0) {
      await db.schedulePrefs.update(prefs.id, { dateOverrides: { ...(prefs.dateOverrides ?? {}), [fmtLocalDate(date)]: [] } })
    }
  }

  async function bankQuickLogMinutes(
    date: Date,
    h: number,
    m: number,
    category: TimeCategory,
    otherNote: string,
    minutesFieldEl?: HTMLElement
  ) {
    const before = getMinuteBank()
    let bank = before + m
    const autoHour = bank >= 60
    if (autoHour) bank -= 60
    saveMinuteBank(bank)
    // Keep the modal open through the gather (so the field's glow is visible), then close it
    // once the ball has launched from the field's captured position.
    await collectAndFlyToMinuteBank(minutesFieldEl)
    closeDayModalSmoothly()
    await animateBankValue(before, bank, 480, setDisplayedBank)
    if (autoHour) {
      const d = new Date(date)
      d.setHours(12, 0, 0, 0)
      await db.timeLogs.add({ date: d.getTime(), minutes: 60, category, note: 'Added from minute bank' } as TimeLog)
    }
    if (h > 0) await saveQuickLog(date, h * 60, category, otherNote)
  }

  function quickLogTime(
    date: Date,
    h: number,
    m: number,
    category: TimeCategory,
    otherNote: string,
    originEl?: HTMLElement
  ) {
    if (h === 0 && m === 0) return
    if (m === 0) {
      saveQuickLog(date, h * 60, category, otherNote)
      closeDayModalSmoothly()
      return
    }
    if (m >= 30) {
      setQuickLogConfirm({ date, hours: h, minutes: m, category, otherNote, originEl })
      return
    }
    // Fade the modal's other fields while the minutes field gathers into the ball; the modal
    // itself is morphed shut by bankQuickLogMinutes once the ball has launched (so the gather
    // is visible and the ball originates from the field's real position).
    setDayModalClosing(true)
    bankQuickLogMinutes(date, h, m, category, otherNote, originEl)
  }

  // Pioneer weekly bar fills against the calendar-derived weekly need (not the raw weeklyHours).
  const weekMinistryPct = pioneerWeeklyGoalMin ? Math.min(100, (weekMinistry / pioneerWeeklyGoalMin) * 100) : (weekMinistry > 0 ? 100 : 0)
  const weekCreditPct = pioneerWeeklyGoalMin ? Math.min(100 - weekMinistryPct, (weekCredit / pioneerWeeklyGoalMin) * 100) : 0

  // A pioneer can build a schedule with no days and no weekly target at all — in that
  // case a "this week vs. weekly goal" bar is meaningless, so it's skipped in favor of
  // the month/year bars below. Re-adding a day (from the weekly calendar) or a weekly
  // target (by redoing the survey) brings it back automatically, since both flow into
  // this same flag.
  const hasSchedule = prefs.daysOut.length > 0 || weeklyGoalMin > 0

  // Tapping the pill lets someone cash in banked minutes early instead of waiting for
  // them to reach a full hour naturally — logged as ministry time, same as an automatic
  // bank-to-hour conversion. Counts the bank down to 0 (instead of snapping) and then
  // plays the reverse of the pill's opening animation, mirroring how it appeared.
  async function redeemMinuteBank() {
    setConfirmBankRoundUp(false)
    const startValue = displayedBank
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    await db.timeLogs.add({ date: d.getTime(), minutes: 60, category: 'ministry', note: 'Added from minute bank' } as TimeLog)
    saveMinuteBank(0)
    await animateBankValue(startValue, 0, 380, setDisplayedBank)
    setBankCollapsing(true)
    await new Promise((resolve) => window.setTimeout(resolve, 260))
    setBankCollapsing(false)
  }

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="applet-title">Schedule</h2>
        <button className="secondary small" onClick={onRedo}>Redo survey</button>
      </div>

      <div className="card highlight">
        <div className="goal-row" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span>{monthYearLabel}</span>
          <button className="secondary small" onClick={() => setProgressExpanded((v) => !v)}>
            {progressExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {isPioneer ? (
          hasSchedule ? (
            <>
              <div className="goal-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {weekOffset === 0 ? 'This week' : `Week of ${fmtDayMonth(weekStartMs)}`}
                  <InfoTip text="Hours you need this week to stay on pace for your yearly goal — worked out from the hours still needed this month and the weeks left in it, rounded up to the whole hour." />
                </span>
                <strong>
                  {pioneerWeeklyGoalMin > 0
                    ? `${fmtDuration(weekTotal)} / ${fmtDuration(pioneerWeeklyGoalMin)}`
                    : `${fmtDuration(weekTotal)} · on pace 🎉`}
                </strong>
              </div>
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
        ) : currentlyAux ? (
          <div>
            <div className="goal-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                This week
                <InfoTip text="Hours still needed this week to hit your auxiliary pioneering target by month end, based on what's already logged and how many weeks remain." />
              </span>
              <strong>{fmtDuration(weekTotal)} / {fmtDuration(auxWeeklyGoalMin)}</strong>
            </div>
            <HourGoalBar appliedMin={weekTotal} goalMin={auxWeeklyGoalMin} />
          </div>
        ) : prefs.goalPeriod === 'weekly' ? (
          <div>
            <div className="goal-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {weekOffset === 0 ? 'This week' : `Week of ${fmtDayMonth(weekStartMs)}`}
                <InfoTip text="Hours logged this week toward your weekly goal." />
              </span>
              <strong>{fmtDuration(weekTotal)} / {fmtDuration(weeklyGoalMin)}</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${weeklyGoalMin ? Math.min(100, (weekTotal / weeklyGoalMin) * 100) : 0}%` }} />
            </div>
          </div>
        ) : prefs.goalPeriod === 'monthly' ? (
          <div>
            <div className="goal-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {MONTH_NAMES_LONG[monthProgress.month]}
                <InfoTip text="Hours logged this month toward your monthly goal." />
              </span>
              <strong>{fmtDuration(monthProgress.applied)} / {fmtDuration(monthProgress.goalMin)}</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${monthProgress.pct}%` }} />
            </div>
          </div>
        ) : prefs.goalPeriod === 'yearly' ? (
          <div>
            <div className="goal-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Service year <span className="muted" style={{ fontSize: 11 }}>({serviceYearRangeLabel(yearProgress.label)})</span>
                <InfoTip text="Hours logged this service year toward your yearly goal." />
              </span>
              <strong>{fmtDuration(yearProgress.applied)} / {fmtDuration(yearlyGoalMin)}</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${yearProgress.pct}%` }} />
            </div>
          </div>
        ) : (
          <div>
            <div className="goal-row">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                Days left in {MONTH_NAMES_LONG[displayedMonth.month]}
                <InfoTip text="How far through this month is — not tied to any goal." />
              </span>
              <strong>{monthDaysLeft} day{monthDaysLeft === 1 ? '' : 's'} left</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${monthElapsedPctVal}%` }} />
            </div>
          </div>
        )}

        {progressExpanded && (
          <>
            {!isPioneer && <AuxPioneeringBox config={auxConfig} onChange={updateAuxConfig} />}

            {(isPioneer || nonPioneerTracksHours) && (
              <>
                <div style={{ marginTop: 10 }}>
                  <div className="goal-row">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {MONTH_NAMES_LONG[monthProgress.month]}
                      <InfoTip
                        text={
                          !isPioneer && currentlyAux && monthProgress.year === now.getFullYear() && monthProgress.month === now.getMonth()
                            ? 'Hours logged this month toward your auxiliary pioneering target.'
                            : 'Hours logged this month toward your monthly goal.'
                        }
                      />
                    </span>
                    <strong>{fmtDuration(monthProgress.applied)} / {fmtDuration(monthProgress.goalMin)}</strong>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${monthProgress.pct}%` }} />
                  </div>
                </div>

                {(isPioneer || prefs.goalPeriod === 'yearly') && (
                  <div style={{ marginTop: 10 }}>
                    <div className="goal-row">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Service year <span className="muted" style={{ fontSize: 11 }}>({serviceYearRangeLabel(yearProgress.label)})</span>
                        <InfoTip text={`Hours applied toward your yearly goal${isPioneer ? ' (credit hours capped at 55h/month)' : ''} — the lighter fill shows everything logged, uncapped.`} />
                      </span>
                      <strong>
                        {fmtDuration(yearProgress.applied)} / {fmtDuration(yearlyGoalMin)}
                      </strong>
                    </div>
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
                {!participatedThisMonth && contactsThisMonth === 0 && scripturesThisMonth === 0 && territoriesThisMonth === 0 ? (
                  <p className="muted">Nothing recorded yet this month.</p>
                ) : (
                  <>
                    {participatedThisMonth && <p className="muted">✓ Participated in the ministry this month</p>}
                    {contactsThisMonth > 0 && (
                      <p className="muted">👋 {contactsThisMonth} contact{contactsThisMonth === 1 ? '' : 's'} recorded this month</p>
                    )}
                    {scripturesThisMonth > 0 && (
                      <p className="muted">📖 {scripturesThisMonth} scripture{scripturesThisMonth === 1 ? '' : 's'} shared this month</p>
                    )}
                    {territoriesThisMonth > 0 && (
                      <p className="muted">🗺️ {territoriesThisMonth} custom territor{territoriesThisMonth === 1 ? 'y' : 'ies'} completed this month</p>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Service Schedule — mini week (collapsed), inline month calendar, or inline week grid */}
      <div className="card" ref={schedCardRef} style={{ scrollMarginTop: 72 }}>
        <div className="service-sched-header">
          <h4 style={{ margin: 0 }}>Service Schedule</h4>
        </div>
        <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
          Your scheduled ministry days and times, plus anything already logged this week.
        </p>

        {/* Shown in all three states (not just the week views) so the nav bar below keeps the
            exact same vertical position — a key part of the seamless collapsed↔week↔calendar
            switch. It always summarizes the current week regardless of the month shown. */}
        {weeklyGoalMin > 0 && (
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Planned this week: {fmtDuration(suggestedWeeklyMin)} / {fmtDuration(weeklyGoalMin)} goal
            {suggestedWeeklyMin >= weeklyGoalMin
              ? ' — 🎉 goal covered!'
              : ` — ${fmtDuration(weeklyGoalMin - suggestedWeeklyMin)} more to schedule`}
          </p>
        )}
        {/* One persistent nav bar for collapsed / week / calendar. Only the label and what
            the arrows step (weeks vs the inline calendar's month) change between views, so
            switching never shifts the bar. The × sits in a reserved slot to the left of the
            › arrow, appearing only when expanded. Single-line uniform label so the week and
            month labels read identically. */}
        <StepperNav
          className="sched-nav"
          onPrev={scheduleView === 'calendar' ? calPrevMonth : goPrevWeek}
          onNext={scheduleView === 'calendar' ? calNextMonth : goNextWeek}
          trailing={
            <span className="sched-close-slot">
              {(scheduleView === 'week' || scheduleView === 'calendar') && (
                <button className="icon-btn sched-close-x" onClick={() => setScheduleView('collapsed')} title="Close">×</button>
              )}
            </span>
          }
        >
          <div className="week-nav-label">
            {scheduleView === 'calendar' ? (
              <span>{MONTH_NAMES[calMonth]} {calYear}</span>
            ) : (
              <span>
                {segmentEndMs - segmentStartMs <= 24 * 60 * 60 * 1000
                  ? fmtDayMonthFull(segmentStartMs)
                  : `${fmtDayMonth(segmentStartMs)} – ${fmtDayMonth(segmentEndMs - 86400000)}`}
                {` · Week ${calendarWeekNumber(weekStartMs)}`}
              </span>
            )}
          </div>
        </StepperNav>

        {scheduleView === 'collapsed' && (
          <>
            <div className="week-mini">
              {DAYS.map((d, i) => {
                const isService = blocksForDate(prefs, dayDateFor(i)).length > 0
                const logged = Object.values(perDayCat[i]).reduce((a, b) => a + b, 0)
                const hasVisit = perDayAppointments[i].length > 0
                return (
                  <div
                    key={i}
                    className={`mini-day${isService ? ' service' : ''}${logged > 0 ? ' done' : ''}${isDayInShownMonth(i) ? '' : ' faded'}`}
                    onClick={(e) => openDayModal(dayDateFor(i), e.currentTarget.getBoundingClientRect())}
                    style={{ cursor: 'pointer' }}
                    title={isDayInShownMonth(i) ? undefined : `Part of ${MONTH_NAMES_LONG[dayDateFor(i).getMonth()]} — not the month shown above`}
                  >
                    {d[0]}
                    {hasVisit && <span className="mini-day-dot" title="Return visit scheduled" />}
                  </div>
                )
              })}
            </div>
            <button className="secondary schedule-view-bar" data-tutorial="calendar-view-btn" onClick={() => setScheduleView('calendar')}>
              📅 See calendar view
            </button>
          </>
        )}

        {scheduleView === 'week' && (
          <div className="sched-view-body">
            {/* Return-visit button always sits first so it never moves; the jump-to-current
                appears below it only when off the current week, keeping button positions stable. */}
            <div className="sched-jump-row">
              <button className="secondary small" onClick={jumpToNextReturnVisit}>
                Jump to next return visit
              </button>
              {(weekOffset !== 0 || segment !== defaultSegment) && (
                <button className="secondary small" onClick={() => { goToWeekOffset(0); setHighlightTs(null) }}>
                  ↩ Jump to current week
                </button>
              )}
            </div>
            {weeklyGoalMin > 0 && suggestedWeeklyMin >= weeklyGoalMin && (
              <div className="goal-line">
                <span className="rule" />
                <span className="txt">✓ Weekly goal scheduled</span>
                <span className="rule" />
              </div>
            )}
            <div className="week-grid">
              {DAYS.map((d, i) => {
                const suggestedBlocks = blocksForDate(prefs, dayDateFor(i))
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
                let cum = 0
                const inShownMonth = isDayInShownMonth(i)
                return (
                  <div
                    key={i}
                    className={`day-row${isToday ? ' today' : ''}${isHighlighted ? ' jump-highlight' : ''}${inShownMonth ? '' : ' faded'}`}
                    onClick={(e) => openDayModal(dayDate, e.currentTarget.getBoundingClientRect())}
                    style={{ cursor: 'pointer' }}
                    title={inShownMonth ? undefined : `Part of ${MONTH_NAMES_LONG[dayDate.getMonth()]} — not the month shown above`}
                  >
                    <div className="day-label">
                      <span>{d}</span>
                      <span className="day-num">{dayDate.getDate()}</span>
                    </div>
                    <div className="day-track">
                      {suggestedBlocks.map((b, bi) => {
                        const left = dayTrackPct(b.start)
                        const right = dayTrackPct(b.end)
                        return (
                          <div
                            key={`sug-${bi}`}
                            className="slot-suggested"
                            style={{
                              left: `${left}%`,
                              width: `${Math.max(0, right - left)}%`,
                              borderColor: `var(--cat-${b.category})`,
                              background: `color-mix(in srgb, var(--cat-${b.category}) 14%, transparent)`,
                            }}
                            title={`${CATEGORY_LABELS[b.category]} · ${fmtTime(b.start)} – ${fmtTime(b.end)}`}
                          />
                        )
                      })}
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
                      {logged > 0 && <span className="day-track-total">{fmtDuration(logged)}</span>}
                    </div>
                    <span className="day-clear-slot">
                      {(suggestedBlocks.length > 0 || logged > 0) && (
                        <button
                          className="cal-week-clear-btn day-clear-btn"
                          title="Clear this day's schedule and logged time"
                          onClick={(e) => { e.stopPropagation(); setConfirmClearDay(dayDate) }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="legend">
              <span><i className="sw suggested" /> Scheduled</span>
              {weekCategoriesUsed.map((cat) => (
                <span key={cat}><i className={`sw ${cat}`} /> {CATEGORY_LABELS[cat]}</span>
              ))}
              <span><i className="sw appt" /> Return Visit</span>
            </div>
            <button className="secondary schedule-view-bar" onClick={() => setScheduleView('calendar')}>
              📅 See calendar view
            </button>
          </div>
        )}

        {scheduleView === 'calendar' && (
          <div className="sched-view-body">
          <ScheduleCalendarView
            prefs={prefs}
            appointments={appointments}
            logs={logs}
            people={people}
            onGoToContact={onGoToContact}
            weeklyGoalMin={effectiveWeeklyGoalMin}
            viewYear={calYear}
            viewMonth={calMonth}
            onSaveBlocks={saveDayBlocks}
            onRemoveDay={removeDaySchedule}
            onClearAllDays={clearAllSuggestedDays}
            onLogTime={quickLogTime}
            onSubmitScheduled={submitScheduledTime}
            onClearWeek={(weekStart) => clearWeekSchedule(prefs, weekStart)}
            onSeeWeeklyView={() => setScheduleView('week')}
          />
          </div>
        )}
      </div>

      {/* Non-pioneers not tracking hours just check a single box off once a month; everyone
          who tracks hours logs via day taps (or the header's "+ Add time" shortcut). */}
      {!isPioneer && !nonPioneerTracksHours && (
        <MonthlyParticipationBox
          month={displayedMonth.month}
          participated={participatedThisMonth}
          onChange={updateParticipated}
        />
      )}

      <ReturnVisits onGoToContact={onGoToContact} />

      <div className="card">
        <div className="recent-entries-header">
          <h4 style={{ margin: 0 }}>Recent Entries</h4>
          <button
            className="secondary small"
            title="Log service time for today"
            onClick={(e) => openDayModal(new Date(), e.currentTarget.getBoundingClientRect(), 'logTime')}
          >
            + Quick add time
          </button>
        </div>
        {/* The minute bank lives here now (moved off the Service Schedule header to declutter
            it). Its own row keeps the arrival pulse clear of the title/button; the anchor is
            always rendered so the fly has a stable landing target. */}
        <div className="minute-bank-row">
          <span className="minute-bank-anchor" aria-hidden="true" />
          {(displayedBank > 0 || bankCollapsing) && (
            <div
              className={`minute-bank-pill${bankCollapsing ? ' minute-bank-collapsing' : ''}`}
              onClick={() => setConfirmBankRoundUp(true)}
              title="Tap to round up and add now"
            >
              <span>⏱ {displayedBank}m</span>
              <div className="minute-bank-track">
                <div className="minute-bank-fill" style={{ width: `${(displayedBank / 60) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <ul className="list">
            {logs.slice(0, visibleLogCount).map((l) => (
              <li key={l.id} className="list-item">
                <div className="visit-info">
                  <span className={`cat-dot ${isCredit(l.category) ? 'credit' : 'ministry'}`} />
                  <strong>{fmtDuration(l.minutes)}</strong> · {CATEGORY_LABELS[l.category]}
                  {l.note ? ` — ${l.note}` : ''}
                  <div className="muted">
                    {new Date(l.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className="visit-actions">
                  <button className="secondary small" onClick={() => setEditingLog(l)}>
                    Edit
                  </button>
                  <button className="danger small" onClick={() => setConfirmDeleteLogId(l.id)}>
                    Delete
                  </button>
                </div>
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
          {editingLog && <EditLogModal log={editingLog} onClose={() => setEditingLog(null)} />}
        </div>

      {dayModalFor != null && (
        <DayActionModal
          date={dayModalFor}
          isSuggestedDay={blocksForDate(prefs, dayModalFor).length > 0}
          currentBlocks={blocksForDate(prefs, dayModalFor)}
          weeklyGoalMin={effectiveWeeklyGoalMin}
          otherDaysSuggestedMin={weekSuggestedMinutesExcluding(prefs, dayModalFor, dayModalFor)}
          appointments={appointments}
          people={people}
          onGoToContact={onGoToContact}
          onSaveBlocks={(blocks, repeatWeekly) => saveDayBlocks(dayModalFor, blocks, repeatWeekly)}
          onRemoveDay={() => removeDaySchedule(dayModalFor)}
          onClearAllDays={clearAllSuggestedDays}
          onLogTime={(h, m, category, otherNote, originEl) => quickLogTime(dayModalFor, h, m, category, otherNote, originEl)}
          onSubmitScheduled={() => submitScheduledTime(dayModalFor, blocksForDate(prefs, dayModalFor))}
          onClose={closeDayModalSmoothly}
          closing={dayModalClosing}
          initialStep={dayModalStep}
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
          onConfirm={() => {
            const { date, hours, category, otherNote } = quickLogConfirm
            setQuickLogConfirm(null)
            saveQuickLog(date, (hours + 1) * 60, category, otherNote)
            closeDayModalSmoothly()
          }}
          onCancel={() => {
            const { date, hours, minutes, category, otherNote, originEl } = quickLogConfirm
            setQuickLogConfirm(null)
            setDayModalClosing(true)
            bankQuickLogMinutes(date, hours, minutes, category, otherNote, originEl)
          }}
        />
      )}

      <ConfirmDialog
        open={confirmBankRoundUp}
        title="Add your banked minutes now?"
        message={`You have ${displayedBank}m banked. Round up and add 1 hour of ministry time now, or keep banking until it fills up on its own.`}
        confirmLabel="Yes, add now"
        cancelLabel="Keep banking"
        tone="primary"
        onConfirm={redeemMinuteBank}
        onCancel={() => setConfirmBankRoundUp(false)}
      />

      <ConfirmDialog
        open={confirmClearDay != null}
        title="Clear this day?"
        message={confirmClearDay ? `Clears ${confirmClearDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} — its scheduled time for that date and any time you've logged that day. Your recurring weekly pattern and other days aren't affected. This can't be undone.` : ''}
        confirmLabel="Yes, clear this day"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => { if (confirmClearDay) clearDay(confirmClearDay); setConfirmClearDay(null) }}
        onCancel={() => setConfirmClearDay(null)}
      />
    </div>
  )
}

/** Edit an already-logged time entry — its date, duration, category, and note. Everything on
    the Schedule tab (weekly totals, month/year progress, the day tracks) derives from these
    same timeLogs via live queries, so a saved edit re-flows into all of them automatically —
    move an hour to a different day and it moves on the weekly schedule too. */
function EditLogModal({ log, onClose }: { log: TimeLog; onClose: () => void }) {
  const [dateStr, setDateStr] = useState(() => fmtLocalDate(new Date(log.date)))
  const [hours, setHours] = useState(String(Math.floor(log.minutes / 60)))
  const [minutes, setMinutes] = useState(String(log.minutes % 60))
  const [category, setCategory] = useState<TimeCategory>(log.category)
  const [note, setNote] = useState(log.note ?? '')

  const totalMin = (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0)

  async function save() {
    if (totalMin <= 0) return
    // Keep the original time-of-day; only the calendar day is user-editable here.
    const orig = new Date(log.date)
    const nd = parseLocalDate(dateStr)
    nd.setHours(orig.getHours(), orig.getMinutes(), 0, 0)
    await db.timeLogs.update(log.id, {
      date: nd.getTime(),
      minutes: totalMin,
      category,
      note: note.trim() || undefined,
    })
    onClose()
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3>Edit Time Entry</h3>
          <label className="field">
            <span className="field-label">Date</span>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Hours</span>
              <input type="number" min={0} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Minutes</span>
              <input type="number" min={0} max={59} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as TimeCategory)}>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {totalMin <= 0 && <p className="muted" style={{ fontSize: 13 }}>⚠ Enter a duration greater than zero.</p>}
          <p className="muted" style={{ fontSize: 13 }}>That's {fmtDuration(totalMin)} total.</p>
          <div className="row">
            <button onClick={save} disabled={totalMin <= 0}>Save Changes</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

/** Edit a return visit's contact, date/time, and notes — opened from the day-detail
    modal's Return Visit section (both the weekly and calendar views). Mirrors
    ReturnVisits' own inline add form (Schedule.tsx ~2523+), just against an existing row. */
function EditAppointmentModal({
  appointment,
  people,
  onClose,
}: {
  appointment: Appointment
  people: { id: number; name: string; street?: string }[]
  onClose: () => void
}) {
  const [personId, setPersonId] = useState<number | null>(appointment.personId ?? null)
  const [dateStr, setDateStr] = useState(() => fmtLocalDate(new Date(appointment.date)))
  const [time, setTime] = useState(() => {
    const d = new Date(appointment.date)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [notes, setNotes] = useState(appointment.notes ?? '')

  async function save() {
    if (!personId || !dateStr) return
    const person = people.find((p) => p.id === personId)
    const [h, m] = time.split(':').map(Number)
    const d = parseLocalDate(dateStr)
    d.setHours(h, m, 0, 0)
    await db.appointments.update(appointment.id, {
      title: `Return Visit${person ? ` — ${person.name}` : ''}`,
      date: d.getTime(),
      personId,
      notes: notes || undefined,
    })
    onClose()
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3>Edit Return Visit</h3>
          <label className="field">
            <span className="field-label">Contact</span>
            <ContactPicker people={people} personId={personId} onChange={setPersonId} />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Date</span>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
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
          <div className="row">
            <button onClick={save} disabled={!personId || !dateStr}>Save Changes</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

/** A small modal for picking a start time (Survey) or a start/end window (Schedule tab's
    "edit suggested schedule"), with an optional "remove this day" action. */
function TimeInputModal({
  title,
  subtitle,
  initialStart,
  initialEnd,
  showEnd,
  onSave,
  onRemove,
  onClose,
}: {
  title: string
  subtitle?: string
  initialStart: string
  initialEnd?: string
  showEnd: boolean
  onSave: (start: string, end?: string) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd ?? initialStart)
  const durationMin = timeInputToMinutes(end) - timeInputToMinutes(start)

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3>{title}</h3>
          {subtitle && <p className="muted" style={{ marginTop: -8, fontSize: 13 }}>{subtitle}</p>}
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
          {showEnd && durationMin > 0 && (
            <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>That's {fmtDuration(durationMin)} of service time.</p>
          )}
          {showEnd && durationMin <= 0 && (
            <p className="muted" style={{ fontSize: 13 }}>⚠ End time must be after start time.</p>
          )}
          <button
            onClick={() => onSave(start, showEnd ? end : undefined)}
            disabled={showEnd && durationMin <= 0}
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
/** A block being edited in the day modal — times as HH:MM strings for the inputs. */
interface EditableBlock {
  start: string
  end: string
  category: TimeCategory
}

function DayActionModal({
  date,
  isSuggestedDay,
  currentBlocks,
  weeklyGoalMin,
  otherDaysSuggestedMin,
  appointments,
  people,
  onGoToContact,
  onSaveBlocks,
  onRemoveDay,
  onClearAllDays,
  onLogTime,
  onSubmitScheduled,
  onClose,
  closing,
  initialStep = 'menu',
}: {
  date: Date
  isSuggestedDay: boolean
  currentBlocks: DayScheduleBlock[]
  weeklyGoalMin: number
  otherDaysSuggestedMin: number
  appointments: Appointment[]
  people: { id: number; name: string; street?: string }[]
  onGoToContact: (personId: number) => void
  onSaveBlocks: (blocks: DayScheduleBlock[], repeatWeekly: boolean) => void
  onRemoveDay: () => void
  onClearAllDays: () => void
  onLogTime: (hours: number, minutes: number, category: TimeCategory, otherNote: string, originEl?: HTMLElement) => void
  onSubmitScheduled: () => void
  onClose: () => void
  closing: boolean
  initialStep?: 'menu' | 'logTime'
}) {
  const dayLabel = DAY_NAMES_FULL[date.getDay()]
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const weekStart = startOfWeek(date).getTime()
  const weekEnd = weekStart + 6 * 24 * 60 * 60 * 1000
  const weekRangeLabel = `Week of ${fmtDayMonth(weekStart)} – ${fmtDayMonth(weekEnd)}, ${new Date(weekEnd).getFullYear()}`
  const dayAppt = appointments.find((a) => fmtLocalDate(new Date(a.date)) === fmtLocalDate(date)) ?? null
  const [editingAppt, setEditingAppt] = useState(false)
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(false)
  const [step, setStep] = useState<'menu' | 'window' | 'logTime' | 'dayOptions'>(initialStep)
  const [blocks, setBlocks] = useState<EditableBlock[]>(() =>
    (currentBlocks.length ? currentBlocks : [{ start: 9 * 60, end: 15 * 60, category: 'ministry' as TimeCategory }]).map(
      (b) => ({ start: minutesToTimeInput(b.start), end: minutesToTimeInput(b.end), category: b.category })
    )
  )
  const [showRepeatConfirm, setShowRepeatConfirm] = useState(false)
  const [confirmRemoveDay, setConfirmRemoveDay] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [confirmSubmitScheduled, setConfirmSubmitScheduled] = useState(false)
  const scheduledTotalMin = currentBlocks.reduce((s, b) => s + Math.max(0, b.end - b.start), 0)
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [category, setCategory] = useState<TimeCategory>('ministry')
  const [otherNote, setOtherNote] = useState('')
  const [numPad, setNumPad] = useState<'hours' | 'minutes' | null>(null)
  const minutesBtnRef = useRef<HTMLButtonElement>(null)

  const creditEnabled = localStorage.getItem('fieldservice_credit_hours') === 'yes'
  const availableCats: TimeCategory[] = creditEnabled
    ? ['ministry', 'ldc', 'hlc', 'convention', 'assembly', 'bethel', 'other']
    : ['ministry', 'other']
  const effectiveCategory = availableCats.includes(category) ? category : 'ministry'

  function blockDuration(b: EditableBlock): number {
    return timeInputToMinutes(b.end) - timeInputToMinutes(b.start)
  }
  const allBlocksValid = blocks.every((b) => blockDuration(b) > 0)
  const dayTotalMin = blocks.reduce((s, b) => s + Math.max(0, blockDuration(b)), 0)
  const liveWeeklyTotalMin = otherDaysSuggestedMin + dayTotalMin

  function updateBlock(i: number, patch: Partial<EditableBlock>) {
    setBlocks((prev) => prev.map((b, bi) => (bi === i ? { ...b, ...patch } : b)))
  }

  function addBlock() {
    setBlocks((prev) => {
      // New block picks up where the last one ends (falling back to 1pm if that field
      // is currently cleared/invalid), for a natural morning → afternoon flow.
      const lastEnd = timeInputToMinutes(prev[prev.length - 1].end) || 13 * 60
      const start = Math.min(lastEnd, 22 * 60)
      return [...prev, { start: minutesToTimeInput(start), end: minutesToTimeInput(Math.min(start + 120, 23 * 60)), category: 'ministry' }]
    })
  }

  function removeBlock(i: number) {
    setBlocks((prev) => prev.filter((_, bi) => bi !== i))
  }

  function confirmSaveBlocks(repeatWeekly: boolean) {
    onSaveBlocks(
      blocks.map((b) => ({ start: timeInputToMinutes(b.start), end: timeInputToMinutes(b.end), category: b.category })),
      repeatWeekly
    )
    setShowRepeatConfirm(false)
  }

  const blocksSummary = blocks
    .map((b) => `${CATEGORY_LABELS[b.category]} ${fmtTime(timeInputToMinutes(b.start))}–${fmtTime(timeInputToMinutes(b.end))}`)
    .join(', ')

  return (
    <ModalPortal>
      <div className="modal-backdrop day-modal-backdrop" onClick={onClose}>
        <div className="modal day-action-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <div style={{ marginTop: -6, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>{dayLabel}</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{dateLabel}</p>
              <p className="muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{weekRangeLabel}</p>
            </div>
            {isSuggestedDay && step !== 'dayOptions' && (
              <button className="secondary small" onClick={() => setStep('dayOptions')}>Edit</button>
            )}
          </div>

          {step === 'menu' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dayAppt && (
                <div className="highlight-box return-visit-box">
                  <strong>📅 Return Visit</strong>
                  <p className="muted" style={{ margin: '4px 0', fontSize: 13 }}>
                    {(people.find((p) => p.id === dayAppt.personId)?.name) ?? dayAppt.title}
                    {' · '}
                    {new Date(dayAppt.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {dayAppt.notes && <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>{dayAppt.notes}</p>}
                  <div className="row">
                    {dayAppt.personId != null && (
                      <button className="secondary small" onClick={() => onGoToContact(dayAppt.personId!)}>
                        Jump to Contact
                      </button>
                    )}
                    <button className="secondary small" onClick={() => setEditingAppt(true)}>Edit</button>
                    <button className="danger small" onClick={() => setConfirmDeleteAppt(true)}>Delete</button>
                  </div>
                </div>
              )}
              {isSuggestedDay && scheduledTotalMin > 0 && (
                <div className="highlight-box">
                  <strong>Scheduled for this day</strong>
                  {currentBlocks.map((b, i) => (
                    <p key={i} className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>
                      {CATEGORY_LABELS[b.category]} · {fmtTime(b.start)}–{fmtTime(b.end)} · {fmtDuration(b.end - b.start)}
                    </p>
                  ))}
                  <button style={{ marginTop: 8 }} onClick={() => setConfirmSubmitScheduled(true)}>
                    Submit Scheduled Time ({fmtDuration(scheduledTotalMin)})
                  </button>
                </div>
              )}
              <button className="secondary" onClick={() => setStep('window')}>
                {isSuggestedDay ? 'Edit Schedule' : 'Add Scheduled Service Time'}
              </button>
              <button className="secondary" onClick={() => setStep('logTime')}>
                Add Service Time for This Day
              </button>
            </div>
          )}

          {step === 'dayOptions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Redo this day's schedule, or start the whole week over.
              </p>
              <button className="danger" onClick={() => setConfirmRemoveDay(true)}>
                Remove This Day's Schedule
              </button>
              <button className="danger" onClick={() => setConfirmClearAll(true)}>
                Clear All Scheduled Days
              </button>
              <button className="secondary" onClick={() => setStep('menu')}>Back</button>
            </div>
          )}

          {step === 'window' && (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Plan this day's time — pick a type and window for each stretch you want to schedule.
              </p>

              {blocks.map((b, i) => {
                const dur = blockDuration(b)
                return (
                  <div key={i} className="schedule-block" style={{ borderLeftColor: `var(--cat-${b.category})` }}>
                    <div className="schedule-block-head">
                      <div className="cat-pills">
                        {availableCats.map((cat) => (
                          <button
                            key={cat}
                            className={`chip${b.category === cat ? ' active' : ''}`}
                            onClick={() => updateBlock(i, { category: cat })}
                          >
                            {CATEGORY_LABELS[cat]}
                          </button>
                        ))}
                      </div>
                      {blocks.length > 1 && (
                        <button className="icon-btn" title="Remove this time" onClick={() => removeBlock(i)}>×</button>
                      )}
                    </div>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">Start time</span>
                        <input type="time" value={b.start} onChange={(e) => updateBlock(i, { start: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="field-label">End time</span>
                        <input type="time" value={b.end} onChange={(e) => updateBlock(i, { end: e.target.value })} />
                      </label>
                    </div>
                    <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                      {dur <= 0
                        ? '⚠ End time must be after start time.'
                        : `${fmtDuration(dur)} of ${CATEGORY_LABELS[b.category]} time.`}
                    </p>
                  </div>
                )
              })}

              {dayTotalMin > 0 && blocks.length > 1 && (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Total this day: {fmtDuration(dayTotalMin)}.
                </p>
              )}
              {weeklyGoalMin > 0 && (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Week total with this day: {fmtDuration(liveWeeklyTotalMin)} / {fmtDuration(weeklyGoalMin)} goal
                  {liveWeeklyTotalMin >= weeklyGoalMin
                    ? ' — 🎉 that covers your weekly goal!'
                    : ` — ${fmtDuration(weeklyGoalMin - liveWeeklyTotalMin)} more to schedule`}
                </p>
              )}

              <button className="secondary" onClick={addBlock}>＋ Add More Time for This Day</button>
              <button onClick={() => setShowRepeatConfirm(true)} disabled={!allBlocksValid}>
                Save
              </button>
            </>
          )}

          {step === 'logTime' && (
            <div className={closing ? 'time-entry-closing' : ''}>
              <div className="hours-minutes-row">
                <div className="field">
                  <span className="field-label">Hours</span>
                  <button className="numpad-display-btn" onClick={() => setNumPad('hours')}>{hours}</button>
                </div>
                <div className="field">
                  <span className="field-label">Minutes</span>
                  <button ref={minutesBtnRef} className="numpad-display-btn" onClick={() => setNumPad('minutes')}>{minutes}</button>
                </div>
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
                onClick={() => onLogTime(Math.max(0, Number(hours) || 0), Math.min(59, Math.max(0, Number(minutes) || 0)), effectiveCategory, otherNote, minutesBtnRef.current ?? undefined)}
                disabled={Number(hours) === 0 && Number(minutes) === 0}
              >
                Submit Time
              </button>
            </div>
          )}
        </div>
      </div>

      {numPad === 'hours' && (
        <NumPad initialValue={hours} label="Hours" onConfirm={setHours} onClose={() => setNumPad(null)} />
      )}
      {numPad === 'minutes' && (
        <NumPad initialValue={minutes} label="Minutes" max={59} onConfirm={setMinutes} onClose={() => setNumPad(null)} />
      )}

      {/* Three-way save choice (repeat weekly / just this date / cancel) — ConfirmDialog
          only supports two buttons, so this one is laid out by hand in the same style. */}
      {showRepeatConfirm && (
        <div className="modal-backdrop confirm-backdrop" onClick={() => setShowRepeatConfirm(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{`Repeat every ${dayLabel}?`}</h3>
            <p className="muted">
              This will suggest {blocksSummary} on your Weekly Schedule.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => confirmSaveBlocks(true)}>Yes, repeat every {dayLabel}</button>
              <button className="secondary" onClick={() => confirmSaveBlocks(false)}>
                No, just use this schedule for {dateLabel}
              </button>
              <button className="secondary" onClick={() => setShowRepeatConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSubmitScheduled}
        title="Submit this scheduled time?"
        message={`Log ${fmtDuration(scheduledTotalMin)} of scheduled time for ${dateLabel} so it counts toward your report. You can edit or delete it afterward from Recent Entries.`}
        confirmLabel="Yes, submit it"
        cancelLabel="Cancel"
        tone="primary"
        onConfirm={() => { setConfirmSubmitScheduled(false); onSubmitScheduled(); onClose() }}
        onCancel={() => setConfirmSubmitScheduled(false)}
      />

      <ConfirmDialog
        open={confirmRemoveDay}
        title={`Remove ${dayLabel} from your schedule?`}
        message="This day's scheduled ministry window (and any scheduled credit hours) will be cleared. This can't be undone."
        confirmLabel="Yes, remove this day"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => { setConfirmRemoveDay(false); onRemoveDay() }}
        onCancel={() => setConfirmRemoveDay(false)}
      />

      <ConfirmDialog
        open={confirmClearAll}
        title="Clear all scheduled days?"
        message="This clears every scheduled day and time from your Weekly Schedule, so you can build it again from scratch. Logged time and goals aren't affected. This can't be undone."
        confirmLabel="Yes, clear all scheduled days"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={() => { setConfirmClearAll(false); onClearAllDays() }}
        onCancel={() => setConfirmClearAll(false)}
      />

      <ConfirmDialog
        open={confirmDeleteAppt}
        title="Delete this return visit?"
        message="This can't be undone."
        onConfirm={() => {
          if (dayAppt) db.appointments.delete(dayAppt.id)
          setConfirmDeleteAppt(false)
        }}
        onCancel={() => setConfirmDeleteAppt(false)}
      />

      {editingAppt && dayAppt && (
        <EditAppointmentModal appointment={dayAppt} people={people} onClose={() => setEditingAppt(false)} />
      )}
    </ModalPortal>
  )
}

// ── Minute bank (localStorage) ──────────────────────────────
function getMinuteBank() { return parseInt(localStorage.getItem('fieldservice_minute_bank') ?? '0', 10) || 0 }
function saveMinuteBank(v: number) { localStorage.setItem('fieldservice_minute_bank', String(Math.max(0, v))) }

// ── Calendar picker ──────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_SHORT = ['S','M','T','W','T','F','S']

// ── Read-only schedule calendar view (suggested days + return visits) ────────
const RING_SIZE = 32
const RING_STROKE = 2
const RING_R = (RING_SIZE - RING_STROKE) / 2
const RING_C = 2 * Math.PI * RING_R

function ScheduleCalendarView({
  prefs,
  appointments,
  logs,
  people,
  onGoToContact,
  weeklyGoalMin,
  viewYear,
  viewMonth,
  onSaveBlocks,
  onRemoveDay,
  onClearAllDays,
  onLogTime,
  onSubmitScheduled,
  onClearWeek,
  onSeeWeeklyView,
}: {
  prefs: SchedulePrefs
  appointments: Appointment[]
  logs: TimeLog[]
  people: { id: number; name: string; street?: string }[]
  onGoToContact: (personId: number) => void
  weeklyGoalMin: number
  // The shown month/year is owned by ScheduleMain (so the shared nav bar can step it) and
  // passed in — this view no longer keeps its own month state or renders its own header.
  viewYear: number
  viewMonth: number
  onSaveBlocks: (date: Date, blocks: DayScheduleBlock[], repeatWeekly: boolean) => void
  onRemoveDay: (date: Date) => void
  onClearAllDays: () => void
  onLogTime: (date: Date, hours: number, minutes: number, category: TimeCategory, otherNote: string, originEl?: HTMLElement) => void
  onSubmitScheduled: (date: Date, blocks: DayScheduleBlock[]) => void
  onClearWeek: (weekStart: Date) => void
  onSeeWeeklyView: () => void
}) {
  const today = new Date()
  const [tapDate, setTapDate] = useState<Date | null>(null)
  const [tapLeaving, setTapLeaving] = useState(false)
  const [confirmClearWeek, setConfirmClearWeek] = useState<Date | null>(null)
  // Guards the delayed unmount setState below from firing after this view has unmounted.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // No origin-rect morph here (calendar cells are too small to shrink a modal back into,
  // unlike the weekly grid's full-width day rows) — just a plain delayed unmount so
  // collectAndFlyToMinuteBank still has a real, attached DOM node to animate from before
  // the modal goes away, matching the weekly view's timing without the transform math.
  function closeTapModal() {
    // Fade the modal + backdrop out (no origin-rect morph here — calendar cells are too small
    // to shrink back into), so dismissal reads as an immediate, smooth close rather than a
    // dead pause before it disappears.
    const modalEl = document.querySelector('.day-action-modal') as HTMLElement | null
    const backdropEl = document.querySelector('.day-modal-backdrop') as HTMLElement | null
    modalEl?.classList.add('day-modal-closing')
    backdropEl?.classList.add('closing')
    setTapLeaving(true)
    window.setTimeout(() => { if (mountedRef.current) { setTapDate(null); setTapLeaving(false) } }, 180)
  }

  const startDow = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  // Always pad to 6 full weeks (42 cells). Every month then renders the exact same number of
  // rows, so the calendar's height is constant and matches the week view — switching between
  // the two never resizes the card.
  while (cells.length < 42) cells.push(null)

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

  // Predominant logged category per day (by total minutes) — colors the shaded fill so a
  // day of credit time reads differently from a day of ministry time at a glance.
  const loggedByDay = new Map<number, Partial<Record<TimeCategory, number>>>()
  for (const l of logs) {
    const d = new Date(l.date)
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue
    const entry = loggedByDay.get(d.getDate()) ?? {}
    entry[l.category] = (entry[l.category] ?? 0) + l.minutes
    loggedByDay.set(d.getDate(), entry)
  }
  function predominantCategory(day: number): TimeCategory | null {
    const entry = loggedByDay.get(day)
    if (!entry) return null
    let best: TimeCategory | null = null
    let bestMin = 0
    for (const cat of CATEGORY_ORDER) {
      const m = entry[cat] ?? 0
      if (m > bestMin) { bestMin = m; best = cat }
    }
    return best
  }

  // Scheduled minutes for a visible day, broken down by category (CATEGORY_ORDER) — powers
  // both the proportional goal ring and the "which categories are scheduled" legend, using
  // the exact same one-off-override-shadows-the-weekly-plan rule as the weekly view.
  function scheduledBlocksFor(day: number): { category: TimeCategory; minutes: number }[] {
    const byCat = new Map<TimeCategory, number>()
    for (const b of blocksForDate(prefs, new Date(viewYear, viewMonth, day))) {
      byCat.set(b.category, (byCat.get(b.category) ?? 0) + (b.end - b.start))
    }
    return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({ category: c, minutes: byCat.get(c)! }))
  }
  function suggestedCatsFor(day: number): TimeCategory[] {
    return scheduledBlocksFor(day).map((b) => b.category)
  }

  // Everything actually visible this month, so the legend only explains what's on screen.
  const suggestedCatsInMonth = CATEGORY_ORDER.filter((c) =>
    Array.from({ length: daysInMonth }, (_, d) => d + 1).some((day) => suggestedCatsFor(day).includes(c))
  )
  const loggedCatsInMonth = CATEGORY_ORDER.filter((c) =>
    Array.from(loggedByDay.keys()).some((day) => predominantCategory(day) === c)
  )
  const monthHasToday = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  // Week-row summaries, one per 7-cell chunk — computed from the REAL calendar week each
  // row represents (which can dip into the adjacent month for a leading/trailing partial
  // row) rather than just the visible in-month cells, since a person's schedule is
  // date-based, not month-based. Powers the week-complete shading/checkmark and anchors
  // the checkmark/clear-week controls to whichever cells are actually visible in this row.
  const weekRows = Array.from({ length: cells.length / 7 }, (_, row) => {
    const rowCells = cells.slice(row * 7, row * 7 + 7)
    const firstIdx = rowCells.findIndex((c) => c !== null)
    const lastIdx = rowCells.length - 1 - [...rowCells].reverse().findIndex((c) => c !== null)
    const anchorDay = firstIdx >= 0 ? rowCells[firstIdx]! : 1
    const weekStart = startOfWeek(new Date(viewYear, viewMonth, anchorDay))
    const totalMin = firstIdx >= 0 ? weekSuggestedMinutesExcluding(prefs, weekStart) : 0
    return { firstIdx, lastIdx, weekStart, hasSchedule: totalMin > 0, isComplete: weeklyGoalMin > 0 && totalMin >= weeklyGoalMin }
  })

  function handleSaveBlocks(blocks: DayScheduleBlock[], repeatWeekly: boolean) {
    if (tapDate) onSaveBlocks(tapDate, blocks, repeatWeekly)
    closeTapModal()
  }
  function handleRemoveDay() {
    if (tapDate) onRemoveDay(tapDate)
    closeTapModal()
  }
  function handleClearAllDays() {
    onClearAllDays()
    closeTapModal()
  }
  function handleLogTime(hours: number, minutes: number, category: TimeCategory, otherNote: string, originEl?: HTMLElement) {
    if (tapDate) onLogTime(tapDate, hours, minutes, category, otherNote, originEl)
    closeTapModal()
  }

  return (
    <>
      <div className="cal-inline cal-modal cal-modal-view">
        {/* No header here anymore — the shared Service Schedule nav bar (in ScheduleMain)
            owns the month label, the ‹ › month stepping, and the collapse ×. */}
        <div className="cal-grid-wrap">
          <div className="cal-dow-row">
            <div className="cal-week-days">
              {DOW_SHORT.map((h, i) => <span key={i} className="cal-dow">{h}</span>)}
            </div>
            <span className="cal-week-action" aria-hidden="true" />
          </div>
          {weekRows.map((wr, row) => {
            const rowCells = cells.slice(row * 7, row * 7 + 7)
            return (
              <div key={row} className={`cal-week-line${wr.isComplete ? ' week-complete' : ''}`}>
                <div className="cal-week-days">
                  {rowCells.map((day, ci) => {
                    if (day === null) return <span key={`e${row}-${ci}`} />
                    const scheduledBlocks = scheduledBlocksFor(day)
                    const isService = scheduledBlocks.length > 0
                    const isToday = monthHasToday && day === today.getDate()
                    const loggedCat = predominantCategory(day)
                    const dayAppts = apptsByDay.get(day) ?? []
                    const cellStyle: CSSProperties = {}
                    if (loggedCat) {
                      cellStyle.background = `color-mix(in srgb, var(--cat-${loggedCat}) 30%, var(--surface))`
                    }
                    const titleParts = [
                      ...scheduledBlocks.map((b) => `Scheduled ${CATEGORY_LABELS[b.category]}`),
                      loggedCat ? `${CATEGORY_LABELS[loggedCat]} time logged` : '',
                      ...dayAppts.map((a) => a.title),
                      wr.isComplete && ci === wr.firstIdx ? 'Weekly goal met' : '',
                    ].filter(Boolean)
                    let ringOffset = 0
                    return (
                      <div
                        key={day}
                        className={[
                          'cal-day-view', isService ? 'service' : '', loggedCat ? 'logged' : '', isToday ? 'today' : '', wr.isComplete ? 'week-complete' : '',
                        ].filter(Boolean).join(' ')}
                        style={cellStyle}
                        title={titleParts.join(', ')}
                        onClick={() => setTapDate(new Date(viewYear, viewMonth, day))}
                      >
                        {weeklyGoalMin > 0 && isService && (
                          <svg className="cal-ring" width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                            <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke="var(--border)" strokeWidth={RING_STROKE} opacity={0.5} />
                            {scheduledBlocks.map((b) => {
                              const pct = Math.min(1, b.minutes / weeklyGoalMin)
                              const segLen = pct * RING_C
                              const dashoffset = -ringOffset
                              ringOffset += segLen
                              return (
                                <circle
                                  key={b.category}
                                  cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                                  fill="none" stroke={`var(--cat-${b.category})`} strokeWidth={RING_STROKE}
                                  strokeDasharray={`${segLen} ${RING_C - segLen}`}
                                  strokeDashoffset={dashoffset}
                                  strokeLinecap="round"
                                  transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                                />
                              )
                            })}
                          </svg>
                        )}
                        {weeklyGoalMin <= 0 && isService && (
                          <span className="cal-day-plain-dot" style={{ background: `var(--cat-${scheduledBlocks[0].category})` }} />
                        )}
                        <span className="cal-day-num">{day}</span>
                        {dayAppts.length > 0 && <span className="cal-day-appt-dot" />}
                        {wr.isComplete && ci === wr.firstIdx && <span className="cal-week-check" title="Weekly goal met">✓</span>}
                      </div>
                    )
                  })}
                </div>
                <div className="cal-week-action">
                  {wr.hasSchedule && (
                    <button
                      className="cal-week-clear-btn"
                      title="Clear this week's schedule"
                      onClick={(e) => { e.stopPropagation(); setConfirmClearWeek(wr.weekStart) }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Contextual legend — each entry only appears when something on the calendar
            above actually uses it, and every swatch is drawn with the exact same style
            as the cells it explains. */}
        <div className="legend">
          {monthHasToday && (
            <span><i className="cal-sw" style={{ outline: '2px solid var(--accent)', outlineOffset: -2 }} /> Today</span>
          )}
          {weeklyGoalMin > 0 && suggestedCatsInMonth.length > 0 && (
            <span><i className="cal-sw cal-sw-ring" /> Share of weekly goal scheduled</span>
          )}
          {weeklyGoalMin <= 0 && suggestedCatsInMonth.map((cat) => (
            <span key={`sug-${cat}`}>
              <i className="cal-sw" style={{ background: `var(--cat-${cat})`, borderRadius: '50%' }} /> Scheduled {CATEGORY_LABELS[cat]}
            </span>
          ))}
          {loggedCatsInMonth.map((cat) => (
            <span key={`log-${cat}`}>
              <i className="cal-sw" style={{ background: `color-mix(in srgb, var(--cat-${cat}) 30%, var(--surface))` }} /> {CATEGORY_LABELS[cat]} logged
            </span>
          ))}
          {weeklyGoalMin > 0 && <span><i className="cal-sw" style={{ background: 'color-mix(in srgb, var(--accent) 16%, var(--surface))' }} /> ✓ Weekly goal met</span>}
          {monthAppts.length > 0 && <span><i className="sw appt" /> Return visit</span>}
        </div>

        {/* No standalone "Return Visits This Month" list — it made the calendar taller than the
            week view. Return visits still surface as the purple day-dots (tap a day for its
            details), and the legend still explains that dot. */}
        <button className="secondary schedule-view-bar" onClick={onSeeWeeklyView}>See week view</button>
      </div>

    {tapDate && (
      <DayActionModal
        date={tapDate}
        isSuggestedDay={blocksForDate(prefs, tapDate).length > 0}
        currentBlocks={blocksForDate(prefs, tapDate)}
        weeklyGoalMin={weeklyGoalMin}
        otherDaysSuggestedMin={weekSuggestedMinutesExcluding(prefs, tapDate, tapDate)}
        appointments={appointments}
        people={people}
        onGoToContact={onGoToContact}
        onSaveBlocks={handleSaveBlocks}
        onRemoveDay={handleRemoveDay}
        onClearAllDays={handleClearAllDays}
        onLogTime={handleLogTime}
        onSubmitScheduled={() => { if (tapDate) onSubmitScheduled(tapDate, blocksForDate(prefs, tapDate)) }}
        onClose={closeTapModal}
        closing={tapLeaving}
      />
    )}

    <ConfirmDialog
      open={confirmClearWeek != null}
      title="Clear this week's schedule?"
      message="Clears every scheduled day and time for this specific week only — other weeks and your recurring weekly pattern aren't affected. This can't be undone."
      confirmLabel="Yes, clear this week"
      cancelLabel="Cancel"
      tone="danger"
      onConfirm={() => {
        if (confirmClearWeek) onClearWeek(confirmClearWeek)
        setConfirmClearWeek(null)
      }}
      onCancel={() => setConfirmClearWeek(null)}
    />
    </>
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

/**
 * The non-pioneer equivalent of AddTime for anyone not tracking real hours — checking
 * the box off is the whole interaction, once a month, no hours or dates involved.
 */
function MonthlyParticipationBox({
  month,
  participated,
  onChange,
}: {
  month: number
  participated: boolean
  onChange: (participated: boolean) => void
}) {
  // Non-pioneers who don't track hours just tick one box a month — so the whole card is that
  // single toggle (the checkbox sits where an expand button used to), with a warm confirmation
  // when it's checked instead of a bare box.
  return (
    <div className={`card participation-card${participated ? ' done' : ''}`}>
      <label className="participation-header">
        <div>
          <strong>Participation in the Ministry</strong>
          <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            Did you share in the ministry during {MONTH_NAMES_LONG[month]}?
          </p>
        </div>
        <input
          type="checkbox"
          className="participation-check"
          checked={participated}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={`I participated in the ministry in ${MONTH_NAMES_LONG[month]}`}
        />
      </label>

      {participated && (
        <div className="participation-cue" role="status">
          <span className="participation-cue-emoji" aria-hidden="true">🎉</span>
          <div>
            <strong>You did it!</strong>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              {MONTH_NAMES_LONG[month]} is marked as a month you shared in the ministry. Every visit makes a difference.
            </p>
          </div>
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
  const [gearOpen, setGearOpen] = useState(false)
  const [confirmDiscontinue, setConfirmDiscontinue] = useState(false)
  const [confirmPrepareSlip, setConfirmPrepareSlip] = useState(false)
  const [slipBusy, setSlipBusy] = useState(false)
  const [slipMsg, setSlipMsg] = useState<string | null>(null)

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
    // 'continuous' ignores `months` for the target-hours decision (auxTargetHoursFor
    // always returns 30 for it) — stored here purely as the "start month" the S-205b-E
    // slip prints, since the form needs a month even for an open-ended enrollment.
    const finalMonths =
      mode === 'this-month' || mode === 'continuous'
        ? [auxMonthKey(now.getFullYear(), now.getMonth())]
        : months
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

  function discontinue() {
    onChange({ enabled: false, mode: null, targetHours: 30, weeklyHours: 7, months: [], monthTargets: {} })
    setConfirmDiscontinue(false)
  }

  async function prepareSlip() {
    setConfirmPrepareSlip(false)
    setSlipBusy(true)
    setSlipMsg(null)
    try {
      const bytes = await buildAuxSlipPdf(config, getProfileName())
      const how = await shareAuxSlipPdf(bytes, 'S-205b-E Auxiliary Pioneer Application.pdf')
      setSlipMsg(how === 'shared' ? 'Slip ready to save or send.' : 'Slip downloaded.')
    } catch {
      setSlipMsg('Could not prepare the slip. Please try again.')
    } finally {
      setSlipBusy(false)
    }
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
        <div style={{ margin: '2px 0 0 24px' }}>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>{summary}</p>

          <div className="row" style={{ marginTop: 6, alignItems: 'center' }}>
            <button className="secondary small" onClick={() => setConfirmPrepareSlip(true)} disabled={slipBusy}>
              📄 Prepare Auxiliary Slip for Group Overseer
            </button>
            <button
              className="icon-btn"
              title="Auxiliary pioneering settings"
              onClick={() => setGearOpen(true)}
            >
              ⚙️
            </button>
          </div>
          {slipMsg && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{slipMsg}</p>}
        </div>
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
                      {currentYearMonths().map(({ year, month, label }) => {
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
                      {currentYearMonths().map(({ year, month, label }) => {
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

      {gearOpen && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setGearOpen(false)}>
            <div className="modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-toolbar">
                <button className="icon-btn close-x" onClick={() => setGearOpen(false)} title="Close">×</button>
              </div>
              <h3 style={{ marginTop: 0 }}>Auxiliary pioneering settings</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="secondary" onClick={() => { setGearOpen(false); setConfiguring(true) }}>Adjust Settings</button>
                <button className="secondary" onClick={() => { setGearOpen(false); setConfirmPrepareSlip(true) }}>Resend S-205b-E Form</button>
                <button className="danger" onClick={() => { setGearOpen(false); setConfirmDiscontinue(true) }}>
                  Discontinue Auxiliary Pioneering
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <ConfirmDialog
        open={confirmPrepareSlip}
        title="Prepare the S-205b-E application?"
        message="This slip must still be reviewed and approved by your congregation's service committee — it isn't sent anywhere automatically. It's only a filled copy for you to share with your group overseer."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        tone="primary"
        onConfirm={prepareSlip}
        onCancel={() => setConfirmPrepareSlip(false)}
      />

      <ConfirmDialog
        open={confirmDiscontinue}
        title="Discontinue auxiliary pioneering?"
        message="Your progress card reverts to standard (non-pioneer) tracking. You can enable auxiliary pioneering again anytime."
        confirmLabel="Yes, discontinue"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={discontinue}
        onCancel={() => setConfirmDiscontinue(false)}
      />
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
