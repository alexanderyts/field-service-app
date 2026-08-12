import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, type Person, type Call, type Appointment, type Territory, type TerritoryStreet } from './db'
import { deleteContacts, groupStreetsIntoTerritory, sendStreetToMinistry, completeTerritory } from './records'

// These run against a real IndexedDB implementation (fake-indexeddb), not a mock, so they
// exercise the actual Dexie transactions — including whether a transaction's scope survives
// being handed to a helper in another module, which is the one thing tsc and a mock can't tell
// us and the one thing most likely to break these flows at runtime.

const pts = (n = 2) => Array.from({ length: n }, (_, i) => ({ lat: 32.3 + i / 100, lng: -90 - i / 100 }))

function street(id: string, name: string): TerritoryStreet {
  return { id, name, points: pts(), done: false }
}

async function seedDraft(streets: TerritoryStreet[]): Promise<number> {
  return (await db.territories.add({
    name: 'Custom Territory',
    createdAt: Date.now(),
    completed: false,
    streets,
  } as Territory)) as number
}

beforeEach(async () => {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
})

describe('deleteContacts', () => {
  it('removes each contact together with its calls and return visits', async () => {
    const keep = (await db.people.add({ name: 'Keep', status: 'interested', dateMet: 0, createdAt: 0 } as Person)) as number
    const drop = (await db.people.add({ name: 'Drop', status: 'interested', dateMet: 0, createdAt: 0 } as Person)) as number
    await db.calls.add({ personId: drop, date: 1 } as Call)
    await db.calls.add({ personId: drop, date: 2 } as Call)
    await db.calls.add({ personId: keep, date: 3 } as Call)
    await db.appointments.add({ title: 'RV', date: 4, durationMinutes: 30, personId: drop } as Appointment)
    await db.appointments.add({ title: 'RV', date: 5, durationMinutes: 30, personId: keep } as Appointment)

    await deleteContacts([drop])

    expect(await db.people.count()).toBe(1)
    // The orphan case: history outliving the person it belonged to.
    expect(await db.calls.where('personId').equals(drop).count()).toBe(0)
    expect(await db.appointments.where('personId').equals(drop).count()).toBe(0)
    expect(await db.calls.where('personId').equals(keep).count()).toBe(1)
    expect(await db.appointments.where('personId').equals(keep).count()).toBe(1)
  })

  it('handles several contacts at once and no-ops on an empty selection', async () => {
    const ids: number[] = []
    for (const name of ['A', 'B', 'C']) {
      ids.push((await db.people.add({ name, status: 'interested', dateMet: 0, createdAt: 0 } as Person)) as number)
    }
    await deleteContacts([])
    expect(await db.people.count()).toBe(3)
    await deleteContacts(ids.slice(0, 2))
    expect(await db.people.count()).toBe(1)
  })
})

describe('groupStreetsIntoTerritory', () => {
  it('creates the territory, backs each street with an entry, and leaves the rest in the draft', async () => {
    const draftId = await seedDraft([street('a', 'Oak St'), street('b', 'Elm St'), street('c', 'Pine St')])

    const newId = await groupStreetsIntoTerritory(draftId, new Set(['a', 'b']), '  North Side  ')
    expect(newId).not.toBeNull()

    const grouped = await db.territories.get(newId!)
    expect(grouped!.name).toBe('North Side')
    expect(grouped!.grouped).toBe(true)
    expect(grouped!.streets.map((s) => s.name).sort()).toEqual(['Elm St', 'Oak St'])

    // The whole point of the operation: every grouped street is linked to a real entry.
    expect(await db.streetEntries.count()).toBe(2)
    for (const s of grouped!.streets) {
      expect(s.entryId).toBeTypeOf('number')
      expect((await db.streetEntries.get(s.entryId!))!.name).toBe(s.name)
    }

    const draft = await db.territories.get(draftId)
    expect(draft!.streets.map((s) => s.id)).toEqual(['c'])
  })

  it('carries the trace and location onto the backing entry', async () => {
    const s = { ...street('a', 'Oak St'), city: 'Brandon', state: 'Mississippi', zip: '39042' }
    const draftId = await seedDraft([s])
    const newId = await groupStreetsIntoTerritory(draftId, ['a'], 'North Side')
    const entry = (await db.streetEntries.toArray())[0]
    expect(entry.city).toBe('Brandon')
    expect(entry.zip).toBe('39042')
    expect(entry.points).toHaveLength(2)
    expect((await db.territories.get(newId!))!.streets[0].points).toHaveLength(2)
  })

  it('keeps two same-named streets apart with a (2) suffix', async () => {
    const draftId = await seedDraft([street('a', 'Oak St'), street('b', 'Oak St')])
    await groupStreetsIntoTerritory(draftId, ['a', 'b'], 'North Side')
    const names = (await db.streetEntries.toArray()).map((e) => e.name).sort()
    expect(names).toEqual(['Oak St', 'Oak St (2)'])
  })

  it('does nothing without a name or a selection, leaving the draft untouched', async () => {
    const draftId = await seedDraft([street('a', 'Oak St')])
    expect(await groupStreetsIntoTerritory(draftId, ['a'], '   ')).toBeNull()
    expect(await groupStreetsIntoTerritory(draftId, [], 'North Side')).toBeNull()
    expect(await groupStreetsIntoTerritory(draftId, ['nope'], 'North Side')).toBeNull()
    expect(await db.streetEntries.count()).toBe(0)
    expect((await db.territories.get(draftId))!.streets).toHaveLength(1)
  })

  it('leaves nothing behind when the draft has gone', async () => {
    expect(await groupStreetsIntoTerritory(9999, ['a'], 'North Side')).toBeNull()
    expect(await db.streetEntries.count()).toBe(0)
    expect(await db.territories.count()).toBe(0)
  })
})

describe('sendStreetToMinistry', () => {
  it('moves the street: it ends up in Streets and is gone from the territory', async () => {
    const s = street('a', 'Oak St')
    const draftId = await seedDraft([s, street('b', 'Elm St')])

    await sendStreetToMinistry(draftId, s, { city: 'Brandon', state: 'Mississippi', zip: '39042' })

    const entries = await db.streetEntries.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('Oak St')
    expect(entries[0].city).toBe('Brandon')
    expect(entries[0].points).toHaveLength(2)
    expect(entries[0].houses).toEqual([])

    // The failure this replaced: the street existing in both places at once.
    const draft = await db.territories.get(draftId)
    expect(draft!.streets.map((s2) => s2.id)).toEqual(['b'])
  })
})

describe('completeTerritory', () => {
  it('records the completion and clears the territory in one step', async () => {
    const draftId = await seedDraft([street('a', 'Oak St'), street('b', 'Elm St')])

    await completeTerritory(draftId)

    const completions = await db.territoryCompletions.toArray()
    expect(completions).toHaveLength(1)
    expect(completions[0].name).toBe('Custom Territory')
    expect(completions[0].streetCount).toBe(2)
    expect(await db.territories.get(draftId)).toBeUndefined()
  })

  // The decision behind this is deliberate: completing a territory records the work and
  // clears the grouping, but never destroys what was learned working it. Houses, statuses
  // and notes outlive the territory.
  it('leaves the backing Streets entries alone — finishing a territory keeps their history', async () => {
    const draftId = await seedDraft([street('a', 'Oak St')])
    await groupStreetsIntoTerritory(draftId, ['a'], 'North Side')
    const grouped = (await db.territories.toArray()).find((t) => t.grouped)!
    const entryId = grouped.streets[0].entryId!
    await db.streetEntries.update(entryId, {
      houses: [{ id: 'h1', number: '342', status: 'not-home', note: 'Dog in the yard' }],
    })

    await completeTerritory(grouped.id)

    expect(await db.territories.get(grouped.id)).toBeUndefined()
    const entry = await db.streetEntries.get(entryId)
    expect(entry).toBeDefined()
    expect(entry!.houses).toHaveLength(1)
    expect(entry!.houses[0].status).toBe('not-home')
    expect(entry!.houses[0].note).toBe('Dog in the yard')
  })

  it('writes nothing for a territory that no longer exists', async () => {
    await completeTerritory(9999)
    expect(await db.territoryCompletions.count()).toBe(0)
  })
})
