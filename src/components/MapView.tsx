import { useEffect, useRef } from 'react'
import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ContactStatus, type Person } from '../db'
import { STATUS_LABELS } from '../contactStatus'
import { useCurrentLocation } from '../useGeolocation'
import { TerritoryManager, TerritoryStreetsOverlay } from './Territory'

const meIcon = L.divIcon({
  className: 'me-marker',
  html: '<div class="me-dot"></div>',
  iconSize: [16, 16],
})

// react-leaflet's default Marker icon depends on image assets whose paths don't
// resolve correctly through Vite's bundler — without a custom icon they render as
// broken/missing images. A teardrop divIcon sidesteps that entirely, doubles as the
// status color-coding (same palette as the contact list's tags), and — being pin-shaped
// rather than a plain dot — doesn't get confused with the round "you are here" marker.
const contactIcons: Record<ContactStatus, L.DivIcon> = Object.fromEntries(
  (['interested', 'return-visit', 'bible-study', 'informal-visit', 'not-interested', 'do-not-call', 'moved'] as ContactStatus[]).map(
    (status) => [
      status,
      L.divIcon({
        className: 'contact-marker-wrap',
        html: `<div class="contact-pin status-${status}"><span class="contact-pin-dot"></span></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -28],
      }),
    ]
  )
) as Record<ContactStatus, L.DivIcon>

// The tile layer never rotates (no bearing/heading control anywhere in the app), so a
// fixed compass rose is always accurate — no device-orientation API or permission
// prompt needed. Purely decorative/informational: pointer-events are disabled so it
// never steals a drag/zoom/tap meant for the map underneath it.
function MapCompass() {
  return (
    <div className="map-compass" aria-hidden="true">
      <svg viewBox="0 0 44 44" width="44" height="44">
        <circle cx="22" cy="22" r="20" fill="var(--surface)" fillOpacity="0.85" stroke="var(--border)" />
        <path d="M22 8 L26 22 L22 19 L18 22 Z" fill="var(--accent)" />
        <path d="M22 36 L18 22 L22 25 L26 22 Z" fill="var(--muted)" />
        <text x="22" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--accent)">N</text>
        <text x="22" y="39" textAnchor="middle" fontSize="8" fill="var(--muted)">S</text>
        <text x="6" y="25" textAnchor="middle" fontSize="8" fill="var(--muted)">W</text>
        <text x="38" y="25" textAnchor="middle" fontSize="8" fill="var(--muted)">E</text>
      </svg>
    </div>
  )
}

function RecenterButton({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], 16)
  }, [target, map])
  return null
}

// Reports the map's live center whenever the user pans/zooms, so "Draw Custom Territory" can
// open the drawing map on wherever they're currently looking (e.g. a town they panned to) rather
// than snapping back to their GPS location.
function MapViewTracker({ onChange }: { onChange: (c: { lat: number; lng: number }) => void }) {
  useMapEvents({
    moveend(e) {
      const c = e.target.getCenter()
      onChange({ lat: c.lat, lng: c.lng })
    },
  })
  return null
}

function FocusOnMount({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (target && !done.current) {
      map.setView([target.lat, target.lng], 17)
      done.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

// Flies the map to a place-search result (a fresh {lat,lng} object each search, so the effect
// re-runs even for a repeated query). Zooms in to street level if currently zoomed further out.
function FlyTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.8 })
  }, [target, map])
  return null
}

function ContactPin({ person, onGoToContact }: { person: Person; onGoToContact?: (id: number) => void }) {
  return (
    <Marker position={[person.lat!, person.lng!]} icon={contactIcons[person.status]}>
      <Popup>
        <div style={{ minWidth: 160 }}>
          <strong style={{ fontSize: 14 }}>{person.name}</strong>
          <div style={{ fontSize: 12, color: '#6d5dd3', fontWeight: 600, marginBottom: 2 }}>
            {STATUS_LABELS[person.status]}
          </div>
          {[person.street, person.city, person.state].filter(Boolean).length > 0 && (
            <div style={{ fontSize: 12, color: '#8a8478', marginBottom: 6 }}>
              {[person.street, person.city, person.state].filter(Boolean).join(', ')}
            </div>
          )}
          {onGoToContact && (
            <button
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, marginTop: 2 }}
              onClick={() => onGoToContact(person.id)}
            >
              Jump to Contact
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  )
}

export default function MapView({
  onGoToContact,
  focusLocation,
  pendingDraw,
  onDrawConsumed,
}: {
  onGoToContact?: (personId: number) => void
  focusLocation?: { lat: number; lng: number; personId?: number } | null
  pendingDraw?: boolean
  onDrawConsumed?: () => void
}) {
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const { getLocation, loading, error } = useCurrentLocation()
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  // Bumped by the single territory button. TerritoryManager opens the draw tool (no draft yet)
  // or the manage modal (draft with streets) whenever this changes.
  const [drawSignal, setDrawSignal] = useState(0)
  // The map's current center, updated as the user pans/zooms — used so drawing starts on the
  // area they're viewing, not their GPS location.
  const [mapView, setMapView] = useState<{ lat: number; lng: number } | null>(null)
  // Base map style — street (CARTO Voyager) or satellite (Esri imagery + street-label overlay).
  const [baseLayer, setBaseLayer] = useState<'street' | 'satellite'>('street')
  // Place / address search that flies the map to a result.
  const [search, setSearch] = useState('')
  const [searchTarget, setSearchTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  async function doSearch() {
    const q = search.trim()
    if (!q) return
    setSearching(true)
    setSearchErr(null)
    try {
      // Same free Nominatim service the app already uses for reverse geocoding, /search endpoint.
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`)
      const data = await res.json()
      if (data?.[0]) setSearchTarget({ lat: +data[0].lat, lng: +data[0].lon })
      else setSearchErr('No place found — try a fuller address.')
    } catch {
      setSearchErr('Search failed — check your connection.')
    } finally {
      setSearching(false)
    }
  }

  const territories = useLiveQuery(() => db.territories.toArray(), []) ?? []
  const streetEntries = useLiveQuery(() => db.streetEntries.toArray(), []) ?? []
  // The draft you're actively tracing new streets into — a grouped territory has
  // "graduated" into a durable Ministry-tab entry and is no longer a draw target.
  const activeTerritory = territories.find((t) => !t.completed && !t.grouped)
  // Streets sent to Ministry keep their trace `points`, so they still render on the map even
  // after leaving the draft custom-territory list. Streets that belong to a territory are already
  // drawn by that territory's own overlay below (via TerritoryStreet.points), so exclude their
  // backing entries here — otherwise a grouped street's line is drawn twice, and the second
  // (always-orange) pass would paint over its real done/not-done color.
  const territoryEntryIds = new Set<number>()
  for (const t of territories) for (const s of t.streets) if (s.entryId != null) territoryEntryIds.add(s.entryId)
  const sentStreets = streetEntries
    .filter((e) => e.points && e.points.length >= 2 && !territoryEntryIds.has(e.id))
    .map((e) => ({ id: `se-${e.id}`, name: e.name, points: e.points!, done: false }))

  useEffect(() => {
    // Don't let an in-flight GPS fix hijack a requested "jump to contact" — RecenterButton
    // reacts to `me` changing, so if this resolves after FocusOnMount has already centered
    // on the contact, it would yank the view back to the user's own position. The explicit
    // "Recenter on Me" button below can still always override, on purpose.
    if (focusLocation) return
    getLocation().then((loc) => loc && setMe(loc))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pinned = people.filter((p) => p.lat != null && p.lng != null)
  const center = focusLocation
    ?? me
    ?? (pinned[0] ? { lat: pinned[0].lat!, lng: pinned[0].lng! } : { lat: 32.3, lng: -90.0 })
  const statusesShown = Array.from(new Set(pinned.map((p) => p.status)))

  return (
    <div className="view">
      <h2 className="applet-title">Territory Map</h2>
      <button
        onClick={async () => {
          const loc = await getLocation()
          if (loc) setMe(loc)
        }}
        disabled={loading}
      >
        {loading ? 'Locating...' : 'Recenter on Me'}
      </button>
      {error && <p className="error">{error}</p>}
      {statusesShown.length > 0 && (
        <div className="legend">
          {statusesShown.map((s) => (
            <span key={s}><i className={`contact-pin legend-mini status-${s}`} style={{ display: 'inline-block' }} /> {STATUS_LABELS[s]}</span>
          ))}
        </div>
      )}

      {/* Jump the map to any place or address (Nominatim search) — handy for planning a territory
          somewhere other than where you're standing. */}
      <div className="map-search-row">
        <input
          className="map-search-input"
          placeholder="Search a place or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
        />
        <button className="secondary" onClick={doSearch} disabled={searching}>{searching ? '…' : '🔍 Search'}</button>
      </div>
      {searchErr && <p className="error" style={{ margin: '4px 0 0' }}>{searchErr}</p>}

      {/* Single custom-territory entry point: draws a new one, or (once streets exist) opens the
          manage modal. Reachable without scrolling past the (touch-capturing) map. */}
      <button className="secondary map-draw-btn" onClick={() => setDrawSignal((n) => n + 1)}>
        {activeTerritory && activeTerritory.streets.length > 0
          ? `🗺️ Manage Custom Territory (${activeTerritory.streets.length})`
          : '✏️ Draw Custom Territory'}
      </button>

      {/* The map itself is the main thing this tab is for, so it stays right up top,
          visible without scrolling — the territory controls below it are a secondary,
          occasional-use tool. Any active temporary territory's streets are drawn on this
          map too (TerritoryStreetsOverlay reads the same data the drawing modal writes
          to), not just inside that modal. */}
      <div className="map-wrap">
        {/* Height adapts to the viewport so the map bottom (attribution + any bottom-edge
            pins) clears the floating tab bar instead of hiding under it, while staying a
            comfortable size on tall and short screens alike. */}
        <MapContainer center={[center.lat, center.lng]} zoom={focusLocation ? 17 : me ? 16 : 13} style={{ height: 'clamp(200px, calc(100dvh - 520px), 620px)', width: '100%' }}>
          {baseLayer === 'street' ? (
            <TileLayer
              key="street"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={20}
            />
          ) : (
            <>
              {/* Esri World Imagery (free, keyless) + a transparent street-label overlay so names
                  still read over the satellite view — i.e. a hybrid. */}
              <TileLayer
                key="satellite"
                attribution='Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
              <TileLayer
                key="satellite-labels"
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                maxZoom={20}
              />
            </>
          )}
          <RecenterButton target={me} />
          <FocusOnMount target={focusLocation ?? null} />
          <FlyTo target={searchTarget} />
          <MapViewTracker onChange={setMapView} />
          {me && (
            <Marker position={[me.lat, me.lng]} icon={meIcon}>
              <Popup>You are here</Popup>
            </Marker>
          )}
          {pinned.map((p) => (
            <ContactPin key={p.id} person={p} onGoToContact={onGoToContact} />
          ))}
          {/* Every territory's traces show here, not just the active draft — a grouped
              territory should still be visible on the map even once it's "graduated"
              into a Ministry-tab entry. */}
          {territories.map((t) => (
            <TerritoryStreetsOverlay key={t.id} streets={t.streets} />
          ))}
          <TerritoryStreetsOverlay streets={sentStreets} />
        </MapContainer>
        <MapCompass />
        <button
          className="map-layer-toggle"
          onClick={() => setBaseLayer((l) => (l === 'street' ? 'satellite' : 'street'))}
          title={baseLayer === 'street' ? 'Switch to satellite' : 'Switch to street map'}
        >
          {baseLayer === 'street' ? '🛰️ Satellite' : '🗺️ Street'}
        </button>
      </div>

      {/* Territory drawing + management both live in their own modals (see Territory.tsx) with
          their own map instances — fully isolated from this page's scroll. Renders no inline UI;
          the button above is the only entry point. Drawing starts on the map's current view. */}
      <TerritoryManager territory={activeTerritory} initialCenter={mapView ?? center} pendingDraw={pendingDraw} onDrawConsumed={onDrawConsumed} drawSignal={drawSignal} />
    </div>
  )
}
