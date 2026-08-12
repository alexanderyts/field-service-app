import { describe, it, expect } from 'vitest'
import { deflate } from 'pako'
import { encodeSharePayload, decodeSharePayload, stripInjectedKeys, type SharePayload } from './share'

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
