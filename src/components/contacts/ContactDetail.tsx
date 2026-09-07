import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Person, type Appointment } from '../../db'
import { STATUS_LABELS } from '../../contactStatus'
import { SharedBadge, SharedWarning } from '../SharedBits'
import { buildContactPayload } from '../../share'
import ConfirmDialog from '../ConfirmDialog'
import ModalPortal from '../../ModalPortal'
import ShareModal from '../ShareModal'
import { ContactForm } from './ContactForm'
import { ReturnVisitEditor } from './ReturnVisitEditor'
import { CallLogger } from './CallLogger'

function householdSummary(person: Person): string[] {
  const lines: string[] = []
  if (person.married) lines.push(`Married${person.spouseName ? ` to ${person.spouseName}` : ''}`)
  if (person.hasKids) lines.push(`Kids${person.kidsInfo ? `: ${person.kidsInfo}` : ''}`)
  if (person.hasPets) lines.push(`Pets${person.petsInfo ? `: ${person.petsInfo}` : ''}`)
  return lines
}
export function ContactDetail({ personId, onClose, onGoToMap }: {
  personId: number
  onClose: () => void
  onGoToMap?: (lat: number, lng: number, personId?: number) => void
}) {
  const person = useLiveQuery(() => db.people.get(personId), [personId])
  const calls = useLiveQuery(() => db.calls.where('personId').equals(personId).toArray(), [personId]) ?? []
  const appointments = useLiveQuery(
    () => db.appointments.where('personId').equals(personId).toArray(),
    [personId]
  ) ?? []
  const [expanded, setExpanded] = useState(false)
  const [showLogger, setShowLogger] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [callSort, setCallSort] = useState<'newest' | 'oldest'>('newest')
  const [editingCallId, setEditingCallId] = useState<number | null>(null)
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showShare, setShowShare] = useState(false)

  async function deletePerson() {
    // Transactional so an interruption (tab closed, exception) mid-delete can't leave
    // orphaned calls/appointments behind for a person that's already gone.
    await db.transaction('rw', [db.calls, db.appointments, db.people], async () => {
      await db.calls.where('personId').equals(personId).delete()
      await db.appointments.where('personId').equals(personId).delete()
      await db.people.delete(personId)
    })
    onClose()
  }

  if (!person) return null

  const addressStr = [person.street, person.city, person.state, person.zip].filter(Boolean).join(', ')
  const directionsUrl = addressStr
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressStr)}`
    : person.lat != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${person.lat},${person.lng}`
      : null

  const now = Date.now()
  const upcoming = appointments.filter((a) => a.date >= now).sort((a, b) => a.date - b.date)
  const sortedCalls = [...calls].sort((a, b) => (callSort === 'newest' ? b.date - a.date : a.date - b.date))
  const household = householdSummary(person)

  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${expanded ? ' modal-expanded' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-toolbar">
          <button className="icon-btn" onClick={() => setExpanded((v) => !v)} title={expanded ? 'Collapse' : 'Expand'} aria-label={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? '⤡' : '⤢'}
          </button>
          <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">
            ×
          </button>
        </div>

        {/* Pinned contact summary — address & phone right under the name */}
        <div className="contact-summary-block">
          <div className="detail-head">
            <h3>{person.name}</h3>
            <span className={`badge status-${person.status}`}>{STATUS_LABELS[person.status]}</span>
            <SharedBadge sharedWith={person.sharedWith} receivedFrom={person.receivedFrom} />
          </div>
          <p className="muted contact-line">{addressStr || 'No address on file'}</p>
          {person.phone && <p className="muted contact-line">{person.phone}</p>}
          <SharedWarning sharedWith={person.sharedWith} />

          {household.length > 0 && (
            <div className="household-summary">
              {household.map((line) => (
                <span key={line} className="household-pill">
                  {line}
                </span>
              ))}
            </div>
          )}
          {person.notes && <p className="muted contact-line">{person.notes}</p>}

          <p className="muted contact-line">Met {new Date(person.dateMet).toLocaleString()}</p>
        </div>

        <div className="row">
          {directionsUrl && (
            <a className="link-button" href={directionsUrl} target="_blank" rel="noreferrer">
              Get Directions
            </a>
          )}
          {person.lat != null && onGoToMap && (
            <button className="secondary" onClick={() => { onGoToMap(person.lat!, person.lng!, personId); onClose() }}>
              Jump to Map
            </button>
          )}
          <button className="secondary" onClick={() => setShowEdit(true)}>
            Edit Contact
          </button>
          <button className="secondary" onClick={() => setShowShare(true)}>↗ Share</button>
          <button onClick={() => setShowLogger((v) => !v)}>{showLogger ? 'Close Call Form' : '+ Log a Call'}</button>
        </div>

        {upcoming.length > 0 && (
          <div className="card appt-card">
            <h4>Upcoming Return Visit{upcoming.length === 1 ? '' : 's'}</h4>
            {upcoming.map((a) => (
              <div key={a.id} className="appt-row">
                <div>
                  <strong>{a.title}</strong>
                  <div className="muted">{new Date(a.date).toLocaleString()}</div>
                  {a.notes && <div>{a.notes}</div>}
                </div>
                <button className="secondary small" onClick={() => setEditingAppt(a)}>Edit</button>
              </div>
            ))}
          </div>
        )}

        {editingAppt && <ReturnVisitEditor appt={editingAppt} onClose={() => setEditingAppt(null)} />}

        {showLogger && <CallLogger personId={personId} sharedWith={person.sharedWith} onSaved={() => setShowLogger(false)} />}

        {/* Call history is the primary focus of this view */}
        <div className="view-header">
          <h4>Call History</h4>
          <label className="field">
            <span className="field-label">Sort</span>
            <select value={callSort} onChange={(e) => setCallSort(e.target.value as 'newest' | 'oldest')}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
        <ul className="list">
          {sortedCalls.map((c) =>
            editingCallId === c.id ? (
              <CallLogger
                key={c.id}
                personId={personId}
                existing={c}
                onSaved={() => setEditingCallId(null)}
                onCancel={() => setEditingCallId(null)}
              />
            ) : (
            <li key={c.id} className="list-item">
              <div>
                <div className="muted">
                  {new Date(c.date).toLocaleString()} {c.notHome && <span className="badge not-home-badge">Not Home</span>}
                </div>
                {c.notes && <div>{c.notes}</div>}
                {c.scriptures && <div>Scriptures: {c.scriptures}</div>}
                {c.literaturePlaced && <div>Literature placed: {c.literaturePlaced}</div>}
                {c.leftAtDoor && <div>Left at door: {c.leftAtDoor}</div>}
                {c.followUpDate && <div className="follow-up">Follow up: {new Date(c.followUpDate).toLocaleDateString()}</div>}
              </div>
              <button className="secondary small" onClick={() => setEditingCallId(c.id)}>
                Edit
              </button>
            </li>
            )
          )}
          {sortedCalls.length === 0 && <p className="muted">No calls logged yet.</p>}
        </ul>

        <div className="row">
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            Delete Contact
          </button>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {showEdit && <ContactForm existing={person} onClose={() => setShowEdit(false)} />}
      {showShare && (
        <ShareModal
          kind="contact"
          recordId={personId}
          itemName={person.name}
          buildPayload={(from) => buildContactPayload(personId, from)}
          onClose={() => setShowShare(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this contact?"
        message={`This permanently removes ${person.name} and their entire call history. This can't be undone.`}
        onConfirm={() => {
          setConfirmDelete(false)
          deletePerson()
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
    </ModalPortal>
  )
}

/** Edit or cancel an already-scheduled return visit (a saved appointment) — change its
    date/time, tweak the notes, or remove it entirely. */
