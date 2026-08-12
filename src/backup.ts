import { db } from './db'
import { APP_VERSION } from './version'
import { setLastBackupAt, LAST_BACKUP_AT_KEY } from './settings'

// Full local backup / restore. Because the app is local-first with no server, a downloadable
// JSON file is the ONLY way a tester's data survives a device wipe — and it's the bridge to
// any future version (a native/App-Store build can't read another origin's IndexedDB, but it
// can always import this file). The format is self-describing and versioned so a later build
// can migrate an older export.

const BACKUP_FORMAT_VERSION = 1

// localStorage keys are exported dynamically (any `fieldservice_*` key), minus these:
//  - privacy_v2 / tutorial_seen: per-device consent + UX state; a restore shouldn't skip the
//    first-launch agreement on a new device. `privacy_v1` is the pre-Meleo-rename key, kept
//    listed so a backup taken by a build old enough to still hold it doesn't carry it either.
//  - notify_sent_ids: transient notification-dedupe bookkeeping, not user data.
//  - dark_mode: legacy key superseded by `fieldservice_theme`.
//  - last_backup_at: a record of when THIS device last exported; restoring someone else's
//    file (or an old one of your own) must not overwrite that with a stale time.
const SETTINGS_BLOCKLIST = new Set([
  'fieldservice_privacy_v1',
  'fieldservice_privacy_v2',
  'fieldservice_tutorial_seen',
  'fieldservice_notify_sent_ids',
  'fieldservice_dark_mode',
  LAST_BACKUP_AT_KEY,
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
  const filename = `meleo-backup-${stamp}.json`

  try {
    const file = new File([json], filename, { type: 'application/json' })
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Meleo backup' })
        setLastBackupAt(Date.now())
        return 'shared'
      } catch (e) {
        // User dismissed the share sheet — treat as done, don't also trigger a download.
        // Deliberately NOT stamped as a backup: a dismissed sheet produced no file, and a
        // "Last backup: just now" line the user hasn't earned is worse than no line at all.
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
  // The closest thing to a completion signal this path has: `a.click()` hands the file to
  // the browser, which offers no event for "the user actually saved it" and lets them
  // cancel the save dialog silently. So the stamp means "an export reached the OS", which
  // is the strongest claim available here — see AUDIT F016.
  setLastBackupAt(Date.now())
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
  return 'downloaded'
}

/** Factory reset — wipe every Dexie table and every `fieldservice_*` localStorage key, so
    the app is genuinely fresh (no lingering aux-pioneering config, theme, credit toggle,
    notification settings, profile name, onboarding flags, etc.). Iterates `db.tables` rather
    than a hardcoded list so any table added later is cleared too. Callers reload afterward. */
export async function wipeAllData(): Promise<void> {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('fieldservice_')) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch { /* localStorage blocked — DB is still wiped */ }
}

export interface ImportSummary {
  tables: Record<string, number>
  settings: number
  fromVersion: string
}

/** Restore from a backup file. Replaces the contents of each table present in the file
    (clear + bulkAdd, preserving original primary keys so cross-table references like
    calls.personId stay valid). Tables not present in the file are left untouched. Throws a
    friendly Error if the file isn't a recognizable Meleo backup. */
export async function importBackup(file: File): Promise<ImportSummary> {
  let data: BackupFile
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't valid JSON — pick a Meleo backup file.")
  }
  // `app` stays the internal 'field-service' tag (predates the Meleo rename) so backups
  // exported before the rename still import correctly — this is a format id, not branding.
  if (!data || data.app !== 'field-service' || typeof data.tables !== 'object') {
    throw new Error("That doesn't look like a Meleo backup file.")
  }

  // The format is versioned precisely so a newer file can be recognized and refused rather
  // than half-applied. Restore is clear-then-bulkAdd, so importing a file this build doesn't
  // understand would wipe real tables and replace them with rows shaped for a schema that
  // doesn't exist here — destroying data to install data that won't work. Older files are
  // still accepted: this build knows every format it has ever written.
  const fileFormat = typeof data.formatVersion === 'number' ? data.formatVersion : 1
  if (fileFormat > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `This backup was made by a newer version of Meleo (${data.appVersion ?? 'unknown'}). ` +
        'Update the app, then restore it — importing it now could damage your current data.'
    )
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
