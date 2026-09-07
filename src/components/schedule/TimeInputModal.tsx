import { useState } from 'react'
import { fmtDuration } from '../../timeStats'
import ModalPortal from '../../ModalPortal'
import { timeInputToMinutes } from './dates'

export function TimeInputModal({
  title,
  subtitle,
  initialStart,
  initialEnd,
  showEnd,
  onSave,
  onRemove,
  onClose,
}: {
  title: string
  subtitle?: string
  initialStart: string
  initialEnd?: string
  showEnd: boolean
  onSave: (start: string, end?: string) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd ?? initialStart)
  const durationMin = timeInputToMinutes(end) - timeInputToMinutes(start)

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <h3>{title}</h3>
          {subtitle && <p className="muted" style={{ marginTop: -8, fontSize: 13 }}>{subtitle}</p>}
          <div className={showEnd ? 'field-row' : undefined}>
            <label className="field">
              <span className="field-label">Start time</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            {showEnd && (
              <label className="field">
                <span className="field-label">End time</span>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            )}
          </div>
          {showEnd && durationMin > 0 && (
            <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>That's {fmtDuration(durationMin)} of service time.</p>
          )}
          {showEnd && durationMin <= 0 && (
            <p className="muted" style={{ fontSize: 13 }}>⚠ End time must be after start time.</p>
          )}
          <button
            onClick={() => onSave(start, showEnd ? end : undefined)}
            disabled={showEnd && durationMin <= 0}
          >
            Save
          </button>
          {onRemove && (
            <button className="danger" onClick={onRemove}>Remove this day</button>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

/** Opens from clicking a day in the expanded weekly schedule: add/edit that day's
    suggested ministry window, or log actual service time against that specific date
    (right here, without leaving for the separate Add Time panel). */
