import Dexie, { type EntityTable } from 'dexie'

export type ContactStatus =
  | 'interested'
  | 'return-visit'
  | 'bible-study'
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
  daysOut: number[]
  weeklyHours: number
  yearlyHours: number
  creditMode: 'weekly' | 'as-needed'
  startMinutes: number
  sessionHours: number
}

export const db = new Dexie('FieldServiceDB') as Dexie & {
  people: EntityTable<Person, 'id'>
  calls: EntityTable<Call, 'id'>
  timeLogs: EntityTable<TimeLog, 'id'>
  appointments: EntityTable<Appointment, 'id'>
  schedulePrefs: EntityTable<SchedulePrefs, 'id'>
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
      topics: v.literatureLeft,
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
