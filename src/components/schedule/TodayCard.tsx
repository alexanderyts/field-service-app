import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { dueToday, isOverdue, visitBadgeLabel } from '../../appointments'

/**
 * Who to see today, at the top of Service: today's return visits and any still-pending
 * overdue ones. "Log visit" opens that contact over this tab with the visit form ready —
 * logging it is what clears the row (a visit followed by a call is no longer pending).
 * Renders nothing on a day with nothing due.
 */
export function TodayCard({ onLogVisit }: { onLogVisit: (personId: number) => void }) {
  const appointments = useLiveQuery(() => db.appointments.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const now = Date.now()
  const due = dueToday(appointments, calls, now)
  if (due.length === 0) return null

  return (
    <div className="card today-card">
      <h4 style={{ margin: 0 }}>Today</h4>
      <ul className="list">
        {due.map((a) => {
          const person = people.find((p) => p.id === a.personId)
          const label = visitBadgeLabel(a.date, now)
          return (
            <li key={a.id} className="list-item today-row">
              <div className="visit-info">
                <strong>{person?.name ?? a.title}</strong>
                <div className={`muted${isOverdue(a, now) && label !== 'Today' ? ' today-overdue' : ''}`}>
                  {label === 'Today'
                    ? new Date(a.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                    : label}
                  {person?.street ? ` · ${person.street}` : ''}
                </div>
                {a.notes && <div className="muted">{a.notes}</div>}
              </div>
              {a.personId != null && (
                <button className="small" onClick={() => onLogVisit(a.personId!)}>Log visit</button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
