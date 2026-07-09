import { db, uniqueStreetName, type Call, type Person, type StreetEntry, type Territory, type TerritoryStreet } from './db'

// Cross-device sharing of a single contact / street / territory. The payload is compressed
// (pako, lazy-loaded) and base64url-encoded, then carried in a deep-link URL *hash* — the
// receiver scans the QR with any camera app, which opens Meleo at that URL; App.tsx reads
// the hash and offers to import. The hash is client-side only, so the data never touches a
// server (preserving the app's local-first, no-backend privacy stance). Items too large
// for one reliably-scannable QR fall back to sharing the same encoded payload as a file.

export type ShareKind = 'contact' | 'street' | 'territory'

/** A contact's transferable fields — its Person row plus its call history, both stripped
    of local ids/foreign keys (the receiver assigns fresh ones). */
export interface ContactPayload {
  person: Omit<Person, 'id' | 'createdAt' | 'sharedWith' | 'receivedFrom'>
  calls: Omit<Call, 'id' | 'personId'>[]
}
export type StreetPayload = Omit<StreetEntry, 'id' | 'createdAt' | 'sharedWith' | 'receivedFrom'>
export type TerritoryPayload = Omit<Territory, 'id' | 'createdAt' | 'completed' | 'sharedWith' | 'receivedFrom'>

export interface SharePayload {
  v: 1
  kind: ShareKind
  /** The sharer's own name (from their on-device profile), recorded as the receiver's
      `receivedFrom`. */
  from: string
  data: ContactPayload | StreetPayload | TerritoryPayload
}

// A conservative budget for the whole deep-link URL when it's going into a QR — beyond
// this the QR gets too dense to scan reliably off a phone screen, so we switch to the
// file fallback instead. (qrcode's own "data too big" throw is a second backstop.)
export const MAX_QR_URL_LEN = 1200

// Import is the app's one untrusted-input boundary: a scanned link or a picked .meleo file
// comes from outside this device. These caps + shape checks keep a malformed or hostile
// payload from wedging the import — a huge encoded blob (real shares are single-digit KB), a
// pathologically large list, or an object shaped nothing like what the writer expects.
const MAX_ENCODED_LEN = 256 * 1024
const MAX_LIST = 2000

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Rejects a decoded payload whose data isn't shaped like the kind it claims to be, so
    importSharedPayload only ever spreads the expected fields into the local database. */
function assertValidPayload(p: SharePayload): void {
  const bad = () => { throw new Error('This share is malformed and was not imported.') }
  const d = p.data as Record<string, unknown>
  if (!isObject(d)) bad()
  const okList = (v: unknown) => v == null || (Array.isArray(v) && v.length <= MAX_LIST)
  if (p.kind === 'contact') {
    const person = (d as { person?: unknown }).person
    if (!isObject(person) || typeof person.name !== 'string') bad()
    if (!okList((d as { calls?: unknown }).calls)) bad()
  } else if (p.kind === 'street') {
    if (typeof d.name !== 'string' || !okList(d.houses)) bad()
  } else if (p.kind === 'territory') {
    if (typeof d.name !== 'string' || !Array.isArray(d.streets) || d.streets.length > MAX_LIST) bad()
  } else {
    bad()
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Serialize + compress a payload to a self-describing base64url string. The one-char
    prefix records whether the body is compressed ('c') or raw ('r') so tiny payloads can
    skip compression and still decode unambiguously. */
export async function encodeSharePayload(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload)
  const raw = new TextEncoder().encode(json)
  const { deflate } = await import('pako')
  const compressed = deflate(raw)
  // Only keep the compressed form if it actually wins (it won't for very small payloads,
  // where deflate's header overhead makes it larger).
  if (compressed.length < raw.length) return 'c' + toBase64Url(compressed)
  return 'r' + toBase64Url(raw)
}

export async function decodeSharePayload(encoded: string): Promise<SharePayload> {
  if (typeof encoded !== 'string' || encoded.length > MAX_ENCODED_LEN) {
    throw new Error('This share is too large or malformed to import.')
  }
  const mode = encoded[0]
  const body = fromBase64Url(encoded.slice(1))
  let json: string
  if (mode === 'c') {
    const { inflate } = await import('pako')
    json = new TextDecoder().decode(inflate(body))
  } else {
    json = new TextDecoder().decode(body)
  }
  const parsed = JSON.parse(json) as SharePayload
  if (parsed?.v !== 1 || !parsed.kind || !parsed.data) throw new Error('Not a valid Meleo share.')
  assertValidPayload(parsed)
  return parsed
}

/** The full deep-link URL a QR encodes — absolute, so scanning it from another device
    opens this exact app. Uses BASE_URL so it resolves under GitHub Pages' subpath and at
    a domain root alike. */
export function buildShareUrl(encoded: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}#i=${encoded}`
}

/** Pulls the encoded payload out of a `#i=…` hash, or null if this isn't an import link. */
export function parseImportHash(hash: string): string | null {
  const m = hash.match(/^#i=(.+)$/)
  return m ? m[1] : null
}

/** Reads a picked `.meleo` file (the size-fallback transport) back to its encoded payload
    string — the same string a QR carries, so both feed one import path. */
export async function readMeleoFile(file: File): Promise<string> {
  if (file.size > MAX_ENCODED_LEN) throw new Error('This file is too large to be a Meleo share.')
  const text = (await file.text()).trim()
  if (!text) throw new Error('Empty file.')
  return text
}

/** A short human summary of what a decoded payload will import, for the confirm dialog. */
export function describePayload(payload: SharePayload): { kindLabel: string; name: string } {
  if (payload.kind === 'contact') {
    return { kindLabel: 'contact', name: (payload.data as ContactPayload).person.name }
  }
  if (payload.kind === 'street') {
    return { kindLabel: 'street', name: (payload.data as StreetPayload).name }
  }
  return { kindLabel: 'territory', name: (payload.data as TerritoryPayload).name }
}

// ── Building a payload from a stored record ──────────────────────────────────

export async function buildContactPayload(personId: number, from: string): Promise<SharePayload> {
  const person = await db.people.get(personId)
  if (!person) throw new Error('Contact not found.')
  const calls = await db.calls.where('personId').equals(personId).toArray()
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { id, createdAt, sharedWith, receivedFrom, ...personData } = person
  const strippedCalls = calls.map(({ id: _cid, personId: _pid, ...c }) => c)
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return { v: 1, kind: 'contact', from, data: { person: personData, calls: strippedCalls } }
}

export function buildStreetPayload(entry: StreetEntry, from: string): SharePayload {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { id, createdAt, sharedWith, receivedFrom, ...data } = entry
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return { v: 1, kind: 'street', from, data }
}

/** Builds a share payload from a street traced on the map (name + points, no house numbers
    yet) — so a draft custom-territory street can be shared before it's sent to Ministry. */
export function buildTracedStreetPayload(street: { name: string; points: { lat: number; lng: number }[] }, from: string): SharePayload {
  return { v: 1, kind: 'street', from, data: { name: street.name, points: street.points, houses: [] } }
}

export function buildTerritoryPayload(territory: Territory, from: string): SharePayload {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { id, createdAt, completed, sharedWith, receivedFrom, ...data } = territory
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return { v: 1, kind: 'territory', from, data }
}

/** Records, on the owner's local copy, that this item was handed to `recipientName` now —
    appended so the full sharing history (and the edit-warning) is preserved. */
export async function recordShare(kind: ShareKind, id: number, recipientName: string): Promise<void> {
  const ref = { name: recipientName, at: Date.now() }
  const table = kind === 'contact' ? db.people : kind === 'street' ? db.streetEntries : db.territories
  const existing = await table.get(id)
  if (!existing) return
  const sharedWith = [...(existing.sharedWith ?? []), ref]
  await table.update(id, { sharedWith })
}

// ── QR image + file transport ────────────────────────────────────────────────

/** Renders the deep-link URL to a QR PNG data URL, or null if the data is too dense to
    encode as a scannable code (caller then uses the file fallback). qrcode is lazy-loaded
    since it's only needed in the share flow. */
export async function generateQrDataUrl(url: string): Promise<string | null> {
  if (url.length > MAX_QR_URL_LEN) return null
  try {
    const QRCode = (await import('qrcode')).default
    return await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 320 })
  } catch {
    return null
  }
}

/** Hands the encoded payload to the OS as a small `.meleo` file — the size-fallback
    transport. Mirrors backup.ts's exportBackup: native share sheet first (reliable on
    iOS), `<a download>` otherwise. */
export async function shareEncodedFile(encoded: string, baseName: string): Promise<'shared' | 'downloaded'> {
  const filename = `${baseName}.meleo`
  const text = encoded
  try {
    const file = new File([text], filename, { type: 'application/octet-stream' })
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Meleo share' })
        return 'shared'
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return 'shared'
      }
    }
  } catch { /* File/share unsupported — fall through to download */ }

  const blob = new Blob([text], { type: 'application/octet-stream' })
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objUrl), 1500)
  return 'downloaded'
}

// ── Importing a received payload as NEW records ──────────────────────────────

/** Writes a decoded payload as brand-new local records (never clobbering existing rows —
    unlike backup restore), tagging each with `receivedFrom` for attribution. A territory
    also gets empty StreetEntry mirrors per street so the per-street "Houses" affordance
    works, matching what the map draw-flow creates. */
export async function importSharedPayload(payload: SharePayload): Promise<void> {
  const receivedFrom = { name: payload.from || 'a Meleo user', at: Date.now() }

  if (payload.kind === 'contact') {
    const { person, calls } = payload.data as ContactPayload
    const personId = (await db.people.add({
      ...person,
      createdAt: Date.now(),
      receivedFrom,
    } as Person)) as number
    for (const c of calls) {
      await db.calls.add({ ...c, personId } as Call)
    }
    return
  }

  if (payload.kind === 'street') {
    const data = payload.data as StreetPayload
    await db.streetEntries.add({ ...data, createdAt: Date.now(), receivedFrom } as StreetEntry)
    return
  }

  const data = payload.data as TerritoryPayload
  // Back each imported street with its own new StreetEntry (carrying the trace points), linked via
  // entryId — so imported territory streets are managed identically to standalone ones and show up
  // in the Streets list. Same-named streets stay distinct (a new one gets a "(2)"/"(3)" suffix);
  // the only streets that share an entry are ones that pointed at the SAME sender entry, deduped
  // via `bySenderEntry` so a genuinely-single shared street isn't split in two.
  const existingNames = (await db.streetEntries.toArray()).map((e) => e.name)
  const bySenderEntry = new Map<number, number>()
  const streets: TerritoryStreet[] = []
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
    streets.push({ ...s, entryId })
  }
  await db.territories.add({
    ...data,
    streets,
    createdAt: Date.now(),
    completed: false,
    grouped: true,
    receivedFrom,
  } as Territory)
}
