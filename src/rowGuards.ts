// Runtime shape checks for rows arriving from outside the app — a share payload or a backup
// file. TypeScript types are erased at runtime, so a hand-edited or damaged file can put a
// number where a list renders `.trim()`, or an object where React renders text, and that row
// then crashes its tab on every launch (AUDIT F039, F054, F055).
//
// Each check is about types, not content: an optional field may be absent, but if present it
// must be the type the renderers assume. Only fields that are actually read are checked;
// unknown extra fields are harmless and left alone.

export type Obj = Record<string, unknown>

export function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
export const okStr = (v: unknown) => v == null || typeof v === 'string'
export const okNum = (v: unknown) => v == null || (typeof v === 'number' && Number.isFinite(v))
export const okBool = (v: unknown) => v == null || typeof v === 'boolean'
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown) => typeof v === 'string'

/** A coordinate is either absent on both axes or a finite number on both. */
export function okCoords(o: Obj): boolean {
  return okNum(o.lat) && okNum(o.lng) && (o.lat == null) === (o.lng == null)
}
export function okPoints(v: unknown): boolean {
  return v == null || (Array.isArray(v) && v.every((pt) => isObject(pt) && isNum(pt.lat) && isNum(pt.lng)))
}
export function okAddress(o: Obj): boolean {
  return okStr(o.street) && okStr(o.city) && okStr(o.state) && okStr(o.zip)
}
const okShareRef = (v: unknown) => v == null || (isObject(v) && isStr(v.name) && okNum(v.at))
const okShareRefs = (v: unknown) => v == null || (Array.isArray(v) && v.every(okShareRef))
const okShareState = (o: Obj) => okShareRefs(o.sharedWith) && okShareRef(o.receivedFrom)

const HOUSE_STATUSES = ['not-home', 'no-trespassing', 'other']

/** The fields of a contact every screen reads. `status` is checked by the caller: a share
    must use a known status, a backup may carry one from an older build. */
export function okPersonFields(p: Obj): boolean {
  return isStr(p.name) && okCoords(p) && okAddress(p) && okStr(p.phone) && okStr(p.notes) && okNum(p.dateMet)
    && okBool(p.married) && okStr(p.spouseName) && okBool(p.hasKids) && okStr(p.kidsInfo)
    && okBool(p.hasPets) && okStr(p.petsInfo) && okStr(p.status)
}

export function okCallFields(c: Obj): boolean {
  return okNum(c.date) && okCoords(c) && okStr(c.notes) && okStr(c.scriptures) && okBool(c.notHome)
    && okStr(c.leftAtDoor) && okNum(c.followUpDate) && okStr(c.literaturePlaced)
}

export function okHouse(h: unknown): boolean {
  return isObject(h) && isStr(h.number) && okStr(h.note)
    && (h.status == null || HOUSE_STATUSES.includes(h.status as string))
}

export function okStreetFields(s: Obj): boolean {
  return isStr(s.name) && okAddress(s) && okStr(s.notes) && okStr(s.assignedTo) && okPoints(s.points)
    && (s.houses == null || (Array.isArray(s.houses) && s.houses.every(okHouse)))
}

export function okTerritoryStreet(st: unknown): boolean {
  return isObject(st) && isStr(st.name) && okPoints(st.points) && okAddress(st) && okNum(st.entryId)
    && okStr(st.assignedTo) && okBool(st.done)
}

export function okTerritoryFields(t: Obj): boolean {
  return isStr(t.name) && okStr(t.assignedTo) && Array.isArray(t.streets) && t.streets.every(okTerritoryStreet)
}

const okBlocks = (v: unknown) =>
  Array.isArray(v) && v.every((b) => isObject(b) && isNum(b.start) && isNum(b.end) && isStr(b.category))

/** Checks for a stored row of each table, as a backup file carries it (ids included). */
export const TABLE_ROW_GUARDS: Record<string, (row: Obj) => boolean> = {
  people: (r) => isNum(r.id) && okPersonFields(r) && okNum(r.createdAt) && okShareState(r),
  calls: (r) => isNum(r.id) && isNum(r.personId) && isNum(r.date) && okCallFields(r),
  timeLogs: (r) => isNum(r.id) && isNum(r.date) && isNum(r.minutes) && (r.category === 'ministry' || r.category === 'credit')
    && okStr(r.note) && okStr(r.activityNote) && okNum(r.startedAt) && okNum(r.endedAt),
  appointments: (r) => isNum(r.id) && isNum(r.date) && okStr(r.title) && okNum(r.durationMinutes) && okNum(r.personId) && okStr(r.notes),
  schedulePrefs: (r) => isNum(r.id) && Array.isArray(r.daysOut) && r.daysOut.every(isNum)
    && okNum(r.weeklyHours) && okNum(r.yearlyHours) && okNum(r.monthlyHours) && okBool(r.completedSurvey) && okBool(r.isPioneer)
    && (r.dateOverrides == null || (isObject(r.dateOverrides) && Object.values(r.dateOverrides).every(okBlocks)))
    && (r.daySchedule == null || isObject(r.daySchedule)),
  streetEntries: (r) => isNum(r.id) && okStreetFields(r) && Array.isArray(r.houses) && okNum(r.createdAt) && okShareState(r),
  territories: (r) => isNum(r.id) && okTerritoryFields(r) && okBool(r.completed) && okBool(r.grouped) && okNum(r.createdAt) && okShareState(r),
  territoryCompletions: (r) => isNum(r.id) && isNum(r.completedAt) && okStr(r.name) && okNum(r.streetCount),
}

/** The first bad row in `rows` for `table`, as "table #index", or null if every row passes.
    A table this build has no guard for passes: it can only have come from this build. */
export function findBadRow(table: string, rows: unknown[]): string | null {
  const guard = TABLE_ROW_GUARDS[table]
  if (!guard) return null
  const i = rows.findIndex((r) => !isObject(r) || !guard(r))
  return i < 0 ? null : `${table} #${i + 1}`
}
