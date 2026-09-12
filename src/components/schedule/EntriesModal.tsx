import type { TimeLog } from '../../db'
import { CATEGORY_LABELS } from '../../categories'
import { fmtDuration, isCredit } from '../../timeStats'
import ModalPortal from '../../ModalPortal'
import { MONTH_NAMES_LONG } from './dates'

/** The full time-log history, grouped by month with a subtotal per month. Opened from
    "See all" under Recent Entries so the tab itself stays short (docs/wave5-plan.md §B).
    Edit and delete route back to the hub's existing handlers, which render their own modals
    on top of this one (ModalPortal stacks). */
export function EntriesModal({
  logs,
  onEdit,
  onDelete,
  onClose,
}: {
  logs: TimeLog[]
  onEdit: (log: TimeLog) => void
  onDelete: (id: number) => void
  onClose: () => void
}) {
  // logs arrive newest-first; group into months in that order.
  const groups: { key: string; label: string; total: number; rows: TimeLog[] }[] = []
  for (const l of logs) {
    const d = new Date(l.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, label: `${MONTH_NAMES_LONG[d.getMonth()]} ${d.getFullYear()}`, total: 0, rows: [] }
      groups.push(g)
    }
    g.rows.push(l)
    g.total += l.minutes
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal modal-expanded" onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <h3 style={{ marginTop: -6 }}>All entries</h3>
          {groups.length === 0 && <p className="muted">No time logged yet.</p>}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="entries-month-head">
                <span>{g.label}</span>
                <span>{fmtDuration(g.total)}</span>
              </div>
              <ul className="list">
                {g.rows.map((l) => (
                  <li key={l.id} className="list-item">
                    <div className="visit-info">
                      <span className={`cat-dot ${isCredit(l.category) ? 'credit' : 'ministry'}`} />
                      <strong>{fmtDuration(l.minutes)}</strong> · {CATEGORY_LABELS[l.category]}
                      {[l.activityNote, l.note].filter(Boolean).map((t) => ` — ${t}`).join('')}
                      <div className="muted">
                        {new Date(l.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div className="visit-actions">
                      <button className="secondary small" onClick={() => onEdit(l)}>Edit</button>
                      <button className="icon-btn row-delete" title="Delete entry" aria-label="Delete this entry" onClick={() => onDelete(l.id)}>🗑</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </ModalPortal>
  )
}
