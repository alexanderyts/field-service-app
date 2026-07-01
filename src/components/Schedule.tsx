import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Appointment, type SchedulePrefs, type TimeCategory, type TimeLog } from '../db'
import { isCredit, yearlyApplied, yearlyTotals } from '../timeStats'
import ConfirmDialog from './ConfirmDialog'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const CATEGORY_LABELS: Record<TimeCategory, string> = {
  ministry: 'Ministry',
  ldc: 'LDC (Construction)',
  hlc: 'HLC',
  convention: 'Convention',
  assembly: 'Assembly',
  bethel: 'Bethel',
  other: 'Other',
}

const DAY_START = 6 * 60 // 6:00 AM
const DAY_END = 22 * 60 // 10:00 PM
const DAY_RANGE = DAY_END - DAY_START

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

/** Parses a `YYYY-MM-DD` (from a date input) as a local date, avoiding the UTC-midnight shift. */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
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

function Survey({ existing, onDone }: { existing?: SchedulePrefs; onDone: () => void }) {
  const [daysOut, setDaysOut] = useState<number[]>(existing?.daysOut ?? [2, 4, 6])
  const [weeklyHours, setWeeklyHours] = useState(String(existing?.weeklyHours ?? 12))
  const [yearlyHours, setYearlyHours] = useState(String(existing?.yearlyHours ?? 600))
  const [creditMode, setCreditMode] = useState<SchedulePrefs['creditMode']>(existing?.creditMode ?? 'as-needed')
  const [startTime, setStartTime] = useState(
    existing
      ? `${String(Math.floor(existing.startMinutes / 60)).padStart(2, '0')}:${String(existing.startMinutes % 60).padStart(2, '0')}`
      : '09:00'
  )
  const [sessionHours, setSessionHours] = useState(String(existing?.sessionHours ?? 2))

  function toggleDay(d: number) {
    setDaysOut((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))
  }

  async function save() {
    const [h, m] = startTime.split(':').map(Number)
    const record = {
      completedSurvey: true,
      daysOut,
      weeklyHours: Number(weeklyHours) || 0,
      yearlyHours: Number(yearlyHours) || 0,
      creditMode,
      startMinutes: h * 60 + m,
      sessionHours: Number(sessionHours) || 1,
    }
    if (existing) {
      await db.schedulePrefs.update(existing.id, record)
    } else {
      await db.schedulePrefs.add(record as SchedulePrefs)
    }
    onDone()
  }

  return (
    <div className="view">
      <h2 className="applet-title">Plan Your Schedule</h2>
      <p className="subtitle">Answer a few questions and we'll build a suggested weekly schedule for you.</p>

      <div className="card">
        <h4>Which days do you want to go out in service?</h4>
        <div className="day-toggle">
          {DAYS.map((d, i) => (
            <button key={i} className={daysOut.includes(i) ? 'chip active' : 'chip'} onClick={() => toggleDay(i)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h4>How much time do you want each week?</h4>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Hours per week</span>
            <input type="number" min="0" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Yearly goal (hrs)</span>
            <input type="number" min="0" value={yearlyHours} onChange={(e) => setYearlyHours(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card">
        <h4>Do you count credit hours weekly, or just as needed?</h4>
        <label className="field">
          <span className="field-label">Credit hours</span>
          <select value={creditMode} onChange={(e) => setCreditMode(e.target.value as SchedulePrefs['creditMode'])}>
            <option value="weekly">Count credit hours weekly</option>
            <option value="as-needed">Only as needed</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h4>When do you like to start, and for how long?</h4>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Usual start time</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Session length (hrs)</span>
            <input type="number" min="0.5" step="0.5" value={sessionHours} onChange={(e) => setSessionHours(e.target.value)} />
          </label>
        </div>
      </div>

      <button onClick={save} disabled={daysOut.length === 0}>
        Build My Schedule
      </button>
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
  const [highlightTs, setHighlightTs] = useState<number | null>(null)
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<number | null>(null)

  const weekStartMs = thisWeekStartMs + weekOffset * 7 * 24 * 60 * 60 * 1000
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000

  function jumpToNextReturnVisit() {
    const next = appointments.filter((a) => a.date >= Date.now()).sort((a, b) => a.date - b.date)[0]
    if (!next) return
    const targetWeekStart = startOfWeek(new Date(next.date)).getTime()
    setWeekOffset(Math.round((targetWeekStart - thisWeekStartMs) / (7 * 24 * 60 * 60 * 1000)))
    setWeekOpen(true)
    setHighlightTs(next.date)
  }

  // Current actual week (for the top goal-progress card — independent of navigation below)
  const thisWeekEndMs = thisWeekStartMs + 7 * 24 * 60 * 60 * 1000
  let weekMinistry = 0
  let weekCredit = 0
  for (const l of logs) {
    if (l.date >= thisWeekStartMs && l.date < thisWeekEndMs) {
      if (isCredit(l.category)) weekCredit += l.minutes
      else weekMinistry += l.minutes
    }
  }
  const weekTotal = weekMinistry + weekCredit

  // Navigated week (for the suggested-week section, which can page forward/back)
  const perDayMinistry = new Array(7).fill(0)
  const perDayCredit = new Array(7).fill(0)
  const perDayAppointments: { title: string; date: number }[][] = Array.from({ length: 7 }, () => [])
  for (const l of logs) {
    if (l.date >= weekStartMs && l.date < weekEndMs) {
      const dow = new Date(l.date).getDay()
      if (isCredit(l.category)) perDayCredit[dow] += l.minutes
      else perDayMinistry[dow] += l.minutes
    }
  }
  for (const a of appointments) {
    if (a.date >= weekStartMs && a.date < weekEndMs) {
      perDayAppointments[new Date(a.date).getDay()].push({ title: a.title, date: a.date })
    }
  }

  // Year: running total (all hours) + capped amount applied toward the goal
  const yearStats = yearlyTotals(logs, now.getFullYear())
  const yearApplied = yearlyApplied(logs, now.getFullYear())

  const sessionMinutes = prefs.daysOut.length ? (prefs.weeklyHours * 60) / prefs.daysOut.length : 0
  const suggestedEnd = Math.min(DAY_END, prefs.startMinutes + sessionMinutes)

  const weeklyGoalMin = prefs.weeklyHours * 60
  const yearlyGoalMin = prefs.yearlyHours * 60
  const weekMinistryPct = weeklyGoalMin ? Math.min(100, (weekMinistry / weeklyGoalMin) * 100) : 0
  const weekCreditPct = weeklyGoalMin ? Math.min(100 - weekMinistryPct, (weekCredit / weeklyGoalMin) * 100) : 0
  const yearPct = yearlyGoalMin ? Math.min(100, Math.round((yearApplied / yearlyGoalMin) * 100)) : 0

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
        <div className="goal-row">
          <span>This week</span>
          <strong>
            {(weekTotal / 60).toFixed(1)} / {prefs.weeklyHours}h
          </strong>
        </div>
        <div className="progress-bar split">
          <div className="progress-fill ministry" style={{ width: `${weekMinistryPct}%` }} />
          <div className="progress-fill credit" style={{ width: `${weekCreditPct}%` }} />
        </div>

        <div className="goal-row">
          <span>This year</span>
          <strong>
            {(yearApplied / 60).toFixed(1)} / {prefs.yearlyHours}h
          </strong>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${yearPct}%` }} />
        </div>
        <div className="legend tight">
          <span><i className="sw ministry" /> Ministry {(yearStats.ministry / 60).toFixed(1)}h</span>
          <span><i className="sw credit" /> Credit {(yearStats.credit / 60).toFixed(1)}h</span>
        </div>
        {yearStats.total / 60 - yearApplied / 60 > 0.05 && (
          <p className="muted">
            Total counted: {(yearStats.total / 60).toFixed(1)}h · {((yearStats.total - yearApplied) / 60).toFixed(1)}h beyond the
            55h/mo credit cap.
          </p>
        )}
      </div>

      {/* Collapsible week view, with navigation between weeks */}
      <div className="card">
        <div className="week-nav">
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation()
              setWeekOffset((o) => o - 1)
              setHighlightTs(null)
            }}
            title="Previous week"
          >
            ‹
          </button>
          <button className="collapse-header week-nav-label" onClick={() => setWeekOpen((o) => !o)}>
            <span>
              <strong>
                {fmtDayMonth(weekStartMs)} – {fmtDayMonth(weekEndMs - 86400000)}
              </strong>
              {weekOffset === 0 && <span className="muted"> · This week</span>}
            </span>
            <span className="chevron">{weekOpen ? '▾' : '▸'}</span>
          </button>
          <button
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation()
              setWeekOffset((o) => o + 1)
              setHighlightTs(null)
            }}
            title="Next week"
          >
            ›
          </button>
        </div>

        {!weekOpen ? (
          <div className="week-mini">
            {DAYS.map((d, i) => {
              const isService = prefs.daysOut.includes(i)
              const logged = perDayMinistry[i] + perDayCredit[i]
              const hasVisit = perDayAppointments[i].length > 0
              return (
                <div key={i} className={`mini-day${isService ? ' service' : ''}${logged > 0 ? ' done' : ''}`}>
                  {d[0]}
                  {hasVisit && <span className="mini-day-dot" title="Return visit scheduled" />}
                </div>
              )
            })}
          </div>
        ) : (
          <>
            {weekOffset !== 0 && (
              <button className="secondary small" onClick={() => { setWeekOffset(0); setHighlightTs(null) }}>
                Jump to current week
              </button>
            )}
            <button className="secondary small" onClick={jumpToNextReturnVisit}>
              Jump to next return visit
            </button>
            <div className="week-grid">
              {DAYS.map((d, i) => {
                const isService = prefs.daysOut.includes(i)
                const ministry = perDayMinistry[i]
                const credit = perDayCredit[i]
                const logged = ministry + credit
                const dayDate = new Date(weekStartMs + i * 24 * 60 * 60 * 1000)
                const isToday = dayDate.toDateString() === now.toDateString()
                const isHighlighted = highlightTs != null && new Date(highlightTs).toDateString() === dayDate.toDateString()
                const dayAppts = perDayAppointments[i]
                return (
                  <div key={i} className={`day-row${isToday ? ' today' : ''}${isHighlighted ? ' jump-highlight' : ''}`}>
                    <div className="day-label">
                      <span>{d}</span>
                      <span className="day-num">{dayDate.getDate()}</span>
                    </div>
                    <div className="day-track">
                      {isService && (
                        <div
                          className="slot-suggested"
                          style={{
                            left: `${((prefs.startMinutes - DAY_START) / DAY_RANGE) * 100}%`,
                            width: `${((suggestedEnd - prefs.startMinutes) / DAY_RANGE) * 100}%`,
                          }}
                          title={`${fmtTime(prefs.startMinutes)} – ${fmtTime(suggestedEnd)}`}
                        />
                      )}
                      {ministry > 0 && (
                        <div className="slot-logged ministry" style={{ width: `${Math.min(100, (ministry / DAY_RANGE) * 100)}%` }} />
                      )}
                      {credit > 0 && (
                        <div
                          className="slot-logged credit"
                          style={{
                            left: `${Math.min(100, (ministry / DAY_RANGE) * 100)}%`,
                            width: `${Math.min(100, (credit / DAY_RANGE) * 100)}%`,
                          }}
                        />
                      )}
                      {dayAppts.map((a, idx) => (
                        <div
                          key={idx}
                          className="slot-appt"
                          style={{ left: `${((new Date(a.date).getHours() * 60 + new Date(a.date).getMinutes() - DAY_START) / DAY_RANGE) * 100}%` }}
                          title={`${a.title} · ${fmtTime(new Date(a.date).getHours() * 60 + new Date(a.date).getMinutes())}`}
                        />
                      ))}
                    </div>
                    <div className="day-logged">{logged > 0 ? `${(logged / 60).toFixed(1)}h` : ''}</div>
                  </div>
                )
              })}
            </div>
            <div className="legend">
              <span><i className="sw suggested" /> Suggested</span>
              <span><i className="sw ministry" /> Ministry</span>
              <span><i className="sw credit" /> Credit</span>
              <span><i className="sw appt" /> Return Visit</span>
            </div>
          </>
        )}
      </div>

      {/* Collapsible add time */}
      <AddTime open={addOpen} onToggle={() => setAddOpen((o) => !o)} onAdded={() => setAddOpen(false)} />

      <ReturnVisits onGoToContact={onGoToContact} />

      <div className="card">
        <h4>Recent Entries</h4>
        <ul className="list">
          {logs.slice(0, 15).map((l) => (
            <li key={l.id} className="list-item">
              <div>
                <span className={`cat-dot ${isCredit(l.category) ? 'credit' : 'ministry'}`} />
                <strong>{(l.minutes / 60).toFixed(1)}h</strong> · {CATEGORY_LABELS[l.category]}
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
    </div>
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
  )
}

function AddTime({ open, onToggle, onAdded }: { open: boolean; onToggle: () => void; onAdded: () => void }) {
  const now = new Date()
  const [date, setDate] = useState(() => now.toISOString().slice(0, 10))
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [category, setCategory] = useState<TimeCategory>('ministry')
  const [otherNote, setOtherNote] = useState('')
  const [note, setNote] = useState('')
  const [showCal, setShowCal] = useState(false)
  const [numPad, setNumPad] = useState<'hours' | 'minutes' | null>(null)
  const [showRoundUp, setShowRoundUp] = useState(false)

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

  async function handleRoundUpNo() {
    setShowRoundUp(false)
    const h = Number(hours)
    const m = Number(minutes)

    // Compute new bank and save BEFORE any await that might trigger re-render
    let bank = getMinuteBank() + m
    const autoHour = bank >= 60
    if (autoHour) bank -= 60
    saveMinuteBank(bank)

    if (autoHour) {
      const d = parseLocalDate(date)
      d.setHours(12, 0, 0, 0)
      await db.timeLogs.add({ date: d.getTime(), minutes: 60, category: 'ministry', note: 'Added from minute bank' } as TimeLog)
    }

    if (h > 0) {
      await commitSave(h * 60)
    } else {
      setHours('0'); setMinutes('0'); setNote(''); setOtherNote('')
      onAdded()
    }
  }

  function handleSave() {
    const h = Number(hours)
    const m = Number(minutes)
    if (h === 0 && m === 0) return
    if (m > 30) { setShowRoundUp(true); return }
    commitSave(h * 60 + m)
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

            {/* Hours & Minutes numpad buttons */}
            <div className="field-row">
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
