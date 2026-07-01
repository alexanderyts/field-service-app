import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Person, type Call, type Appointment, type ContactStatus } from '../db'
import { useCurrentLocation } from '../useGeolocation'
import { analyzeScripture, formatScripture } from '../scripture'
import ConfirmDialog from './ConfirmDialog'

const STATUS_LABELS: Record<ContactStatus, string> = {
  interested: 'Interested',
  'return-visit': 'Return Visit',
  'bible-study': 'Bible Study',
  'not-interested': 'Not Interested',
  'do-not-call': 'Do Not Call',
  moved: 'Moved',
}

const STATUS_ORDER: ContactStatus[] = [
  'interested',
  'return-visit',
  'bible-study',
  'not-interested',
  'do-not-call',
  'moved',
]

type SortKey = 'street' | 'name' | 'date' | 'city' | 'zip'

function toLocalInput(ts: number) {
  const d = new Date(ts)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/** Parses a `YYYY-MM-DD` (from a date input) as a local date, avoiding the UTC-midnight shift. */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function Contacts({
  openContactId,
  onOpenedContact,
  onGoToMap,
}: {
  openContactId?: number | null
  onOpenedContact?: () => void
  onGoToMap?: (lat: number, lng: number, personId: number) => void
}) {
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const appointments = useLiveQuery(() => db.appointments.toArray(), []) ?? []
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [filterStatuses, setFilterStatuses] = useState<ContactStatus[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (openContactId != null) {
      setSelectedId(openContactId)
      onOpenedContact?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openContactId])

  function toggleStatusFilter(s: ContactStatus) {
    setFilterStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const now = Date.now()
  const nextAppointment = new Map<number, number>()
  for (const a of appointments) {
    if (a.personId && a.date >= now) {
      const cur = nextAppointment.get(a.personId)
      if (cur === undefined || a.date < cur) nextAppointment.set(a.personId, a.date)
    }
  }

  const filtered = people.filter((p) => {
    if (filterStatuses.length > 0 && !filterStatuses.includes(p.status)) return false
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
        <h2 className="applet-title">Contacts</h2>
        <button onClick={() => setShowNew(true)}>+ New Contact</button>
      </div>

      <input
        className="full"
        placeholder="Search name, street, city, zip..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
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

      {/* Multi-select tag filter — tap any number of tags to combine them */}
      <div className="tag-filter">
        <button className={filterStatuses.length === 0 ? 'chip uniform active' : 'chip uniform'} onClick={() => setFilterStatuses([])}>
          All
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            className={`chip uniform status-${s}${filterStatuses.includes(s) ? ' active' : ''}`}
            onClick={() => toggleStatusFilter(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {showNew && <ContactForm onClose={() => setShowNew(false)} />}

      <ul className="list">
        {sorted.map((p) => (
          <li key={p.id} className="list-item clickable" onClick={() => setSelectedId(p.id)}>
            <div>
              <strong>{p.name}</strong>
              <span className={`badge status-${p.status}`}>{STATUS_LABELS[p.status]}</span>
              {nextAppointment.has(p.id) && (
                <span className="badge appt-badge" title={new Date(nextAppointment.get(p.id)!).toLocaleString()}>
                  📅 {new Date(nextAppointment.get(p.id)!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
              <div className="muted">{[p.street, p.city, p.state, p.zip].filter(Boolean).join(', ') || 'No address'}</div>
            </div>
          </li>
        ))}
        {sorted.length === 0 && <p className="muted">No contacts match.</p>}
      </ul>

      {selectedId != null && <ContactDetail personId={selectedId} onClose={() => setSelectedId(null)} onGoToMap={onGoToMap} />}
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

/** Shared popup form for both creating a new contact and editing an existing one. */
const REQUIRED_FIELDS = ['name'] as const
type RequiredField = (typeof REQUIRED_FIELDS)[number]

function ContactForm({ onClose, existing }: { onClose: () => void; existing?: Person }) {
  const [name, setName] = useState(existing?.name ?? '')
  const [street, setStreet] = useState(existing?.street ?? '')
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
  const [metAt, setMetAt] = useState(() => toLocalInput(existing?.dateMet ?? Date.now()))
  const [conversation, setConversation] = useState('')
  const [scripture, setScripture] = useState('')
  const [returnVisitDate, setReturnVisitDate] = useState('')
  const [returnVisitTime, setReturnVisitTime] = useState('10:00')
  const [scriptureSuggestion, setScriptureSuggestion] = useState<{ original: string; suggestion: string } | null>(
    null
  )
  const { getLocation, loading, error } = useCurrentLocation()
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  async function handleUseLocation() {
    const loc = await getLocation()
    if (loc) setCoords(loc)
  }

  function validate(): boolean {
    if (existing) return true
    const missing = new Set<RequiredField>()
    if (!name.trim()) missing.add('name')
    setErrors(missing)
    return missing.size === 0
  }

  function save() {
    if (!validate()) return

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
    const metMs = metAt ? new Date(metAt).getTime() : Date.now()
    const hasAddress = street.trim() || city.trim() || state.trim() || zip.trim()

    // Geocode address if provided and no manual GPS fix
    let resolvedCoords = coords
    if (hasAddress && !coords) {
      resolvedCoords = await geocodeAddress(street.trim(), city.trim(), state.trim(), zip.trim())
    }

    const record = {
      name: name.trim(),
      street: street.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
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
      // Geocode for edits only when the existing record has no coords yet
      const editCoords = resolvedCoords ?? (existing.lat == null && hasAddress
        ? await geocodeAddress(street.trim(), city.trim(), state.trim(), zip.trim())
        : null)
      await db.people.update(existing.id, {
        ...record,
        ...(editCoords ? { lat: editCoords.lat, lng: editCoords.lng } : {}),
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

    if (conversation.trim() || finalScripture) {
      await db.calls.add({
        personId,
        date: metMs,
        notes: conversation.trim() || undefined,
        scriptures: finalScripture || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
      } as Call)
    }

    if (returnVisitDate) {
      const [h, m] = returnVisitTime.split(':').map(Number)
      const d = parseLocalDate(returnVisitDate)
      d.setHours(h, m, 0, 0)
      await db.appointments.add({
        title: `Return Visit — ${name.trim()}`,
        date: d.getTime(),
        durationMinutes: 30,
        personId,
      } as Appointment)
    }

    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-toolbar">
          <button className="icon-btn close-x" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <h3>{existing ? 'Edit Contact' : 'New Contact'}</h3>

        <section className="form-section">
          <h4 className="section-title">Contact Info</h4>
          <label className={`field${errors.has('name') ? ' field-invalid' : ''}`}>
            <span className="field-label">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Street address</span>
            <input value={street} onChange={(e) => setStreet(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">State</span>
              <input value={state} onChange={(e) => setState(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Zip</span>
              <input value={zip} onChange={(e) => setZip(e.target.value)} />
            </label>
          </div>
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
              <label className="field">
                <span className="field-label">Date &amp; time met</span>
                <input type="datetime-local" value={metAt} onChange={(e) => setMetAt(e.target.value)} />
              </label>
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
          <button onClick={save}>{existing ? 'Save Changes' : 'Save Contact'}</button>
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
  onGoToMap?: (lat: number, lng: number, personId: number) => void
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
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function deletePerson() {
    await db.calls.where('personId').equals(personId).delete()
    await db.appointments.where('personId').equals(personId).delete()
    await db.people.delete(personId)
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
          </div>
          <p className="muted contact-line">{addressStr || 'No address on file'}</p>
          {person.phone && <p className="muted contact-line">{person.phone}</p>}

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
          <button onClick={() => setShowLogger((v) => !v)}>{showLogger ? 'Close Call Form' : '+ Log a Call'}</button>
        </div>

        {upcoming.length > 0 && (
          <div className="card appt-card">
            <h4>Upcoming Return Visit</h4>
            {upcoming.map((a) => (
              <div key={a.id}>
                <strong>{a.title}</strong>
                <div className="muted">{new Date(a.date).toLocaleString()}</div>
                {a.notes && <div>{a.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {showLogger && <CallLogger personId={personId} onSaved={() => setShowLogger(false)} />}

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
  )
}

function CallLogger({
  personId,
  existing,
  onSaved,
  onCancel,
}: {
  personId: number
  existing?: Call
  onSaved: () => void
  onCancel?: () => void
}) {
  const [when, setWhen] = useState(() => toLocalInput(existing?.date ?? Date.now()))
  const [notHome, setNotHome] = useState(existing?.notHome ?? false)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [scriptures, setScriptures] = useState(existing?.scriptures ?? '')
  const [leftAtDoor, setLeftAtDoor] = useState(existing?.leftAtDoor ?? '')
  const [returnVisitDate, setReturnVisitDate] = useState('')
  const [returnVisitTime, setReturnVisitTime] = useState('10:00')
  const { getLocation } = useCurrentLocation()

  async function saveCall() {
    const loc = existing ? undefined : await getLocation()
    const record = {
      personId,
      date: when ? new Date(when).getTime() : Date.now(),
      notHome,
      notes: notes || undefined,
      scriptures: notHome ? undefined : scriptures ? formatScripture(scriptures) : undefined,
      leftAtDoor: notHome ? leftAtDoor || undefined : undefined,
    }

    if (existing) {
      await db.calls.update(existing.id, record)
    } else {
      await db.calls.add({ ...record, lat: loc?.lat, lng: loc?.lng } as Call)
    }

    if (returnVisitDate) {
      const person = await db.people.get(personId)
      const [h, m] = returnVisitTime.split(':').map(Number)
      const d = parseLocalDate(returnVisitDate)
      d.setHours(h, m, 0, 0)
      await db.appointments.add({
        title: `Return Visit${person ? ` — ${person.name}` : ''}`,
        date: d.getTime(),
        durationMinutes: 30,
        personId,
      } as Appointment)
    }
    onSaved()
  }

  return (
    <div className="card">
      <h4>{existing ? 'Edit Call' : 'Log a Call'}</h4>
      <label className="field">
        <span className="field-label">Date &amp; time</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
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

      <div className="row">
        <button onClick={saveCall}>{existing ? 'Save Changes' : 'Save Call'}</button>
        {onCancel && (
          <button className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
