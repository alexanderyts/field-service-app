// One typed accessor layer over the app's plain `fieldservice_*` localStorage settings, so
// config isn't read as bare string literals scattered across components. Wraps the EXISTING
// keys with their EXISTING stored strings — this is not a migration, and renaming a key or
// changing its stored format would break every existing install (see CLAUDE.md).
//
// Every getter is total: a missing, corrupt, or wrong-type value returns the documented
// default rather than throwing. That matters because localStorage itself can throw
// synchronously (Safari "Block All Cookies", managed profiles, quota), and because
// backup.ts restores any `fieldservice_*` string verbatim from a file the app didn't write —
// so a settings value reaching a render is not trustworthy input.

export type Theme = 'light' | 'dark' | 'pastel' | 'mark'

const THEMES: readonly Theme[] = ['light', 'dark', 'pastel', 'mark']

const KEY = {
  creditHours: 'fieldservice_credit_hours',
  theme: 'fieldservice_theme',
  /** Superseded by `theme`; still read so devices that chose dark before the theme picker
      existed keep it, and cleared the first time a theme is set. */
  legacyDarkMode: 'fieldservice_dark_mode',
  lastBackupAt: 'fieldservice_last_backup_at',
  /** Leftover minutes held aside rather than logged (they become an hour at 60). Ministry
      minutes only — see `quickLogStrategy`. Stored as a plain integer string. */
  minuteBank: 'fieldservice_minute_bank',
  /** Non-pioneer "did I share in the ministry this month" — a JSON map keyed "YYYY-M"
      (month 0-based, matching Date.getMonth), value true/false. */
  participatedMonths: 'fieldservice_participated_months',
} as const

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch { /* localStorage unavailable — the setting just doesn't persist */ }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch { /* nothing to clear if it's unreachable */ }
}

/** Whether the Credit category (LDC, HLC, Bethel, conventions/assemblies) is offered when logging
    time. Stored as the literal 'yes'/'no' strings this key has always used. */
export function creditHoursEnabled(): boolean {
  return readRaw(KEY.creditHours) === 'yes'
}

export function setCreditHoursEnabled(enabled: boolean): void {
  writeRaw(KEY.creditHours, enabled ? 'yes' : 'no')
}

/** The chosen theme, falling back to the legacy dark-mode boolean and then to light. */
export function getTheme(): Theme {
  const stored = readRaw(KEY.theme)
  if (stored && (THEMES as readonly string[]).includes(stored)) return stored as Theme
  if (readRaw(KEY.legacyDarkMode) === 'yes') return 'dark'
  return 'light'
}

/** Persists the theme and retires the legacy boolean, so the two can never disagree. */
export function setTheme(theme: Theme): void {
  writeRaw(KEY.theme, theme)
  removeRaw(KEY.legacyDarkMode)
}

/** When the user last completed a backup export, or null if they never have. Since the
    backup file is the only recovery path for a local-first app, "never" is a meaningful
    answer the More tab surfaces rather than hides. */
export function getLastBackupAt(): number | null {
  const raw = readRaw(KEY.lastBackupAt)
  if (raw === null) return null
  const parsed = Number(raw)
  // Rejects '', 'abc', Infinity, negatives and 0 — anything that couldn't be a real
  // timestamp reads as "never backed up" rather than rendering a nonsense date.
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export function setLastBackupAt(at: number): void {
  if (!Number.isFinite(at) || at <= 0) return
  writeRaw(KEY.lastBackupAt, String(Math.floor(at)))
}

/** The key backup.ts must exclude from export/restore — a backup carries the user's data,
    not another device's record of when *it* was last backed up. */
export const LAST_BACKUP_AT_KEY = KEY.lastBackupAt

/** Minutes currently in the minute bank; 0 for anything that isn't a positive integer. */
export function getMinuteBank(): number {
  const parsed = parseInt(readRaw(KEY.minuteBank) ?? '0', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function setMinuteBank(minutes: number): void {
  writeRaw(KEY.minuteBank, String(Math.max(0, Math.floor(minutes))))
}

function readParticipatedMap(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(readRaw(KEY.participatedMonths) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/** Whether a non-pioneer shared in the ministry at all in the given month (0-based). A
    person with zero hours may still have participated — this is independent of time logs. */
export function getParticipatedMonth(year: number, month: number): boolean {
  return !!readParticipatedMap()[`${year}-${month}`]
}

export function setParticipatedMonth(year: number, month: number, participated: boolean): void {
  const map = readParticipatedMap()
  map[`${year}-${month}`] = participated
  writeRaw(KEY.participatedMonths, JSON.stringify(map))
}
