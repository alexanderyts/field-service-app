import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { importBackup, type BackupFile } from './backup'

// Runs against a real IndexedDB (fake-indexeddb) and a real Map-backed localStorage, so it
// exercises importBackup's actual settings-write path — the thing backup.test.ts's mocked db
// can't reach, because those cases must all reject *before* touching the database.

function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    get length() { return store.size },
    key: (i: number) => [...store.keys()][i] ?? null,
  }
}

function backupFile(settings: Record<string, string>): File {
  const body: BackupFile = {
    app: 'field-service',
    formatVersion: 1,
    appVersion: '0.19.0',
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
    tables: {},
    settings,
  }
  return { text: async () => JSON.stringify(body) } as unknown as File
}

beforeEach(async () => {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeLocalStorage(),
    configurable: true,
    writable: true,
  })
})

describe('importBackup — settings restore (AUDIT F-B6)', () => {
  it('clears a stale setting the backup file does not mention, rather than leaving it mixed in', async () => {
    localStorage.setItem('fieldservice_credit_hours', 'true')
    localStorage.setItem('fieldservice_theme', 'dark')

    await importBackup(backupFile({ fieldservice_theme: 'light' }))

    expect(localStorage.getItem('fieldservice_theme')).toBe('light')
    expect(localStorage.getItem('fieldservice_credit_hours')).toBeNull()
  })

  it('never clears a blocklisted per-device key, even though it is never in the restored set', async () => {
    localStorage.setItem('fieldservice_privacy_v2', 'accepted')
    localStorage.setItem('fieldservice_tutorial_seen', 'true')

    await importBackup(backupFile({ fieldservice_theme: 'light' }))

    expect(localStorage.getItem('fieldservice_privacy_v2')).toBe('accepted')
    expect(localStorage.getItem('fieldservice_tutorial_seen')).toBe('true')
  })
})
