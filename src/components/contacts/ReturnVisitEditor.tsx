import { useState } from 'react'
import { db, type Appointment } from '../../db'
import ConfirmDialog from '../ConfirmDialog'
import ModalPortal from '../../ModalPortal'
import { toLocalDateStr, toLocalTimeStr, combineDateTime } from '../../localDate'

export function ReturnVisitEditor({ appt, onClose }: { appt: Appointment; onClose: () => void }) {
  const [date, setDate] = useState(() => toLocalDateStr(appt.date))
  const [time, setTime] = useState(() => toLocalTimeStr(appt.date))
  const [notes, setNotes] = useState(appt.notes ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function save() {
    await db.appointments.update(appt.id, {
      date: combineDateTime(date, time),
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  async function remove() {
    await db.appointments.delete(appt.id)
    onClose()
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <h3>Edit Return Visit</h3>
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
            <span className="field-label">Notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="row">
            <button onClick={save}>Save Changes</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
          <button className="danger" onClick={() => setConfirmRemove(true)}>Remove This Visit</button>

          <ConfirmDialog
            open={confirmRemove}
            title="Remove this return visit?"
            message="This cancels the scheduled visit. This can't be undone."
            confirmLabel="Remove"
            onConfirm={() => { setConfirmRemove(false); remove() }}
            onCancel={() => setConfirmRemove(false)}
          />
        </div>
      </div>
    </ModalPortal>
  )
}
