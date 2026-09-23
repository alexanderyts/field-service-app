import { useState } from 'react'
import { type AuxConfig } from '../../auxPioneering'
import { buildAuxSlipPdf, shareAuxSlipPdf } from '../../auxSlip'
import { getProfileName } from '../../profile'
import ConfirmDialog from '../ConfirmDialog'

/**
 * Auxiliary pioneering at a glance: what's set, and the S-205b-E slip. Setting it up, changing
 * it or stopping it all happen in one place — the goal editor's role question ("Change") — so
 * this card no longer carries a second copy of that form (Phase 3d).
 */
export function AuxPioneeringBox({ config, onChange }: { config: AuxConfig; onChange: () => void }) {
  const [confirmPrepareSlip, setConfirmPrepareSlip] = useState(false)
  const [slipBusy, setSlipBusy] = useState(false)
  const [slipMsg, setSlipMsg] = useState<string | null>(null)

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

  const summary =
    config.mode === 'continuous' ? '30h a month · Continuous'
    : config.mode === 'this-month' ? `${config.targetHours}h · This month`
    : `${config.months.length} month${config.months.length === 1 ? '' : 's'} chosen`

  return (
    <div className="aux-summary">
      <div className="aux-summary-head">
        <span><strong>Auxiliary pioneering</strong> <span className="muted">· {summary}</span></span>
        <button type="button" className="link-btn" onClick={onChange}>Change</button>
      </div>
      <button className="secondary small" onClick={() => setConfirmPrepareSlip(true)} disabled={slipBusy}>
        📄 Prepare the application slip (S-205b-E)
      </button>
      {slipMsg && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{slipMsg}</p>}

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
    </div>
  )
}
