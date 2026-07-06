import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, compareHouseNumbers, uniqueStreetName, type StreetEntry, type StreetHouse, type HouseStatus } from '../db'
import { expandState } from '../usStates'
import ModalPortal from '../ModalPortal'
import ConfirmDialog from './ConfirmDialog'
import ShareModal from './ShareModal'
import { SharedBadge, SharedWarning } from './SharedBits'
import { buildStreetPayload } from '../share'

/** Best-effort lookup of a traced street matching this Ministry-tab entry by name, across
    every territory (not just the active draft) — used to power a "Jump to Map" action
    for streets that have a real trace on the map. Returns the midpoint of its points. */
export async function findStreetTraceMidpoint(streetName: string): Promise<{ lat: number; lng: number } | null> {
  const territories = await db.territories.toArray()
  for (const t of territories) {
    const match = t.streets.find((s) => s.name.trim().toLowerCase() === streetName.trim().toLowerCase())
    if (match && match.points.length > 0) {
      const mid = match.points[Math.floor(match.points.length / 2)]
      return { lat: mid.lat, lng: mid.lng }
    }
  }
  return null
}

const HOUSE_STATUS_OPTIONS: { value: '' | HouseStatus; label: string }[] = [
  { value: '', label: '—' },
  { value: 'not-home', label: 'Not Home' },
  { value: 'no-trespassing', label: 'No Trespassing' },
  { value: 'other', label: 'Other' },
]

function houseId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Seed values for a new People-tab contact created from a street/house — just the address
    fields; the contact form fills the rest. */
export interface ContactPrefill {
  street?: string
  city?: string
  state?: string
  zip?: string
}

/** Returns the id of the StreetEntry backing a territory street, creating one if this street
    isn't already linked to one. This is what makes a street managed identically whether it's
    standalone or inside a territory — the group/import/manage flows all funnel a street through
    here so it always has a real StreetEntry behind it. Reuse is by the explicit `entryId` link
    only, never by name: two traces of the same road are kept as separate entries (a new one gets
    a "(2)"/"(3)" suffix so you can tell them apart). `extra` optionally seeds the city/state/zip. */
export async function ensureStreetEntry(
  street: { entryId?: number; name: string; points?: { lat: number; lng: number }[]; assignedTo?: string },
  extra?: { city?: string; state?: string; zip?: string }
): Promise<number> {
  const entries = await db.streetEntries.toArray()
  if (street.entryId != null) {
    const linked = entries.find((e) => e.id === street.entryId)
    if (linked) return linked.id
  }
  return (await db.streetEntries.add({
    name: uniqueStreetName(street.name, entries.map((e) => e.name)),
    city: extra?.city,
    state: extra?.state,
    zip: extra?.zip,
    houses: [],
    points: street.points,
    assignedTo: street.assignedTo,
    createdAt: Date.now(),
  })) as number
}

/**
 * The Ministry tab's "Streets" view — a searchable list of street entries, each holding the
 * house numbers worked on that road. Rendered beside the contacts list; the shared "+ New
 * Entry" chooser drives whether the new-street form is open via `showNewForm`.
 */
type StreetFilter = 'all' | 'standalone' | 'territory'

export default function StreetEntries({
  showNewForm,
  onCloseNewForm,
  onGoToMap,
  onCreateContact,
}: {
  showNewForm: boolean
  onCloseNewForm: () => void
  onGoToMap?: (lat: number, lng: number) => void
  onCreateContact?: (prefill: ContactPrefill) => void
}) {
  const entries = useLiveQuery(() => db.streetEntries.toArray(), []) ?? []
  const groupedTerritories = useLiveQuery(() => db.territories.filter((t) => !!t.grouped).toArray(), []) ?? []
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StreetFilter>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)

  // Which territory (if any) each street belongs to — keyed by both the backing entryId and the
  // street name (name is the legacy fallback link). Powers the list badge and the filter.
  const territoryByEntryId = new Map<number, string>()
  const territoryByName = new Map<string, string>()
  for (const t of groupedTerritories) {
    for (const s of t.streets) {
      if (s.entryId != null) territoryByEntryId.set(s.entryId, t.name)
      territoryByName.set(s.name.trim().toLowerCase(), t.name)
    }
  }
  function territoryFor(e: StreetEntry): string | undefined {
    return territoryByEntryId.get(e.id) ?? territoryByName.get(e.name.trim().toLowerCase())
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  async function bulkDelete() {
    await db.streetEntries.bulkDelete([...selectedIds])
    setSelectedIds(new Set()); setEditMode(false); setConfirmBulk(false)
  }

  const q = search.trim().toLowerCase()
  const filtered = entries
    .filter((e) =>
      !q ||
      e.name.toLowerCase().includes(q) ||
      (e.city ?? '').toLowerCase().includes(q) ||
      (e.zip ?? '').includes(q)
    )
    .filter((e) => {
      if (filter === 'all') return true
      const inTerritory = territoryFor(e) != null
      return filter === 'territory' ? inTerritory : !inTerritory
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const anyInTerritory = entries.some((e) => territoryFor(e) != null)

  return (
    <>
      <input
        className="full"
        placeholder="Search street, city, zip…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {anyInTerritory && (
        <div className="segmented">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'standalone' ? 'active' : ''} onClick={() => setFilter('standalone')}>Standalone</button>
          <button className={filter === 'territory' ? 'active' : ''} onClick={() => setFilter('territory')}>In a territory</button>
        </div>
      )}

      {showNewForm && (
        <StreetEntryForm
          onClose={onCloseNewForm}
          onSaved={(id) => {
            onCloseNewForm()
            setSelectedId(id)
          }}
        />
      )}

      {filtered.length > 0 && (
        <div className="list-edit-bar">
          <button className="secondary small" onClick={() => { setEditMode((m) => !m); setSelectedIds(new Set()) }}>
            {editMode ? 'Done' : '✎ Edit'}
          </button>
          {editMode && selectedIds.size > 0 && (
            <button className="danger small" onClick={() => setConfirmBulk(true)}>Delete selected ({selectedIds.size})</button>
          )}
        </div>
      )}

      <ul className="list">
        {filtered.map((e) => {
          const address = [e.city, e.state, e.zip].filter(Boolean).join(', ')
          return (
            <li key={e.id} className="list-item clickable" onClick={() => (editMode ? toggleSelect(e.id) : setSelectedId(e.id))}>
              {editMode && <input type="checkbox" checked={selectedIds.has(e.id)} readOnly style={{ marginRight: 10, flexShrink: 0 }} />}
              <div>
                <strong>{e.name}</strong>
                <span className="badge">{e.houses.length} house{e.houses.length === 1 ? '' : 's'}</span>
                {territoryFor(e) && <span className="badge">🗺 {territoryFor(e)}</span>}
                <SharedBadge sharedWith={e.sharedWith} receivedFrom={e.receivedFrom} />
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

      <ConfirmDialog
        open={confirmBulk}
        title={`Delete ${selectedIds.size} street${selectedIds.size === 1 ? '' : 's'}?`}
        message="This permanently removes the selected street entries and their house numbers. This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulk(false)}
      />

      {selectedId != null && !editMode && (
        <StreetDetail entryId={selectedId} onClose={() => setSelectedId(null)} onGoToMap={onGoToMap} onCreateContact={onCreateContact} />
      )}
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
  const [assignedTo, setAssignedTo] = useState(existing?.assignedTo ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [error, setError] = useState(false)
  const [dupConfirm, setDupConfirm] = useState(false)

  async function save(force = false) {
    if (!name.trim()) { setError(true); return }
    const record = {
      name: name.trim(),
      city: city.trim() || undefined,
      state: expandState(state) || undefined,
      zip: zip.trim() || undefined,
      assignedTo: assignedTo.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    if (existing) {
      await db.streetEntries.update(existing.id, record)
      onClose()
      return
    }
    if (!force) {
      const dup = (await db.streetEntries.toArray()).some((e) => e.name.trim().toLowerCase() === record.name.toLowerCase())
      if (dup) { setDupConfirm(true); return }
    }
    const id = (await db.streetEntries.add({ ...record, houses: [], createdAt: Date.now() })) as number
    onSaved?.(id)
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3>{existing ? 'Edit Street' : 'New Street'}</h3>
          {existing && <SharedWarning sharedWith={existing.sharedWith} />}
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
              <input value={state} onChange={(e) => setState(e.target.value)} onBlur={() => setState((s) => expandState(s))} />
            </label>
            <label className="field">
              <span className="field-label">Zip</span>
              <input value={zip} onChange={(e) => setZip(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Assigned to (optional)</span>
            <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="e.g. John Smith" />
          </label>
          <label className="field">
            <span className="field-label">Notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this street…" />
          </label>
          {error && <p className="error">Please enter a street name.</p>}
          <div className="row">
            <button onClick={() => save()}>{existing ? 'Save Changes' : 'Save Street'}</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>

        <ConfirmDialog
          open={dupConfirm}
          title="A street with this name already exists"
          message={`"${name.trim()}" is already in your Streets list. Add another entry with the same name?`}
          confirmLabel="Add anyway"
          cancelLabel="Cancel"
          tone="primary"
          onConfirm={() => { setDupConfirm(false); save(true) }}
          onCancel={() => setDupConfirm(false)}
        />
      </div>
    </ModalPortal>
  )
}

export function StreetDetail({
  entryId,
  onClose,
  onGoToMap,
  onCreateContact,
}: {
  entryId: number
  onClose: () => void
  onGoToMap?: (lat: number, lng: number) => void
  onCreateContact?: (prefill: ContactPrefill) => void
}) {
  const entry = useLiveQuery(() => db.streetEntries.get(entryId), [entryId])
  const [showEdit, setShowEdit] = useState(false)
  const [showPad, setShowPad] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [traceMidpoint, setTraceMidpoint] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (entry) {
      findStreetTraceMidpoint(entry.name).then((mid) => { if (!cancelled) setTraceMidpoint(mid) })
    }
    return () => { cancelled = true }
    // Deliberately keyed on the name alone — re-scanning every territory whenever any
    // other field (houses, notes) changes on this entry would be wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.name])

  if (!entry) return null

  const address = [entry.city, entry.state, entry.zip].filter(Boolean).join(', ')
  const sortedHouses = [...entry.houses].sort((a, b) => compareHouseNumbers(a.number, b.number))

  async function addHouses(newHouses: PadHouse[]) {
    if (!entry) return
    const existingNums = new Set(entry.houses.map((h) => h.number.toLowerCase()))
    const additions: StreetHouse[] = []
    for (const h of newHouses) {
      const trimmed = h.number.trim()
      if (!trimmed || existingNums.has(trimmed.toLowerCase())) continue
      existingNums.add(trimmed.toLowerCase())
      additions.push({ id: houseId(), number: trimmed, status: h.status, note: h.note })
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
          <p className="muted contact-line">
            {address || 'No city/zip on file'}
            {' '}<SharedBadge sharedWith={entry.sharedWith} receivedFrom={entry.receivedFrom} />
          </p>
          {entry.assignedTo && <p className="muted contact-line">👤 Assigned to {entry.assignedTo}</p>}
          {entry.notes && <p className="muted contact-line">{entry.notes}</p>}

          <SharedWarning sharedWith={entry.sharedWith} />

          <div className="row">
            <button onClick={() => setShowPad(true)}>＋ Add House</button>
            {onCreateContact && (
              <button
                className="secondary"
                onClick={() => { onCreateContact({ street: entry.name, city: entry.city, state: entry.state, zip: entry.zip }); onClose() }}
              >
                👤 New Contact
              </button>
            )}
            <button className="secondary" onClick={() => setShowShare(true)}>↗ Share</button>
            {traceMidpoint && onGoToMap && (
              <button className="secondary" onClick={() => { onGoToMap(traceMidpoint.lat, traceMidpoint.lng); onClose() }}>
                Jump to Map
              </button>
            )}
          </div>

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
                  {onCreateContact && (
                    <button
                      className="icon-btn"
                      title="Create a contact for this house"
                      onClick={() => { onCreateContact({ street: `${h.number} ${entry.name}`, city: entry.city, state: entry.state, zip: entry.zip }); onClose() }}
                    >
                      👤
                    </button>
                  )}
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
        {showPad && <HouseNumberPad onSubmit={(houses) => addHouses(houses)} onClose={() => setShowPad(false)} />}
        {showShare && (
          <ShareModal
            kind="street"
            recordId={entry.id}
            itemName={entry.name}
            buildPayload={(from) => buildStreetPayload(entry, from)}
            onClose={() => setShowShare(false)}
          />
        )}

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

/** A house being entered on the pad — its number plus an optional status flag and note. */
export interface PadHouse {
  number: string
  status?: HouseStatus
  note?: string
}

/**
 * A contextual keypad for entering house numbers. Digits by default; the "ABC" toggle
 * swaps the grid to letters so a unit suffix (12B) can be appended. Backspace (⌫) and enter
 * (✓) live in the grid itself. A status flag (Not Home / No Trespassing / Other) and an
 * optional note can be attached to each house right here at entry time.
 *
 * "Multiple houses" mode keeps the pad open after each ✓ so a whole run of doors can be
 * entered without reopening — every house is banked locally and handed back together on
 * close (single submit path, so no chance of double-adding). Outside that mode, ✓ submits
 * the single house and closes.
 */
function HouseNumberPad({ onSubmit, onClose }: { onSubmit: (houses: PadHouse[]) => void; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'' | HouseStatus>('')
  const [note, setNote] = useState('')
  const [alpha, setAlpha] = useState(false)
  const [multiple, setMultiple] = useState(false)
  const [queued, setQueued] = useState<PadHouse[]>([])

  function currentHouse(): PadHouse {
    return { number: value.trim(), status: status || undefined, note: note.trim() || undefined }
  }

  function resetFields() {
    setValue('')
    setStatus('')
    setNote('')
  }

  // Backdrop tap / X: keep whatever was already banked in multiple mode, drop the half-typed
  // current entry. In single mode nothing is ever queued, so this discards cleanly.
  function close() {
    if (queued.length) onSubmit(queued)
    onClose()
  }

  // Multiple mode's explicit "Done": also include the house currently on the display.
  function done() {
    const all = value.trim() ? [...queued, currentHouse()] : queued
    if (all.length) onSubmit(all)
    onClose()
  }

  function handleEnter() {
    if (!value.trim()) return
    if (multiple) {
      setQueued((q) => [...q, currentHouse()])
      resetFields()
    } else {
      onSubmit([currentHouse()])
      onClose()
    }
  }

  const enteredCount = queued.length
  const keys = alpha ? LETTERS : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

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
          </div>

          {multiple && enteredCount > 0 && (
            <p className="muted numpad-count">{enteredCount} added this session</p>
          )}

          <div className={alpha ? 'numpad-grid numpad-grid-alpha' : 'numpad-grid'}>
            {keys.map((ch) => (
              <button key={ch} className="numpad-key" onClick={() => setValue((v) => v + ch)}>{ch}</button>
            ))}
          </div>

          {/* Enter (green) bottom-left, backspace bottom-right — same on both the number and
              letter pads, so the two most-used keys are always in a predictable spot. */}
          <div className="numpad-actions">
            <button className="numpad-key numpad-key-enter" title="Add house" onClick={handleEnter} disabled={!value.trim()}>✓ Enter</button>
            <button className="numpad-key numpad-key-back" title="Backspace" onClick={() => setValue((v) => v.slice(0, -1))}>⌫</button>
          </div>

          <div className="numpad-house-meta">
            <select
              className="house-status"
              value={status}
              onChange={(e) => setStatus((e.target.value || '') as '' | HouseStatus)}
            >
              {HOUSE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label === '—' ? 'No flag' : o.label}</option>
              ))}
            </select>
            <input
              className="house-note"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
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
