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

const MODES: readonly AuxMode[] = ['this-month', 'multiple-months', 'continuous']

function isTargetHours(v: unknown): v is 15 | 30 {
  return v === 15 || v === 30
}

/**
 * Coerce anything at all into a usable AuxConfig, field by field.
 *
 * Spreading the parsed JSON over the defaults (what this used to do) looks safe but isn't:
 * a key that's present-but-wrong *overwrites* its default rather than falling back to it,
 * so a stored `{"months":null}` yields `months: null` and the very next `months.includes(…)`
 * throws — taking out Schedule and Reports, both of which read this on every render. The
 * value is reachable from outside the app too: backup.ts restores any `fieldservice_*`
 * string verbatim from a file the app didn't write. Unknown fields are dropped rather than
 * carried through, since nothing reads them.
 */
export function normalizeAuxConfig(input: unknown): AuxConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ...DEFAULT_CONFIG }
  const raw = input as Record<string, unknown>

  const monthTargets: Record<string, 15 | 30> = {}
  if (raw.monthTargets && typeof raw.monthTargets === 'object' && !Array.isArray(raw.monthTargets)) {
    for (const [key, value] of Object.entries(raw.monthTargets)) {
      if (isTargetHours(value)) monthTargets[key] = value
    }
  }

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_CONFIG.enabled,
    mode: MODES.includes(raw.mode as AuxMode) ? (raw.mode as AuxMode) : DEFAULT_CONFIG.mode,
    targetHours: isTargetHours(raw.targetHours) ? raw.targetHours : DEFAULT_CONFIG.targetHours,
    weeklyHours:
      typeof raw.weeklyHours === 'number' && Number.isFinite(raw.weeklyHours) && raw.weeklyHours >= 0
        ? raw.weeklyHours
        : DEFAULT_CONFIG.weeklyHours,
    months: Array.isArray(raw.months) ? raw.months.filter((m): m is string => typeof m === 'string') : [],
    monthTargets,
  }
}

export function getAuxConfig(): AuxConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    return normalizeAuxConfig(JSON.parse(raw))
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

/** A sensible weekly split for a monthly target, rounded to the nearest half hour. Used
    only as the settings form's initial estimate before anything's been logged yet —
    `weeklyHoursNeeded` below drives the live progress bar. */
export function suggestedWeeklyHours(targetHours: number): number {
  return Math.round((targetHours / 4.3) * 2) / 2
}

function startOfWeek(ref: Date): Date {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

/** Every Sun–Sat week-block touching [today, month-end] counts as one whole "week left"
    even if it's partial at either edge (today's partial week still counts as this week;
    a short trailing week at month-end still counts as one more) — matches how a person
    actually plans, rather than prorating by day-count. */
export function remainingWeeksInMonth(today: Date, year: number, month: number): number {
  const monthEnd = new Date(year, month + 1, 0)
  if (today > monthEnd) return 0
  const start = today > new Date(year, month, 1) ? today : new Date(year, month, 1)
  let weeks = 0
  // Step by calendar days (setDate), not a fixed 7×24h in ms — the latter drifts an hour
  // across a DST transition, which can flip the local-midnight `<=` comparison below and
  // miscount the weeks left (skewing the weekly-hours target every March/November).
  const cursor = startOfWeek(start)
  const lastWeekStart = startOfWeek(monthEnd).getTime()
  while (cursor.getTime() <= lastWeekStart) {
    weeks++
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

/** Hours still needed this week to hit `targetHours` for the month by month-end, given
    what's already logged — representative of the person's actual current situation
    (a mid-month start, a future month with nothing logged yet, etc.) rather than a flat
    average. Rounded to the nearest half hour, matching `suggestedWeeklyHours`. */
export function weeklyHoursNeeded(targetHours: number, loggedMin: number, today: Date, year: number, month: number): number {
  const remainingMin = Math.max(0, targetHours * 60 - loggedMin)
  const weeksLeft = remainingWeeksInMonth(today, year, month)
  if (weeksLeft <= 0) return 0
  return Math.round((remainingMin / weeksLeft / 60) * 2) / 2
}
