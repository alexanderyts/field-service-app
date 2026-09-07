import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  creditHoursEnabled,
  setCreditHoursEnabled,
  getTheme,
  setTheme,
  getLastBackupAt,
  setLastBackupAt,
  getMinuteBank,
  setMinuteBank,
  getParticipatedMonth,
  setParticipatedMonth,
} from './settings'

// Vitest runs these in plain Node (no DOM), so localStorage is stubbed here. A hand-rolled
// stub also lets the "storage throws" case be exercised directly, which is the branch that
// matters most — an unguarded read there would crash before the app could mount.
let store: Record<string, string>

function installStorage(throwing = false) {
  store = {}
  const api = {
    getItem(key: string) {
      if (throwing) throw new DOMException('blocked')
      return key in store ? store[key] : null
    },
    setItem(key: string, value: string) {
      if (throwing) throw new DOMException('blocked')
      store[key] = value
    },
    removeItem(key: string) {
      if (throwing) throw new DOMException('blocked')
      delete store[key]
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: api, configurable: true, writable: true })
}

beforeEach(() => installStorage())
afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'localStorage')
})

describe('creditHours', () => {
  it('defaults to off when unset', () => {
    expect(creditHoursEnabled()).toBe(false)
  })

  it('round-trips, keeping the historical yes/no strings', () => {
    setCreditHoursEnabled(true)
    expect(store['fieldservice_credit_hours']).toBe('yes')
    expect(creditHoursEnabled()).toBe(true)

    setCreditHoursEnabled(false)
    expect(store['fieldservice_credit_hours']).toBe('no')
    expect(creditHoursEnabled()).toBe(false)
  })

  it('treats any unrecognized value as off', () => {
    store['fieldservice_credit_hours'] = 'true'
    expect(creditHoursEnabled()).toBe(false)
  })
})

describe('theme', () => {
  it('defaults to light when unset', () => {
    expect(getTheme()).toBe('light')
  })

  it('round-trips each theme', () => {
    for (const theme of ['light', 'dark', 'pastel', 'mark'] as const) {
      setTheme(theme)
      expect(getTheme()).toBe(theme)
    }
  })

  it('falls back to light on a corrupt value', () => {
    store['fieldservice_theme'] = 'neon'
    expect(getTheme()).toBe('light')
  })

  it('honors the legacy dark-mode key when no theme is set', () => {
    store['fieldservice_dark_mode'] = 'yes'
    expect(getTheme()).toBe('dark')
  })

  it('prefers an explicit theme over the legacy key', () => {
    store['fieldservice_theme'] = 'pastel'
    store['fieldservice_dark_mode'] = 'yes'
    expect(getTheme()).toBe('pastel')
  })

  it('retires the legacy key once a theme is set, so the two cannot disagree', () => {
    store['fieldservice_dark_mode'] = 'yes'
    setTheme('light')
    expect(store['fieldservice_dark_mode']).toBeUndefined()
    expect(getTheme()).toBe('light')
  })
})

describe('lastBackupAt', () => {
  it('is null when the user has never backed up', () => {
    expect(getLastBackupAt()).toBeNull()
  })

  it('round-trips a timestamp', () => {
    setLastBackupAt(1_760_000_000_000)
    expect(getLastBackupAt()).toBe(1_760_000_000_000)
  })

  it.each(['', 'abc', '0', '-5', 'NaN', 'Infinity'])('reads %o as never-backed-up', (raw) => {
    store['fieldservice_last_backup_at'] = raw
    expect(getLastBackupAt()).toBeNull()
  })

  it('refuses to persist a non-timestamp', () => {
    setLastBackupAt(Number.NaN)
    setLastBackupAt(0)
    setLastBackupAt(-1)
    expect(getLastBackupAt()).toBeNull()
  })
})

describe('when localStorage throws', () => {
  beforeEach(() => installStorage(true))

  it('every getter returns its default instead of throwing', () => {
    expect(() => creditHoursEnabled()).not.toThrow()
    expect(creditHoursEnabled()).toBe(false)
    expect(getTheme()).toBe('light')
    expect(getLastBackupAt()).toBeNull()
  })

  it('every setter is a silent no-op instead of throwing', () => {
    expect(() => setCreditHoursEnabled(true)).not.toThrow()
    expect(() => setTheme('dark')).not.toThrow()
    expect(() => setLastBackupAt(Date.now())).not.toThrow()
  })
})

// Moved here from Schedule.tsx (F0.3's "two keys remain module-locals" leftover, closed while
// splitting that file for F008). Same keys, same stored strings — only the owner changed.
describe('minuteBank', () => {
  it('defaults to 0 and round-trips a whole number of minutes', () => {
    expect(getMinuteBank()).toBe(0)
    setMinuteBank(45)
    expect(store['fieldservice_minute_bank']).toBe('45')
    expect(getMinuteBank()).toBe(45)
  })

  it('never stores or returns a negative or fractional bank', () => {
    setMinuteBank(-10)
    expect(getMinuteBank()).toBe(0)
    setMinuteBank(12.9)
    expect(getMinuteBank()).toBe(12)
  })

  it('reads garbage (a restored value the app never wrote) as 0', () => {
    store['fieldservice_minute_bank'] = 'lots'
    expect(getMinuteBank()).toBe(0)
  })

  it('does not throw when storage is blocked', () => {
    installStorage(true)
    expect(() => setMinuteBank(5)).not.toThrow()
    expect(getMinuteBank()).toBe(0)
  })
})

describe('participatedMonth', () => {
  it('is false by default and round-trips per month, keyed the way Schedule always keyed it', () => {
    expect(getParticipatedMonth(2026, 8)).toBe(false)
    setParticipatedMonth(2026, 8, true)
    expect(JSON.parse(store['fieldservice_participated_months'])).toEqual({ '2026-8': true })
    expect(getParticipatedMonth(2026, 8)).toBe(true)
    expect(getParticipatedMonth(2026, 7)).toBe(false)
  })

  it('reads a corrupt map (a restored value) as nobody having participated', () => {
    store['fieldservice_participated_months'] = '[1,2]'
    expect(getParticipatedMonth(2026, 8)).toBe(false)
    store['fieldservice_participated_months'] = 'not json'
    expect(() => setParticipatedMonth(2026, 8, true)).not.toThrow()
    expect(getParticipatedMonth(2026, 8)).toBe(true)
  })
})
