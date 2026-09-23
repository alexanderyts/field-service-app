import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import ConfirmDialog from '../ConfirmDialog'
import { fmtDateTime } from '../../localDate'
import { isOverdue, pendingAppointments } from '../../appointments'
import { ReturnVisitEditor } from '../contacts/ReturnVisitEditor'

export function ReturnVisits({ onGoToContact }: { onGoToContact: (personId: number) => void }) {
  const appointments = useLiveQuery(() => db.appointments.orderBy('date').toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []
  const [adding, setAdding] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)

  const now = Date.now()
  // Missed visits stay listed, marked overdue, until followed up or stale (AUDIT F036).
  const upcoming = pendingAppointments(appointments, calls, now)

  return (
    <div className="card">
      <div className="collapse-header">
        <strong>Return Visits</strong>
        <button className="add-plus" onClick={() => setAdding(true)} aria-label="Schedule a return visit" title="Schedule a return visit">+</button>
      </div>
      {adding && <ReturnVisitEditor people={people} onClose={() => setAdding(false)} />}

      <ul className="list">
        {(showAll ? upcoming : upcoming.slice(0, 3)).map((a) => {
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
                    Open contact
                  </button>
                )}
                <button className="icon-btn row-delete" title="Delete return visit" aria-label="Delete this return visit" onClick={() => setConfirmDeleteId(a.id)}>
                  🗑
                </button>
              </div>
            </li>
          )
        })}
        {upcoming.length === 0 && <p className="muted">No return visits scheduled. Tap + here, or set one while logging a visit.</p>}
      </ul>
      {upcoming.length > 3 && (
        <button className="secondary small" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all (${upcoming.length})`}
        </button>
      )}

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
