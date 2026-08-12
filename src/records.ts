import { db, type Territory, type TerritoryCompletion, type TerritoryStreet } from './db'
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
