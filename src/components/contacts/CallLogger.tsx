import { useState } from 'react'
import { db, type Person, type Call, type Appointment } from '../../db'
import { logCall } from '../../records'
import { useCurrentLocation } from '../../useGeolocation'
import { formatScripture } from '../../scripture'
import { SharedWarning } from '../SharedBits'
import { toLocalDateStr, toLocalTimeStr, combineDateTime } from '../../localDate'

export function CallLogger({
  personId,
  existing,
  sharedWith,
  onSaved,
  onCancel,
}: {
  personId: number
  existing?: Call
  sharedWith?: Person['sharedWith']
  onSaved: () => void
  onCancel?: () => void
}) {
  const [whenDate, setWhenDate] = useState(() => toLocalDateStr(existing?.date ?? Date.now()))
  const [whenTime, setWhenTime] = useState(() => toLocalTimeStr(existing?.date ?? Date.now()))
  const [notHome, setNotHome] = useState(existing?.notHome ?? false)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [scriptures, setScriptures] = useState(existing?.scriptures ?? '')
  const [leftAtDoor, setLeftAtDoor] = useState(existing?.leftAtDoor ?? '')
  const [literaturePlaced, setLiteraturePlaced] = useState(existing?.literaturePlaced ?? '')
  const [returnVisitDate, setReturnVisitDate] = useState('')
  const [returnVisitTime, setReturnVisitTime] = useState('10:00')
  const { getLocation } = useCurrentLocation()
  const [saving, setSaving] = useState(false)

  async function saveCall() {
    if (saving) return
    setSaving(true)
    const record = {
      personId,
      date: whenDate ? combineDateTime(whenDate, whenTime) : Date.now(),
      notHome,
      notes: notes || undefined,
      scriptures: notHome ? undefined : scriptures ? formatScripture(scriptures) : undefined,
      leftAtDoor: notHome ? leftAtDoor || undefined : undefined,
      literaturePlaced: notHome ? undefined : literaturePlaced.trim() || undefined,
    }

    let returnVisit: Omit<Appointment, 'id'> | null = null
    if (returnVisitDate) {
      const person = await db.people.get(personId)
      returnVisit = {
        title: `Return Visit${person ? ` — ${person.name}` : ''}`,
        date: combineDateTime(returnVisitDate, returnVisitTime),
        durationMinutes: 30,
        personId,
      }
    }

    if (existing) {
      await db.transaction('rw', db.calls, db.appointments, async () => {
        await db.calls.update(existing.id, record)
        if (returnVisit) await db.appointments.add(returnVisit as Appointment)
      })
    } else {
      // Saved before the GPS lookup starts; the position is attached when (if) it arrives.
      await logCall(record, returnVisit, getLocation)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="card">
      {onCancel && (
        <div className="modal-toolbar">
          <button className="icon-btn close-x" onClick={onCancel} disabled={saving} title="Cancel edit" aria-label="Cancel edit">×</button>
        </div>
      )}
      <h4>{existing ? 'Edit Call' : 'Log a Call'}</h4>
      <SharedWarning sharedWith={sharedWith} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Date</span>
          <input type="date" value={whenDate} onChange={(e) => setWhenDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Time</span>
          <input type="time" value={whenTime} onChange={(e) => setWhenTime(e.target.value)} />
        </label>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={notHome} onChange={(e) => setNotHome(e.target.checked)} />
        <span>Not at home</span>
      </label>

      {notHome ? (
        <>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea placeholder="Any notes about this visit…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Left at the door (optional)</span>
            <input value={leftAtDoor} onChange={(e) => setLeftAtDoor(e.target.value)} />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Conversation notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Scriptures shared (optional)</span>
            <input
              value={scriptures}
              onChange={(e) => setScriptures(e.target.value)}
              onBlur={(e) => setScriptures(formatScripture(e.target.value))}
              placeholder="e.g. jn 3:16"
            />
          </label>
          <label className="field">
            <span className="field-label">Literature placed (optional)</span>
            <input value={literaturePlaced} onChange={(e) => setLiteraturePlaced(e.target.value)} placeholder="e.g. Awake! magazine" />
          </label>
        </>
      )}

      <p className="field-label">Schedule a return visit (optional)</p>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Date</span>
          <input type="date" value={returnVisitDate} onChange={(e) => setReturnVisitDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Time</span>
          <input type="time" value={returnVisitTime} onChange={(e) => setReturnVisitTime(e.target.value)} />
        </label>
      </div>

      <div className="row">
        <button onClick={saveCall} disabled={saving}>{existing ? 'Save Changes' : 'Save Call'}</button>
        {onCancel && (
          <button className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
