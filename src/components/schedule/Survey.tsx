import { useState } from 'react'
import { db, type SchedulePrefs } from '../../db'
import { creditHoursEnabled, setCreditHoursEnabled } from '../../settings'
import { type AuxConfig, type AuxMode, auxMonthKey, getAuxConfig, saveAuxConfig, suggestedWeeklyHours } from '../../auxPioneering'
import { type Role, deriveRole } from '../../schedulePrefsRole'
import { weeklyFromYearly } from './dates'
import { AuxMonthTargets } from './AuxMonthTargets'

const AUX_OFF: AuxConfig = { enabled: false, mode: null, targetHours: 30, weeklyHours: 7, months: [], monthTargets: {} }

/** Shown once, only for a device with no schedulePrefs record yet — a way past the intake
    for someone who hasn't decided what they want to track. */
export function SurveyIntro({ onTakeSurvey, onSkip }: { onTakeSurvey: () => void; onSkip: () => void }) {
  return (
    <div className="view">
      <h2 className="applet-title">Set your goal</h2>
      <div className="card">
        <p>
          Tell Meleo what you're aiming for and it will show your progress toward it every time
          you log time. Takes about 20 seconds, and you can change it any time.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <button onClick={onTakeSurvey}>Set my goal</button>
          <button className="secondary" onClick={onSkip}>Skip for now</button>
        </div>
      </div>
    </div>
  )
}

/**
 * The intake. One question decides everything else: are you a publisher, an auxiliary
 * pioneer, or a regular pioneer? Days and time windows are never asked here — planning a
 * week is optional and lives on the Service tab (docs/tracking-first-plan.md, Wave 1).
 *
 * On a redo, `daysOut`/`daySchedule`/`dateOverrides` are left exactly as they were.
 */
export function Survey({ existing, onDone }: { existing?: SchedulePrefs; onDone: () => void }) {
  const initialAux = getAuxConfig()
  const [role, setRole] = useState<Role | null>(existing ? deriveRole(existing, initialAux) : null)

  // Pioneer
  const [yearlyHours, setYearlyHours] = useState(String(existing?.yearlyHours || 600))
  const [creditYes, setCreditYes] = useState<boolean | null>(existing ? creditHoursEnabled() : null)

  // Auxiliary
  const [auxMode, setAuxMode] = useState<AuxMode | null>(initialAux.enabled ? initialAux.mode : null)
  const [targetHours, setTargetHours] = useState<15 | 30>(initialAux.targetHours)
  const [months, setMonths] = useState<string[]>(initialAux.months)
  const [monthTargets, setMonthTargets] = useState<Record<string, 15 | 30>>(initialAux.monthTargets)

  // Publisher
  const [goalPeriod, setGoalPeriod] = useState<'none' | 'weekly' | 'monthly' | 'yearly'>(existing?.goalPeriod ?? 'none')
  const [weeklyHours, setWeeklyHours] = useState(String(existing?.weeklyHours || 2))
  const [monthlyHours, setMonthlyHours] = useState(String(existing?.monthlyHours ?? (Math.round((existing?.weeklyHours ?? 0) * 4.3) || 10)))
  const [pubYearlyHours, setPubYearlyHours] = useState(String(existing?.yearlyHours || 100))

  function setMonthTarget(key: string, hours: 15 | 30) {
    setMonths((prev) => (prev.includes(key) ? prev : [...prev, key].sort()))
    setMonthTargets((prev) => ({ ...prev, [key]: hours }))
  }
  function removeMonth(key: string) {
    setMonths((prev) => prev.filter((k) => k !== key))
    setMonthTargets((prev) => { const next = { ...prev }; delete next[key]; return next })
  }

  const ready =
    role === 'pioneer' ? creditYes !== null
    : role === 'auxiliary' ? auxMode !== null && (auxMode !== 'multiple-months' || months.length > 0)
    : role === 'publisher'

  async function save() {
    if (!role || !ready) return
    let record: Partial<SchedulePrefs>
    if (role === 'pioneer') {
      const yearly = Number(yearlyHours) || 600
      record = {
        role, isPioneer: true,
        yearlyHours: yearly,
        weeklyHours: Number(weeklyFromYearly(yearly)),
        goalPeriod: 'none', monthlyHours: undefined,
      }
      saveAuxConfig(AUX_OFF)
      setCreditHoursEnabled(!!creditYes)
    } else if (role === 'auxiliary') {
      const now = new Date()
      const target: 15 | 30 = auxMode === 'continuous' ? 30 : targetHours
      const finalMonths = auxMode === 'multiple-months' ? months : [auxMonthKey(now.getFullYear(), now.getMonth())]
      saveAuxConfig({
        enabled: true, mode: auxMode!, targetHours: target,
        weeklyHours: suggestedWeeklyHours(target),
        months: finalMonths,
        monthTargets: auxMode === 'multiple-months' ? monthTargets : {},
      })
      record = { role, isPioneer: false, yearlyHours: 0, weeklyHours: suggestedWeeklyHours(target), goalPeriod: 'none', monthlyHours: undefined }
      setCreditHoursEnabled(false)
    } else {
      const weekly =
        goalPeriod === 'weekly' ? Number(weeklyHours) || 0
        : goalPeriod === 'monthly' ? Math.round(((Number(monthlyHours) || 0) / 4.3) * 10) / 10
        : goalPeriod === 'yearly' ? Number(weeklyFromYearly(Number(pubYearlyHours) || 0))
        : 0
      record = {
        role, isPioneer: false,
        goalPeriod,
        weeklyHours: weekly,
        yearlyHours: goalPeriod === 'yearly' ? Number(pubYearlyHours) || 0 : 0,
        monthlyHours: goalPeriod === 'monthly' ? Number(monthlyHours) || 0 : undefined,
      }
      saveAuxConfig(AUX_OFF)
      setCreditHoursEnabled(false)
    }
    if (existing) {
      await db.schedulePrefs.update(existing.id, { ...record, completedSurvey: true })
    } else {
      await db.schedulePrefs.add({ ...record, completedSurvey: true, daysOut: [], daySchedule: {} } as SchedulePrefs)
    }
    onDone()
  }

  const roleBtn = (r: Role, label: string, hint: string) => (
    <button className={role === r ? '' : 'secondary'} aria-pressed={role === r} onClick={() => setRole(r)} style={{ textAlign: 'left' }}>
      <strong style={{ display: 'block' }}>{label}</strong>
      <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>{hint}</span>
    </button>
  )

  return (
    <div className="view">
      <h2 className="applet-title">Set your goal</h2>
      <p className="subtitle">What you pick here decides what the Service tab counts for you.</p>

      <div className="card">
        <h4>Which best describes you?</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {roleBtn('publisher', 'Publisher', 'Report whether you shared in the ministry each month. Set an hour goal if you want one.')}
          {roleBtn('auxiliary', 'Auxiliary pioneer', '15 or 30 hours a month, for the months you choose.')}
          {roleBtn('pioneer', 'Regular pioneer', '600 hours a service year, with credit hours if they apply.')}
        </div>
      </div>

      {role === 'pioneer' && (
        <>
          <div className="card">
            <h4>Hours for the service year</h4>
            <label className="field">
              <span className="field-label">Yearly goal (hrs)</span>
              <input type="number" min="0" value={yearlyHours} onChange={(e) => setYearlyHours(e.target.value)} />
            </label>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Meleo works out what each month and week needs from this, and adjusts as you go.
            </p>
          </div>
          <div className="card">
            <h4>Count credit hours?</h4>
            <p className="muted" style={{ marginTop: -6 }}>
              LDC, HLC, Bethel and qualifying convention or assembly time — counted alongside
              ministry time, up to a combined 55 hours a month.
            </p>
            <div className="row">
              <button className={creditYes === true ? '' : 'secondary'} aria-pressed={creditYes === true} onClick={() => setCreditYes(true)}>Yes</button>
              <button className={creditYes === false ? '' : 'secondary'} aria-pressed={creditYes === false} onClick={() => setCreditYes(false)}>No</button>
            </div>
          </div>
        </>
      )}

      {role === 'auxiliary' && (
        <div className="card">
          <h4>For how long?</h4>
          <div className="row">
            <button className={auxMode === 'this-month' ? '' : 'secondary'} aria-pressed={auxMode === 'this-month'} onClick={() => setAuxMode('this-month')}>This month</button>
            <button className={auxMode === 'multiple-months' ? '' : 'secondary'} aria-pressed={auxMode === 'multiple-months'} onClick={() => setAuxMode('multiple-months')}>Chosen months</button>
            <button className={auxMode === 'continuous' ? '' : 'secondary'} aria-pressed={auxMode === 'continuous'} onClick={() => setAuxMode('continuous')}>Continuous</button>
          </div>
          {auxMode === 'this-month' && (
            <div className="field" style={{ marginTop: 10 }}>
              <span className="field-label">Monthly target</span>
              <div className="row">
                <button className={targetHours === 15 ? '' : 'secondary'} aria-pressed={targetHours === 15} onClick={() => setTargetHours(15)}>15 hours</button>
                <button className={targetHours === 30 ? '' : 'secondary'} aria-pressed={targetHours === 30} onClick={() => setTargetHours(30)}>30 hours</button>
              </div>
            </div>
          )}
          {auxMode === 'continuous' && (
            <p className="muted" style={{ margin: '10px 0 0' }}>Continuous auxiliary pioneers aim for 30 hours a month.</p>
          )}
          {auxMode === 'multiple-months' && (
            <div style={{ marginTop: 10 }}>
              <AuxMonthTargets months={months} monthTargets={monthTargets} onSet={setMonthTarget} onRemove={removeMonth} />
            </div>
          )}
        </div>
      )}

      {role === 'publisher' && (
        <div className="card">
          <h4>
            Set a personal hour goal? <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(optional)</span>
          </h4>
          <p className="muted" style={{ marginTop: -6 }}>
            Without one, Meleo just tracks whether you shared in the ministry each month.
          </p>
          <div className="row">
            <button className={goalPeriod === 'none' ? '' : 'secondary'} aria-pressed={goalPeriod === 'none'} onClick={() => setGoalPeriod('none')}>Just participation</button>
            <button className={goalPeriod === 'weekly' ? '' : 'secondary'} aria-pressed={goalPeriod === 'weekly'} onClick={() => setGoalPeriod('weekly')}>Weekly</button>
            <button className={goalPeriod === 'monthly' ? '' : 'secondary'} aria-pressed={goalPeriod === 'monthly'} onClick={() => setGoalPeriod('monthly')}>Monthly</button>
            <button className={goalPeriod === 'yearly' ? '' : 'secondary'} aria-pressed={goalPeriod === 'yearly'} onClick={() => setGoalPeriod('yearly')}>Yearly</button>
          </div>
          {goalPeriod === 'weekly' && (
            <label className="field" style={{ marginTop: 10 }}>
              <span className="field-label">Hours per week</span>
              <input type="number" min="0" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} />
            </label>
          )}
          {goalPeriod === 'monthly' && (
            <label className="field" style={{ marginTop: 10 }}>
              <span className="field-label">Hours per month</span>
              <input type="number" min="0" value={monthlyHours} onChange={(e) => setMonthlyHours(e.target.value)} />
            </label>
          )}
          {goalPeriod === 'yearly' && (
            <label className="field" style={{ marginTop: 10 }}>
              <span className="field-label">Hours per service year</span>
              <input type="number" min="0" value={pubYearlyHours} onChange={(e) => setPubYearlyHours(e.target.value)} />
            </label>
          )}
        </div>
      )}

      {role && (
        <button onClick={save} disabled={!ready}>Start tracking</button>
      )}
    </div>
  )
}
