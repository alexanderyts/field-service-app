import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ContactStatus } from '../db'
import { fmtDateTime } from '../localDate'
import { isOverdue, nextPendingByPerson, visitBadgeLabel } from '../appointments'
import { STATUS_LABELS, STATUS_ORDER } from '../contactStatus'
import { deleteContacts } from '../records'
import { SharedBadge, pressable } from './SharedBits'
import { readMeleoFile } from '../share'
import ConfirmDialog from './ConfirmDialog'
import ModalPortal from '../ModalPortal'
import Territories from './Territories'
import StreetEntries, { type ContactPrefill } from './StreetEntries'
import { ContactForm } from './contacts/ContactForm'
import { ContactDetail } from './contacts/ContactDetail'

type SortKey = 'street' | 'name' | 'date' | 'city' | 'zip'
type MinistryView = 'people' | 'streets' | 'territories'
export default function Contacts({
  openContactId,
  onOpenedContact,
  onGoToMap,
  onImportEncoded,
  onNewTerritory,
}: {
  openContactId?: number | null
  onOpenedContact?: () => void
  onGoToMap?: (lat: number, lng: number, personId?: number) => void
  onImportEncoded?: (encoded: string) => void
  onNewTerritory?: () => void
}) {
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const appointments = useLiveQuery(() => db.appointments.toArray(), []) ?? []
  const calls = useLiveQuery(() => db.calls.toArray(), []) ?? []
  // Counts shown on the segmented control so each list's size reads at a glance. Territories
  // counts only the *grouped* (durable) ones — the active draft isn't a "created" territory.
  const streetCount = useLiveQuery(() => db.streetEntries.count(), []) ?? 0
  const territoryCount = useLiveQuery(() => db.territories.filter((t) => !!t.grouped).count(), []) ?? 0
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [filterStatus, setFilterStatus] = useState<ContactStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState<MinistryView>('people')
  const [contactPrefill, setContactPrefill] = useState<ContactPrefill | null>(null)
  const [showChooser, setShowChooser] = useState(false)
  const [streetFormOpen, setStreetFormOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  async function bulkDeletePeople() {
    await deleteContacts([...selectedIds])
    setSelectedIds(new Set()); setEditMode(false); setConfirmBulk(false)
  }

  // Open the new-contact form on the People view, pre-filled from a street/house (from the
  // Streets list or a street inside a territory).
  function handleCreateContact(prefill: ContactPrefill) {
    setContactPrefill(prefill)
    setView('people')
    setShowNew(true)
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return
    try {
      const encoded = await readMeleoFile(file)
      onImportEncoded?.(encoded)
    } catch {
      // A malformed/empty file — ImportConfirm surfaces decode errors; an unreadable file
      // just no-ops rather than throwing.
    }
  }

  useEffect(() => {
    if (openContactId != null) {
      setSelectedId(openContactId)
      setView('people')
      onOpenedContact?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openContactId])

  const now = Date.now()
  // Overdue visits stay on the row until followed up or stale (AUDIT F036).
  const nextAppointment = nextPendingByPerson(appointments, calls, now)

  const filtered = people.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    const q = search.toLowerCase()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      (p.street ?? '').toLowerCase().includes(q) ||
      (p.city ?? '').toLowerCase().includes(q) ||
      (p.zip ?? '').includes(q)
    )
  })

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case 'street':
        return (a.street ?? '').localeCompare(b.street ?? '')
      case 'name':
        return a.name.localeCompare(b.name)
      case 'date':
        return b.dateMet - a.dateMet
      case 'city':
        return (a.city ?? '').localeCompare(b.city ?? '')
      case 'zip':
        return (a.zip ?? '').localeCompare(b.zip ?? '')
      default:
        return 0
    }
  })

  return (
    <div className="view">
      <div className="view-header">
        <h2 className="applet-title">Ministry</h2>
        <button onClick={() => setShowChooser(true)}>+ New Entry</button>
      </div>

      {/* People vs. Streets — contacts are individual householders; streets track the
          house numbers worked on a road (and are auto-created from temporary territories). */}
      <div className="segmented">
        <button className={view === 'people' ? 'active' : ''} aria-pressed={view === 'people'} onClick={() => setView('people')}>People{people.length > 0 ? ` (${people.length})` : ''}</button>
        <button className={view === 'streets' ? 'active' : ''} aria-pressed={view === 'streets'} onClick={() => setView('streets')}>Streets{streetCount > 0 ? ` (${streetCount})` : ''}</button>
        <button className={view === 'territories' ? 'active' : ''} aria-pressed={view === 'territories'} onClick={() => setView('territories')}>Territories{territoryCount > 0 ? ` (${territoryCount})` : ''}</button>
      </div>

      {view === 'people' ? (
        <>
          <input
            className="full"
            placeholder="Search name, street, city, zip..."
            aria-label="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="field-row">
            <label className="field">
              <span className="field-label">Sort by</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="name">Name</option>
                <option value="street">Street</option>
                <option value="date">Date Met</option>
                <option value="city">City</option>
                <option value="zip">Zip</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Filter by tag</span>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ContactStatus | 'all')}>
                <option value="all">All tags</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
          </div>

          {showNew && (
            <ContactForm
              prefill={contactPrefill ?? undefined}
              onClose={() => { setShowNew(false); setContactPrefill(null) }}
            />
          )}

          {sorted.length > 0 && (
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
            {sorted.map((p) => (
              <li
                key={p.id}
                className="list-item clickable"
                {...pressable(() => (editMode ? toggleSelect(p.id) : setSelectedId(p.id)))}
              >
                {editMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${p.name}`}
                    style={{ marginRight: 10, flexShrink: 0 }}
                  />
                )}
                <div>
                  <strong>{p.name}</strong>
                  <span className={`badge status-${p.status}`}>{STATUS_LABELS[p.status]}</span>
                  <SharedBadge sharedWith={p.sharedWith} receivedFrom={p.receivedFrom} />
                  {nextAppointment.has(p.id) && (
                    <span
                      className={`badge appt-badge${isOverdue({ date: nextAppointment.get(p.id)! }, now) ? ' overdue' : ''}`}
                      title={fmtDateTime(nextAppointment.get(p.id)!)}
                    >
                      📅 {visitBadgeLabel(nextAppointment.get(p.id)!, now)}
                    </span>
                  )}
                  <div className="muted">{[p.street, p.city, p.state, p.zip].filter(Boolean).join(', ') || 'No address'}</div>
                </div>
              </li>
            ))}
            {sorted.length === 0 && <p className="muted">No contacts match.</p>}
          </ul>

          <ConfirmDialog
            open={confirmBulk}
            title={`Delete ${selectedIds.size} contact${selectedIds.size === 1 ? '' : 's'}?`}
            message="This permanently removes the selected contacts and their call logs and return visits. This can't be undone."
            confirmLabel="Delete"
            cancelLabel="Cancel"
            tone="danger"
            onConfirm={bulkDeletePeople}
            onCancel={() => setConfirmBulk(false)}
          />

          {selectedId != null && !editMode && <ContactDetail personId={selectedId} onClose={() => setSelectedId(null)} onGoToMap={onGoToMap} />}
        </>
      ) : view === 'streets' ? (
        <StreetEntries showNewForm={streetFormOpen} onCloseNewForm={() => setStreetFormOpen(false)} onGoToMap={onGoToMap} onCreateContact={handleCreateContact} />
      ) : (
        <Territories onGoToMap={onGoToMap} onCreateContact={handleCreateContact} />
      )}

      {showChooser && (
        <ModalPortal onClose={() => setShowChooser(false)}>
          <div className="modal-backdrop" onClick={() => setShowChooser(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
              <div className="modal-toolbar">
                <button className="icon-btn close-x" onClick={() => setShowChooser(false)} title="Close" aria-label="Close">×</button>
              </div>
              <h3>Add a new entry</h3>
              <p className="muted" style={{ marginTop: -6 }}>What would you like to add?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  className="secondary"
                  onClick={() => { setShowChooser(false); setView('people'); setShowNew(true) }}
                >
                  👤 New Contact
                </button>
                <button
                  className="secondary"
                  onClick={() => { setShowChooser(false); setView('streets'); setStreetFormOpen(true) }}
                >
                  🛣️ New Street
                </button>
                <button
                  className="secondary"
                  onClick={() => { setShowChooser(false); onNewTerritory?.() }}
                >
                  🗺️ New Custom Territory
                </button>
              </div>
              <div className="section-divider" />
              <button
                className="secondary"
                onClick={() => { setShowChooser(false); importInputRef.current?.click() }}
              >
                📥 Import a Shared Item (file)
              </button>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                For items shared as a <strong>.meleo</strong> file. Most shares are QR codes — just scan those with
                your camera.
              </p>
            </div>
          </div>
        </ModalPortal>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept=".meleo,application/octet-stream,text/plain"
        style={{ display: 'none' }}
        onChange={(e) => { handleImportFile(e.target.files?.[0]); e.target.value = '' }}
      />
    </div>
  )
}
