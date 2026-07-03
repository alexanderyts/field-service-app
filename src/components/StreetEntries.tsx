import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, compareHouseNumbers, type StreetEntry, type StreetHouse, type HouseStatus } from '../db'
import ModalPortal from '../ModalPortal'
import ConfirmDialog from './ConfirmDialog'

const HOUSE_STATUS_OPTIONS: { value: '' | HouseStatus; label: string }[] = [
  { value: '', label: '—' },
  { value: 'not-home', label: 'Not Home' },
  { value: 'no-trespassing', label: 'No Trespassing' },
  { value: 'other', label: 'Other' },
]

function houseId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * The Ministry tab's "Streets" view — a searchable list of street entries, each holding the
 * house numbers worked on that road. Rendered beside the contacts list; the shared "+ New
 * Entry" chooser drives whether the new-street form is open via `showNewForm`.
 */
export default function StreetEntries({
  showNewForm,
  onCloseNewForm,
}: {
  showNewForm: boolean
  onCloseNewForm: () => void
}) {
  const entries = useLiveQuery(() => db.streetEntries.toArray(), []) ?? []
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const q = search.trim().toLowerCase()
  const filtered = entries
    .filter((e) =>
      !q ||
      e.name.toLowerCase().includes(q) ||
      (e.city ?? '').toLowerCase().includes(q) ||
      (e.zip ?? '').includes(q)
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <input
        className="full"
        placeholder="Search street, city, zip…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showNewForm && (
        <StreetEntryForm
          onClose={onCloseNewForm}
          onSaved={(id) => {
            onCloseNewForm()
            setSelectedId(id)
          }}
        />
      )}

      <ul className="list">
        {filtered.map((e) => {
          const address = [e.city, e.state, e.zip].filter(Boolean).join(', ')
          return (
            <li key={e.id} className="list-item clickable" onClick={() => setSelectedId(e.id)}>
              <div>
                <strong>{e.name}</strong>
                <span className="badge">{e.houses.length} house{e.houses.length === 1 ? '' : 's'}</span>
                <div className="muted">{address || 'No city/zip'}</div>
              </div>
            </li>
          )
        })}
        {filtered.length === 0 && (
          <p className="muted">
            {entries.length === 0 ? 'No street entries yet. Tap "+ New Entry" to add one.' : 'No streets match.'}
          </p>
        )}
      </ul>

      {selectedId != null && <StreetDetail entryId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  )
}

/** Create or edit the street's identifying info (name + city/state/zip). Houses are managed
    separately, inside the detail view. */
function StreetEntryForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: StreetEntry
  onClose: () => void
  onSaved?: (id: number) => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [city, setCity] = useState(existing?.city ?? '')
  const [state, setState] = useState(existing?.state ?? '')
  const [zip, setZip] = useState(existing?.zip ?? '')
  const [error, setError] = useState(false)

  async function save() {
    if (!name.trim()) { setError(true); return }
    const record = {
      name: name.trim(),
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      zip: zip.trim() || undefined,
    }
    if (existing) {
      await db.streetEntries.update(existing.id, record)
      onClose()
    } else {
      const id = (await db.streetEntries.add({ ...record, houses: [], createdAt: Date.now() })) as number
      onSaved?.(id)
    }
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3>{existing ? 'Edit Street' : 'New Street'}</h3>
          <label className={`field${error ? ' field-invalid' : ''}`}>
            <span className="field-label">Street name</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setError(false) }} placeholder="e.g. Maple Avenue" autoFocus />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">State</span>
              <input value={state} onChange={(e) => setState(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Zip</span>
              <input value={zip} onChange={(e) => setZip(e.target.value)} />
            </label>
          </div>
          {error && <p className="error">Please enter a street name.</p>}
          <div className="row">
            <button onClick={save}>{existing ? 'Save Changes' : 'Save Street'}</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}

function StreetDetail({ entryId, onClose }: { entryId: number; onClose: () => void }) {
  const entry = useLiveQuery(() => db.streetEntries.get(entryId), [entryId])
  const [showEdit, setShowEdit] = useState(false)
  const [showPad, setShowPad] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!entry) return null

  const address = [entry.city, entry.state, entry.zip].filter(Boolean).join(', ')
  const sortedHouses = [...entry.houses].sort((a, b) => compareHouseNumbers(a.number, b.number))

  async function addHouses(numbers: string[]) {
    if (!entry) return
    const existingNums = new Set(entry.houses.map((h) => h.number.toLowerCase()))
    const additions: StreetHouse[] = []
    for (const n of numbers) {
      const trimmed = n.trim()
      if (!trimmed || existingNums.has(trimmed.toLowerCase())) continue
      existingNums.add(trimmed.toLowerCase())
      additions.push({ id: houseId(), number: trimmed })
    }
    if (additions.length) await db.streetEntries.update(entry.id, { houses: [...entry.houses, ...additions] })
  }

  async function updateHouse(id: string, patch: Partial<StreetHouse>) {
    if (!entry) return
    const houses = entry.houses.map((h) => (h.id === id ? { ...h, ...patch } : h))
    await db.streetEntries.update(entry.id, { houses })
  }

  async function removeHouse(id: string) {
    if (!entry) return
    await db.streetEntries.update(entry.id, { houses: entry.houses.filter((h) => h.id !== id) })
  }

  async function deleteEntry() {
    await db.streetEntries.delete(entryId)
    onClose()
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>

          <div className="detail-head">
            <h3>{entry.name}</h3>
            <button className="icon-btn" title="Edit street" onClick={() => setShowEdit(true)}>✎</button>
          </div>
          <p className="muted contact-line">{address || 'No city/zip on file'}</p>

          <button onClick={() => setShowPad(true)}>＋ Add House</button>

          <ul className="house-list">
            {sortedHouses.map((h) => (
              <li key={h.id} className="house-row">
                <div className="house-row-main">
                  <strong className="house-number">{h.number}</strong>
                  <select
                    className="house-status"
                    value={h.status ?? ''}
                    onChange={(e) => updateHouse(h.id, { status: (e.target.value || undefined) as HouseStatus | undefined })}
                  >
                    {HOUSE_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button className="icon-btn" title="Remove house" onClick={() => removeHouse(h.id)}>×</button>
                </div>
                <input
                  className="house-note"
                  placeholder="Note (optional)"
                  value={h.note ?? ''}
                  onChange={(e) => updateHouse(h.id, { note: e.target.value || undefined })}
                />
              </li>
            ))}
            {sortedHouses.length === 0 && (
              <p className="muted" style={{ marginTop: 8 }}>No houses yet — tap "Add House" to start.</p>
            )}
          </ul>

          <div className="row">
            <button className="danger" onClick={() => setConfirmDelete(true)}>Delete Street</button>
            <button className="secondary" onClick={onClose}>Close</button>
          </div>
        </div>

        {showEdit && <StreetEntryForm existing={entry} onClose={() => setShowEdit(false)} />}
        {showPad && <HouseNumberPad onSubmit={(nums) => addHouses(nums)} onClose={() => setShowPad(false)} />}

        <ConfirmDialog
          open={confirmDelete}
          title="Delete this street?"
          message={`This removes "${entry.name}" and all ${entry.houses.length} of its house numbers. This can't be undone.`}
          onConfirm={() => { setConfirmDelete(false); deleteEntry() }}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </ModalPortal>
  )
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * A contextual keypad for entering house numbers. Digits by default; the "ABC" toggle
 * swaps the grid to letters so a unit suffix (12B) can be appended. "Multiple houses" mode
 * keeps the pad open after each ✓ so a whole run of doors can be entered without reopening —
 * every submitted number is collected and handed back together on close. Outside that mode,
 * ✓ submits the single number and closes.
 */
function HouseNumberPad({ onSubmit, onClose }: { onSubmit: (numbers: string[]) => void; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [alpha, setAlpha] = useState(false)
  const [multiple, setMultiple] = useState(false)
  // In multiple mode each ✓ banks a number here; nothing hits the DB until the pad closes,
  // so there's a single submit path and no chance of double-adding.
  const [queued, setQueued] = useState<string[]>([])

  // Backdrop tap / X: keep whatever was already banked in multiple mode, drop the half-typed
  // current value. In single mode nothing is ever queued, so this discards cleanly.
  function close() {
    if (queued.length) onSubmit(queued)
    onClose()
  }

  // Multiple mode's explicit "Done": also include the number currently on the display.
  function done() {
    const v = value.trim()
    const all = v ? [...queued, v] : queued
    if (all.length) onSubmit(all)
    onClose()
  }

  function handleEnter() {
    if (!value.trim()) return
    if (multiple) {
      setQueued((q) => [...q, value.trim()])
      setValue('')
    } else {
      onSubmit([value.trim()])
      onClose()
    }
  }

  const enteredCount = queued.length

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={close}>
        <div className="modal numpad-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={close} title="Close">×</button>
          </div>
          <h3 style={{ marginTop: 0 }}>Add House{multiple ? 's' : ''}</h3>

          <div className="numpad-display">
            <span className="numpad-value">{value || <span className="numpad-placeholder">Enter number</span>}</span>
            <button className="icon-btn numpad-back" title="Backspace" onClick={() => setValue((v) => v.slice(0, -1))}>⌫</button>
          </div>

          {multiple && enteredCount > 0 && (
            <p className="muted numpad-count">{enteredCount} added this session</p>
          )}

          <div className={alpha ? 'numpad-grid numpad-grid-alpha' : 'numpad-grid'}>
            {alpha
              ? LETTERS.map((ch) => (
                  <button key={ch} className="numpad-key" onClick={() => setValue((v) => v + ch)}>{ch}</button>
                ))
              : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
                  <button key={d} className="numpad-key" onClick={() => setValue((v) => v + d)}>{d}</button>
                ))}
          </div>

          <div className="numpad-controls">
            <button
              className={alpha ? 'chip active' : 'chip'}
              onClick={() => setAlpha((a) => !a)}
            >
              {alpha ? '123' : 'ABC'}
            </button>
            <button
              className={multiple ? 'chip active' : 'chip'}
              onClick={() => setMultiple((m) => !m)}
            >
              Multiple houses
            </button>
          </div>

          <button className="numpad-enter" onClick={handleEnter} disabled={!value.trim()}>
            {multiple ? '✓ Add (keep open)' : '✓ Add House'}
          </button>
          {multiple ? (
            <button className="secondary" onClick={done}>Done</button>
          ) : (
            <button className="secondary" onClick={onClose}>Cancel</button>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
