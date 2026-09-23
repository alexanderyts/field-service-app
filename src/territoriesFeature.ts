import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { getTerritoriesSetting } from './settings'

/**
 * Street and territory tracing is opt-in (docs/review-2026-09-23.md Phase 3a): most people
 * report through NW Publisher and never trace a street, so it stays out of their way. The
 * person's own choice wins; with no choice made, it is on exactly when streets or territories
 * already exist — nobody who uses it loses it on update.
 */
export function resolveTerritoriesEnabled(setting: boolean | null, hasData: boolean): boolean {
  return setting ?? hasData
}

export function useTerritoriesEnabled(): boolean {
  const count = useLiveQuery(async () => (await db.streetEntries.count()) + (await db.territories.count()), [])
  return resolveTerritoriesEnabled(getTerritoriesSetting(), (count ?? 0) > 0)
}
