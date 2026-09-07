import { useState } from 'react'
import { db, type TimeCategory, type TimeLog } from '../../db'
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../categories'
import { fmtDuration } from '../../timeStats'
import ModalPortal from '../../ModalPortal'
import { parseLocalDate, fmtLocalDate } from '../../localDate'

export function EditLogModal({ log, onClose }: { log: TimeLog; onClose: () => void }) {
  const [dateStr, setDateStr] = useState(() => fmtLocalDate(new Date(log.date)))
  const [hours, setHours] = useState(String(Math.floor(log.minutes / 60)))
  const [minutes, setMinutes] = useState(String(log.minutes % 60))
  const [category, setCategory] = useState<TimeCategory>(log.category)
  const [note, setNote] = useState(log.note ?? '')
  const [activityNote, setActivityNote] = useState(log.activityNote ?? '')

  const totalMin = (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0)

  async function save() {
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
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <h3>Edit Time Entry</h3>
          <label className="field">
            <span className="field-label">Date</span>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Hours</span>
              <input type="number" min={0} inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Minutes</span>
              <input type="number" min={0} max={59} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as TimeCategory)}>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">What was it? (optional)</span>
            <input
              value={activityNote}
              onChange={(e) => setActivityNote(e.target.value)}
              placeholder={category === 'credit' ? 'e.g. LDC, Circuit assembly…' : 'e.g. Cart witnessing, Letter writing…'}
            />
          </label>
          <label className="field">
            <span className="field-label">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {totalMin <= 0 && <p className="muted" style={{ fontSize: 13 }}>⚠ Enter a duration greater than zero.</p>}
          <p className="muted" style={{ fontSize: 13 }}>That's {fmtDuration(totalMin)} total.</p>
          <div className="row">
            <button onClick={save} disabled={totalMin <= 0}>Save Changes</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

/** Edit a return visit's contact, date/time, and notes — opened from the day-detail
    modal's Return Visit section (both the weekly and calendar views). Mirrors
    ReturnVisits' own inline add form (Schedule.tsx ~2523+), just against an existing row. */
