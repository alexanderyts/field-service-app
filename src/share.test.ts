import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { deflate } from 'pako'
import { db, type Person } from './db'
import {
  encodeSharePayload,
  decodeSharePayload,
  stripInjectedKeys,
  importSharedPayload,
  type SharePayload,
} from './share'

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Import is the one untrusted-input boundary, so these lock the decode-time guards:
// well-formed payloads round-trip, malformed / oversized ones are rejected before any
// database write happens.

describe('decodeSharePayload — trust boundary', () => {
  it('round-trips a valid contact payload', async () => {
    const payload: SharePayload = {
      v: 1,
      kind: 'contact',
      from: 'Tester',
      data: { person: { name: 'Jane Doe', status: 'interested', dateMet: 0 }, calls: [] },
    }
    const decoded = await decodeSharePayload(await encodeSharePayload(payload))
    expect(decoded.kind).toBe('contact')
    expect((decoded.data as { person: { name: string } }).person.name).toBe('Jane Doe')
  })

  it('rejects a contact with no name', async () => {
    const bad = { v: 1, kind: 'contact', from: 'x', data: { calls: [] } } as unknown as SharePayload
    const encoded = await encodeSharePayload(bad)
    await expect(decodeSharePayload(encoded)).rejects.toThrow(/malformed/i)
  })

  it('rejects an unknown kind', async () => {
    const bad = { v: 1, kind: 'evil', from: 'x', data: { name: 'x' } } as unknown as SharePayload
    const encoded = await encodeSharePayload(bad)
    await expect(decodeSharePayload(encoded)).rejects.toThrow()
  })

  it('rejects a territory with an over-long streets list', async () => {
    const streets = Array.from({ length: 2001 }, (_, i) => ({ id: `${i}`, name: 'S', points: [], done: false }))
    const bad = { v: 1, kind: 'territory', from: 'x', data: { name: 'T', streets } } as unknown as SharePayload
    const encoded = await encodeSharePayload(bad)
    await expect(decodeSharePayload(encoded)).rejects.toThrow(/malformed/i)
  })

  it('rejects an oversized encoded blob before decoding', async () => {
    await expect(decodeSharePayload('r' + 'A'.repeat(300 * 1024))).rejects.toThrow(/too large|malformed/i)
  })

  it('rejects a non-Meleo payload', async () => {
    const encoded = await encodeSharePayload({ hello: 'world' } as unknown as SharePayload)
    await expect(decodeSharePayload(encoded)).rejects.toThrow(/not a valid/i)
  })

  // A decompression bomb: highly-repetitive input deflates far below the 256 KB encoded cap
  // while inflating well past the 4 MB output cap, so only an output-side limit catches it.
  it('rejects a decompression bomb that passes the encoded-size cap', async () => {
    const bomb = deflate(new Uint8Array(64 * 1024 * 1024))
    const encoded = 'c' + toBase64Url(bomb)
    expect(encoded.length).toBeLessThan(256 * 1024)
    await expect(decodeSharePayload(encoded)).rejects.toThrow(/too large/i)
  })

  it('still accepts a payload comfortably under the inflated cap', async () => {
    const payload: SharePayload = {
      v: 1,
      kind: 'street',
      from: 'Tester',
      data: { name: 'Main St', houses: Array.from({ length: 500 }, (_, i) => ({ id: `${i}`, number: `${i}` })) },
    }
    const decoded = await decodeSharePayload(await encodeSharePayload(payload))
    expect((decoded.data as { houses: unknown[] }).houses).toHaveLength(500)
  })

  it('rejects a corrupt compressed body without crashing', async () => {
    await expect(decodeSharePayload('c' + toBase64Url(new Uint8Array([1, 2, 3, 4, 5])))).rejects.toThrow(/malformed/i)
  })
})

describe('stripInjectedKeys — runtime id removal', () => {
  it('removes every locally-assigned field a payload could carry', () => {
    const hostile = {
      id: 5,
      personId: 9,
      createdAt: 1,
      sharedWith: [{ name: 'forged', at: 0 }],
      receivedFrom: { name: 'forged', at: 0 },
      completed: true,
      grouped: false,
      name: 'Jane Doe',
    }
    expect(stripInjectedKeys(hostile)).toEqual({ name: 'Jane Doe' })
  })

  it('leaves a well-formed payload untouched', () => {
    const clean = { name: 'Main St', city: 'Brandon', houses: [] }
    expect(stripInjectedKeys(clean)).toEqual(clean)
  })

  it('does not mutate its input', () => {
    const input = { id: 3, name: 'x' }
    stripInjectedKeys(input)
    expect(input.id).toBe(3)
  })
})

// Import writes to the database, so these run against fake-indexeddb rather than asserting on
// the payload alone — the point of F014 is what actually lands in a table.
describe('importSharedPayload — what reaches the database', () => {
  beforeEach(async () => {
    await db.open()
    await db.transaction('rw', db.tables, async () => {
      for (const t of db.tables) await t.clear()
    })
  })

  it('imports a contact and its calls as new records', async () => {
    await importSharedPayload({
      v: 1,
      kind: 'contact',
      from: 'Sam',
      data: {
        person: { name: 'Jane Doe', status: 'interested', dateMet: 0 },
        calls: [{ date: 1, notes: 'first' }, { date: 2, notes: 'second' }],
      },
    } as SharePayload)

    const people = await db.people.toArray()
    expect(people).toHaveLength(1)
    expect(people[0].name).toBe('Jane Doe')
    expect(people[0].receivedFrom?.name).toBe('Sam')

    const calls = await db.calls.toArray()
    expect(calls).toHaveLength(2)
    // Calls must hang off the LOCAL new person, not any id the sender supplied.
    expect(calls.every((c) => c.personId === people[0].id)).toBe(true)
  })

  it('ignores an injected primary key instead of colliding with a real row', async () => {
    const mine = (await db.people.add({ name: 'Mine', status: 'interested', dateMet: 0, createdAt: 0 } as Person)) as number

    // A hand-built payload naming an id that already exists. Before F014 this reached
    // db.people.add() and threw ConstraintError, aborting the import part-way.
    await importSharedPayload({
      v: 1,
      kind: 'contact',
      from: 'Attacker',
      data: {
        person: { id: mine, name: 'Injected', status: 'interested', dateMet: 0, sharedWith: [{ name: 'forged', at: 0 }] },
        calls: [],
      },
    } as unknown as SharePayload)

    const people = await db.people.toArray()
    expect(people).toHaveLength(2)
    expect((await db.people.get(mine))!.name).toBe('Mine')
    const imported = people.find((p) => p.name === 'Injected')!
    expect(imported.id).not.toBe(mine)
    expect(imported.sharedWith).toBeUndefined()
    expect(imported.receivedFrom?.name).toBe('Attacker')
  })

  it('imports a territory, backing each street with its own entry', async () => {
    await importSharedPayload({
      v: 1,
      kind: 'territory',
      from: 'Sam',
      data: {
        name: 'North Side',
        streets: [
          { id: 'a', name: 'Oak St', points: [{ lat: 32.3, lng: -90 }], done: false, entryId: 7 },
          { id: 'b', name: 'Elm St', points: [{ lat: 32.4, lng: -90.1 }], done: false, entryId: 8 },
        ],
      },
    } as unknown as SharePayload)

    const territories = await db.territories.toArray()
    expect(territories).toHaveLength(1)
    expect(territories[0].grouped).toBe(true)

    const entries = await db.streetEntries.toArray()
    expect(entries).toHaveLength(2)
    // The sender's entryIds are theirs, not ours — each street must point at a local entry.
    for (const s of territories[0].streets) {
      expect([7, 8]).not.toContain(s.entryId)
      expect(entries.some((e) => e.id === s.entryId)).toBe(true)
    }
  })

  it('gives two streets that shared one sender entry the same local entry', async () => {
    await importSharedPayload({
      v: 1,
      kind: 'territory',
      from: 'Sam',
      data: {
        name: 'North Side',
        streets: [
          { id: 'a', name: 'Oak St', points: [{ lat: 32.3, lng: -90 }], done: false, entryId: 7 },
          { id: 'b', name: 'Oak St', points: [{ lat: 32.5, lng: -90.2 }], done: false, entryId: 7 },
        ],
      },
    } as unknown as SharePayload)

    expect(await db.streetEntries.count()).toBe(1)
    const streets = (await db.territories.toArray())[0].streets
    expect(streets[0].entryId).toBe(streets[1].entryId)
  })
})
