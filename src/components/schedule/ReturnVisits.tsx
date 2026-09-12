import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Appointment } from '../../db'
import ConfirmDialog from '../ConfirmDialog'
import { parseLocalDate, fmtDateTime } from '../../localDate'
import { isOverdue, pendingAppointments } from '../../appointments'
import { ContactPicker } from './ContactPicker'

export function ReturnVisits({ onGoToContact }: { onGoToContact: (personId: number) => void }) {
  const appointments = useLiveQuery(() => db.appointments.orderBy('date').toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []
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

  const now = Date.now()
  // Missed visits stay listed, marked overdue, until followed up or stale (AUDIT F036).
  const upcoming = pendingAppointments(appointments, calls, now)

  return (
    <div className="card">
      <button className="collapse-header" onClick={() => setOpen((o) => !o)}>
        <strong>Return Visits</strong>
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
                {isOverdue(a, now) && <span className="badge appt-badge overdue">Overdue</span>}
                <div className="muted">{fmtDateTime(a.date)}</div>
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
