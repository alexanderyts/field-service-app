import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type SchedulePrefs } from './db'
import { applyFirstRunRole } from './roleSetup'
import { getAuxConfig, isAuxMonth } from './auxPioneering'
import { deriveRole } from './schedulePrefsRole'

const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
})
const prefs = async () => (await db.schedulePrefs.toArray())[0] as SchedulePrefs

beforeEach(async () => {
  store.clear()
  await db.open()
  await db.schedulePrefs.clear()
})

describe('applyFirstRunRole', () => {
  it('pioneer: 600 h a year, no aux', async () => {
    await applyFirstRunRole('pioneer')
    const p = await prefs()
    expect(p).toMatchObject({ role: 'pioneer', isPioneer: true, yearlyHours: 600, completedSurvey: true })
    expect(deriveRole(p, getAuxConfig())).toBe('pioneer')
  })
  it('auxiliary: this month at the chosen target', async () => {
    const sept = new Date(2026, 8, 5)
    await applyFirstRunRole('auxiliary', 15, sept)
    expect(await prefs()).toMatchObject({ role: 'auxiliary', isPioneer: false })
    const aux = getAuxConfig()
    expect(aux).toMatchObject({ enabled: true, mode: 'this-month', targetHours: 15 })
    expect(isAuxMonth(aux, 2026, 8)).toBe(true)
    expect(isAuxMonth(aux, 2026, 9)).toBe(false)
  })
  it('publisher: no hour goal', async () => {
    await applyFirstRunRole('publisher')
    expect(await prefs()).toMatchObject({ role: 'publisher', goalPeriod: 'none', weeklyHours: 0, yearlyHours: 0 })
  })
  it('never overwrites prefs that already exist (e.g. a restored backup)', async () => {
    await db.schedulePrefs.add({ completedSurvey: true, role: 'pioneer', isPioneer: true, daysOut: [1], weeklyHours: 15, yearlyHours: 600 } as SchedulePrefs)
    await applyFirstRunRole('publisher')
    expect(await db.schedulePrefs.count()).toBe(1)
    expect((await prefs()).role).toBe('pioneer')
  })
})
