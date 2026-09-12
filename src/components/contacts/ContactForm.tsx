import { useEffect, useRef, useState } from 'react'
import { db, type Person, type Call, type Appointment, type ContactStatus } from '../../db'
import { STATUS_LABELS, STATUS_ORDER } from '../../contactStatus'
import { useCurrentLocation } from '../../useGeolocation'
import { analyzeScripture } from '../../scripture'
import { expandState } from '../../usStates'
import { sameAddress } from '../../address'
import { SharedWarning } from '../SharedBits'
import ConfirmDialog from '../ConfirmDialog'
import ModalPortal from '../../ModalPortal'
import { toLocalDateStr, toLocalTimeStr, combineDateTime } from '../../localDate'
import { geocodeAddress, type AddressSuggestion, searchAddress } from './geocode'
import type { ContactPrefill } from '../StreetEntries'

/** Shared popup form for both creating a new contact and editing an existing one. */
const REQUIRED_FIELDS = ['name'] as const
type RequiredField = (typeof REQUIRED_FIELDS)[number]
export function ContactForm({ onClose, existing, prefill }: { onClose: () => void; existing?: Person; prefill?: ContactPrefill }) {
  const [name, setName] = useState(existing?.name ?? '')
  const [street, setStreet] = useState(existing?.street ?? prefill?.street ?? '')
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([])
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false)
  const [city, setCity] = useState(existing?.city ?? prefill?.city ?? '')
  const [state, setState] = useState(existing?.state ?? prefill?.state ?? '')
  const [zip, setZip] = useState(existing?.zip ?? prefill?.zip ?? '')
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
  const [confirmDropCoords, setConfirmDropCoords] = useState<{ scripture: string | undefined } | null>(null)
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
  // Each lookup takes a ticket; only the newest ticket's answer is shown. Responses don't
  // arrive in the order they were sent, so without this a slow reply to "Map" could land
  // after the fast reply to "Maple Av" and replace the right list with a stale one
  // (REVIEW.md F-C6). Clearing the list takes a ticket too, so a late reply can't refill it.
  const addressLookupSeq = useRef(0)
  useEffect(() => {
    const q = [street, city, state].filter(Boolean).join(', ')
    if (street.trim().length < 4) {
      addressLookupSeq.current++
      setAddressSuggestions([])
      return
    }
    const t = window.setTimeout(() => {
      const ticket = ++addressLookupSeq.current
      searchAddress(q).then((results) => {
        if (ticket === addressLookupSeq.current) setAddressSuggestions(results)
      })
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

  async function commitSave(finalScripture: string | undefined, dropStaleCoords = false) {
    setSaving(true)
    const metMs = metDate ? combineDateTime(metDate, metTime) : Date.now()
    const nextAddress = { street: street.trim(), city: city.trim(), state: expandState(state), zip: zip.trim() }
    const hasAddress = Boolean(nextAddress.street || nextAddress.city || nextAddress.state || nextAddress.zip)

    // Only geocode when there's an address but no already-known coordinate for it — a
    // fresh GPS fix, an autocomplete pick, or (on edit) the contact's existing coords
    // when the address wasn't touched. Never re-geocode an address the user didn't change.
    let resolvedCoords = coords
    // Typing in an address field clears `coords` on the first keystroke, but typing isn't the
    // same as changing: touch-and-undo, or retyping a value identically, would otherwise throw
    // away a good coordinate and force a pointless network round-trip. If the text a save is
    // about to write is the same address the stored coordinate came from, that coordinate is
    // still valid for it.
    if (hasAddress && !resolvedCoords && existing?.lat != null && existing.lng != null && sameAddress(nextAddress, existing)) {
      resolvedCoords = { lat: existing.lat, lng: existing.lng }
    }
    if (hasAddress && !resolvedCoords) {
      resolvedCoords = await geocodeAddress(nextAddress.street, nextAddress.city, nextAddress.state, nextAddress.zip)
    }

    // The address genuinely changed, the lookup failed (offline, rate-limited, or an address
    // OSM can't resolve) and this contact has a pin that's about to be dropped. Keeping it
    // would point at the OLD address, which is why the form clears it — but dropping it
    // silently is how an accurate, hard-won GPS position disappears without anyone noticing.
    // Only the person editing knows whether they fixed a typo or the householder moved, so ask.
    if (hasAddress && !resolvedCoords && existing?.lat != null && !dropStaleCoords) {
      setSaving(false)
      setConfirmDropCoords({ scripture: finalScripture })
      return
    }

    const record = {
      name: name.trim(),
      // Same normalized values `sameAddress` compared above, so what's written can never
      // disagree with what the coordinate decision was made against.
      street: nextAddress.street || undefined,
      city: nextAddress.city || undefined,
      state: nextAddress.state || undefined,
      zip: nextAddress.zip || undefined,
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
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">
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
          <div className="field-row stay-row address-row">
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

      <ConfirmDialog
        open={confirmDropCoords != null}
        title="Couldn't look up that address"
        message="The new address couldn't be found — you may be offline. Saving now removes this contact's map location, since the old pin belongs to the previous address. You can restore it by saving again once you're back online."
        confirmLabel="Save without a location"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          const scripture = confirmDropCoords?.scripture
          setConfirmDropCoords(null)
          commitSave(scripture, true)
        }}
        onCancel={() => setConfirmDropCoords(null)}
      />
      </div>
    </ModalPortal>
  )
}
