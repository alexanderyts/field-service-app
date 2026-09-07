import { useState } from 'react'
import { buildAuxSlipPdf, shareAuxSlipPdf } from '../../auxSlip'
import { getProfileName } from '../../profile'
import { type AuxConfig, type AuxMode, auxMonthKey, suggestedWeeklyHours } from '../../auxPioneering'
import ConfirmDialog from '../ConfirmDialog'
import ModalPortal from '../../ModalPortal'
import { currentYearMonths } from './dates'

const EMPTY_MONTH_TARGETS: Record<string, 15 | 30> = {}

/** The auxiliary-pioneering checkbox and its one-time setup flow, shown at the top of a
    non-pioneer's progress card. */
export function AuxPioneeringBox({ config, onChange }: { config: AuxConfig; onChange: (cfg: AuxConfig) => void }) {
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
              aria-label="Auxiliary pioneering settings"
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
            aria-label="Close without saving"
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
                <button className="icon-btn close-x" onClick={() => setGearOpen(false)} title="Close" aria-label="Close">×</button>
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
