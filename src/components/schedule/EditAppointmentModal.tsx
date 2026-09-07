import { useState } from 'react'
import { db, type Appointment } from '../../db'
import ModalPortal from '../../ModalPortal'
import { parseLocalDate, fmtLocalDate } from '../../localDate'
import { ContactPicker } from './ContactPicker'

export function EditAppointmentModal({
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
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
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
