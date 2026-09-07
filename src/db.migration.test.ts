import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import Dexie from 'dexie'
import { CATEGORY_LABELS, CATEGORY_ORDER } from './categories'
import { monthTotals, isCredit } from './timeStats'
import type { TimeCategory, TimeLog } from './db'

// The v9 upgrade: seven Time Categories collapse to Ministry + Credit, with the old category
// label preserved as an Activity Note. This is the migration REVIEW.md §4 argues is the SAFER
// path, not the optional one — so it needs the two assertions that claim rests on:
//
//   1. a legacy row still renders afterwards (its category has a label and is in the list the
//      rings/legend/month-scans iterate — the mechanism that would silently drop it), and
//   2. no month's applied total moves.
//
// It runs against a real IndexedDB (fake-indexeddb): a v8 database is built with legacy rows,
// closed, and then reopened through the app's own `db`, which is what actually triggers Dexie's
// upgrade path. A mock cannot exercise that.

/** The app's cumulative schema as of v8, so the upgrade under test is a genuine 8 -> 9 step. */
const V8_SCHEMA = {
  people: '++id, name, status, createdAt, street, city, zip, dateMet',
  calls: '++id, personId, date, followUpDate',
  timeLogs: '++id, date, category',
  appointments: '++id, date, personId',
  schedulePrefs: '++id',
  territories: '++id, completed',
  territoryCompletions: '++id, completedAt',
  streetEntries: '++id, name, createdAt',
}

const OCT = new Date(2025, 9, 15).getTime()

/** October 2025 as a pre-0.20 user would have it: 24h ministry + 64h of credit spread across
    four different old categories — the exact shape of the 55h-cap example, so a migration that
    shifted the ministry/credit split would show up immediately in `applied`. */
const LEGACY_LOGS = [
  { date: OCT, minutes: 24 * 60, category: 'ministry' },
  { date: OCT, minutes: 20 * 60, category: 'ldc' },
  { date: OCT, minutes: 20 * 60, category: 'hlc' },
  { date: OCT, minutes: 14 * 60, category: 'convention' },
  { date: OCT, minutes: 10 * 60, category: 'other', note: 'Cart witnessing' },
]

let migrated: TimeLog[]
let legacyPrefs: { daySchedule?: Record<string, { blocks?: { category: string }[] }> }

beforeAll(async () => {
  const legacy = new Dexie('FieldServiceDB')
  legacy.version(8).stores(V8_SCHEMA)
  await legacy.open()
  await legacy.table('timeLogs').bulkAdd(LEGACY_LOGS)
  await legacy.table('schedulePrefs').add({
    completedSurvey: true,
    daysOut: [2, 4],
    weeklyHours: 15,
    yearlyHours: 600,
    daySchedule: { 2: { blocks: [{ start: 540, end: 720, category: 'ministry' }, { start: 780, end: 900, category: 'ldc' }] } },
  })
  legacy.close()

  // Reopening through the app's own db is what runs the v9 upgrader.
  const { db } = await import('./db')
  await db.open()
  migrated = await db.timeLogs.toArray()
  legacyPrefs = (await db.schedulePrefs.toArray())[0]
})

describe('v9 upgrade — seven categories collapse to Ministry + Credit', () => {
  it('leaves no row on a category the app can no longer name', () => {
    for (const l of migrated) {
      expect(CATEGORY_LABELS[l.category]).toBeDefined()
      // The stricter half: the display code ITERATES this list to build goal rings, the week
      // legend and the month scans. A row on a category missing from it is never visited —
      // it vanishes from every ring while still counting in the totals, which is what reads
      // to a user as data loss.
      expect(CATEGORY_ORDER).toContain(l.category)
    }
  })

  it('keeps what each entry was, as an Activity Note', () => {
    const notes = migrated.filter((l) => isCredit(l.category)).map((l) => l.activityNote).sort()
    expect(notes).toEqual(['Convention', 'HLC', 'LDC', 'Other'])
  })

  it('does not touch a row that was already ministry', () => {
    const ministry = migrated.filter((l) => l.category === 'ministry')
    expect(ministry).toHaveLength(1)
    expect(ministry[0].minutes).toBe(24 * 60)
    expect(ministry[0].activityNote).toBeUndefined()
  })

  it('leaves an existing note alone — the Activity Note is a separate field', () => {
    const cart = migrated.find((l) => l.note === 'Cart witnessing')
    expect(cart).toBeDefined()
    expect(cart!.category).toBe('credit')
    expect(cart!.activityNote).toBe('Other')
  })

  // The claim the whole migration rests on: it relabels, it does not re-total.
  it('does not move the month\'s applied total', () => {
    const before = monthTotals(LEGACY_LOGS as unknown as TimeLog[])
    const after = monthTotals(migrated)
    expect(after.ministry).toBe(before.ministry)
    expect(after.credit).toBe(before.credit)
    expect(after.total).toBe(before.total)
    expect(after.applied).toBe(before.applied)
    // And concretely, so a future edit to monthTotals can't quietly move both sides together:
    expect(after.applied).toBe(55 * 60)
    expect(after.total).toBe(88 * 60)
  })

  it('migrates planned schedule blocks too, so a submitted plan cannot reintroduce a dead category', () => {
    const blocks = legacyPrefs.daySchedule?.[2]?.blocks ?? []
    expect(blocks.map((b) => b.category)).toEqual(['ministry', 'credit'])
    for (const b of blocks) expect(CATEGORY_ORDER).toContain(b.category as TimeCategory)
  })
})
