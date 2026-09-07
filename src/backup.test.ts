import { describe, it, expect, vi, beforeEach } from 'vitest'

// backup.ts pulls in db.ts, which opens Dexie at import time — stubbed here so the version
// gate can be tested as the pure decision it is. These cases must all reject *before* any
// table is touched, so the stub throws loudly if a restore ever reaches the database.
const shouldNotRun = () => {
  throw new Error('importBackup touched the database despite rejecting the file')
}

vi.mock('./db', () => ({
  db: {
    open: shouldNotRun,
    tables: [],
    table: shouldNotRun,
    transaction: shouldNotRun,
    verno: 8,
  },
}))

const { importBackup } = await import('./backup')

/** Minimal stand-in for the File the More tab hands to importBackup. */
function backupFile(body: unknown): File {
  return { text: async () => JSON.stringify(body) } as unknown as File
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null },
    configurable: true,
    writable: true,
  })
})

describe('importBackup — file gate', () => {
  it('rejects a file that is not JSON', async () => {
    const notJson = { text: async () => 'nope' } as unknown as File
    await expect(importBackup(notJson)).rejects.toThrow(/valid JSON/i)
  })

  it('rejects a JSON file that is not a Meleo backup', async () => {
    await expect(importBackup(backupFile({ hello: 'world' }))).rejects.toThrow(/doesn't look like/i)
  })

  // The reason the format is versioned: restore is clear-then-bulkAdd, so applying a file
  // this build doesn't understand destroys real data to install rows it can't use.
  it('refuses a backup from a newer version of the app', async () => {
    const future = backupFile({ app: 'field-service', formatVersion: 2, appVersion: '9.9.9', tables: {} })
    await expect(importBackup(future)).rejects.toThrow(/newer version/i)
  })

  it('names the version that produced the file, so the user knows what to update to', async () => {
    const future = backupFile({ app: 'field-service', formatVersion: 99, appVersion: '1.4.0', tables: {} })
    await expect(importBackup(future)).rejects.toThrow(/1\.4\.0/)
  })

  it('treats a missing formatVersion as the original format rather than refusing it', async () => {
    // Reaching the database means the gate let it through, which is what we want here.
    const legacy = backupFile({ app: 'field-service', appVersion: '0.6.0', tables: {} })
    await expect(importBackup(legacy)).rejects.toThrow(/touched the database/)
  })

  it('accepts the current format version', async () => {
    const current = backupFile({ app: 'field-service', formatVersion: 1, appVersion: '0.17.0', tables: {} })
    await expect(importBackup(current)).rejects.toThrow(/touched the database/)
  })

  // AUDIT F032: the backup format hasn't changed since v1, but the Dexie schema (`db.verno`,
  // mocked at 8 above) has moved eight times and will move again — this is the version that
  // actually diverges, and needs the same before-any-table-is-touched gate as formatVersion.
  it('refuses a backup written by a newer schema version', async () => {
    const future = backupFile({ app: 'field-service', formatVersion: 1, dbVersion: 9, appVersion: '9.9.9', tables: {} })
    await expect(importBackup(future)).rejects.toThrow(/newer version/i)
  })

  it('treats a missing dbVersion as the original schema rather than refusing it', async () => {
    const legacy = backupFile({ app: 'field-service', formatVersion: 1, appVersion: '0.6.0', tables: {} })
    await expect(importBackup(legacy)).rejects.toThrow(/touched the database/)
  })

  it('accepts a backup written by the current schema version', async () => {
    const current = backupFile({ app: 'field-service', formatVersion: 1, dbVersion: 8, appVersion: '0.19.0', tables: {} })
    await expect(importBackup(current)).rejects.toThrow(/touched the database/)
  })
})
