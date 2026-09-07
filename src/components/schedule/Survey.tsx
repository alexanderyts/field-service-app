import { useState } from 'react'
import { db, type SchedulePrefs } from '../../db'
import { creditHoursEnabled, setCreditHoursEnabled } from '../../settings'
import { DAYS, DAY_NAMES_FULL, fmtTime, weeklyFromYearly, minutesToTimeInput, timeInputToMinutes } from './dates'
import { TimeInputModal } from './TimeInputModal'

export function SurveyIntro({ onTakeSurvey, onSkip }: { onTakeSurvey: () => void; onSkip: () => void }) {
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
export function Survey({ existing, onDone }: { existing?: SchedulePrefs; onDone: () => void }) {
  // Matches db.ts's documented default: a legacy record that predates this field is
  // treated as a pioneer everywhere else in the app, so redoing the survey on one
  // should start pre-answered the same way instead of looking unanswered. A brand-new
  // user (no existing record at all) gets no default — they must answer explicitly.
  const [isPioneer, setIsPioneer] = useState<boolean | null>(existing ? (existing.isPioneer ?? true) : null)
  const [creditYes, setCreditYes] = useState<boolean | null>(
    existing ? creditHoursEnabled() : null
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
    setCreditHoursEnabled(!!(isPioneer && creditYes))
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
            LDC, HLC, Bethel and qualifying convention or assembly time — counted alongside
            ministry time, up to a combined 55 hours a month.
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
