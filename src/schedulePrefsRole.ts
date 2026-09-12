import type { SchedulePrefs } from './db'
import { type AuxConfig, isAuxMonth } from './auxPioneering'

/**
 * Who the person is, for the purpose of what the app tracks.
 *
 * - `pioneer`   — regular pioneer: 600h service-year goal, credit hours, monthly pace.
 * - `auxiliary` — auxiliary pioneer: 15h or 30h in the months `auxPioneering.ts` says apply.
 * - `publisher` — everyone else: participation once a month, plus an optional personal goal.
 *
 * Stored as `SchedulePrefs.role` since 0.21.0 (docs/tracking-first-plan.md D1). Older rows
 * only have `isPioneer` (missing = pioneer, the original survey's audience) and the aux
 * config in localStorage; `deriveRole` reads those so nothing has to be migrated.
 */
export type Role = 'publisher' | 'auxiliary' | 'pioneer'

export function deriveRole(prefs: Pick<SchedulePrefs, 'role' | 'isPioneer'>, aux: Pick<AuxConfig, 'enabled'>): Role {
  if (prefs.role) return prefs.role
  if (prefs.isPioneer !== false) return 'pioneer'
  return aux.enabled ? 'auxiliary' : 'publisher'
}

/**
 * Whether hours are being counted against a goal in the given month — which decides whether
 * the tab leads with progress bars or with the participation checkbox. A pioneer always is;
 * anyone else is when that month is an auxiliary month or they set a personal goal.
 */
export function roleTracksHours(
  role: Role,
  prefs: Pick<SchedulePrefs, 'goalPeriod'>,
  aux: AuxConfig,
  year: number,
  month: number
): boolean {
  if (role === 'pioneer') return true
  if (isAuxMonth(aux, year, month)) return true
  return prefs.goalPeriod === 'weekly' || prefs.goalPeriod === 'monthly' || prefs.goalPeriod === 'yearly'
}
