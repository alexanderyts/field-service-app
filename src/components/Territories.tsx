import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, resolveStreetEntry, commonLocationLabel, type TerritoryStreet } from '../db'
import ModalPortal from '../ModalPortal'
import ConfirmDialog from './ConfirmDialog'
import { StreetDetail, type ContactPrefill } from './StreetEntries'
import { ensureStreetEntry } from '../streets'
import { completeTerritory } from '../records'
import { StreetSnapshotModal, TerritoryMiniMap } from './Territory'
import ShareModal from './ShareModal'
import { SharedBadge, SharedWarning } from './SharedBits'
import { buildTerritoryPayload } from '../share'

/**
 * The Ministry tab's "Territories" view — every street grouping finalized from the Map
 * tab (Territory.tsx's "Group Selected into a Territory") shows up here as a durable
 * entry: name, assignment, a combined schematic map image, and its streets (each linking
 * to the matching Ministry-tab StreetEntry for house numbers).
 */
export default function Territories({
  onGoToMap,
  onCreateContact,
}: {
  onGoToMap?: (lat: number, lng: number) => void
  onCreateContact?: (prefill: ContactPrefill) => void
}) {
  const territories = useLiveQuery(() => db.territories.toArray(), []) ?? []
  const grouped = territories.filter((t) => t.grouped).sort((a, b) => b.createdAt - a.createdAt)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)

  function toggleSelect(id: number) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  async function bulkDelete() {
    await db.territories.bulkDelete([...selectedIds])
    setSelectedIds(new Set()); setEditMode(false); setConfirmBulk(false)
  }

  return (
    <>
      {grouped.length > 0 && (
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
        {grouped.map((t) => {
          const location = commonLocationLabel(t.streets)
          return (
            <li key={t.id} className="list-item clickable" onClick={() => (editMode ? toggleSelect(t.id) : setSelectedId(t.id))}>
              {editMode && <input type="checkbox" checked={selectedIds.has(t.id)} readOnly style={{ marginRight: 10, flexShrink: 0 }} />}
              <div>
                <strong>{t.name}</strong>
                <span className="badge">{t.streets.length} street{t.streets.length === 1 ? '' : 's'}</span>
                <SharedBadge sharedWith={t.sharedWith} receivedFrom={t.receivedFrom} />
                {location && <div className="muted">📍 {location}</div>}
                {t.assignedTo && <div className="muted">👤 Assigned to {t.assignedTo}</div>}
              </div>
            </li>
          )
        })}
        {grouped.length === 0 && (
          <p className="muted">
            No territories yet — trace streets on the Map tab, then check some and "Group Selected into a Territory."
          </p>
        )}
      </ul>

      <ConfirmDialog
        open={confirmBulk}
        title={`Delete ${selectedIds.size} territor${selectedIds.size === 1 ? 'y' : 'ies'}?`}
        message="This removes the selected territory groupings. The streets' own Ministry-tab entries aren't affected. This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulk(false)}
      />

      {selectedId != null && !editMode && (
        <TerritoryDetail territoryId={selectedId} onClose={() => setSelectedId(null)} onGoToMap={onGoToMap} onCreateContact={onCreateContact} />
      )}
    </>
  )
}

function TerritoryDetail({
  territoryId,
  onClose,
  onGoToMap,
  onCreateContact,
}: {
  territoryId: number
  onClose: () => void
  onGoToMap?: (lat: number, lng: number) => void
  onCreateContact?: (prefill: ContactPrefill) => void
}) {
  const territory = useLiveQuery(() => db.territories.get(territoryId), [territoryId])
  const streetEntries = useLiveQuery(() => db.streetEntries.toArray(), []) ?? []
  const [showImage, setShowImage] = useState(false)
  const [openStreetEntryId, setOpenStreetEntryId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [viewStreet, setViewStreet] = useState<TerritoryStreet | null>(null)

  /** Mark a street finished (or not). Without this a grouped territory could never reach
      "all streets done", which is the whole signal Complete Territory reads — the draft has
      had this since tracing existed, the durable copy never did. Re-reads inside a
      transaction so two quick toggles can't build on the same stale snapshot (cf. F023). */
  async function toggleStreetDone(streetId: string) {
    await db.transaction('rw', db.territories, async () => {
      const fresh = await db.territories.get(territoryId)
      if (!fresh) return
      await db.territories.update(territoryId, {
        streets: fresh.streets.map((s) => (s.id === streetId ? { ...s, done: !s.done } : s)),
      })
    })
  }

  async function setStreetAssignee(streetId: string, name: string) {
    if (!territory) return
    const trimmed = name.trim() || undefined
    const streets = territory.streets.map((s) => (s.id === streetId ? { ...s, assignedTo: trimmed } : s))
    await db.territories.update(territory.id, { streets })
  }

  if (!territory) return null

  const territoryLocation = commonLocationLabel(territory.streets)
  const allDone = territory.streets.length > 0 && territory.streets.every((s) => s.done)

  function entryFor(street: TerritoryStreet) {
    return resolveStreetEntry(street, streetEntries)
  }

  /** Open the full street manager (house numbers, notes, share, create-contact) for a territory
      street — creating and linking its backing StreetEntry the first time, so legacy grouped
      territories (and any street without an entry yet) self-heal on open. */
  async function openManage(street: TerritoryStreet) {
    if (!territory) return
    const id = await ensureStreetEntry(street, { city: street.city, state: street.state, zip: street.zip })
    if (street.entryId !== id) {
      const streets = territory.streets.map((s) => (s.id === street.id ? { ...s, entryId: id } : s))
      await db.territories.update(territory.id, { streets })
    }
    setOpenStreetEntryId(id)
  }

  async function deleteTerritory() {
    setConfirmDelete(false)
    await db.territories.delete(territoryId)
    onClose()
  }

  /** Finish a territory for real: record the completion Reports counts, then clear the
      grouping. Distinct from Delete, which removes a territory without crediting the work —
      that's for one created by mistake. The streets keep their own entries and house history
      either way, so finishing a territory never destroys what was learned working it. */
  async function finishTerritory() {
    setConfirmComplete(false)
    await completeTerritory(territoryId)
    onClose()
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>

          <div className="detail-head">
            <h3>{territory.name}</h3>
            <button className="icon-btn" title="View all streets on the map" aria-label="View all streets on the map" onClick={() => setShowImage(true)}>🗺️</button>
          </div>
          <p className="muted contact-line">
            {territory.streets.length} street{territory.streets.length === 1 ? '' : 's'}
            {territoryLocation ? ` · 📍 ${territoryLocation}` : ''}
            {' '}<SharedBadge sharedWith={territory.sharedWith} receivedFrom={territory.receivedFrom} />
          </p>

          <SharedWarning sharedWith={territory.sharedWith} />

          <label className="field">
            <span className="field-label">Assigned to</span>
            <input
              key={territory.id}
              defaultValue={territory.assignedTo ?? ''}
              placeholder="e.g. John Smith"
              onBlur={(e) => db.territories.update(territory.id, { assignedTo: e.target.value.trim() || undefined })}
            />
          </label>

          <ul className="list" style={{ marginTop: 10 }}>
            {territory.streets.map((s) => {
              const entry = entryFor(s)
              const mid = s.points[Math.floor(s.points.length / 2)]
              return (
                <li key={s.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <label className="checkbox-row territory-street-done">
                      <input
                        type="checkbox"
                        checked={!!s.done}
                        onChange={() => toggleStreetDone(s.id)}
                        aria-label={`Mark ${entry?.name ?? s.name} finished`}
                      />
                      <div>
                        <strong className={s.done ? 'street-done' : undefined}>{entry?.name ?? s.name}</strong>
                        {entry && (
                          <span className="badge">{entry.houses.length} house{entry.houses.length === 1 ? '' : 's'}</span>
                        )}
                      </div>
                    </label>
                    <div className="row" style={{ gap: 6 }}>
                      {s.points.length >= 2 && (
                        <button className="icon-btn" title="View traced map" aria-label="View traced map" onClick={() => setViewStreet(s)}>🗺️</button>
                      )}
                      <button className="secondary small" onClick={() => openManage(s)}>
                        Manage
                      </button>
                      {onGoToMap && mid && (
                        <button className="secondary small" onClick={() => { onGoToMap(mid.lat, mid.lng); onClose() }}>
                          Map
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    className="assign-input"
                    placeholder="Assign to…"
                    defaultValue={s.assignedTo ?? ''}
                    onBlur={(e) => setStreetAssignee(s.id, e.target.value)}
                  />
                </li>
              )
            })}
            {territory.streets.length === 0 && <p className="muted">No streets in this territory.</p>}
          </ul>

          <div className="row">
            <button
              className={allDone ? '' : 'secondary'}
              onClick={() => setConfirmComplete(true)}
              disabled={territory.streets.length === 0}
            >
              Complete Territory
            </button>
            <button className="secondary" onClick={() => setShowShare(true)}>↗ Share</button>
          </div>
          <div className="row">
            <button className="danger" onClick={() => setConfirmDelete(true)}>Delete Territory</button>
            <button className="secondary" onClick={onClose}>Close</button>
          </div>
        </div>

        {showShare && (
          <ShareModal
            kind="territory"
            recordId={territory.id}
            itemName={territory.name}
            buildPayload={(from) => buildTerritoryPayload(territory, from)}
            onClose={() => setShowShare(false)}
          />
        )}

        {showImage && (
          <ModalPortal onClose={() => setShowImage(false)}>
            <div className="modal-backdrop" onClick={() => setShowImage(false)}>
              <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-toolbar">
                  <button className="icon-btn close-x" onClick={() => setShowImage(false)} title="Close" aria-label="Close">×</button>
                </div>
                <h3 style={{ marginTop: 0 }}>{territory.name}</h3>
                <TerritoryMiniMap streets={territory.streets} />
                <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                  Every street in this territory on the map — pan and zoom to see how they connect. Each line is
                  labelled by name.
                </p>
              </div>
            </div>
          </ModalPortal>
        )}

        {openStreetEntryId != null && (
          <StreetDetail entryId={openStreetEntryId} onClose={() => setOpenStreetEntryId(null)} onGoToMap={onGoToMap} onCreateContact={onCreateContact} />
        )}

        {viewStreet && <StreetSnapshotModal street={viewStreet} onClose={() => setViewStreet(null)} />}

        <ConfirmDialog
          open={confirmComplete}
          title={`Complete "${territory.name}"?`}
          message={
            (allDone
              ? 'Every street is marked finished. '
              : 'Not every street is marked finished yet. Complete it anyway? ') +
            "This records it in your reports and clears the grouping. Each street stays in Ministry → Streets with its house numbers, statuses and notes — nothing you recorded is lost."
          }
          confirmLabel="Complete Territory"
          cancelLabel="Not yet"
          tone="primary"
          onConfirm={finishTerritory}
          onCancel={() => setConfirmComplete(false)}
        />

        <ConfirmDialog
          open={confirmDelete}
          title="Delete this territory?"
          message={`This removes "${territory.name}" and its street grouping. The streets' own Ministry-tab entries (house numbers, etc.) aren't affected. This can't be undone.`}
          onConfirm={deleteTerritory}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </ModalPortal>
  )
}
