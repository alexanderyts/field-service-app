import Dexie, { type EntityTable } from 'dexie'

export type ContactStatus =
  | 'interested'
  | 'return-visit'
  | 'bible-study'
  | 'informal-visit'
  | 'not-interested'
  | 'do-not-call'
  | 'moved'

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
  /** Per-day suggested ministry window (day-of-week key, 0=Sun..6=Sat, -> minutes since
      midnight) for whichever days are in daysOut. Each day can have its own start time —
      replaces the old single global startMinutes/sessionHours. `end` is only present once
      explicitly customized (from the Schedule tab); until then it's derived live from
      weeklyHours split evenly across the selected days, so it stays correct as days are
      added or removed instead of going stale. `creditMin` is an optional planning-only
      suggestion (credit hours someone hopes to fit in that day) — purely a planning aid,
      never logged automatically. */
  daySchedule?: Record<number, { start: number; end?: number; creditMin?: number }>
  /** Non-pioneers only — an optional self-set goal. Choosing monthly or yearly turns on
      real hour tracking (daysOut/weeklyHours/yearlyHours) for them, same as a pioneer's,
      just measured against their own goal instead of the fixed 600h/year. */
  goalPeriod?: 'none' | 'monthly' | 'yearly'
}

export interface TerritoryStreet {
  /** Local to the territory, not a Dexie primary key — just needs to be unique within streets[]. */
  id: string
  name: string
  points: { lat: number; lng: number }[]
  done: boolean
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
