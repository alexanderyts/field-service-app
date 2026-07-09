import { describe, it, expect } from 'vitest'
import { encodeSharePayload, decodeSharePayload, type SharePayload } from './share'

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
})
