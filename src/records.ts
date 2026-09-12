import { db, uniqueStreetName, type Appointment, type Call, type Person, type StreetEntry, type Territory, type TerritoryCompletion, type TerritoryStreet } from './db'
import { stripInjectedKeys, type ContactPayload, type SharePayload, type StreetPayload, type TerritoryPayload } from './share'
import { ensureStreetEntry } from './streets'

// The multi-table operations that used to live inline in components. Each one spans more than
// one table, so each is a single transaction: interrupted partway, the earlier versions left
// orphaned call history, duplicated street entries, a street existing in two places at once,
// or a completed territory whose completion record was lost (AUDIT F025).
//
// They're here rather than in the components because a flow you can't call without rendering
// React is a flow you can't test. These are exercised against fake-indexeddb in records.test.ts.

/**
 * Delete several contacts and everything hanging off them.
 *
 * `personId` is indexed on both `calls` and `appointments`, so these are index lookups rather
 * than the full-table scan the appointments cleanup used to do per selected contact.
 */
export async function deleteContacts(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  await db.transaction('rw', db.people, db.calls, db.appointments, async () => {
    for (const id of ids) {
      await db.people.delete(id)
      await db.calls.where('personId').equals(id).delete()
      await db.appointments.where('personId').equals(id).delete()
    }
  })
}

/**
 * Move the chosen streets out of a draft territory and into a new grouped one, backing each
 * with a real Streets entry so it's managed identically from either place.
 *
 * `streetEntries` is in the transaction scope so `ensureStreetEntry` joins this transaction
 * rather than writing outside it. Creating the entries first, as a separate step, meant a
 * failure during the territory writes orphaned them — and a retry created a second set, since
 * `ensureStreetEntry` only reuses by `entryId` and a draft street has none yet.
 *
 * Returns the new territory's id, or null if there was nothing to move.
 */
export async function groupStreetsIntoTerritory(
  draftId: number,
  streetIds: Set<string> | string[],
  name: string
): Promise<number | null> {
  const wanted = streetIds instanceof Set ? streetIds : new Set(streetIds)
  const trimmed = name.trim()
  if (!trimmed || wanted.size === 0) return null

  let created: number | null = null
  await db.transaction('rw', db.territories, db.streetEntries, async () => {
    // Re-read rather than trusting a render-time snapshot, so a concurrent edit to another
    // street in this territory isn't reverted by this one.
    const fresh = await db.territories.get(draftId)
    if (!fresh) return
    const toMove = fresh.streets.filter((s) => wanted.has(s.id))
    const remaining = fresh.streets.filter((s) => !wanted.has(s.id))
    if (toMove.length === 0) return

    const movedWithEntries: TerritoryStreet[] = []
    for (const s of toMove) {
      const entryId = await ensureStreetEntry(s, { city: s.city, state: s.state, zip: s.zip })
      movedWithEntries.push({ ...s, entryId })
    }

    created = (await db.territories.add({
      name: trimmed,
      createdAt: Date.now(),
      completed: false,
      grouped: true,
      streets: movedWithEntries,
    } as Territory)) as number
    await db.territories.update(draftId, { streets: remaining })
  })
  return created
}

/**
 * Move one traced street out of a territory and into the Streets list as a standalone entry,
 * carrying its trace so it keeps showing on the map.
 *
 * Add-then-remove in one transaction: as two separate awaits, an interruption between them
 * left the street existing in BOTH places, looking like two roads. Any reverse-geocoding must
 * happen before this call — a network wait inside a Dexie transaction would break it.
 */
export async function sendStreetToMinistry(
  territoryId: number,
  street: TerritoryStreet,
  location: { city?: string; state?: string; zip?: string }
): Promise<void> {
  await db.transaction('rw', db.streetEntries, db.territories, async () => {
    await db.streetEntries.add({
      name: street.name,
      city: location.city,
      state: location.state,
      zip: location.zip,
      houses: [],
      points: street.points,
      assignedTo: street.assignedTo,
      createdAt: Date.now(),
    })
    const fresh = await db.territories.get(territoryId)
    if (!fresh) return
    await db.territories.update(territoryId, { streets: fresh.streets.filter((s) => s.id !== street.id) })
  })
}

/**
 * Record a territory as completed and clear it.
 *
 * The completion is the app's only write-once record and the sole source of the Reports
 * completion figure. The territory is gone afterwards, so a failure between the two writes
 * loses the completion permanently with nothing left to reconstruct it from — hence one
 * transaction. Backing Streets entries are left alone by design; finishing a territory doesn't
 * discard the streets' house-by-house history.
 */
export async function completeTerritory(territoryId: number): Promise<void> {
  await db.transaction('rw', db.territoryCompletions, db.territories, async () => {
    const fresh = await db.territories.get(territoryId)
    if (!fresh) return
    await db.territoryCompletions.add({
      completedAt: Date.now(),
      name: fresh.name,
      streetCount: fresh.streets.length,
    } as TerritoryCompletion)
    await db.territories.delete(territoryId)
  })
}

/**
 * Log a call (and, optionally, the return visit scheduled from it), then attach the phone's
 * position afterwards.
 *
 * The write comes first, on purpose. The old flow awaited a high-accuracy GPS fix — up to ten
 * seconds at a door with poor signal, plus the OS permission prompt on first use — before
 * touching the database, so "Save Call" sat dead exactly when the person was standing on a
 * porch (AUDIT F035). Now the row is durable before `locate` is even called; the fix, if one
 * arrives, is patched onto it and nothing waits for it. The call and its appointment share one
 * transaction so an interruption can't leave a visit scheduled for a call that was never saved.
 *
 * Resolves to the new call id as soon as the rows are committed.
 */
export async function logCall(
  call: Omit<Call, 'id' | 'lat' | 'lng'>,
  returnVisit: Omit<Appointment, 'id'> | null,
  locate: () => Promise<{ lat: number; lng: number } | null>
): Promise<number> {
  const id = await db.transaction('rw', db.calls, db.appointments, async () => {
    const callId = (await db.calls.add(call as Call)) as number
    if (returnVisit) await db.appointments.add(returnVisit as Appointment)
    return callId
  })
  void locate()
    .then((loc) => (loc ? db.calls.update(id, { lat: loc.lat, lng: loc.lng }) : undefined))
    .catch(() => {})
  return id
}

/**
 * Write a decoded share as brand-new local records (never clobbering existing rows — unlike
 * backup restore), tagging each with `receivedFrom` for attribution. A territory also gets a
 * StreetEntry per street so it is managed identically to one drawn here.
 *
 * One transaction per import. A territory used to add N street entries and then the
 * territory outside any transaction, so a failure part-way left orphan entries and "try
 * again" created another set (AUDIT F040). Sender-assigned `TerritoryStreet.id`s are replaced:
 * two streets arriving with the same id made every toggle hit both (AUDIT F039).
 */
export async function importSharedPayload(payload: SharePayload): Promise<void> {
  const receivedFrom = { name: payload.from || 'a Meleo user', at: Date.now() }

  await db.transaction('rw', db.people, db.calls, db.streetEntries, db.territories, async () => {
    if (payload.kind === 'contact') {
      const { person, calls } = payload.data as ContactPayload
      const personId = (await db.people.add({
        ...stripInjectedKeys(person),
        createdAt: Date.now(),
        receivedFrom,
      } as Person)) as number
      for (const c of calls ?? []) {
        await db.calls.add({ ...stripInjectedKeys(c), personId } as Call)
      }
      return
    }

    if (payload.kind === 'street') {
      const data = payload.data as StreetPayload
      await db.streetEntries.add({ ...stripInjectedKeys(data), createdAt: Date.now(), receivedFrom } as StreetEntry)
      return
    }

    const data = payload.data as TerritoryPayload
    // Back each imported street with its own new StreetEntry (carrying the trace points),
    // linked via entryId. Same-named streets stay distinct (a new one gets a "(2)"/"(3)"
    // suffix); the only streets that share an entry are ones that pointed at the SAME sender
    // entry, deduped via `bySenderEntry` so a genuinely-single shared street isn't split.
    const existingNames = (await db.streetEntries.toArray()).map((e) => e.name)
    const bySenderEntry = new Map<number, number>()
    const streets: TerritoryStreet[] = []
    let n = 0
    for (const s of data.streets) {
      let entryId = s.entryId != null ? bySenderEntry.get(s.entryId) : undefined
      if (entryId == null) {
        const name = uniqueStreetName(s.name, existingNames)
        existingNames.push(name)
        entryId = (await db.streetEntries.add({
          name,
          city: s.city,
          state: s.state,
          zip: s.zip,
          houses: [],
          points: s.points,
          createdAt: Date.now(),
        })) as number
        if (s.entryId != null) bySenderEntry.set(s.entryId, entryId)
      }
      streets.push({ ...s, id: `imp-${Date.now().toString(36)}-${n++}`, entryId })
    }
    await db.territories.add({
      ...stripInjectedKeys(data),
      streets,
      createdAt: Date.now(),
      completed: false,
      grouped: true,
      receivedFrom,
    } as Territory)
  })
}
