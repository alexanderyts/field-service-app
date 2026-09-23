import { db, type Call, type Person, type StreetEntry, type Territory } from './db'
import { isObject as isRecord, okCallFields, okPersonFields, okStreetFields, okTerritoryFields } from './rowGuards'
import { STATUS_ORDER } from './contactStatus'

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

// A link can be sent (pasted into a message, tapped) far past the point where it stops being
// a scannable QR, so the two limits are separate. This one is about what survives being
// carried by a messaging app and re-opened by a browser — well under the ~2 KB some of them
// still truncate at. Past it, the file is the only honest transport.
export const MAX_LINK_URL_LEN = 1800

/** Whether this payload can travel as a tappable link, as opposed to only as a file. */
export function canShareAsLink(encoded: string): boolean {
  return buildShareUrl(encoded).length <= MAX_LINK_URL_LEN
}

// Import is the app's one untrusted-input boundary: a scanned link or a picked .meleo file
// comes from outside this device. These caps + shape checks keep a malformed or hostile
// payload from wedging the import — a huge encoded blob (real shares are single-digit KB), a
// pathologically large list, or an object shaped nothing like what the writer expects.
const MAX_ENCODED_LEN = 256 * 1024
const MAX_LIST = 2000
// MAX_LIST bounds how many elements a list can have, never how big one element is — a single
// contact name or house note could otherwise arrive at nearly MAX_INFLATED_LEN and get written
// straight to IndexedDB, then rendered into a list row on every paint (AUDIT F033). 10,000
// chars is far past any real name/address/note field and comfortably below anything that could
// wedge a phone.
const MAX_STR = 10_000
// Capping the *encoded* size isn't enough on its own: deflate ratios can exceed 1000:1, so a
// 256 KB payload could inflate to hundreds of MB and exhaust memory before JSON.parse — let
// alone before MAX_LIST gets a look. Real shares are single-digit KB inflated; 4 MB is far
// above anything legitimate and far below a level that could wedge a phone.
const MAX_INFLATED_LEN = 4 * 1024 * 1024
// The sender's name rides outside `data`, so the depth walk never saw it; it lands in
// `receivedFrom.name` and is rendered on every list row that carries the badge (AUDIT F039).
const MAX_FROM_LEN = 200

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Fields the payload *types* strip only at compile time. `Omit<Person, 'id' | …>` is erased
 * at runtime, so a hand-built payload can carry an `id` (or a `personId`, or a forged
 * `sharedWith`) straight through a spread into `db.<table>.add()`. An injected `id` either
 * collides with a real row — throwing ConstraintError mid-import, leaving a half-written
 * record — or jumps the auto-increment counter. Every one of these is set by the importer
 * itself, so removing them can never lose real data.
 */
const INJECTED_KEYS = ['id', 'personId', 'createdAt', 'sharedWith', 'receivedFrom', 'completed', 'grouped'] as const

/** Shallow copy of `record` with every locally-assigned field removed. */
export function stripInjectedKeys<T extends object>(record: T): T {
  const out = { ...record } as Record<string, unknown>
  for (const key of INJECTED_KEYS) delete out[key]
  return out as T
}

/** Walks a value at every depth, rejecting any string over MAX_STR or any array over
    MAX_LIST — closes the gap the per-kind checks below leave open: they cap `calls`/`houses`/
    `streets` themselves, but a TerritoryStreet's own nested `points`/`houses` arrays, or any
    string anywhere in the payload, were never bounded at all (AUDIT F033). */
function assertBoundedDepth(v: unknown): void {
  const bad = () => { throw new Error('This share is malformed and was not imported.') }
  if (typeof v === 'string') {
    if (v.length > MAX_STR) bad()
  } else if (Array.isArray(v)) {
    if (v.length > MAX_LIST) bad()
    for (const item of v) assertBoundedDepth(item)
  } else if (isObject(v)) {
    for (const value of Object.values(v)) assertBoundedDepth(value)
  }
}

/** Rejects a decoded payload whose data isn't shaped like the kind it claims to be, so
    importSharedPayload only ever spreads the expected fields into the local database.

    Every field a renderer reads is typed here (rowGuards.ts), not just `name`: a `lat` of
    "abc" or a `points` of [null] used to pass, get stored, and then throw inside Leaflet on
    every visit to the Map tab (AUDIT F039); an `assignedTo` or `literaturePlaced` that wasn't
    a string crashed the list that shows it (F054). */
function assertValidPayload(p: SharePayload): void {
  const bad = () => { throw new Error('This share is malformed and was not imported.') }
  const d = p.data as Record<string, unknown>
  if (!isObject(d)) bad()
  assertBoundedDepth(d)
  const okList = (v: unknown) => v == null || (Array.isArray(v) && v.length <= MAX_LIST)

  if (p.kind === 'contact') {
    const person = (d as { person?: unknown }).person
    if (!isRecord(person) || !okPersonFields(person)) bad()
    const status = (person as Record<string, unknown>).status
    if (status != null && !(STATUS_ORDER as string[]).includes(status as string)) bad()
    const calls = (d as { calls?: unknown }).calls
    if (!okList(calls)) bad()
    for (const c of (calls as unknown[] | undefined) ?? []) {
      if (!isRecord(c) || !okCallFields(c)) bad()
    }
  } else if (p.kind === 'street') {
    if (!okList(d.houses) || !okStreetFields(d)) bad()
  } else if (p.kind === 'territory') {
    if (!okList(d.streets) || !okTerritoryFields(d)) bad()
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

/** Marker so the size guard inside the inflate callback is distinguishable from a genuine
    pako failure once it surfaces out of `push`. */
class InflatedTooLarge extends Error {}

/** Streaming inflate that aborts as soon as the output passes MAX_INFLATED_LEN, rather than
    materializing the whole thing and measuring afterwards — throwing from pako's `onData`
    unwinds out of `push` mid-stream, so a decompression bomb never gets built in memory. */
async function inflateCapped(body: Uint8Array): Promise<Uint8Array> {
  const { Inflate } = await import('pako')
  const inflator = new Inflate()
  const chunks: Uint8Array[] = []
  let total = 0
  inflator.onData = (chunk) => {
    const bytes = chunk as Uint8Array
    total += bytes.length
    if (total > MAX_INFLATED_LEN) throw new InflatedTooLarge()
    chunks.push(bytes)
  }
  try {
    inflator.push(body, true)
  } catch (e) {
    if (e instanceof InflatedTooLarge) throw new Error('This share is too large to import.')
    throw new Error('This share is malformed and was not imported.')
  }
  if (inflator.err) throw new Error('This share is malformed and was not imported.')

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export async function decodeSharePayload(encoded: string): Promise<SharePayload> {
  if (typeof encoded !== 'string' || encoded.length > MAX_ENCODED_LEN) {
    throw new Error('This share is too large or malformed to import.')
  }
  const mode = encoded[0]
  const body = fromBase64Url(encoded.slice(1))
  let json: string
  if (mode === 'c') {
    json = new TextDecoder().decode(await inflateCapped(body))
  } else {
    json = new TextDecoder().decode(body)
  }
  const parsed = JSON.parse(json) as SharePayload
  if (parsed?.v !== 1 || !parsed.kind || !parsed.data) throw new Error('Not a valid Meleo share.')
  // `from` is attribution, never required: a missing or non-string one becomes anonymous, an
  // absurdly long one is hostile and the whole share is refused (AUDIT F039).
  if (typeof parsed.from !== 'string') parsed.from = ''
  if (parsed.from.length > MAX_FROM_LEN) throw new Error('This share is malformed and was not imported.')
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

// Importing a received payload lives in records.ts (`importSharedPayload`): it writes several
// tables, so it belongs with the other transactional multi-table operations (AUDIT F040).
