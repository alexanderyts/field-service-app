import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { db, type Territory, type TerritoryCompletion, type TerritoryStreet } from '../db'
import ModalPortal from '../ModalPortal'
import ConfirmDialog from './ConfirmDialog'
import ShareModal from './ShareModal'
import { STREET_COLORS } from '../territoryImage'
import { fetchRoadsNear, snapPathToRoads, type LatLng } from '../roadSnap'
import { buildTracedStreetPayload } from '../share'

function newStreetId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Best-effort reverse geocode of a traced street's midpoint, via the same Nominatim
    service the app already uses for contact addresses (just the /reverse endpoint) —
    returns the nearest road name, or null on any failure/no-match. Just a suggestion:
    callers pre-fill the name field with it but always leave it editable. */
interface ReverseAddress {
  road?: string
  city?: string
  state?: string
  zip?: string
}

/** Full reverse geocode of a point — road plus city/state/zip — used both to suggest a
    traced street's name and to seed the mirrored Ministry-tab street entry's address. */
async function reverseGeocodeAddress(lat: number, lng: number): Promise<ReverseAddress | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'FieldServiceApp/1.0' } }
    )
    const data = await res.json()
    const a = (data?.address ?? {}) as Record<string, string>
    return {
      road: a.road?.trim() || undefined,
      city: (a.city || a.town || a.village || a.hamlet)?.trim() || undefined,
      state: a.state?.trim() || undefined,
      zip: a.postcode?.trim() || undefined,
    }
  } catch {
    return null
  }
}

async function reverseGeocodeStreet(lat: number, lng: number): Promise<string | null> {
  const addr = await reverseGeocodeAddress(lat, lng)
  return addr?.road ?? null
}

/** Renders inside any <MapContainer>: just the saved street traces, colored by
    finished/not. Pure display — used both by the drawing modal's own map and by the
    main Territory Map's map, so a temporary territory's streets show up in both places
    from the same underlying data (no separate "add to main map" step needed). */
export function TerritoryStreetsOverlay({ streets }: { streets: TerritoryStreet[] }) {
  return (
    <>
      {streets.map((s) => (
        <Polyline
          key={s.id}
          positions={s.points.map((p) => [p.lat, p.lng])}
          interactive={false}
          pathOptions={{ color: s.done ? '#3f9142' : '#d97a3e', weight: 5, opacity: 0.9 }}
        />
      ))}
    </>
  )
}

/**
 * Renders inside the drawing modal's <MapContainer>: the saved street traces (via
 * TerritoryStreetsOverlay) plus, while `placing` is on, the waypoints tapped so far and a
 * preview line through them. Points are placed by *tapping* the map (Leaflet's `click`
 * fires on a tap, not a pan-drag), so panning and zooming stay fully enabled and nothing is
 * ever hidden under a moving finger. Double-click-zoom is suspended while placing so a
 * quick double-tap to add a bend doesn't also zoom.
 */
function TerritoryPlaceLayer({
  streets,
  placing,
  waypoints,
  onAddPoint,
}: {
  streets: TerritoryStreet[]
  placing: boolean
  waypoints: LatLng[]
  onAddPoint: (p: LatLng) => void
}) {
  const map = useMap()
  const placingRef = useRef(placing)
  const addRef = useRef(onAddPoint)
  placingRef.current = placing
  addRef.current = onAddPoint

  useEffect(() => {
    if (!placing) return
    map.doubleClickZoom.disable()
    return () => { map.doubleClickZoom.enable() }
  }, [placing, map])

  useMapEvents({
    click(e) {
      if (placingRef.current) addRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })

  return (
    <>
      <TerritoryStreetsOverlay streets={streets} />
      {waypoints.length > 1 && (
        <Polyline
          positions={waypoints.map((p) => [p.lat, p.lng])}
          interactive={false}
          pathOptions={{ color: '#6d5dd3', weight: 5 }}
        />
      )}
      {placing && waypoints.map((p, i) => (
        <CircleMarker
          key={i}
          center={[p.lat, p.lng]}
          radius={6}
          interactive={false}
          pathOptions={{ color: '#6d5dd3', weight: 3, fillColor: '#fff', fillOpacity: 1 }}
        />
      ))}
    </>
  )
}

/**
 * The full drawing workspace, in its own modal with its own map instance — isolated from
 * the page's normal scroll so panning/zooming the map can never fight the page scrolling
 * underneath it (ModalPortal locks body scroll while this is open). Street data is saved
 * to Dexie as each trace is named, so closing this any time is safe — nothing is lost.
 */
export function TerritoryDrawModal({
  territory,
  initialCenter,
  editStreetId,
  onClose,
}: {
  territory: Territory
  initialCenter: { lat: number; lng: number }
  /** When set, the modal re-traces this existing street: it opens straight into placing mode
      and, on finish, replaces that street's points (no name step) instead of adding a new one. */
  editStreetId?: string
  onClose: () => void
}) {
  const [placing, setPlacing] = useState(false)
  const [waypoints, setWaypoints] = useState<LatLng[]>([])
  const [snapping, setSnapping] = useState(false)
  const [pendingStroke, setPendingStroke] = useState<LatLng[] | null>(null)
  const [streetName, setStreetName] = useState('')
  const [lookingUpName, setLookingUpName] = useState(false)

  function startPlacing() { setWaypoints([]); setPlacing(true) }

  // Re-trace mode arms drawing immediately.
  useEffect(() => { if (editStreetId) setPlacing(true) }, [editStreetId])

  const editCenter = editStreetId
    ? territory.streets.find((s) => s.id === editStreetId)?.points[0] ?? initialCenter
    : initialCenter

  /** Finish placing: fetch nearby roads and snap the tapped path onto the real street
      centerline (falling back to the raw taps offline / with no road nearby), then hand off
      to the existing name-and-save flow. */
  async function finishStreet() {
    if (waypoints.length < 2) return
    setSnapping(true)
    let snapped: LatLng[] = waypoints
    try {
      const ways = await fetchRoadsNear(waypoints)
      const result = snapPathToRoads(waypoints, ways)
      if (result.length >= 2) snapped = result
    } catch { /* keep the raw tapped path */ }
    setSnapping(false)
    setPlacing(false)
    setWaypoints([])
    if (editStreetId) {
      // Re-trace: swap this street's points and we're done — keep its name/assignment.
      const streets = territory.streets.map((s) => (s.id === editStreetId ? { ...s, points: snapped } : s))
      await db.territories.update(territory.id, { streets })
      onClose()
    } else {
      setPendingStroke(snapped)
    }
  }
  // Tracks whether the user has typed into the name field since the current trace was
  // finished, so a slow reverse-geocode response can't clobber an edit they've already made.
  const nameEditedRef = useRef(false)

  useEffect(() => {
    if (!pendingStroke) return
    setStreetName(`Street ${territory.streets.length + 1}`)
    nameEditedRef.current = false
    setLookingUpName(true)
    const mid = pendingStroke[Math.floor(pendingStroke.length / 2)]
    reverseGeocodeStreet(mid.lat, mid.lng).then((name) => {
      setLookingUpName(false)
      if (name && !nameEditedRef.current) setStreetName(name)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStroke])

  async function savePendingStreet(name: string) {
    if (!pendingStroke) return
    const stroke = pendingStroke
    const street: TerritoryStreet = { id: newStreetId(), name, points: stroke, done: false }
    await db.territories.update(territory.id, { streets: [...territory.streets, street] })
    setPendingStroke(null)
    // Back to the neutral "Draw Street" button rather than auto-arming the next trace. The
    // street is NOT added to the Ministry tab automatically — the user sends it there
    // explicitly (or groups it into a territory) from the street list.
    setPlacing(false)
    setWaypoints([])
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal modal-expanded" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Done">×</button>
          </div>
          <h3 style={{ margin: 0 }}>{editStreetId ? 'Re-trace street' : territory.name}</h3>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            {editStreetId
              ? 'Tap a fresh set of points along the street — this replaces the old trace when you finish.'
              : placing
                ? 'Tap along the street to drop points — pan and zoom anytime. Finish when done.'
                : 'Pan and zoom to find the streets you want, then tap Draw Street.'}
          </p>

          <div style={{ touchAction: 'none', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MapContainer center={[editCenter.lat, editCenter.lng]} zoom={16} style={{ height: 'min(52vh, 440px)', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                maxZoom={20}
                crossOrigin="anonymous"
              />
              <TerritoryPlaceLayer
                streets={territory.streets}
                placing={placing}
                waypoints={waypoints}
                onAddPoint={(p) => setWaypoints((w) => [...w, p])}
              />
            </MapContainer>
          </div>

          {!placing ? (
            <>
              <button onClick={startPlacing}>🖊️ Draw Street</button>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {territory.streets.length} street{territory.streets.length === 1 ? '' : 's'} traced so far.
              </p>
              <button className="secondary" onClick={onClose}>Done — Back to Territory</button>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {waypoints.length === 0
                  ? 'Tap the start of the street, then tap along it — a couple of points for a straight street, more around bends.'
                  : `${waypoints.length} point${waypoints.length === 1 ? '' : 's'} placed. Add more, or finish.`}
              </p>
              <div className="row">
                <button onClick={finishStreet} disabled={waypoints.length < 2 || snapping}>
                  {snapping ? 'Matching to street…' : '✓ Finish Street'}
                </button>
                <button className="secondary" onClick={() => setWaypoints((w) => w.slice(0, -1))} disabled={waypoints.length === 0 || snapping}>
                  ↶ Undo Point
                </button>
                <button className="secondary" onClick={() => { setPlacing(false); setWaypoints([]) }} disabled={snapping}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {pendingStroke && (
            <ModalPortal>
              <div className="modal-backdrop" onClick={() => setPendingStroke(null)}>
                <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
                  <h3>Name this street</h3>
                  {pendingStroke && (
                    <TerritoryMiniMap
                      streets={[{ id: 'preview', name: streetName.trim() || 'New street', points: pendingStroke, done: false }]}
                    />
                  )}
                  <label className="field">
                    <span className="field-label">Street name</span>
                    <input
                      value={streetName}
                      onChange={(e) => { setStreetName(e.target.value); nameEditedRef.current = true }}
                      autoFocus
                    />
                  </label>
                  {lookingUpName && <p className="muted" style={{ fontSize: 12, margin: 0 }}>Looking up street name…</p>}
                  <button onClick={() => savePendingStreet(streetName.trim() || 'Untitled street')}>Save Street</button>
                  <button className="secondary" onClick={() => { setPendingStroke(null); startPlacing() }}>
                    🔁 Redo this trace
                  </button>
                </div>
              </div>
            </ModalPortal>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

/** Owns the whole custom-territory workflow as modals — nothing renders inline on the Map page.
    The Map tab's single territory button drives it via `drawSignal`: with no streets yet it opens
    the drawing modal; once streets exist it opens the manage modal (street checklist + draw more +
    group + complete + discard). The map itself only ever lives inside the draw/mini-map modals. */
export function TerritoryManager({
  territory,
  initialCenter,
  pendingDraw,
  onDrawConsumed,
  drawSignal,
}: {
  territory: Territory | undefined
  initialCenter: { lat: number; lng: number }
  /** Set by "New Custom Territory" from the Ministry chooser — creates a draft (if none) and jumps
      straight into drawing, then calls onDrawConsumed so it fires once. */
  pendingDraw?: boolean
  onDrawConsumed?: () => void
  /** Incremented by the Map tab's territory button — opens the manage modal when the draft already
      has streets, or creates a draft and opens the drawing tool when it doesn't. Repeatable. */
  drawSignal?: number
}) {
  const [manageOpen, setManageOpen] = useState(false)
  const [drawOpen, setDrawOpen] = useState(false)
  const [editStreetId, setEditStreetId] = useState<string | null>(null)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupNaming, setGroupNaming] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [viewStreet, setViewStreet] = useState<TerritoryStreet | null>(null)
  const [shareStreet, setShareStreet] = useState<TerritoryStreet | null>(null)
  const [confirmSend, setConfirmSend] = useState<TerritoryStreet | null>(null)

  // Ministry chooser's "New Custom Territory" (the Map tab mounts fresh on the switch, so this
  // fires on mount): create a draft if none exists and open the drawing tool, then consume once.
  const drawHandled = useRef(false)
  useEffect(() => {
    if (!pendingDraw || drawHandled.current) return
    drawHandled.current = true
    onDrawConsumed?.()
    createTerritory() // idempotent — reuses the active draft if there already is one
    setDrawOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDraw])

  // The Map tab's territory button: manage if the draft already has streets, otherwise draw.
  const lastDrawSignal = useRef(0)
  useEffect(() => {
    if (!drawSignal || drawSignal === lastDrawSignal.current) return
    lastDrawSignal.current = drawSignal
    if (territory && territory.streets.length > 0) {
      setManageOpen(true)
    } else {
      createTerritory()
      setDrawOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawSignal])

  function toggleSelected(streetId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(streetId)) next.delete(streetId)
      else next.add(streetId)
      return next
    })
  }

  /** Moves the checked streets out of this draft and into a brand-new, named, `grouped`
      territory — a durable Ministry-tab entry. Whatever wasn't checked simply stays in
      this draft, still individually traced and assignable. One transaction so a checked
      street is never briefly missing from both records if something goes wrong mid-way. */
  async function confirmGroup() {
    if (!territory || selected.size === 0 || !groupName.trim()) return
    const toMove = territory.streets.filter((s) => selected.has(s.id))
    const remaining = territory.streets.filter((s) => !selected.has(s.id))
    // Grouping puts the streets ONLY into the new territory (Ministry → Territories); it no longer
    // also mirrors them into Ministry → Streets, so there's no duplicate. To have a street in
    // Streets, send it there explicitly with "Send to Ministry". One transaction so a checked
    // street is never briefly missing from both records if something goes wrong mid-way.
    await db.transaction('rw', db.territories, async () => {
      await db.territories.add({
        name: groupName.trim(),
        createdAt: Date.now(),
        completed: false,
        grouped: true,
        streets: toMove,
      } as Territory)
      await db.territories.update(territory.id, { streets: remaining })
    })
    setSelected(new Set())
    setGroupName('')
    setGroupNaming(false)
  }

  /** Sends a single traced street to Ministry → Streets as a standalone entry (carrying its
      trace `points`, so it keeps showing on the map), and removes it from this draft list.
      Duplicate names prompt first (unless already confirmed). */
  async function sendStreetToMinistry(street: TerritoryStreet, confirmed = false) {
    if (!territory) return
    const dup = (await db.streetEntries.toArray()).some((e) => e.name.trim().toLowerCase() === street.name.trim().toLowerCase())
    if (dup && !confirmed) { setConfirmSend(street); return }
    setConfirmSend(null)
    const mid = street.points[Math.floor(street.points.length / 2)]
    const addr = mid ? await reverseGeocodeAddress(mid.lat, mid.lng) : null
    await db.streetEntries.add({
      name: street.name,
      city: addr?.city,
      state: addr?.state,
      zip: addr?.zip,
      houses: [],
      points: street.points,
      assignedTo: street.assignedTo,
      createdAt: Date.now(),
    })
    await db.territories.update(territory.id, { streets: territory.streets.filter((s) => s.id !== street.id) })
  }

  async function createTerritory() {
    // Ensure a draft exists (reuse the active one — guards against a duplicate when called before
    // the live query has resolved). Callers decide which modal to open afterward.
    const existing = (await db.territories.toArray()).find((t) => !t.completed && !t.grouped)
    if (!existing) {
      const record: Omit<Territory, 'id'> = {
        name: 'Custom Territory',
        createdAt: Date.now(),
        completed: false,
        streets: [],
      }
      await db.territories.add(record as Territory)
    }
  }

  async function toggleStreetDone(streetId: string) {
    if (!territory) return
    const streets = territory.streets.map((s) => (s.id === streetId ? { ...s, done: !s.done } : s))
    await db.territories.update(territory.id, { streets })
  }

  async function setStreetAssignee(streetId: string, name: string) {
    if (!territory) return
    const trimmed = name.trim() || undefined
    const streets = territory.streets.map((s) => (s.id === streetId ? { ...s, assignedTo: trimmed } : s))
    await db.territories.update(territory.id, { streets })
  }

  async function removeStreet(streetId: string) {
    if (!territory) return
    const streets = territory.streets.filter((s) => s.id !== streetId)
    await db.territories.update(territory.id, { streets })
  }

  async function completeTerritory() {
    if (!territory) return
    setConfirmComplete(false)
    await db.territoryCompletions.add({
      completedAt: Date.now(),
      name: territory.name,
      streetCount: territory.streets.length,
    } as TerritoryCompletion)
    await db.territories.delete(territory.id)
  }

  async function discardTerritory() {
    if (!territory) return
    setConfirmDiscard(false)
    await db.territories.delete(territory.id)
  }

  const allDone = !!territory && territory.streets.length > 0 && territory.streets.every((s) => s.done)

  return (
    <>
      {/* Manage modal — the whole street workspace, opened by the Map tab's territory button once a
          draft has streets. Everything the old below-map card offered lives here. */}
      {territory && manageOpen && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setManageOpen(false)}>
            <div className="modal manage-territory-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-toolbar">
                <button className="icon-btn close-x" onClick={() => setManageOpen(false)} title="Close">×</button>
              </div>
              <div className="goal-row">
                <h3 style={{ margin: 0 }}>{territory.name}</h3>
                <button className="icon-btn" title="Discard territory" onClick={() => setConfirmDiscard(true)}>🗑</button>
              </div>

              <button onClick={() => setDrawOpen(true)}>🗺️ Draw Streets</button>

              {territory.streets.length > 0 ? (
                <ul className="draft-street-list">
                  {territory.streets.map((s) => (
                    <li key={s.id} className="draft-street-row">
                      <label className="checkbox-row draft-street-name">
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)} />
                        <span style={{ textDecoration: s.done ? 'line-through' : undefined }}>{s.name}</span>
                        {s.assignedTo && <span className="badge">👤 {s.assignedTo}</span>}
                      </label>
                      <div className="draft-street-actions">
                        <button className="secondary small" onClick={() => toggleStreetDone(s.id)}>{s.done ? '✓ Done' : 'Mark done'}</button>
                        <button className="secondary small" onClick={() => sendStreetToMinistry(s)}>📥 Send to Ministry</button>
                        <button className="secondary small" onClick={() => { setEditStreetId(s.id); setDrawOpen(true) }}>✏️ Edit trace</button>
                        <button className="secondary small" onClick={() => setViewStreet(s)}>🗺️ Map</button>
                        <button className="secondary small" onClick={() => setShareStreet(s)}>↗ Share</button>
                        <button className="secondary small" onClick={() => removeStreet(s.id)}>🗑 Remove</button>
                      </div>
                      <input
                        className="assign-input"
                        placeholder="Assign to…"
                        defaultValue={s.assignedTo ?? ''}
                        onBlur={(e) => setStreetAssignee(s.id, e.target.value)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>No streets traced yet — tap Draw Streets to start.</p>
              )}

              {selected.size > 0 && (
                <button className="secondary" onClick={() => setGroupNaming(true)}>
                  📦 Group {selected.size} Selected Street{selected.size === 1 ? '' : 's'} into a Territory
                </button>
              )}

              <button
                className={allDone ? '' : 'secondary'}
                onClick={() => setConfirmComplete(true)}
                disabled={territory.streets.length === 0}
              >
                Complete Territory
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {territory && drawOpen && (
        <TerritoryDrawModal
          territory={territory}
          initialCenter={initialCenter}
          editStreetId={editStreetId ?? undefined}
          onClose={() => { setDrawOpen(false); setEditStreetId(null) }}
        />
      )}

      {viewStreet && <StreetSnapshotModal street={viewStreet} onClose={() => setViewStreet(null)} />}

      {shareStreet && (
        <ShareModal
          kind="street"
          itemName={shareStreet.name}
          buildPayload={(from) => buildTracedStreetPayload(shareStreet, from)}
          onClose={() => setShareStreet(null)}
        />
      )}

      <ConfirmDialog
        open={confirmSend != null}
        title="A street with this name already exists"
        message={confirmSend ? `"${confirmSend.name}" is already in Ministry → Streets. Send this one anyway (a second entry)?` : ''}
        confirmLabel="Send anyway"
        cancelLabel="Cancel"
        tone="primary"
        onConfirm={() => { if (confirmSend) sendStreetToMinistry(confirmSend, true) }}
        onCancel={() => setConfirmSend(null)}
      />

      <ConfirmDialog
        open={confirmComplete}
        title="Complete this territory?"
        message={allDone ? 'All streets are marked finished. This will clear it from the map.' : 'Not every street is marked finished yet. Complete anyway and clear it from the map?'}
        confirmLabel="Complete & Clear"
        tone="primary"
        onConfirm={completeTerritory}
        onCancel={() => setConfirmComplete(false)}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this custom territory?"
        message="This removes it and all traced streets. This can't be undone."
        confirmLabel="Discard"
        onConfirm={discardTerritory}
        onCancel={() => setConfirmDiscard(false)}
      />

      {groupNaming && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setGroupNaming(false)}>
            <div className="modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
              <h3>Name this territory</h3>
              <p className="muted" style={{ marginTop: -6 }}>
                {selected.size} street{selected.size === 1 ? '' : 's'} will move into it under Ministry → Territories
                only — not duplicated into Streets. Use "Send to Ministry" on a street if you want it there too.
              </p>
              <label className="field">
                <span className="field-label">Territory name</span>
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} autoFocus />
              </label>
              <div className="row">
                <button onClick={confirmGroup} disabled={!groupName.trim()}>Group Streets</button>
                <button className="secondary" onClick={() => setGroupNaming(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}

/** Shows a single traced street on a live, labelled map over real tiles — the same view as
    the combined territory map, for one street. Shared by the draft checklist and the
    grouped-territory detail. */
export function StreetSnapshotModal({ street, onClose }: { street: TerritoryStreet; onClose: () => void }) {
  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3 style={{ marginTop: 0 }}>{street.name}</h3>
          <TerritoryMiniMap streets={[street]} />
          {street.assignedTo && <p className="muted" style={{ margin: '8px 0 0' }}>👤 Assigned to {street.assignedTo}</p>}
        </div>
      </div>
    </ModalPortal>
  )
}

/** Zooms/pans the map to frame every one of the territory's traced streets at once, so the
    whole group and how the streets sit relative to each other is visible on open. */
function FitToStreets({ streets }: { streets: TerritoryStreet[] }) {
  const map = useMap()
  useEffect(() => {
    const pts = streets.flatMap((s) => s.points).map((p) => [p.lat, p.lng] as [number, number])
    if (pts.length === 1) map.setView(pts[0], 16)
    else if (pts.length > 1) map.fitBounds(pts, { padding: [28, 28] })
    // The map mounts inside a just-opened modal, so its container may have been zero-size on
    // first layout — recompute once it's settled so tiles fill correctly.
    const t = window.setTimeout(() => map.invalidateSize(), 120)
    return () => window.clearTimeout(t)
  }, [map, streets])
  return null
}

/** A live, interactive map of a whole territory: every traced street drawn as a colored,
    name-labelled line over real tiles, auto-framed to fit them all — so their true positions
    and relationship to each other are visible, not just a schematic. */
export function TerritoryMiniMap({ streets }: { streets: TerritoryStreet[] }) {
  const drawn = streets.filter((s) => s.points.length >= 2)
  const first = drawn[0]?.points[0]
  const center: [number, number] = first ? [first.lat, first.lng] : [32.3, -90.0]
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <MapContainer center={center} zoom={15} style={{ height: 340, width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        {drawn.map((s, i) => (
          <Polyline
            key={s.id}
            positions={s.points.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: STREET_COLORS[i % STREET_COLORS.length], weight: 5, opacity: 0.9 }}
          >
            <Tooltip permanent direction="center" className="territory-street-label">{s.name}</Tooltip>
          </Polyline>
        ))}
        <FitToStreets streets={streets} />
      </MapContainer>
    </div>
  )
}
