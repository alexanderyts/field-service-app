import { useState } from 'react'
import { db, type Appointment } from '../../db'
import ConfirmDialog from '../ConfirmDialog'
import ModalPortal from '../../ModalPortal'
import { toLocalDateStr, toLocalTimeStr, combineDateTime, localDateAfter, roundedTimeStr } from '../../localDate'
import { VisitDateChips } from './VisitDateChips'
import { ContactPicker } from '../schedule/ContactPicker'

type PickablePerson = { id: number; name: string; street?: string }

/**
 * The one return-visit editor (Phase 3g — it used to be three: this, the day view's, and the
 * Return Visits card's inline form). With `appt` it edits or removes that visit; without, it
 * schedules a new one — for `personId` ("📅 Schedule visit" on a contact), or for whoever is
 * picked when `people` is given (Service → Return Visits → +). `people` also lets an existing
 * visit move to another contact.
 */
export function ReturnVisitEditor({ appt, personId: fixedPersonId, personName, people, onClose }: {
  appt?: Appointment
  personId?: number
  personName?: string
  people?: PickablePerson[]
  onClose: () => void
}) {
  const now = Date.now()
  const [personId, setPersonId] = useState<number | null>(appt?.personId ?? fixedPersonId ?? null)
  const [date, setDate] = useState(() => (appt ? toLocalDateStr(appt.date) : localDateAfter(7, now)))
  const [time, setTime] = useState(() => (appt ? toLocalTimeStr(appt.date) : roundedTimeStr(now)))
  const [notes, setNotes] = useState(appt?.notes ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const name = people?.find((p) => p.id === personId)?.name ?? personName
  const canSave = !!date && personId != null

  async function save() {
    if (!canSave) return
    const fields = {
      title: `Return Visit${name ? ` — ${name}` : ''}`,
      date: combineDateTime(date, time),
      personId: personId!,
      notes: notes.trim() || undefined,
    }
    if (appt) await db.appointments.update(appt.id, fields)
    else await db.appointments.add({ ...fields, durationMinutes: 30 } as Appointment)
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
          <h3>{appt ? 'Edit return visit' : `Schedule a visit${!people && name ? ` — ${name}` : ''}`}</h3>
          {people && (
            <label className="field">
              <span className="field-label">Contact</span>
              <ContactPicker people={people} personId={personId} onChange={setPersonId} />
            </label>
          )}
          <VisitDateChips date={date} time={time} onDate={setDate} onTime={setTime} />
          <label className="field">
            <span className="field-label">Notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="row">
            <button onClick={save} disabled={!canSave}>{appt ? 'Save changes' : 'Schedule visit'}</button>
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
