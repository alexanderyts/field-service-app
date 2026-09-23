import { useState } from 'react'
import { db, type Person, type Call, type Appointment } from '../../db'
import { logCall } from '../../records'
import { useCurrentLocation } from '../../useGeolocation'
import { formatScripture } from '../../scripture'
import { SharedWarning } from '../SharedBits'
import { toLocalDateStr, toLocalTimeStr, combineDateTime, fmtDateTime, roundedTimeStr } from '../../localDate'
import { VisitDateChips } from './VisitDateChips'

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
  const [returnVisitTime, setReturnVisitTime] = useState(() => roundedTimeStr(Date.now()))
  // At the door the visit is "now"; the date/time pickers only open on request.
  const [editWhen, setEditWhen] = useState(false)
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
      <h4>{existing ? 'Edit visit' : 'Log a visit'}</h4>
      <SharedWarning sharedWith={sharedWith} />
      {/* The one question that shapes the rest of the form, as two big buttons. */}
      <div className="segmented visit-outcome" role="group" aria-label="How did it go?">
        <button type="button" className={!notHome ? 'active' : ''} aria-pressed={!notHome} onClick={() => setNotHome(false)}>🗣️ Talked</button>
        <button type="button" className={notHome ? 'active' : ''} aria-pressed={notHome} onClick={() => setNotHome(true)}>🚪 Not home</button>
      </div>
      {editWhen ? (
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
      ) : (
        <p className="muted visit-when">
          {existing ? fmtDateTime(existing.date) : 'Now'} ·{' '}
          <button type="button" className="link-btn" onClick={() => setEditWhen(true)}>change</button>
        </p>
      )}

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

      <p className="field-label">Return visit</p>
      <VisitDateChips date={returnVisitDate} time={returnVisitTime} onDate={setReturnVisitDate} onTime={setReturnVisitTime} allowNone />

      <div className="row">
        <button onClick={saveCall} disabled={saving}>{existing ? 'Save changes' : 'Save visit'}</button>
        {onCancel && (
          <button className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
