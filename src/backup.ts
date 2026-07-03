import { db } from './db'
import { APP_VERSION } from './version'

// Full local backup / restore. Because the app is local-first with no server, a downloadable
// JSON file is the ONLY way a tester's data survives a device wipe — and it's the bridge to
// any future version (a native/App-Store build can't read another origin's IndexedDB, but it
// can always import this file). The format is self-describing and versioned so a later build
// can migrate an older export.

const BACKUP_FORMAT_VERSION = 1

// localStorage keys are exported dynamically (any `fieldservice_*` key), minus these:
//  - privacy_v1 / tutorial_seen: per-device consent + UX state; a restore shouldn't skip the
//    first-launch agreement on a new device.
//  - notify_sent_ids: transient notification-dedupe bookkeeping, not user data.
//  - dark_mode: legacy key superseded by `fieldservice_theme`.
const SETTINGS_BLOCKLIST = new Set([
  'fieldservice_privacy_v1',
  'fieldservice_tutorial_seen',
  'fieldservice_notify_sent_ids',
  'fieldservice_dark_mode',
])

export interface BackupFile {
  app: 'field-service'
  formatVersion: number
  appVersion: string
  dbVersion: number
  exportedAt: string
  tables: Record<string, unknown[]>
  settings: Record<string, string>
}

/** Gather every Dexie table plus the user's settings into one plain object. Iterates
    `db.tables` rather than a hardcoded list so new tables are captured automatically. */
export async function buildBackup(): Promise<BackupFile> {
  await db.open()
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    tables[table.name] = await table.toArray()
  }

  const settings: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('fieldservice_') && !SETTINGS_BLOCKLIST.has(key)) {
        settings[key] = localStorage.getItem(key) ?? ''
      }
    }
  } catch { /* localStorage blocked — export DB data only */ }

  return {
    app: 'field-service',
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
    tables,
    settings,
  }
}

/** Serialize a backup and hand it to the user. Prefers the native share sheet on mobile
    (on iOS — especially an installed PWA — an `<a download>` is unreliable, whereas Share
    lets them save to Files or send it to themselves), falling back to a normal download. */
export async function exportBackup(): Promise<'shared' | 'downloaded'> {
  const backup = await buildBackup()
  const json = JSON.stringify(backup)
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `field-service-backup-${stamp}.json`

  try {
    const file = new File([json], filename, { type: 'application/json' })
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Field Service backup' })
        return 'shared'
      } catch (e) {
        // User dismissed the share sheet — treat as done, don't also trigger a download.
        if (e instanceof Error && e.name === 'AbortError') return 'shared'
        // Any other share failure: fall through to the download path.
      }
    }
  } catch { /* File/share unsupported — fall through to download */ }

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
  return 'downloaded'
}

export interface ImportSummary {
  tables: Record<string, number>
  settings: number
  fromVersion: string
}

/** Restore from a backup file. Replaces the contents of each table present in the file
    (clear + bulkAdd, preserving original primary keys so cross-table references like
    calls.personId stay valid). Tables not present in the file are left untouched. Throws a
    friendly Error if the file isn't a recognizable Field Service backup. */
export async function importBackup(file: File): Promise<ImportSummary> {
  let data: BackupFile
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't valid JSON — pick a Field Service backup file.")
  }
  if (!data || data.app !== 'field-service' || typeof data.tables !== 'object') {
    throw new Error("That doesn't look like a Field Service backup file.")
  }

  const knownTables = new Set(db.tables.map((t) => t.name))
  const counts: Record<string, number> = {}

  await db.transaction('rw', db.tables, async () => {
    for (const [name, rows] of Object.entries(data.tables)) {
      if (!knownTables.has(name) || !Array.isArray(rows)) continue
      const table = db.table(name)
      await table.clear()
      if (rows.length) await table.bulkAdd(rows as unknown as never[])
      counts[name] = rows.length
    }
  })

  let settingsCount = 0
  if (data.settings && typeof data.settings === 'object') {
    for (const [key, value] of Object.entries(data.settings)) {
      if (key.startsWith('fieldservice_') && !SETTINGS_BLOCKLIST.has(key) && typeof value === 'string') {
        try { localStorage.setItem(key, value); settingsCount++ } catch { /* ignore */ }
      }
    }
  }

  return { tables: counts, settings: settingsCount, fromVersion: data.appVersion ?? 'unknown' }
}
