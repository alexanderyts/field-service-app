import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import { db, type Territory, type TerritoryCompletion, type TerritoryStreet } from '../db'
import ModalPortal from '../ModalPortal'
import ConfirmDialog from './ConfirmDialog'
import { renderStreetsImage } from '../territoryImage'
import { smoothStroke } from '../strokeSmooth'
import { captureTraceSnapshot } from '../mapSnapshot'
import type { Map as LeafletMap } from 'leaflet'

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
          pathOptions={{ color: s.done ? '#3f9142' : '#d97a3e', weight: 5, opacity: 0.9 }}
        />
      ))}
    </>
  )
}

/**
 * Renders inside the drawing modal's <MapContainer>: the saved street traces (via
 * TerritoryStreetsOverlay) plus, while `drawing` is on, a live preview of the stroke in
 * progress. Freehand capture uses raw pointer events on the map's own DOM container
 * rather than Leaflet's map events — Leaflet's synthetic mouse events aren't a reliable
 * continuous stream during a touch drag, especially with panning disabled, so this talks
 * to the browser directly and converts pixel coordinates to lat/lng itself.
 */
function TerritoryDrawLayer({
  streets,
  drawing,
  onStrokeComplete,
  onMap,
}: {
  streets: TerritoryStreet[]
  drawing: boolean
  onStrokeComplete: (points: { lat: number; lng: number }[]) => void
  onMap?: (map: LeafletMap) => void
}) {
  const map = useMap()
  const [liveStroke, setLiveStroke] = useState<{ lat: number; lng: number }[]>([])

  // Hand the live Leaflet map instance up so the parent can capture a real snapshot of the
  // tiles under a finished trace.
  useEffect(() => { onMap?.(map) }, [map, onMap])

  useEffect(() => {
    if (!drawing) return
    const container = map.getContainer()
    const prevTouchAction = container.style.touchAction
    container.style.touchAction = 'none'
    map.dragging.disable()
    map.doubleClickZoom.disable()
    map.scrollWheelZoom.disable()
    map.touchZoom.disable()

    let points: { lat: number; lng: number }[] = []
    let active = false

    function toLatLng(e: PointerEvent) {
      const rect = container.getBoundingClientRect()
      const { lat, lng } = map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top])
      return { lat, lng }
    }

    function onDown(e: PointerEvent) {
      active = true
      points = [toLatLng(e)]
      setLiveStroke(points)
      container.setPointerCapture(e.pointerId)
    }
    function onMoveEvt(e: PointerEvent) {
      if (!active) return
      points = [...points, toLatLng(e)]
      setLiveStroke(points)
    }
    function onUp() {
      if (!active) return
      active = false
      if (points.length > 1) onStrokeComplete(points)
      points = []
      setLiveStroke([])
    }

    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointermove', onMoveEvt)
    container.addEventListener('pointerup', onUp)
    container.addEventListener('pointercancel', onUp)

    return () => {
      container.style.touchAction = prevTouchAction
      map.dragging.enable()
      map.doubleClickZoom.enable()
      map.scrollWheelZoom.enable()
      map.touchZoom.enable()
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMoveEvt)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointercancel', onUp)
    }
  }, [drawing, map, onStrokeComplete])

  return (
    <>
      <TerritoryStreetsOverlay streets={streets} />
      {liveStroke.length > 1 && (
        <Polyline positions={liveStroke.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#6d5dd3', weight: 5, dashArray: '6 6' }} />
      )}
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
  onClose,
}: {
  territory: Territory
  initialCenter: { lat: number; lng: number }
  onClose: () => void
}) {
  const [drawing, setDrawing] = useState(false)
  const [pendingStroke, setPendingStroke] = useState<{ lat: number; lng: number }[] | null>(null)
  const [streetName, setStreetName] = useState('')
  const [lookingUpName, setLookingUpName] = useState(false)
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null)
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

  const tracePreview = useMemo(
    () => (pendingStroke ? renderStreetsImage([{ points: pendingStroke }], { width: 280, height: 160 }) : null),
    [pendingStroke]
  )

  async function savePendingStreet(name: string) {
    if (!pendingStroke) return
    const stroke = pendingStroke
    // Capture a real snapshot of the map tiles under this trace (with the line + name drawn
    // on top) while the map is still showing this area. Best-effort — on any failure the
    // schematic renderer is used instead.
    const snapshot = mapInstance ? (await captureTraceSnapshot(mapInstance, stroke, name)) ?? undefined : undefined
    const street: TerritoryStreet = { id: newStreetId(), name, points: stroke, done: false, snapshot }
    await db.territories.update(territory.id, { streets: [...territory.streets, street] })
    setPendingStroke(null)
    // Back to the neutral "Draw Street" button rather than silently staying in
    // continuous-draw mode — saving one street shouldn't auto-arm the next trace.
    setDrawing(false)
    // Mirror the traced street into the Ministry tab's Streets list so house numbers can be
    // loaded against it. Best-effort address lookup runs after the trace is already saved, so
    // a slow/failed geocode never blocks or loses the street itself.
    const mid = stroke[Math.floor(stroke.length / 2)]
    const addr = await reverseGeocodeAddress(mid.lat, mid.lng)
    await db.streetEntries.add({
      name,
      city: addr?.city,
      state: addr?.state,
      zip: addr?.zip,
      houses: [],
      createdAt: Date.now(),
    })
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal modal-expanded" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Done">×</button>
          </div>
          <h3 style={{ margin: 0 }}>{territory.name}</h3>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            {drawing
              ? 'Trace a street on the map with your finger, then release to name it.'
              : 'Pan and zoom to find the streets you want, then start drawing.'}
          </p>

          <div style={{ touchAction: 'none', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MapContainer center={[initialCenter.lat, initialCenter.lng]} zoom={16} style={{ height: 'min(52vh, 440px)', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                maxZoom={20}
                crossOrigin="anonymous"
              />
              <TerritoryDrawLayer
                streets={territory.streets}
                drawing={drawing}
                onStrokeComplete={(pts) => setPendingStroke(smoothStroke(pts))}
                onMap={setMapInstance}
              />
            </MapContainer>
          </div>

          <button className={drawing ? '' : 'secondary'} onClick={() => setDrawing((d) => !d)}>
            {drawing ? '✋ Stop Drawing (Pan Map)' : '🖊️ Draw Street'}
          </button>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {territory.streets.length} street{territory.streets.length === 1 ? '' : 's'} traced so far.
          </p>
          <button className="secondary" onClick={onClose}>Done — Back to Territory</button>

          {pendingStroke && (
            <ModalPortal>
              <div className="modal-backdrop" onClick={() => setPendingStroke(null)}>
                <div className="modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
                  <h3>Name this street</h3>
                  {tracePreview && (
                    <img
                      src={tracePreview}
                      alt="Preview of the traced street"
                      style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
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
                  <button className="secondary" onClick={() => { setPendingStroke(null); setDrawing(true) }}>
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

/** Renders inline on the main Territory Map view: the "create" button when there's no
    active temporary territory, or (once one exists) its street checklist plus a button
    to reopen the drawing modal — the map itself never sits in this normally-scrolling
    page, only inside TerritoryDrawModal. */
export function TerritoryControls({
  territory,
  initialCenter,
}: {
  territory: Territory | undefined
  initialCenter: { lat: number; lng: number }
}) {
  const [drawOpen, setDrawOpen] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [groupNaming, setGroupNaming] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [viewStreet, setViewStreet] = useState<TerritoryStreet | null>(null)

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

  async function createTerritory() {
    const record: Omit<Territory, 'id'> = {
      name: 'Temporary Territory',
      createdAt: Date.now(),
      completed: false,
      streets: [],
    }
    await db.territories.add(record as Territory)
    setDrawOpen(true)
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

  if (!territory) {
    return (
      <button className="secondary" onClick={createTerritory}>
        📍 Create Temporary Territory
      </button>
    )
  }

  const allDone = territory.streets.length > 0 && territory.streets.every((s) => s.done)

  return (
    <div className="card">
      <div className="goal-row">
        <h4 style={{ margin: 0 }}>{territory.name}</h4>
        <button className="icon-btn" title="Discard territory" onClick={() => setConfirmDiscard(true)}>🗑</button>
      </div>

      <button onClick={() => setDrawOpen(true)}>🗺️ Open Map to Draw Streets</button>

      {territory.streets.length > 0 ? (
        <ul className="list" style={{ marginTop: 10 }}>
          {territory.streets.map((s) => (
            <li key={s.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <label className="checkbox-row" style={{ flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelected(s.id)} />
                  <span style={{ textDecoration: s.done ? 'line-through' : undefined }}>{s.name}</span>
                </label>
                <div className="row" style={{ gap: 6 }}>
                  <button className={s.done ? 'small' : 'secondary small'} onClick={() => toggleStreetDone(s.id)}>
                    {s.done ? '✓ Finished' : 'Mark Finished'}
                  </button>
                  <button className="icon-btn" title="Remove street" onClick={() => removeStreet(s.id)}>×</button>
                </div>
              </div>
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <input
                  className="assign-input"
                  placeholder="Assign to…"
                  defaultValue={s.assignedTo ?? ''}
                  onBlur={(e) => setStreetAssignee(s.id, e.target.value)}
                />
                {s.snapshot && (
                  <button className="icon-btn" title="View traced map" onClick={() => setViewStreet(s)}>🗺️</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>No streets traced yet — open the map to start drawing.</p>
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

      {drawOpen && (
        <TerritoryDrawModal territory={territory} initialCenter={initialCenter} onClose={() => setDrawOpen(false)} />
      )}

      {viewStreet && <StreetSnapshotModal street={viewStreet} onClose={() => setViewStreet(null)} />}

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
        title="Discard this temporary territory?"
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
                {selected.size} street{selected.size === 1 ? '' : 's'} will move into it, and it'll show up under
                Ministry → Territories.
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
    </div>
  )
}

/** Shows a single traced street's real map snapshot (the picture captured over the tiles at
    draw time), falling back to the schematic renderer when no snapshot was captured. Shared
    by the draft checklist and the grouped-territory detail. */
export function StreetSnapshotModal({ street, onClose }: { street: TerritoryStreet; onClose: () => void }) {
  const img = street.snapshot ?? renderStreetsImage([{ points: street.points, name: street.name }], { width: 360, height: 260 })
  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3 style={{ marginTop: 0 }}>{street.name}</h3>
          <img src={img} alt={`Map of ${street.name}`} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
          {!street.snapshot && (
            <p className="muted" style={{ fontSize: 12 }}>Schematic view — a real map snapshot wasn't captured for this street.</p>
          )}
          {street.assignedTo && <p className="muted" style={{ margin: '4px 0 0' }}>👤 Assigned to {street.assignedTo}</p>}
        </div>
      </div>
    </ModalPortal>
  )
}
