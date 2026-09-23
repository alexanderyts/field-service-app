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

describe('restoring a pre-v9 file (AUDIT F041)', () => {
  it('rewrites legacy time categories the way the schema upgrade would', async () => {
    const body: BackupFile = {
      app: 'field-service',
      formatVersion: 1,
      appVersion: '0.19.1',
      dbVersion: 8,
      exportedAt: new Date().toISOString(),
      tables: {
        timeLogs: [
          { id: 1, date: Date.now(), minutes: 60, category: 'ldc' },
          { id: 2, date: Date.now(), minutes: 30, category: 'ministry' },
        ],
      },
      settings: {},
    }
    await importBackup({ text: async () => JSON.stringify(body) } as unknown as File)
    const logs = await db.timeLogs.orderBy('id').toArray()
    expect(logs.map((l) => l.category)).toEqual(['credit', 'ministry'])
    expect(logs[0].activityNote).toBe('LDC')
  })

  it('refuses a file whose tables field is null with the friendly error', async () => {
    const file = { text: async () => JSON.stringify({ app: 'field-service', tables: null }) } as unknown as File
    await expect(importBackup(file)).rejects.toThrow(/Meleo backup/)
  })
})

describe('a damaged row refuses the whole file (AUDIT F055)', () => {
  function fileWith(tables: BackupFile['tables']): File {
    const body: BackupFile = { app: 'field-service', formatVersion: 1, appVersion: '0.25.1', dbVersion: db.verno, exportedAt: '', tables, settings: {} }
    return { text: async () => JSON.stringify(body) } as unknown as File
  }

  it('rejects, names the row, and leaves every table as it was', async () => {
    await db.people.add({ name: 'Keep me', status: 'interested', dateMet: 0, createdAt: 0 } as never)
    const file = fileWith({
      people: [{ id: 1, name: 'Fine', status: 'interested', dateMet: 0, createdAt: 0 }],
      streetEntries: [{ id: 1, name: 'Oak St', houses: [], createdAt: 0, assignedTo: { x: 1 } }],
    })
    await expect(importBackup(file)).rejects.toThrow(/streetEntries #1/)
    expect((await db.people.toArray()).map((p) => p.name)).toEqual(['Keep me'])
    expect(await db.streetEntries.count()).toBe(0)
  })

  it('catches the wrong-type fields that crash a list: a call note, a time entry, a house', async () => {
    await expect(importBackup(fileWith({ calls: [{ id: 1, personId: 1, date: 0, literaturePlaced: 5 }] }))).rejects.toThrow(/calls #1/)
    await expect(importBackup(fileWith({ timeLogs: [{ id: 1, date: 0, minutes: '60', category: 'ministry' }] }))).rejects.toThrow(/timeLogs #1/)
    await expect(importBackup(fileWith({ streetEntries: [{ id: 1, name: 'A', houses: [{ id: 'h', number: 12 }], createdAt: 0 }] }))).rejects.toThrow(/streetEntries #1/)
  })

  it('does not restore the install-banner dismissal onto another device', async () => {
    const body: BackupFile = { app: 'field-service', formatVersion: 1, appVersion: '0.25.1', dbVersion: db.verno, exportedAt: '', tables: {}, settings: { fieldservice_install_dismissed: '1', fieldservice_theme: 'dark' } }
    await importBackup({ text: async () => JSON.stringify(body) } as unknown as File)
    expect(localStorage.getItem('fieldservice_install_dismissed')).toBeNull()
    expect(localStorage.getItem('fieldservice_theme')).toBe('dark')
  })
})
