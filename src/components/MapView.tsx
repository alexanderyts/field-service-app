import { useEffect, useRef } from 'react'
import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ContactStatus, type Person } from '../db'
import { STATUS_LABELS } from '../contactStatus'
import { useCurrentLocation } from '../useGeolocation'
import { TerritoryControls, TerritoryStreetsOverlay } from './Territory'

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
}: {
  onGoToContact?: (personId: number) => void
  focusLocation?: { lat: number; lng: number; personId: number } | null
}) {
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const { getLocation, loading, error } = useCurrentLocation()
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)

  const territories = useLiveQuery(() => db.territories.toArray(), []) ?? []
  const activeTerritory = territories.find((t) => !t.completed)

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

      {/* The map itself is the main thing this tab is for, so it stays right up top,
          visible without scrolling — the territory controls below it are a secondary,
          occasional-use tool. Any active temporary territory's streets are drawn on this
          map too (TerritoryStreetsOverlay reads the same data the drawing modal writes
          to), not just inside that modal. */}
      <div className="map-wrap">
        <MapContainer center={[center.lat, center.lng]} zoom={focusLocation ? 17 : me ? 16 : 13} style={{ height: '440px', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={20}
          />
          <RecenterButton target={me} />
          <FocusOnMount target={focusLocation ?? null} />
          {me && (
            <Marker position={[me.lat, me.lng]} icon={meIcon}>
              <Popup>You are here</Popup>
            </Marker>
          )}
          {pinned.map((p) => (
            <ContactPin key={p.id} person={p} onGoToContact={onGoToContact} />
          ))}
          {activeTerritory && <TerritoryStreetsOverlay streets={activeTerritory.streets} />}
        </MapContainer>
        <MapCompass />
      </div>

      {/* Drawing happens in its own modal (see Territory.tsx) with its own map instance,
          not this page's map — that keeps it fully isolated from this page's normal
          scroll, so panning/zooming there can never fight the page scrolling underneath. */}
      <TerritoryControls territory={activeTerritory} initialCenter={center} />
    </div>
  )
}
