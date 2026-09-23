import { useState } from 'react'
import { db, type TimeCategory, type TimeLog } from '../../db'
import ModalPortal from '../../ModalPortal'
import { parseLocalDate, fmtLocalDate } from '../../localDate'
import { LogTimeForm } from './LogTimeForm'

/** Edit a logged entry with the same form used to log it — presets, NumPad, category pills —
    instead of the native number inputs it used to have. The day and the note stay editable. */
export function EditLogModal({ log, onClose }: { log: TimeLog; onClose: () => void }) {
  const [dateStr, setDateStr] = useState(() => fmtLocalDate(new Date(log.date)))
  const [note, setNote] = useState(log.note ?? '')

  async function save(hours: number, minutes: number, category: TimeCategory, activityNote: string) {
    const totalMin = hours * 60 + minutes
    if (totalMin <= 0) return
    // Keep the original time-of-day; only the calendar day is user-editable here.
    const orig = new Date(log.date)
    const nd = parseLocalDate(dateStr)
    nd.setHours(orig.getHours(), orig.getMinutes(), 0, 0)
    await db.timeLogs.update(log.id, {
      date: nd.getTime(),
      minutes: totalMin,
      category,
      note: note.trim() || undefined,
      activityNote: activityNote.trim() || undefined,
    })
    onClose()
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <h3>Edit time entry</h3>
          <label className="field">
            <span className="field-label">Date</span>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <LogTimeForm
            closing={false}
            initial={{ hours: Math.floor(log.minutes / 60), minutes: log.minutes % 60, category: log.category, activityNote: log.activityNote }}
            submitLabel="Save changes"
            onSubmit={(h, m, cat, act) => { void save(h, m, cat, act) }}
          />
          <button className="secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </ModalPortal>
  )
}
