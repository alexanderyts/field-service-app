// Auxiliary pioneering — a temporary elevated commitment (15h or 30h a month) that a
// non-pioneer can opt into for one month, several chosen months, or on an ongoing basis.
// Stored in localStorage (not Dexie) since it's a lightweight, frequently-toggled setting
// rather than a durable record.

export type AuxMode = 'this-month' | 'multiple-months' | 'continuous'

export interface AuxConfig {
  enabled: boolean
  mode: AuxMode | null
  /** Target for 'this-month' and 'continuous' (a single monthly figure). 'multiple-months'
      uses monthTargets instead, since each selected month can have its own 15h/30h target. */
  targetHours: 15 | 30
  weeklyHours: number
  /** "YYYY-M" keys — which calendar months count as auxiliary pioneering. Populated for
      'this-month' (just the month it was set up in) and 'multiple-months' (whichever the
      person picked). Unused for 'continuous', which applies to every month once enabled. */
  months: string[]
  /** 'multiple-months' only — per-month target hours, keyed the same as `months`. */
  monthTargets: Record<string, 15 | 30>
}

const STORAGE_KEY = 'fieldservice_aux_pioneering'

const DEFAULT_CONFIG: AuxConfig = { enabled: false, mode: null, targetHours: 30, weeklyHours: 7, months: [], monthTargets: {} }

export function getAuxConfig(): AuxConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveAuxConfig(cfg: AuxConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch { /* localStorage unavailable */ }
}

export function auxMonthKey(year: number, month: number): string {
  return `${year}-${month}`
}

/** The auxiliary monthly target (in hours) that applies to a given calendar month, or
    null if that month isn't an auxiliary-pioneering month at all. */
export function auxTargetHoursFor(cfg: AuxConfig, year: number, month: number): number | null {
  if (!cfg.enabled || !cfg.mode) return null
  const key = auxMonthKey(year, month)
  if (cfg.mode === 'continuous') return 30
  if (!cfg.months.includes(key)) return null
  if (cfg.mode === 'multiple-months') return cfg.monthTargets[key] ?? cfg.targetHours
  return cfg.targetHours
}

export function isAuxMonth(cfg: AuxConfig, year: number, month: number): boolean {
  return auxTargetHoursFor(cfg, year, month) != null
}

/** A sensible weekly split for a monthly target, rounded to the nearest half hour. */
export function suggestedWeeklyHours(targetHours: number): number {
  return Math.round((targetHours / 4.3) * 2) / 2
}
