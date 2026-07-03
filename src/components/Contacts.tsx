import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Person, type Call, type Appointment, type ContactStatus } from '../db'
import { STATUS_LABELS, STATUS_ORDER } from '../contactStatus'
import { useCurrentLocation } from '../useGeolocation'
import { analyzeScripture, formatScripture } from '../scripture'
import { expandState } from '../usStates'
import ConfirmDialog from './ConfirmDialog'
import ModalPortal from '../ModalPortal'
import StreetEntries from './StreetEntries'
import Territories from './Territories'
import ShareModal from './ShareModal'
import { SharedBadge, SharedWarning } from './SharedBits'
import { buildContactPayload, readMeleoFile } from '../share'

type SortKey = 'street' | 'name' | 'date' | 'city' | 'zip'
type MinistryView = 'people' | 'streets' | 'territories'

/** Parses a `YYYY-MM-DD` (from a date input) as a local date, avoiding the UTC-midnight shift. */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toLocalDateStr(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toLocalTimeStr(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Combines a `YYYY-MM-DD` and `HH:mm` pair (from separate date/time inputs) into a local timestamp. */
function combineDateTime(dateStr: string, timeStr: string): number {
  const d = parseLocalDate(dateStr)
  const [h, m] = timeStr.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export default function Contacts({
  openContactId,
  onOpenedContact,
  onGoToMap,
  onImportEncoded,
}: {
  openContactId?: number | null
  onOpenedContact?: () => void
  onGoToMap?: (lat: number, lng: number, personId?: number) => void
  onImportEncoded?: (encoded: string) => void
}) {
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const appointments = useLiveQuery(() => db.appointments.toArray(), []) ?? []
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [filterStatus, setFilterStatus] = useState<ContactStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState<MinistryView>('people')
  const [showChooser, setShowChooser] = useState(false)
  const [streetFormOpen, setStreetFormOpen] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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
  const nextAppointment = new Map<number, number>()
  for (const a of appointments) {
    if (a.personId && a.date >= now) {
      const cur = nextAppointment.get(a.personId)
      if (cur === undefined || a.date < cur) nextAppointment.set(a.personId, a.date)
    }
  }

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
        <button className={view === 'people' ? 'active' : ''} onClick={() => setView('people')}>People</button>
        <button className={view === 'streets' ? 'active' : ''} onClick={() => setView('streets')}>Streets</button>
        <button className={view === 'territories' ? 'active' : ''} onClick={() => setView('territories')}>Territories</button>
      </div>

      {view === 'people' ? (
        <>
          <input
            className="full"
            placeholder="Search name, street, city, zip..."
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

          {showNew && <ContactForm onClose={() => setShowNew(false)} />}

          <ul className="list">
            {sorted.map((p) => (
              <li key={p.id} className="list-item clickable" onClick={() => setSelectedId(p.id)}>
                <div>
                  <strong>{p.name}</strong>
                  <span className={`badge status-${p.status}`}>{STATUS_LABELS[p.status]}</span>
                  <SharedBadge sharedWith={p.sharedWith} receivedFrom={p.receivedFrom} />
                  {nextAppointment.has(p.id) && (
                    <span className="badge appt-badge" title={new Date(nextAppointment.get(p.id)!).toLocaleString()}>
                      📅 {new Date(nextAppointment.get(p.id)!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  <div className="muted">{[p.street, p.city, p.state, p.zip].filter(Boolean).join(', ') || 'No address'}</div>
                </div>
              </li>
            ))}
            {sorted.length === 0 && <p className="muted">No contacts match.</p>}
          </ul>

          {selectedId != null && <ContactDetail personId={selectedId} onClose={() => setSelectedId(null)} onGoToMap={onGoToMap} />}
        </>
      ) : view === 'streets' ? (
        <StreetEntries showNewForm={streetFormOpen} onCloseNewForm={() => setStreetFormOpen(false)} onGoToMap={onGoToMap} />
      ) : (
        <Territories onGoToMap={onGoToMap} />
      )}

      {showChooser && (
        <ModalPortal>
          <div className="modal-backdrop" onClick={() => setShowChooser(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
              <div className="modal-toolbar">
                <button className="icon-btn close-x" onClick={() => setShowChooser(false)} title="Close">×</button>
              </div>
              <h3>Add a new entry</h3>
              <p className="muted" style={{ marginTop: -6 }}>What would you like to add?</p>
              <button
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

async function geocodeAddress(street: string, city: string, state: string, zip: string): Promise<{ lat: number; lng: number } | null> {
  const q = [street, city, state, zip].filter(Boolean).join(', ')
  if (!q) return null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'FieldServiceApp/1.0' } }
    )
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    // Geocoding is best-effort; fail silently
  }
  return null
}

interface AddressSuggestion {
  label: string
  street?: string
  city?: string
  state?: string
  zip?: string
  lat: number
  lng: number
}

/** Looks up real, deliverable addresses matching what's typed so far, for autocorrecting street entry. */
async function searchAddress(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 4) return []
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`,
      { headers: { 'User-Agent': 'FieldServiceApp/1.0' } }
    )
    const data = await res.json()
    return data.map((d: Record<string, unknown>) => {
      const addr = (d.address ?? {}) as Record<string, string>
      return {
        label: d.display_name as string,
        street: [addr.house_number, addr.road].filter(Boolean).join(' ') || undefined,
        city: addr.city || addr.town || addr.village || addr.hamlet || undefined,
        state: addr.state || undefined,
        zip: addr.postcode || undefined,
        lat: parseFloat(d.lat as string),
        lng: parseFloat(d.lon as string),
      }
    })
  } catch {
    return []
  }
}

/** Shared popup form for both creating a new contact and editing an existing one. */
const REQUIRED_FIELDS = ['name'] as const
type RequiredField = (typeof REQUIRED_FIELDS)[number]

function ContactForm({ onClose, existing }: { onClose: () => void; existing?: Person }) {
  const [name, setName] = useState(existing?.name ?? '')
  const [street, setStreet] = useState(existing?.street ?? '')
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false)
  const [city, setCity] = useState(existing?.city ?? '')
  const [state, setState] = useState(existing?.state ?? '')
  const [zip, setZip] = useState(existing?.zip ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [status, setStatus] = useState<ContactStatus>(existing?.status ?? 'interested')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [errors, setErrors] = useState<Set<RequiredField>>(new Set())

  const [showAdditional, setShowAdditional] = useState(
    Boolean(existing?.married || existing?.hasKids || existing?.hasPets)
  )
  const [married, setMarried] = useState(existing?.married ?? false)
  const [spouseName, setSpouseName] = useState(existing?.spouseName ?? '')
  const [hasKids, setHasKids] = useState(existing?.hasKids ?? false)
  const [kidsInfo, setKidsInfo] = useState(existing?.kidsInfo ?? '')
  const [hasPets, setHasPets] = useState(existing?.hasPets ?? false)
  const [petsInfo, setPetsInfo] = useState(existing?.petsInfo ?? '')

  // First-visit details (new contact only)
  const [metDate, setMetDate] = useState(() => toLocalDateStr(existing?.dateMet ?? Date.now()))
  const [metTime, setMetTime] = useState(() => toLocalTimeStr(existing?.dateMet ?? Date.now()))
  const [conversation, setConversation] = useState('')
  const [scripture, setScripture] = useState('')
  const [literaturePlaced, setLiteraturePlaced] = useState('')
  const [returnVisitDate, setReturnVisitDate] = useState('')
  const [returnVisitTime, setReturnVisitTime] = useState('10:00')
  const [scriptureSuggestion, setScriptureSuggestion] = useState<{ original: string; suggestion: string } | null>(
    null
  )
  const { getLocation, loading, error } = useCurrentLocation()
  // Seeded from the existing record's coords (if any) so editing an unrelated field
  // (phone, notes, status…) doesn't trigger a network re-geocode that could silently
  // overwrite an accurate, GPS-captured position. Cleared to null — forcing a fresh
  // geocode on save — whenever the address text is hand-edited (see the street/city/
  // state/zip onChange handlers below), since a stale coordinate for a changed address
  // is worse than no coordinate at all.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() =>
    existing?.lat != null && existing?.lng != null ? { lat: existing.lat, lng: existing.lng } : null
  )

  async function handleUseLocation() {
    const loc = await getLocation()
    if (loc) setCoords(loc)
  }

  // Debounced address lookup — waits for a pause in typing before hitting Nominatim,
  // both to be a reasonable API citizen and to avoid a suggestion list that's constantly
  // re-fetching mid-keystroke.
  useEffect(() => {
    const q = [street, city, state].filter(Boolean).join(', ')
    if (street.trim().length < 4) {
      setAddressSuggestions([])
      return
    }
    const t = window.setTimeout(() => {
      searchAddress(q).then(setAddressSuggestions)
    }, 500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [street])

  function pickAddressSuggestion(s: AddressSuggestion) {
    if (s.street) setStreet(s.street)
    if (s.city) setCity(s.city)
    if (s.state) setState(s.state)
    if (s.zip) setZip(s.zip)
    setCoords({ lat: s.lat, lng: s.lng })
    setAddressSuggestions([])
    setShowAddressSuggestions(false)
  }

  function validate(): boolean {
    if (existing) return true
    const missing = new Set<RequiredField>()
    if (!name.trim()) missing.add('name')
    setErrors(missing)
    return missing.size === 0
  }

  const [saving, setSaving] = useState(false)

  function save() {
    if (saving || !validate()) return

    const scriptureRaw = scripture.trim()
    if (scriptureRaw) {
      const analysis = analyzeScripture(scriptureRaw)
      if (!analysis.recognized && analysis.suggestion) {
        setScriptureSuggestion({ original: scriptureRaw, suggestion: analysis.suggestion })
        return
      }
      commitSave(analysis.formatted)
      return
    }
    commitSave(undefined)
  }

  async function commitSave(finalScripture: string | undefined) {
    setSaving(true)
    const metMs = metDate ? combineDateTime(metDate, metTime) : Date.now()
    const hasAddress = Boolean(street.trim() || city.trim() || state.trim() || zip.trim())

    // Only geocode when there's an address but no already-known coordinate for it — a
    // fresh GPS fix, an autocomplete pick, or (on edit) the contact's existing coords
    // when the address wasn't touched. Never re-geocode an address the user didn't change.
    let resolvedCoords = coords
    if (hasAddress && !resolvedCoords) {
      resolvedCoords = await geocodeAddress(street.trim(), city.trim(), state.trim(), zip.trim())
    }

    const record = {
      name: name.trim(),
      street: street.trim() || undefined,
      city: city.trim() || undefined,
      state: expandState(state) || undefined,
      zip: zip.trim() || undefined,
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      married,
      spouseName: married ? spouseName.trim() || undefined : undefined,
      hasKids,
      kidsInfo: hasKids ? kidsInfo.trim() || undefined : undefined,
      hasPets,
      petsInfo: hasPets ? petsInfo.trim() || undefined : undefined,
      status,
    }

    if (existing) {
      // hasAddress false means the address was cleared — drop the stale coords along with it
      // rather than leaving a ghost pin pointing at the old, no-longer-listed address.
      await db.people.update(existing.id, {
        ...record,
        lat: hasAddress ? resolvedCoords?.lat : undefined,
        lng: hasAddress ? resolvedCoords?.lng : undefined,
      })
      onClose()
      return
    }

    const personId = (await db.people.add({
      ...record,
      lat: resolvedCoords?.lat,
      lng: resolvedCoords?.lng,
      dateMet: metMs,
      createdAt: Date.now(),
    } as Person)) as number

    if (conversation.trim() || finalScripture || literaturePlaced.trim()) {
      await db.calls.add({
        personId,
        date: metMs,
        notes: conversation.trim() || undefined,
        scriptures: finalScripture || undefined,
        literaturePlaced: literaturePlaced.trim() || undefined,
        lat: resolvedCoords?.lat,
        lng: resolvedCoords?.lng,
      } as Call)
    }

    if (returnVisitDate) {
      await db.appointments.add({
        title: `Return Visit — ${name.trim()}`,
        date: combineDateTime(returnVisitDate, returnVisitTime),
        durationMinutes: 30,
        personId,
      } as Appointment)
    }

    onClose()
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">
              ×
            </button>
          </div>

          <h3>{existing ? 'Edit Contact' : 'New Contact'}</h3>
          {existing && <SharedWarning sharedWith={existing.sharedWith} />}

        <section className="form-section">
          <h4 className="section-title">Contact Info</h4>
          <label className={`field${errors.has('name') ? ' field-invalid' : ''}`}>
            <span className="field-label">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Street address</span>
            <div className="combobox">
              <input
                value={street}
                onChange={(e) => { setStreet(e.target.value); setShowAddressSuggestions(true); setCoords(null) }}
                onFocus={() => setShowAddressSuggestions(true)}
                onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 120)}
                placeholder="Start typing to look up a real address…"
                autoComplete="off"
              />
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="combobox-list">
                  {addressSuggestions.map((s, i) => (
                    <div key={i} className="combobox-option" onMouseDown={() => pickAddressSuggestion(s)}>
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">City</span>
              <input value={city} onChange={(e) => { setCity(e.target.value); setCoords(null) }} />
            </label>
            <label className="field">
              <span className="field-label">State</span>
              <input
                value={state}
                onChange={(e) => { setState(e.target.value); setCoords(null) }}
                onBlur={() => setState((s) => expandState(s))}
              />
            </label>
            <label className="field">
              <span className="field-label">Zip</span>
              <input value={zip} onChange={(e) => { setZip(e.target.value); setCoords(null) }} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Tag</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ContactStatus)}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="secondary" onClick={handleUseLocation} disabled={loading}>
            {loading ? 'Getting location...' : coords ? 'Location captured ✓' : 'Use Current Location'}
          </button>
          {error && <p className="error">{error}</p>}
          {errors.size > 0 && <p className="error">Please enter a name before saving.</p>}
        </section>

        <div className="section-divider" />

        {/* Compact, expandable household details — kept light so the form doesn't feel cluttered */}
        <section className="form-section">
          <button className="collapse-header" onClick={() => setShowAdditional((v) => !v)}>
            <span className="section-title" style={{ margin: 0 }}>
              Additional Details
            </span>
            <span className="chevron">{showAdditional ? '▾' : '▸'}</span>
          </button>

          {showAdditional && (
            <div className="household-fields">
              <label className="checkbox-row">
                <input type="checkbox" checked={married} onChange={(e) => setMarried(e.target.checked)} />
                <span>Married</span>
              </label>
              {married && (
                <input className="full" placeholder="Spouse's name" value={spouseName} onChange={(e) => setSpouseName(e.target.value)} />
              )}

              <label className="checkbox-row">
                <input type="checkbox" checked={hasKids} onChange={(e) => setHasKids(e.target.checked)} />
                <span>Kids</span>
              </label>
              {hasKids && (
                <input className="full" placeholder="Names / ages / info" value={kidsInfo} onChange={(e) => setKidsInfo(e.target.value)} />
              )}

              <label className="checkbox-row">
                <input type="checkbox" checked={hasPets} onChange={(e) => setHasPets(e.target.checked)} />
                <span>Pets</span>
              </label>
              {hasPets && (
                <input className="full" placeholder="Type / names / info" value={petsInfo} onChange={(e) => setPetsInfo(e.target.value)} />
              )}

              <label className="field">
                <span className="field-label">Other notes</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          )}
        </section>

        {!existing && (
          <>
            <div className="section-divider" />
            <section className="form-section">
              <h4 className="section-title">Visit Details</h4>
              <p className="field-label">Date &amp; time met</p>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Date</span>
                  <input type="date" value={metDate} onChange={(e) => setMetDate(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">Time</span>
                  <input type="time" value={metTime} onChange={(e) => setMetTime(e.target.value)} />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Conversation notes (optional)</span>
                <textarea
                  placeholder="What was talked about…"
                  value={conversation}
                  onChange={(e) => setConversation(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Scripture shared (optional)</span>
                <input value={scripture} onChange={(e) => setScripture(e.target.value)} placeholder="e.g. John 3:16" />
              </label>
              <label className="field">
                <span className="field-label">Literature placed (optional)</span>
                <input value={literaturePlaced} onChange={(e) => setLiteraturePlaced(e.target.value)} placeholder="e.g. Awake! magazine" />
              </label>
              <p className="field-label">Schedule a return visit (optional)</p>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">Date</span>
                  <input type="date" value={returnVisitDate} onChange={(e) => setReturnVisitDate(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">Time</span>
                  <input type="time" value={returnVisitTime} onChange={(e) => setReturnVisitTime(e.target.value)} />
                </label>
              </div>
            </section>
          </>
        )}

        <div className="row">
          <button onClick={save} disabled={saving}>{existing ? 'Save Changes' : 'Save Contact'}</button>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={scriptureSuggestion != null}
        title="Did you mean this scripture?"
        message={scriptureSuggestion ? `"${scriptureSuggestion.original}" doesn't match a known scripture. Did you mean "${scriptureSuggestion.suggestion}"?` : ''}
        confirmLabel="Yes, use this"
        cancelLabel="No, keep as typed"
        tone="primary"
        onConfirm={() => {
          const suggestion = scriptureSuggestion?.suggestion
          setScriptureSuggestion(null)
          commitSave(suggestion)
        }}
        onCancel={() => {
          const original = scriptureSuggestion?.original
          setScriptureSuggestion(null)
          commitSave(original)
        }}
      />
      </div>
    </ModalPortal>
  )
}

function householdSummary(person: Person): string[] {
  const lines: string[] = []
  if (person.married) lines.push(`Married${person.spouseName ? ` to ${person.spouseName}` : ''}`)
  if (person.hasKids) lines.push(`Kids${person.kidsInfo ? `: ${person.kidsInfo}` : ''}`)
  if (person.hasPets) lines.push(`Pets${person.petsInfo ? `: ${person.petsInfo}` : ''}`)
  return lines
}

function ContactDetail({ personId, onClose, onGoToMap }: {
  personId: number
  onClose: () => void
  onGoToMap?: (lat: number, lng: number, personId?: number) => void
}) {
  const person = useLiveQuery(() => db.people.get(personId), [personId])
  const calls = useLiveQuery(() => db.calls.where('personId').equals(personId).toArray(), [personId]) ?? []
  const appointments = useLiveQuery(
    () => db.appointments.where('personId').equals(personId).toArray(),
    [personId]
  ) ?? []
  const [expanded, setExpanded] = useState(false)
  const [showLogger, setShowLogger] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [callSort, setCallSort] = useState<'newest' | 'oldest'>('newest')
  const [editingCallId, setEditingCallId] = useState<number | null>(null)
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showShare, setShowShare] = useState(false)

  async function deletePerson() {
    // Transactional so an interruption (tab closed, exception) mid-delete can't leave
    // orphaned calls/appointments behind for a person that's already gone.
    await db.transaction('rw', [db.calls, db.appointments, db.people], async () => {
      await db.calls.where('personId').equals(personId).delete()
      await db.appointments.where('personId').equals(personId).delete()
      await db.people.delete(personId)
    })
    onClose()
  }

  if (!person) return null

  const addressStr = [person.street, person.city, person.state, person.zip].filter(Boolean).join(', ')
  const directionsUrl = addressStr
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressStr)}`
    : person.lat != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${person.lat},${person.lng}`
      : null

  const now = Date.now()
  const upcoming = appointments.filter((a) => a.date >= now).sort((a, b) => a.date - b.date)
  const sortedCalls = [...calls].sort((a, b) => (callSort === 'newest' ? b.date - a.date : a.date - b.date))
  const household = householdSummary(person)

  return (
    <ModalPortal>
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${expanded ? ' modal-expanded' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-toolbar">
          <button className="icon-btn" onClick={() => setExpanded((v) => !v)} title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? '⤡' : '⤢'}
          </button>
          <button className="icon-btn close-x" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        {/* Pinned contact summary — address & phone right under the name */}
        <div className="contact-summary-block">
          <div className="detail-head">
            <h3>{person.name}</h3>
            <span className={`badge status-${person.status}`}>{STATUS_LABELS[person.status]}</span>
            <SharedBadge sharedWith={person.sharedWith} receivedFrom={person.receivedFrom} />
          </div>
          <p className="muted contact-line">{addressStr || 'No address on file'}</p>
          {person.phone && <p className="muted contact-line">{person.phone}</p>}
          <SharedWarning sharedWith={person.sharedWith} />

          {household.length > 0 && (
            <div className="household-summary">
              {household.map((line) => (
                <span key={line} className="household-pill">
                  {line}
                </span>
              ))}
            </div>
          )}
          {person.notes && <p className="muted contact-line">{person.notes}</p>}

          <p className="muted contact-line">Met {new Date(person.dateMet).toLocaleString()}</p>
        </div>

        <div className="row">
          {directionsUrl && (
            <a className="link-button" href={directionsUrl} target="_blank" rel="noreferrer">
              Get Directions
            </a>
          )}
          {person.lat != null && onGoToMap && (
            <button className="secondary" onClick={() => { onGoToMap(person.lat!, person.lng!, personId); onClose() }}>
              Jump to Map
            </button>
          )}
          <button className="secondary" onClick={() => setShowEdit(true)}>
            Edit Contact
          </button>
          <button className="secondary" onClick={() => setShowShare(true)}>↗ Share</button>
          <button onClick={() => setShowLogger((v) => !v)}>{showLogger ? 'Close Call Form' : '+ Log a Call'}</button>
        </div>

        {upcoming.length > 0 && (
          <div className="card appt-card">
            <h4>Upcoming Return Visit{upcoming.length === 1 ? '' : 's'}</h4>
            {upcoming.map((a) => (
              <div key={a.id} className="appt-row">
                <div>
                  <strong>{a.title}</strong>
                  <div className="muted">{new Date(a.date).toLocaleString()}</div>
                  {a.notes && <div>{a.notes}</div>}
                </div>
                <button className="secondary small" onClick={() => setEditingAppt(a)}>Edit</button>
              </div>
            ))}
          </div>
        )}

        {editingAppt && <ReturnVisitEditor appt={editingAppt} onClose={() => setEditingAppt(null)} />}

        {showLogger && <CallLogger personId={personId} sharedWith={person.sharedWith} onSaved={() => setShowLogger(false)} />}

        {/* Call history is the primary focus of this view */}
        <div className="view-header">
          <h4>Call History</h4>
          <label className="field">
            <span className="field-label">Sort</span>
            <select value={callSort} onChange={(e) => setCallSort(e.target.value as 'newest' | 'oldest')}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
        <ul className="list">
          {sortedCalls.map((c) =>
            editingCallId === c.id ? (
              <CallLogger
                key={c.id}
                personId={personId}
                existing={c}
                onSaved={() => setEditingCallId(null)}
                onCancel={() => setEditingCallId(null)}
              />
            ) : (
            <li key={c.id} className="list-item">
              <div>
                <div className="muted">
                  {new Date(c.date).toLocaleString()} {c.notHome && <span className="badge not-home-badge">Not Home</span>}
                </div>
                {c.notes && <div>{c.notes}</div>}
                {c.scriptures && <div>Scriptures: {c.scriptures}</div>}
                {c.literaturePlaced && <div>Literature placed: {c.literaturePlaced}</div>}
                {c.leftAtDoor && <div>Left at door: {c.leftAtDoor}</div>}
                {c.followUpDate && <div className="follow-up">Follow up: {new Date(c.followUpDate).toLocaleDateString()}</div>}
              </div>
              <button className="secondary small" onClick={() => setEditingCallId(c.id)}>
                Edit
              </button>
            </li>
            )
          )}
          {sortedCalls.length === 0 && <p className="muted">No calls logged yet.</p>}
        </ul>

        <div className="row">
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            Delete Contact
          </button>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {showEdit && <ContactForm existing={person} onClose={() => setShowEdit(false)} />}
      {showShare && (
        <ShareModal
          kind="contact"
          recordId={personId}
          itemName={person.name}
          buildPayload={(from) => buildContactPayload(personId, from)}
          onClose={() => setShowShare(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this contact?"
        message={`This permanently removes ${person.name} and their entire call history. This can't be undone.`}
        onConfirm={() => {
          setConfirmDelete(false)
          deletePerson()
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
    </ModalPortal>
  )
}

/** Edit or cancel an already-scheduled return visit (a saved appointment) — change its
    date/time, tweak the notes, or remove it entirely. */
function ReturnVisitEditor({ appt, onClose }: { appt: Appointment; onClose: () => void }) {
  const [date, setDate] = useState(() => toLocalDateStr(appt.date))
  const [time, setTime] = useState(() => toLocalTimeStr(appt.date))
  const [notes, setNotes] = useState(appt.notes ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function save() {
    await db.appointments.update(appt.id, {
      date: combineDateTime(date, time),
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  async function remove() {
    await db.appointments.delete(appt.id)
    onClose()
  }

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3>Edit Return Visit</h3>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="row">
            <button onClick={save}>Save Changes</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
          <button className="danger" onClick={() => setConfirmRemove(true)}>Remove This Visit</button>

          <ConfirmDialog
            open={confirmRemove}
            title="Remove this return visit?"
            message="This cancels the scheduled visit. This can't be undone."
            confirmLabel="Remove"
            onConfirm={() => { setConfirmRemove(false); remove() }}
            onCancel={() => setConfirmRemove(false)}
          />
        </div>
      </div>
    </ModalPortal>
  )
}

function CallLogger({
  personId,
  existing,
  sharedWith,
  onSaved,
  onCancel,
}: {
  personId: number
  existing?: Call
  sharedWith?: Person['sharedWith']
  onSaved: () => void
  onCancel?: () => void
}) {
  const [whenDate, setWhenDate] = useState(() => toLocalDateStr(existing?.date ?? Date.now()))
  const [whenTime, setWhenTime] = useState(() => toLocalTimeStr(existing?.date ?? Date.now()))
  const [notHome, setNotHome] = useState(existing?.notHome ?? false)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [scriptures, setScriptures] = useState(existing?.scriptures ?? '')
  const [leftAtDoor, setLeftAtDoor] = useState(existing?.leftAtDoor ?? '')
  const [literaturePlaced, setLiteraturePlaced] = useState(existing?.literaturePlaced ?? '')
  const [returnVisitDate, setReturnVisitDate] = useState('')
  const [returnVisitTime, setReturnVisitTime] = useState('10:00')
  const { getLocation, error: locationError } = useCurrentLocation()
  const [saving, setSaving] = useState(false)

  async function saveCall() {
    if (saving) return
    setSaving(true)
    const loc = existing ? undefined : await getLocation()
    const record = {
      personId,
      date: whenDate ? combineDateTime(whenDate, whenTime) : Date.now(),
      notHome,
      notes: notes || undefined,
      scriptures: notHome ? undefined : scriptures ? formatScripture(scriptures) : undefined,
      leftAtDoor: notHome ? leftAtDoor || undefined : undefined,
      literaturePlaced: notHome ? undefined : literaturePlaced.trim() || undefined,
    }

    if (existing) {
      await db.calls.update(existing.id, record)
    } else {
      await db.calls.add({ ...record, lat: loc?.lat, lng: loc?.lng } as Call)
    }

    if (returnVisitDate) {
      const person = await db.people.get(personId)
      await db.appointments.add({
        title: `Return Visit${person ? ` — ${person.name}` : ''}`,
        date: combineDateTime(returnVisitDate, returnVisitTime),
        durationMinutes: 30,
        personId,
      } as Appointment)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="card">
      {onCancel && (
        <div className="modal-toolbar">
          <button className="icon-btn close-x" onClick={onCancel} disabled={saving} title="Cancel edit">×</button>
        </div>
      )}
      <h4>{existing ? 'Edit Call' : 'Log a Call'}</h4>
      <SharedWarning sharedWith={sharedWith} />
      <p className="field-label">Date &amp; time</p>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Date</span>
          <input type="date" value={whenDate} onChange={(e) => setWhenDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Time</span>
          <input type="time" value={whenTime} onChange={(e) => setWhenTime(e.target.value)} />
        </label>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={notHome} onChange={(e) => setNotHome(e.target.checked)} />
        <span>Not at home</span>
      </label>

      {notHome ? (
        <>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea placeholder="Any notes about this visit…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Left at the door (optional)</span>
            <input value={leftAtDoor} onChange={(e) => setLeftAtDoor(e.target.value)} />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Conversation notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Scriptures shared (optional)</span>
            <input
              value={scriptures}
              onChange={(e) => setScriptures(e.target.value)}
              onBlur={(e) => setScriptures(formatScripture(e.target.value))}
              placeholder="e.g. jn 3:16"
            />
          </label>
          <label className="field">
            <span className="field-label">Literature placed (optional)</span>
            <input value={literaturePlaced} onChange={(e) => setLiteraturePlaced(e.target.value)} placeholder="e.g. Awake! magazine" />
          </label>
        </>
      )}

      <p className="field-label">Schedule a return visit (optional)</p>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Date</span>
          <input type="date" value={returnVisitDate} onChange={(e) => setReturnVisitDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Time</span>
          <input type="time" value={returnVisitTime} onChange={(e) => setReturnVisitTime(e.target.value)} />
        </label>
      </div>

      {!existing && locationError && <p className="muted" style={{ fontSize: 13 }}>⚠ Couldn't get your location — this call will be saved without a map pin.</p>}
      <div className="row">
        <button onClick={saveCall} disabled={saving}>{existing ? 'Save Changes' : 'Save Call'}</button>
        {onCancel && (
          <button className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
