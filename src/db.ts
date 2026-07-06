import Dexie, { type EntityTable } from 'dexie'

export type ContactStatus =
  | 'interested'
  | 'return-visit'
  | 'bible-study'
  | 'informal-visit'
  | 'not-interested'
  | 'do-not-call'
  | 'moved'

/** One end of a share transfer — a person's name plus when it happened. `sharedWith` (on
    the owner's copy) is a list, appended each time they hand the item to someone; a
    receiver's copy carries a single `receivedFrom`. Optional/non-indexed, so no Dexie
    version bump is needed to add these to existing records. */
export interface ShareRef {
  name: string
  at: number
}

export interface Person {
  id: number
  name: string
  street?: string
  city?: string
  state?: string
  zip?: string
  lat?: number
  lng?: number
  status: ContactStatus
  dateMet: number
  phone?: string
  married?: boolean
  spouseName?: string
  hasKids?: boolean
  kidsInfo?: string
  hasPets?: boolean
  petsInfo?: string
  /** Freeform notes about the person — anything else worth remembering. */
  notes?: string
  createdAt: number
  /** Who this contact has been shared with (owner's copy) / who shared it here (receiver's
      copy) — see ShareRef. */
  sharedWith?: ShareRef[]
  receivedFrom?: ShareRef
}

export interface Call {
  id: number
  personId: number
  date: number
  notHome?: boolean
  notes?: string
  scriptures?: string
  /** What was left at the door, only relevant when notHome is true. */
  leftAtDoor?: string
  followUpDate?: number
  /** Literature left/placed during this visit, if any (e.g. a tract or magazine title). */
  literaturePlaced?: string
  lat?: number
  lng?: number
}

export type TimeCategory = 'ministry' | 'ldc' | 'hlc' | 'convention' | 'assembly' | 'bethel' | 'other'

/** One suggested (planned) window of time on a weekly-schedule day — minutes since
    midnight, typed by ministry category so a morning of ministry and an afternoon of
    LDC can coexist on the same day. */
export interface DayScheduleBlock {
  start: number
  end: number
  category: TimeCategory
}

export interface TimeLog {
  id: number
  date: number
  minutes: number
  category: TimeCategory
  note?: string
}

export interface Appointment {
  id: number
  title: string
  date: number
  durationMinutes: number
  personId?: number
  notes?: string
}

export interface SchedulePrefs {
  id: number
  completedSurvey: boolean
  /** Regular pioneers get the full hour-based survey/tracking; everyone else gets a
      simplified day-based one. Missing on records saved before this field existed —
      treat as `true` there, since the old survey WAS the pioneer survey. */
  isPioneer?: boolean
  daysOut: number[]
  weeklyHours: number
  yearlyHours: number
  /** Per-day suggested schedule (day-of-week key, 0=Sun..6=Sat). The current shape is
      `blocks` — any number of typed time windows per day (e.g. ministry in the morning,
      LDC in the afternoon), each purely a planning suggestion, never logged automatically.
      The loose top-level `start`/`end`/`creditMin`/`creditCategory` fields are legacy
      shapes from before blocks existed (single ministry window + optional credit amount);
      records that still carry them are normalized into blocks at read time (see
      dayScheduleBlocks in Schedule.tsx) rather than migrated in place. */
  daySchedule?: Record<
    number,
    {
      start?: number
      end?: number
      creditMin?: number
      creditCategory?: TimeCategory
      blocks?: DayScheduleBlock[]
    }
  >
  /** One-off suggested schedules for specific dates (keyed `YYYY-MM-DD`) — saved when
      someone answers "just this day" instead of "repeat weekly". A date present here
      completely shadows that date's weekly daySchedule entry. */
  dateOverrides?: Record<string, DayScheduleBlock[]>
  /** Non-pioneers only — an optional self-set goal. Choosing weekly, monthly, or yearly
      turns on real hour tracking (daysOut/weeklyHours/yearlyHours) for them, same as a
      pioneer's, just measured against their own goal instead of the fixed 600h/year. The
      period decides which progress bar leads and which figure the goal-amount prompt
      collects. */
  goalPeriod?: 'none' | 'weekly' | 'monthly' | 'yearly'
  /** Non-pioneers with a `monthly` goal — the monthly hour figure they entered directly
      (rather than one derived from a weekly target). Absent for every other goalPeriod;
      `weeklyHours` is still kept in sync (monthly ÷ 4.3) so week-schedule planning and the
      calendar goal rings have a weekly number to size against. */
  monthlyHours?: number
  /** Which view the Service Schedule card opens into when expanded from the mini-week — the
      week grid (default) or the month calendar. The collapsed quick-toggle opens the other one. */
  scheduleDefaultExpand?: 'week' | 'calendar'
}

/** Why a house is worth flagging on a return pass — kept deliberately small. 'none' is the
    default (nothing special) and is stored implicitly by leaving status undefined. */
export type HouseStatus = 'not-home' | 'no-trespassing' | 'other'

/** One house number on a street entry. `number` is a free string (not numeric) so unit
    letters and suffixes like "123A" or "12-B" survive; entries are sorted numerically at
    display time by parsing the leading digits (see compareHouseNumbers). */
export interface StreetHouse {
  id: string
  number: string
  status?: HouseStatus
  note?: string
}

/** A street the publisher is tracking door-to-door — the list of house numbers worked on a
    given road, with per-house flags/notes. Distinct from a Territory (a hand-traced map
    shape): a StreetEntry is the address-book side. A street traced on the map is only added
    here when the user explicitly "sends it to Ministry" (or groups it into a territory) — at
    which point its traced `points` come along so it still shows on the Territory Map. */
export interface StreetEntry {
  id: number
  name: string
  city?: string
  state?: string
  zip?: string
  houses: StreetHouse[]
  createdAt: number
  /** Free-text notes about the whole street — anything worth remembering that isn't tied to a
      single house number (e.g. "spoke to the older couple mid-block, wants a return visit"). */
  notes?: string
  /** Free-text name of whoever this individual street was handed to — not a Person FK,
      just a lightweight note (matches how territory assignment works too). */
  assignedTo?: string
  /** The traced map shape, if this street came from (or was sent from) a map trace — lets it
      keep rendering on the Territory Map after it leaves the draft custom-territory list. */
  points?: { lat: number; lng: number }[]
  sharedWith?: ShareRef[]
  receivedFrom?: ShareRef
}

export interface TerritoryStreet {
  /** Local to the territory, not a Dexie primary key — just needs to be unique within streets[]. */
  id: string
  name: string
  points: { lat: number; lng: number }[]
  done: boolean
  /** Reverse-geocoded location of the trace, captured once at draw time (from the same lookup that
      suggests the street name) so grouping/sending/importing can seed the backing StreetEntry's
      address without extra geocode calls, and a territory can show where it is. */
  city?: string
  state?: string
  zip?: string
  /** The backing StreetEntry (Ministry → Streets) that holds this street's house numbers, notes,
      and share state — so a street is managed identically whether it's standalone or in a territory.
      Set when the group/import/manage flow creates or links the entry. Missing on rows that predate
      this field; resolveStreetEntry falls back to matching by name there. */
  entryId?: number
  /** Free-text name of whoever this specific street was handed to — independent of any
      territory-level assignment, so each street in a group can go to a different person. */
  assignedTo?: string
}

/** A short "City, ST" (or just "City") label for a set of streets — the most common city among
    them — used to show where a territory or street grouping sits. Undefined when no street has a
    city on file yet. */
export function commonLocationLabel(items: { city?: string; state?: string }[]): string | undefined {
  const counts = new Map<string, number>()
  for (const it of items) {
    const city = it.city?.trim()
    if (!city) continue
    const st = it.state?.trim()
    const key = st ? `${city}, ${st}` : city
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best: string | undefined
  let bestN = 0
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n }
  return best
}

/** The StreetEntry that backs a territory street, or undefined if none exists yet. Prefers the
    explicit entryId link; falls back to a case-insensitive name match for legacy rows (the app
    linked streets by name before entryId existed). */
export function resolveStreetEntry(
  street: Pick<TerritoryStreet, 'entryId' | 'name'>,
  entries: StreetEntry[]
): StreetEntry | undefined {
  if (street.entryId != null) {
    const byId = entries.find((e) => e.id === street.entryId)
    if (byId) return byId
  }
  const key = street.name.trim().toLowerCase()
  return entries.find((e) => e.name.trim().toLowerCase() === key)
}

/** A hand-traced, disposable group of streets someone is working door to door — not the
    congregation's permanent territory records, just a lightweight way to carve out and
    share "this group of streets" for a single outing. Streets live as a plain array on
    the territory rather than their own table, since they're never queried independently
    of their parent territory. */
export interface Territory {
  id: number
  name: string
  createdAt: number
  completed: boolean
  /** True once "Group Selected into a Territory" has finalized this record with a real
      name — it then shows up as a durable entry in the Ministry tab's Territories view,
      and the Map tab stops treating it as the active draft to draw new streets into. */
  grouped?: boolean
  /** Free-text name of whoever this whole territory was handed to. */
  assignedTo?: string
  sharedWith?: ShareRef[]
  receivedFrom?: ShareRef
  streets: TerritoryStreet[]
}

/** A permanent record of a temporary territory being marked complete — written once,
    right before the Territory itself is deleted, purely so Reports can show how many
    were finished in a given month/service year. Never edited or deleted afterward. */
export interface TerritoryCompletion {
  id: number
  completedAt: number
  name: string
  streetCount: number
}

export const db = new Dexie('FieldServiceDB') as Dexie & {
  people: EntityTable<Person, 'id'>
  calls: EntityTable<Call, 'id'>
  timeLogs: EntityTable<TimeLog, 'id'>
  appointments: EntityTable<Appointment, 'id'>
  schedulePrefs: EntityTable<SchedulePrefs, 'id'>
  territories: EntityTable<Territory, 'id'>
  territoryCompletions: EntityTable<TerritoryCompletion, 'id'>
  streetEntries: EntityTable<StreetEntry, 'id'>
}

db.version(1).stores({
  people: '++id, name, status, createdAt',
  visits: '++id, personId, date',
  timeLogs: '++id, date, type',
})

db.version(2).stores({
  people: '++id, name, status, createdAt, street, city, zip, dateMet',
  visits: null,
  calls: '++id, personId, date, followUpDate',
  timeLogs: '++id, date, category',
  literature: '++id, title',
  timeGoals: '++id, period, year, month',
  appointments: '++id, date, personId',
  availability: '++id, dayOfWeek',
}).upgrade(async (tx) => {
  const oldPeople = await tx.table('people').toArray()
  for (const p of oldPeople) {
    if (p.dateMet == null) {
      await tx.table('people').update(p.id, { dateMet: p.createdAt })
    }
  }
  const oldVisits = await tx.table('visits').toArray().catch(() => [])
  for (const v of oldVisits) {
    await tx.table('calls').add({
      personId: v.personId,
      date: v.date,
      notes: v.notes,
      scriptures: v.scriptures,
      leftAtDoor: v.literatureLeft,
      lat: v.lat,
      lng: v.lng,
    })
  }
  const oldLogs = await tx.table('timeLogs').toArray()
  for (const l of oldLogs) {
    if (!l.category) {
      await tx.table('timeLogs').update(l.id, { category: l.type === 'bible-study' ? 'ministry' : l.type })
    }
  }
})

db.version(3).stores({
  schedulePrefs: '++id',
})

// Drop tables that are no longer used (planning moved to schedulePrefs).
db.version(4).stores({
  timeGoals: null,
  availability: null,
})

// Literature tracking was removed; drop the catalog and old literatureIds field.
db.version(5).stores({
  literature: null,
}).upgrade(async (tx) => {
  const calls = await tx.table('calls').toArray()
  for (const c of calls) {
    if ('literatureIds' in c || 'topics' in c) {
      await tx.table('calls').update(c.id, { literatureIds: undefined, topics: undefined })
    }
  }
})

db.version(6).stores({
  territories: '++id, completed',
})

db.version(7).stores({
  territoryCompletions: '++id, completedAt',
})

db.version(8).stores({
  streetEntries: '++id, name, createdAt',
})

/** Sorts house numbers "1, 2, 10, 10A, 10B, 11" the way a person walks a street: by the
    leading numeric part first, then any suffix (unit letter, "-B", etc.) as a tiebreak.
    Purely-alphabetic entries fall after numbered ones. */
export function compareHouseNumbers(a: string, b: string): number {
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  const aNum = !Number.isNaN(na)
  const bNum = !Number.isNaN(nb)
  if (aNum && bNum && na !== nb) return na - nb
  if (aNum !== bNum) return aNum ? -1 : 1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
