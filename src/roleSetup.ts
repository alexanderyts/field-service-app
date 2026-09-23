import { db, type SchedulePrefs } from './db'
import { AUX_OFF, auxMonthKey, saveAuxConfig, suggestedWeeklyHours } from './auxPioneering'
import type { Role } from './schedulePrefsRole'

const PIONEER_YEARLY_HOURS = 600

/**
 * The first-run role choice (Phase 3e), as the one question the welcome screen asks. It writes
 * the same shape the full goal editor (Survey) would for the plain case — pioneer at 600 h,
 * auxiliary for this month at 15 or 30 h, publisher with no hour goal — so the Service tab
 * opens ready. Everything finer (credit hours, several aux months, a personal goal) is in
 * "Change my goal". Never overwrites an existing prefs row: a restored backup already has one.
 */
export async function applyFirstRunRole(role: Role, auxTargetHours: 15 | 30 = 30, now = new Date()): Promise<void> {
  if ((await db.schedulePrefs.count()) > 0) return
  const base = { completedSurvey: true, daysOut: [], daySchedule: {}, goalPeriod: 'none' as const }
  let prefs: Omit<SchedulePrefs, 'id'>
  if (role === 'pioneer') {
    saveAuxConfig(AUX_OFF)
    prefs = { ...base, role, isPioneer: true, yearlyHours: PIONEER_YEARLY_HOURS, weeklyHours: Math.round((PIONEER_YEARLY_HOURS / 52) * 10) / 10 }
  } else if (role === 'auxiliary') {
    saveAuxConfig({
      enabled: true,
      mode: 'this-month',
      targetHours: auxTargetHours,
      weeklyHours: suggestedWeeklyHours(auxTargetHours),
      months: [auxMonthKey(now.getFullYear(), now.getMonth())],
      monthTargets: {},
    })
    prefs = { ...base, role, isPioneer: false, yearlyHours: 0, weeklyHours: suggestedWeeklyHours(auxTargetHours) }
  } else {
    saveAuxConfig(AUX_OFF)
    prefs = { ...base, role, isPioneer: false, yearlyHours: 0, weeklyHours: 0 }
  }
  await db.schedulePrefs.add(prefs as SchedulePrefs)
}
