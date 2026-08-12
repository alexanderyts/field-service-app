import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  creditHoursEnabled,
  setCreditHoursEnabled,
  getTheme,
  setTheme,
  getLastBackupAt,
  setLastBackupAt,
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
