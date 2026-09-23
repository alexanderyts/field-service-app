import { useState } from 'react'
import { db, type Appointment } from '../../db'
import ConfirmDialog from '../ConfirmDialog'
import ModalPortal from '../../ModalPortal'
import { toLocalDateStr, toLocalTimeStr, combineDateTime, localDateAfter, roundedTimeStr } from '../../localDate'
import { VisitDateChips } from './VisitDateChips'

/**
 * Schedule a return visit for a contact, or edit / remove one already scheduled. With `appt` it
 * edits that visit; without, it creates one for `personId` — "📅 Schedule visit" on a contact,
 * so a visit can be set without logging a fake call first.
 */
export function ReturnVisitEditor({ appt, personId, personName, onClose }: {
  appt?: Appointment
  personId?: number
  personName?: string
  onClose: () => void
}) {
  const now = Date.now()
  const [date, setDate] = useState(() => (appt ? toLocalDateStr(appt.date) : localDateAfter(7, now)))
  const [time, setTime] = useState(() => (appt ? toLocalTimeStr(appt.date) : roundedTimeStr(now)))
  const [notes, setNotes] = useState(appt?.notes ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function save() {
    if (!date) return
    const when = combineDateTime(date, time)
    if (appt) {
      await db.appointments.update(appt.id, { date: when, notes: notes.trim() || undefined })
    } else if (personId != null) {
      await db.appointments.add({
        title: `Return Visit${personName ? ` — ${personName}` : ''}`,
        date: when,
        durationMinutes: 30,
        personId,
        notes: notes.trim() || undefined,
      } as Appointment)
    }
    onClose()
  }

  async function remove() {
    if (appt) await db.appointments.delete(appt.id)
    onClose()
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <h3>{appt ? 'Edit return visit' : `Schedule a visit${personName ? ` — ${personName}` : ''}`}</h3>
          <VisitDateChips date={date} time={time} onDate={setDate} onTime={setTime} />
          <label className="field">
            <span className="field-label">Notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="row">
            <button onClick={save} disabled={!date}>{appt ? 'Save changes' : 'Schedule visit'}</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
          {appt && <button className="danger" onClick={() => setConfirmRemove(true)}>Remove this visit</button>}

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
