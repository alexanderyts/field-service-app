import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TerritoryStreet } from '../db'
import ModalPortal from '../ModalPortal'
import ConfirmDialog from './ConfirmDialog'
import { StreetDetail } from './StreetEntries'
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
export default function Territories({ onGoToMap }: { onGoToMap?: (lat: number, lng: number) => void }) {
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
        {grouped.map((t) => (
          <li key={t.id} className="list-item clickable" onClick={() => (editMode ? toggleSelect(t.id) : setSelectedId(t.id))}>
            {editMode && <input type="checkbox" checked={selectedIds.has(t.id)} readOnly style={{ marginRight: 10, flexShrink: 0 }} />}
            <div>
              <strong>{t.name}</strong>
              <span className="badge">{t.streets.length} street{t.streets.length === 1 ? '' : 's'}</span>
              <SharedBadge sharedWith={t.sharedWith} receivedFrom={t.receivedFrom} />
              {t.assignedTo && <div className="muted">👤 Assigned to {t.assignedTo}</div>}
            </div>
          </li>
        ))}
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
        <TerritoryDetail territoryId={selectedId} onClose={() => setSelectedId(null)} onGoToMap={onGoToMap} />
      )}
    </>
  )
}

function TerritoryDetail({
  territoryId,
  onClose,
  onGoToMap,
}: {
  territoryId: number
  onClose: () => void
  onGoToMap?: (lat: number, lng: number) => void
}) {
  const territory = useLiveQuery(() => db.territories.get(territoryId), [territoryId])
  const streetEntries = useLiveQuery(() => db.streetEntries.toArray(), []) ?? []
  const [showImage, setShowImage] = useState(false)
  const [openStreetEntryId, setOpenStreetEntryId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [viewStreet, setViewStreet] = useState<TerritoryStreet | null>(null)

  async function setStreetAssignee(streetId: string, name: string) {
    if (!territory) return
    const trimmed = name.trim() || undefined
    const streets = territory.streets.map((s) => (s.id === streetId ? { ...s, assignedTo: trimmed } : s))
    await db.territories.update(territory.id, { streets })
  }

  if (!territory) return null

  function entryFor(streetName: string) {
    return streetEntries.find((e) => e.name.trim().toLowerCase() === streetName.trim().toLowerCase())
  }

  async function deleteTerritory() {
    setConfirmDelete(false)
    await db.territories.delete(territoryId)
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
            <h3>{territory.name}</h3>
            <button className="icon-btn" title="View all streets on the map" onClick={() => setShowImage(true)}>🗺️</button>
          </div>
          <p className="muted contact-line">
            {territory.streets.length} street{territory.streets.length === 1 ? '' : 's'}
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
              const entry = entryFor(s.name)
              const mid = s.points[Math.floor(s.points.length / 2)]
              return (
                <li key={s.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <strong>{s.name}</strong>
                      {entry && (
                        <span className="badge">{entry.houses.length} house{entry.houses.length === 1 ? '' : 's'}</span>
                      )}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {s.points.length >= 2 && (
                        <button className="icon-btn" title="View traced map" onClick={() => setViewStreet(s)}>🗺️</button>
                      )}
                      {entry && (
                        <button className="secondary small" onClick={() => setOpenStreetEntryId(entry.id)}>
                          Houses
                        </button>
                      )}
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
            <button onClick={() => setShowShare(true)}>↗ Share</button>
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
          <ModalPortal>
            <div className="modal-backdrop" onClick={() => setShowImage(false)}>
              <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-toolbar">
                  <button className="icon-btn close-x" onClick={() => setShowImage(false)} title="Close">×</button>
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
          <StreetDetail entryId={openStreetEntryId} onClose={() => setOpenStreetEntryId(null)} onGoToMap={onGoToMap} />
        )}

        {viewStreet && <StreetSnapshotModal street={viewStreet} onClose={() => setViewStreet(null)} />}

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
