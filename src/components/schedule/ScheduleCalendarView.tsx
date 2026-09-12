import { useEffect, useRef, useState } from 'react'
import { type Appointment, type DayScheduleBlock, type SchedulePrefs, type TimeCategory, type TimeLog } from '../../db'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../categories'
import { GoalRing, RingSwatch } from '../SharedBits'
import { daySegments } from '../../goalSegments'
import ConfirmDialog from '../ConfirmDialog'
import { startOfWeek, DOW_SHORT } from './dates'
import { blocksForDate, weekSuggestedMinutesExcluding } from './plan'
import { DayActionModal } from './DayActionModal'

// ── Read-only schedule calendar view (suggested days + return visits) ────────
const RING_SIZE = 32
export function ScheduleCalendarView({
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
  onSubmitBlock,
  onDeleteBlock,
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
  onLogTime: (date: Date, hours: number, minutes: number, category: TimeCategory, activityNote: string, originEl?: HTMLElement, interval?: { startedAt: number; endedAt: number }) => void
  onSubmitScheduled: (date: Date, blocks: DayScheduleBlock[]) => void
  onSubmitBlock: (date: Date, blockIndex: number) => void
  onDeleteBlock: (date: Date, blockIndex: number) => void
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
  function handleLogTime(hours: number, minutes: number, category: TimeCategory, activityNote: string, originEl?: HTMLElement, interval?: { startedAt: number; endedAt: number }) {
    if (tapDate) onLogTime(tapDate, hours, minutes, category, activityNote, originEl, interval)
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
                    // Same ring language as the mini-week: each arc is that day's share of the
                    // weekly goal (hollow = scheduled, filled = logged), types accumulating.
                    const segments = daySegments(scheduledBlocks, loggedByDay.get(day) ?? {}, weeklyGoalMin)
                    const titleParts = [
                      ...scheduledBlocks.map((b) => `Scheduled ${CATEGORY_LABELS[b.category]}`),
                      loggedCat ? `${CATEGORY_LABELS[loggedCat]} time logged` : '',
                      ...dayAppts.map((a) => a.title),
                      wr.isComplete && ci === wr.firstIdx ? 'Weekly goal met' : '',
                    ].filter(Boolean)
                    return (
                      <div
                        key={day}
                        className={[
                          'cal-day-view', isService ? 'service' : '', loggedCat ? 'logged' : '', isToday ? 'today' : '', wr.isComplete ? 'week-complete' : '',
                        ].filter(Boolean).join(' ')}
                        title={titleParts.join(', ')}
                        onClick={() => setTapDate(new Date(viewYear, viewMonth, day))}
                      >
                        {segments.length > 0 && <GoalRing segments={segments} size={RING_SIZE} />}
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
        {/* Two-row legend: a Scheduled row (hollow ring + lightly-shaded category swatches) and a
            Logged row (filled ring + solid swatches), each listing exactly the categories present
            this month. The green ring around today's date already signifies the current day, so no
            "Today" key is needed. */}
        <div className="cal-legend">
          {weeklyGoalMin > 0 && suggestedCatsInMonth.length > 0 && (
            <div className="cal-legend-row">
              <span className="cal-legend-lead"><RingSwatch color="var(--accent)" /> Scheduled:</span>
              {suggestedCatsInMonth.map((cat) => (
                <span key={`s-${cat}`} className="cal-legend-cat">
                  <i className="cal-cat-sw" style={{ background: `color-mix(in srgb, var(--cat-${cat}) 30%, var(--surface))`, borderColor: `var(--cat-${cat})` }} /> {CATEGORY_LABELS[cat]}
                </span>
              ))}
            </div>
          )}
          {weeklyGoalMin > 0 && loggedCatsInMonth.length > 0 && (
            <div className="cal-legend-row">
              <span className="cal-legend-lead"><RingSwatch color="var(--accent)" logged /> Logged:</span>
              {loggedCatsInMonth.map((cat) => (
                <span key={`l-${cat}`} className="cal-legend-cat">
                  <i className="cal-cat-sw" style={{ background: `var(--cat-${cat})`, borderColor: `var(--cat-${cat})` }} /> {CATEGORY_LABELS[cat]}
                </span>
              ))}
            </div>
          )}
          {(weeklyGoalMin > 0 || monthAppts.length > 0) && (
            <div className="legend cal-legend-extra">
              {weeklyGoalMin > 0 && <span><i className="cal-sw" style={{ background: 'color-mix(in srgb, var(--accent) 16%, var(--surface))' }} /> ✓ Weekly goal met</span>}
              {monthAppts.length > 0 && <span><i className="sw appt" /> Return visit</span>}
            </div>
          )}
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
        onSubmitBlock={(i) => { if (tapDate) onSubmitBlock(tapDate, i) }}
        onDeleteBlock={(i) => { if (tapDate) onDeleteBlock(tapDate, i) }}
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
