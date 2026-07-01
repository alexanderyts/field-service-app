import { useEffect, useRef } from 'react'
import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Person } from '../db'
import { useCurrentLocation } from '../useGeolocation'

const STATUS_LABELS: Record<string, string> = {
  'interested': 'Interested',
  'return-visit': 'Return Visit',
  'bible-study': 'Bible Study',
  'not-interested': 'Not Interested',
  'do-not-call': 'Do Not Call',
  'moved': 'Moved',
}

const meIcon = L.divIcon({
  className: 'me-marker',
  html: '<div class="me-dot"></div>',
  iconSize: [16, 16],
})

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
    <Marker position={[person.lat!, person.lng!]}>
      <Popup>
        <div style={{ minWidth: 160 }}>
          <strong style={{ fontSize: 14 }}>{person.name}</strong>
          <div style={{ fontSize: 12, color: '#6d5dd3', fontWeight: 600, marginBottom: 2 }}>
            {STATUS_LABELS[person.status] ?? person.status}
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

  useEffect(() => {
    getLocation().then((loc) => loc && setMe(loc))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pinned = people.filter((p) => p.lat != null && p.lng != null)
  const center = focusLocation
    ?? me
    ?? (pinned[0] ? { lat: pinned[0].lat!, lng: pinned[0].lng! } : { lat: 32.3, lng: -90.0 })

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
      <div className="map-wrap">
        <MapContainer center={[center.lat, center.lng]} zoom={focusLocation ? 17 : me ? 16 : 13} style={{ height: '500px', width: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
        </MapContainer>
      </div>
    </div>
  )
}
