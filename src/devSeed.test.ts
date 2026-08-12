import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import { db } from './db'
import { compareHouseNumbers } from './db'
import { seedDemoData } from './devSeed'

// The demo seed is dev-only, but it's what every manual test of the app starts from — so if
// it stops producing the things those tests need (a draft territory to group from, streets
// with houses to edit), the manual pass silently tests nothing. Cheap to assert, easy to
// forget otherwise.

beforeAll(async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      store: new Map<string, string>(),
      getItem(k: string) { return this.store.get(k) ?? null },
      setItem(k: string, v: string) { this.store.set(k, v) },
      removeItem(k: string) { this.store.delete(k) },
      get length() { return this.store.size },
      key(i: number) { return [...this.store.keys()][i] ?? null },
    },
    configurable: true,
    writable: true,
  })
  await seedDemoData()
}, 60_000)

describe('seedDemoData', () => {
  it('fills the tables a preview needs', async () => {
    expect(await db.people.count()).toBeGreaterThan(20)
    expect(await db.calls.count()).toBeGreaterThan(20)
    expect(await db.timeLogs.count()).toBeGreaterThan(50)
    expect(await db.appointments.count()).toBeGreaterThan(0)
  })

  it('seeds a DRAFT territory — the only place group / send / complete are reachable', async () => {
    const draft = (await db.territories.toArray()).find((t) => !t.grouped && !t.completed)
    expect(draft, 'no draft territory: the Map tab flows cannot be tested').toBeDefined()
    expect(draft!.streets.length).toBeGreaterThanOrEqual(2)
    // Draft streets are unbacked, exactly as a fresh trace would be — grouping is what
    // creates their entries, so pre-linking them would test the wrong thing.
    expect(draft!.streets.every((s) => s.entryId === undefined)).toBe(true)
    expect(draft!.streets.every((s) => s.points.length >= 2)).toBe(true)
  })

  it('seeds a grouped territory whose streets are each backed by a real entry', async () => {
    const grouped = (await db.territories.toArray()).find((t) => t.grouped)
    expect(grouped).toBeDefined()
    expect(grouped!.streets.length).toBeGreaterThan(0)
    for (const s of grouped!.streets) {
      expect(s.entryId).toBeTypeOf('number')
      expect(await db.streetEntries.get(s.entryId!)).toBeDefined()
    }
  })

  it('seeds streets with houses in mixed states, for the house-editing pass', async () => {
    const entries = await db.streetEntries.toArray()
    expect(entries.length).toBeGreaterThanOrEqual(4)

    const houses = entries.flatMap((e) => e.houses)
    expect(houses.length).toBeGreaterThan(20)
    expect(houses.some((h) => h.status === 'not-home')).toBe(true)
    expect(houses.some((h) => h.status === undefined)).toBe(true)
    expect(houses.some((h) => h.note)).toBe(true)
    // A lettered number somewhere, so walk-order sorting has something to prove.
    expect(houses.some((h) => /[A-Za-z]/.test(h.number))).toBe(true)
  })

  it('gives every house a unique id within its street', async () => {
    for (const e of await db.streetEntries.toArray()) {
      expect(new Set(e.houses.map((h) => h.id)).size).toBe(e.houses.length)
    }
  })

  it('sorts seeded house numbers in walk order', async () => {
    const entry = (await db.streetEntries.toArray())[0]
    const sorted = [...entry.houses].sort((a, b) => compareHouseNumbers(a.number, b.number))
    expect(sorted.map((h) => h.number)).toEqual(entry.houses.map((h) => h.number))
  })

  it('seeds past completions so Reports has a figure to show', async () => {
    expect(await db.territoryCompletions.count()).toBeGreaterThan(0)
  })
})
