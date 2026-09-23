import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import ConfirmDialog from './ConfirmDialog'
import { exportBackup, importBackup, wipeAllData, type ImportSummary } from '../backup'
import { readMeleoFile } from '../share'
import { InstallCard } from './InstallPrompt'
import { tipServices, type TipKind } from '../tips'
import { APP_VERSION } from '../version'
import { viewportDiag } from '../viewportFix'
import { COPYRIGHT_SUMMARY, NOT_AFFILIATED, DEVELOPER_NAME, DEVELOPER_EMAIL } from '../legal'
import { getAuxConfig } from '../auxPioneering'
import { roleSummary } from '../schedulePrefsRole'
import { GoalEditorModal } from './schedule/GoalEditorModal'
import { getProfileName, saveProfileName } from '../profile'
import { creditHoursEnabled, setCreditHoursEnabled, getTheme, setTheme as saveTheme, getLastBackupAt, isBackupOverdue, setTerritoriesSetting, type Theme } from '../settings'
import { useTerritoriesEnabled } from '../territoriesFeature'
import { CREDIT_ACTIVITY_SUGGESTIONS } from '../categories'
import { formatTimeAgo } from '../timeAgo'
import { minuteBankAnimationsEnabled, setMinuteBankAnimationsEnabled } from '../minuteBankFly'
import {
  NOTIFY_LEAD_OPTIONS,
  getNotifyLeadMinutes,
  notificationsEnabled,
  notificationsSupported,
  requestNotificationPermission,
  setNotificationsEnabled,
  setNotifyLeadMinutes,
  type NotifyLeadMinutes,
} from '../notifications'

export default function Misc({ onReplayTutorial, onImportEncoded }: { onReplayTutorial: () => void; onImportEncoded?: (encoded: string) => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState(false)
  const [versionTaps, setVersionTaps] = useState(0)
  const [legalOpen, setLegalOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClear2, setConfirmClear2] = useState(false)
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [creditEnabled, setCreditEnabled] = useState(() => creditHoursEnabled())
  const territoriesOn = useTerritoriesEnabled()
  // The switch lives in localStorage; bumping this re-renders so the checkbox follows it.
  const [, setFeaturesVersion] = useState(0)
  // The single prefs row — by position, not by id 1: a restored backup keeps its own ids.
  const schedulePrefs = useLiveQuery(() => db.schedulePrefs.toCollection().first(), [])
  const defaultExpandCalendar = schedulePrefs?.scheduleDefaultExpand === 'calendar'
  async function setDefaultExpandCalendar(v: boolean) {
    if (schedulePrefs) await db.schedulePrefs.update(schedulePrefs.id, { scheduleDefaultExpand: v ? 'calendar' : 'week' })
  }
  const [theme, setThemeState] = useState<Theme>(() => getTheme())
  const [firstName, setFirstName] = useState(() => getProfileName().firstName)
  const [lastName, setLastName] = useState(() => getProfileName().lastName)
  const [minuteAnimEnabled, setMinuteAnimEnabledState] = useState(() => minuteBankAnimationsEnabled())
  const [notifyEnabled, setNotifyEnabledState] = useState(() => notificationsEnabled())
  const [notifyLead, setNotifyLeadState] = useState<NotifyLeadMinutes>(() => getNotifyLeadMinutes())
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationsSupported() ? Notification.permission : 'unsupported'
  )

  // Tips
  const [tipMenu, setTipMenu] = useState<TipKind | null>(null)
  const oneTimeTips = tipServices('oneTime')
  const monthlyTips = tipServices('monthly')

  // Share the web app link
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  // Build from this deployment's own origin + base path so the link always
  // points at wherever this exact build is hosted (GH Pages, Netlify, …).
  const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href
  async function shareApp() {
    setShareMsg(null)
    const shareData = {
      title: 'Meleo',
      text: 'Meleo — a free field service companion. No sign-up, works right in your browser:',
      url: appUrl,
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.canShare?.(shareData)) {
        await navigator.share(shareData)
        return // OS share sheet handled it
      }
      await navigator.clipboard.writeText(appUrl)
      setShareMsg('Link copied to your clipboard.')
    } catch (err) {
      // AbortError = user closed the share sheet; not a failure worth surfacing.
      if (err instanceof DOMException && err.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(appUrl)
        setShareMsg('Link copied to your clipboard.')
      } catch {
        setShareMsg(appUrl) // last resort: show it so they can copy by hand
      }
    }
  }

  // Backup & restore
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shareImportInputRef = useRef<HTMLInputElement>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(() => getLastBackupAt())

  async function handleExport() {
    setExportMsg(null)
    setBackupBusy(true)
    try {
      const how = await exportBackup()
      setExportMsg(how === 'shared' ? 'Backup ready to save or send.' : 'Backup file downloaded.')
    } catch {
      setExportMsg('Could not create the backup. Please try again.')
    } finally {
      // Re-read rather than stamping locally: exportBackup only records the time at its real
      // completion points, so a dismissed share sheet correctly leaves this line unchanged.
      setLastBackupAt(getLastBackupAt())
      setBackupBusy(false)
    }
  }

  function pickImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked later
    if (!file) return
    setImportError(null)
    setImportSummary(null)
    setPendingImport(file)
  }

  async function confirmImport() {
    if (!pendingImport) return
    setBackupBusy(true)
    setImportError(null)
    try {
      const summary = await importBackup(pendingImport)
      setImportSummary(summary)
      setPendingImport(null)
      // A live reload guarantees every screen re-reads the restored data + settings cleanly.
      setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.')
      setPendingImport(null)
    } finally {
      setBackupBusy(false)
    }
  }

  async function loadDemoData() {
    // Dynamic import so this dev-only generator (and its data) is a separate chunk that
    // production builds never fetch, rather than a static import baking it into the
    // main bundle regardless of whether the (dev-gated) button that calls it renders.
    const { seedDemoData } = await import('../devSeed')
    await seedDemoData()
    window.location.reload()
  }

  function toggleCredit(v: boolean) {
    setCreditEnabled(v)
    setCreditHoursEnabled(v)
  }

  function changeTheme(t: Theme) {
    setThemeState(t)
    saveTheme(t)
    document.documentElement.dataset.theme = t === 'light' ? '' : t
  }

  function toggleMinuteAnim(v: boolean) {
    setMinuteAnimEnabledState(v)
    setMinuteBankAnimationsEnabled(v)
  }

  async function toggleNotify(v: boolean) {
    if (v) {
      if (!notificationsSupported()) return
      const perm = await requestNotificationPermission()
      setNotifyPermission(perm)
      if (perm !== 'granted') return // denied or dismissed — don't turn it on
    }
    setNotifyEnabledState(v)
    setNotificationsEnabled(v)
  }

  function changeNotifyLead(v: NotifyLeadMinutes) {
    setNotifyLeadState(v)
    setNotifyLeadMinutes(v)
  }

  async function clearAllData() {
    // True factory reset — every table + every fieldservice_* setting (aux pioneering, theme,
    // credit toggle, notifications, profile, onboarding flags), so the app starts genuinely fresh.
    await wipeAllData()
    window.location.reload()
  }

  return (
    <div className="view">
      <h2 className="applet-title">More</h2>

      {/* Order (Phase 3f): what you set up, what keeps your data safe, how the app behaves,
          then help, support and the fine print. It used to open with the tip jar. */}

      {/* ═══ Your goal ═══ */}
      <div className="card misc-goal">
        <div>
          <strong>Your goal</strong>
          <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>
            {schedulePrefs ? roleSummary(schedulePrefs, getAuxConfig()) : 'Not set yet — Service will ask.'}
          </p>
        </div>
        {schedulePrefs && <button className="secondary small" onClick={() => setEditingGoal(true)}>Change</button>}
      </div>

      {/* ═══ Backup ═══ */}
      <div className="card">
        <div className="misc-backup-head">
          <strong>💾 Backup</strong>
          <span className={`backup-status${lastBackupAt === null ? ' never' : isBackupOverdue(lastBackupAt, Date.now()) ? ' overdue' : ''}`}>
            <span className="backup-status-dot" aria-hidden="true" />
            {lastBackupAt === null ? 'Never backed up' : `Last: ${formatTimeAgo(lastBackupAt, Date.now())}`}
          </span>
        </div>
        <p className="muted backup-copy">Your data lives only on this phone — a backup file is the only copy anywhere else. Keep a recent one.</p>
        <div className="row">
          <button onClick={handleExport} disabled={backupBusy}>Export backup</button>
          <button className="secondary" onClick={() => fileInputRef.current?.click()} disabled={backupBusy}>
            Restore…
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={pickImportFile}
        />
        {exportMsg && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{exportMsg}</p>}
        {importSummary && (
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--accent)' }}>
            Restored {Object.values(importSummary.tables).reduce((a, b) => a + b, 0)} records. Reloading…
          </p>
        )}
        {importError && (
          <p style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--danger)' }}>{importError}</p>
        )}
        <div className="section-divider" />
        <div className="row">
          <button className="secondary small" onClick={() => shareImportInputRef.current?.click()}>📥 Open a .meleo file</button>
          <button className="danger small" onClick={() => setConfirmClear(true)}>Clear all data…</button>
        </div>
        <input
          ref={shareImportInputRef}
          type="file"
          accept=".meleo,application/octet-stream,text/plain"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) {
              try { onImportEncoded?.(await readMeleoFile(file)) } catch { /* ImportConfirm surfaces bad files */ }
            }
          }}
        />
      </div>

      {/* Add to Home Screen (renders only when installing is possible and not done) */}
      <InstallCard />

      {/* ═══ Settings ═══ */}
      <div className="card">
        <button className="collapse-header" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>⚙️ Settings</span>
          <span className="chevron">{settingsOpen ? '▾' : '▸'}</span>
        </button>

        {settingsOpen && (
          <>
            <div className="field" style={{ marginTop: 10 }}>
              <span className="field-label">Theme</span>
              <div className="cat-pills">
                {([
                  ['light', '☀️ Light'],
                  ['dark', '🌙 Dark'],
                  ['pastel', '🌸 Pastel'],
                  ['mark', '🌊 Navy'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    className={`chip${theme === key ? ' active' : ''}`}
                    aria-pressed={theme === key}
                    onClick={() => changeTheme(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="misc-settings-divider" />
          <div className="misc-settings">
            {/* Your name */}
            <div className="field-row">
              <div className="field">
                <label className="field-label">First name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => saveProfileName(firstName, lastName)}
                  placeholder="First name"
                />
              </div>
              <div className="field">
                <label className="field-label">Last name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() => saveProfileName(firstName, lastName)}
                  placeholder="Last name"
                />
              </div>
            </div>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
              Stays on this device only — used for personalization and optional sharing features.
            </p>

            <div className="misc-settings-divider" />

            {/* Credit hours */}
            <label className="checkbox-row">
              <input type="checkbox" checked={creditEnabled} onChange={(e) => toggleCredit(e.target.checked)} />
              <div>
                <strong>Count credit hours</strong>
                <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                  Adds a Credit category when logging time, capped at 55 hours a month — for
                  example {CREDIT_ACTIVITY_SUGGESTIONS.join(', ')}. You can note which one it was
                  on the entry.
                </p>
              </div>
            </label>

            <div className="misc-settings-divider" />

            {/* Minute-bank animation */}
            <label className="checkbox-row">
              <input type="checkbox" checked={minuteAnimEnabled} onChange={(e) => toggleMinuteAnim(e.target.checked)} />
              <div>
                <strong>Minute-bank animation</strong>
                <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                  Plays a short animation when leftover minutes get banked. Turn off for an instant save.
                </p>
              </div>
            </label>

            <div className="misc-settings-divider" />

            {/* Default Service Schedule expansion */}
            <label className="checkbox-row">
              <input type="checkbox" checked={defaultExpandCalendar} onChange={(e) => setDefaultExpandCalendar(e.target.checked)} />
              <div>
                <strong>Expand to calendar by default</strong>
                <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                  When you expand the Service Schedule, open the month calendar instead of the week grid. The quick-toggle still opens the other view.
                </p>
              </div>
            </label>

            <div className="misc-settings-divider" />

            {/* Return visit reminders */}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={notifyEnabled}
                disabled={notifyPermission === 'unsupported'}
                onChange={(e) => toggleNotify(e.target.checked)}
              />
              <div>
                <strong>Return visit reminders</strong>
                <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                  {notifyPermission === 'unsupported'
                    ? "Notifications aren't supported in this browser."
                    : "Reminds you as a return visit approaches. With no backend, this only works while the app is open."}
                </p>
              </div>
            </label>
            {notifyPermission === 'denied' && (
              <p className="muted" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
                Notifications are blocked for this app in your browser/device settings — allow them there first.
              </p>
            )}
            {notifyEnabled && notifyPermission === 'granted' && (
              <div className="field" style={{ marginTop: 8 }}>
                <span className="field-label">Remind me</span>
                <div className="cat-pills">
                  {NOTIFY_LEAD_OPTIONS.map((opt) => (
                    <button
                      key={opt.minutes}
                      className={`chip${notifyLead === opt.minutes ? ' active' : ''}`}
                      onClick={() => changeNotifyLead(opt.minutes)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </div>

      {/* ═══ Features ═══ */}
      <div className="card">
        <label className="checkbox-row">
          <input type="checkbox" checked={territoriesOn} onChange={(e) => { setTerritoriesSetting(e.target.checked); setFeaturesVersion((n) => n + 1) }} />
          <div>
            <strong>Streets &amp; territories</strong>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
              Trace streets on the map, track house numbers, and group streets into territories. Adds Streets and Territories to People. Turning it off hides them; nothing is deleted.
            </p>
          </div>
        </label>
      </div>

      {/* ═══ Help & feedback ═══ */}
      <div className="card misc-help">
        <strong>Help &amp; feedback</strong>
        <div className="row">
          <button className="secondary small" onClick={onReplayTutorial}>Take the guided tour</button>
          <a className="link-button secondary" href={`mailto:${DEVELOPER_EMAIL}?subject=Meleo%20feedback`}>✉️ Send feedback</a>
          <button className="secondary small" onClick={shareApp}>📣 Share Meleo</button>
        </div>
        {shareMsg && <p className="muted" style={{ fontSize: 12, margin: 0, color: 'var(--accent)', wordBreak: 'break-all' }}>{shareMsg}</p>}
      </div>

      {/* ═══ Support ═══ */}
      <div className="card misc-donate">
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          ☕ Meleo is free and will stay that way — if it helps you, a tip is a kind thank-you, never expected.
        </p>
        <div className="tip-actions">
          {oneTimeTips.length === 1 ? (
            <a className="link-button tip-btn" href={oneTimeTips[0].oneTime} target="_blank" rel="noreferrer">One-Time Tip</a>
          ) : oneTimeTips.length > 1 ? (
            <button className="tip-btn" onClick={() => setTipMenu((m) => (m === 'oneTime' ? null : 'oneTime'))}>One-Time Tip</button>
          ) : null}

          {monthlyTips.length === 1 ? (
            <a className="link-button secondary tip-btn" href={monthlyTips[0].monthly} target="_blank" rel="noreferrer">Recurring Tip</a>
          ) : monthlyTips.length > 1 ? (
            <button className="secondary tip-btn" onClick={() => setTipMenu((m) => (m === 'monthly' ? null : 'monthly'))}>Recurring Tip</button>
          ) : null}
        </div>

        {tipMenu && (
          <div className="tip-menu">
            {tipServices(tipMenu).map((s) => (
              <a key={s.id} className="link-button" href={s[tipMenu]} target="_blank" rel="noreferrer">
                {s.emoji} {s.label}
              </a>
            ))}
          </div>
        )}
        {tipMenu && (
          <div className="tip-menu">
            {tipServices(tipMenu).map((s) => (
              <a key={s.id} className="link-button" href={s[tipMenu]} target="_blank" rel="noreferrer">
                {s.emoji} {s.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Developer (dev builds only, never shipped) ───────── */}
      {import.meta.env.DEV && (
        <div className="card">
          <h4>Developer</h4>
          <p className="muted" style={{ margin: '2px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
            Fills the app with ~1.5 years of realistic pioneer activity (Rankin County, MS) for previewing.
            This replaces all current data.
          </p>
          <button className="secondary" onClick={() => setConfirmSeed(true)}>Load Demo Year</button>
        </div>
      )}

      {/* ═══ Legal ═══ */}
      <div className="card">
        <button className="collapse-header" onClick={() => setLegalOpen((v) => !v)}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>🔒 Legal & Privacy</span>
          <span className="chevron">{legalOpen ? '▾' : '▸'}</span>
        </button>

        {legalOpen && (
          <div className="misc-privacy">
            <div className="misc-privacy-item">
              <span className="misc-privacy-icon" aria-hidden="true">ℹ️</span>
              <div>
                <strong>Not affiliated.</strong>
                <p>{NOT_AFFILIATED}</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon" aria-hidden="true">📱</span>
              <div>
                <strong>Your data stays on your device.</strong>
                <p>Contacts, call logs, time records, and schedules live only in your browser's local storage (IndexedDB). Meleo has no server — no analytics, tracking, ads, or backend — and the developer can't see anything you enter. The only outside services are the map ones: address text goes to OpenStreetMap to find a position, traced areas go to Overpass to snap to roads, and Esri serves the map tiles. Never a name or a note.</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon" aria-hidden="true">⚖️</span>
              <div>
                <strong>Terms of use.</strong>
                <p>The app is provided "as is," without warranty of any kind. You're responsible for the information you store and for using it lawfully. To the fullest extent permitted by law, the developer isn't liable for any damages or data loss arising from your use of the app. Use is at your own risk.</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon" aria-hidden="true">©️</span>
              <div>
                <strong>Copyright.</strong>
                <p>{COPYRIGHT_SUMMARY}</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon" aria-hidden="true">👋</span>
              <div>
                <strong>Developer.</strong>
                <p>Made by {DEVELOPER_NAME}. Questions or feedback? <a href={`mailto:${DEVELOPER_EMAIL}`}>{DEVELOPER_EMAIL}</a></p>
              </div>
            </div>

            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '2px 0 0' }}>
              Informational summary — see the full Privacy Policy &amp; Terms you accepted at first launch.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all app data?"
        message="This permanently deletes all contacts, streets, territories, call history, time logs, return visits, and settings on this device. There is no server copy. Export a backup first if you might want any of it back."
        confirmLabel="Continue"
        cancelLabel="Never mind"
        tone="danger"
        onConfirm={() => { setConfirmClear(false); setConfirmClear2(true) }}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmDialog
        open={confirmClear2}
        title="Delete everything?"
        message="Last check — this can't be undone."
        confirmLabel="Yes, I have a backup"
        cancelLabel="Never mind"
        tone="danger"
        onConfirm={() => { setConfirmClear2(false); clearAllData() }}
        onCancel={() => setConfirmClear2(false)}
      />

      <ConfirmDialog
        open={confirmSeed}
        title="Load a year of demo data?"
        message="This replaces all current contacts, time logs, call history, and schedule settings with generated demo data. This cannot be undone."
        confirmLabel="Yes, load demo data"
        cancelLabel="Never mind"
        tone="danger"
        onConfirm={() => { setConfirmSeed(false); loadDemoData() }}
        onCancel={() => setConfirmSeed(false)}
      />

      <ConfirmDialog
        open={!!pendingImport}
        title="Restore this backup?"
        message="This replaces your current data with the contents of the backup file. Anything not in the file will be lost. Consider exporting a backup first."
        confirmLabel="Restore"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={confirmImport}
        onCancel={() => setPendingImport(null)}
      />

      {/* Five taps on the version shows the launch-viewport numbers (viewportFix.ts) for a
          device check; ordinary users never see them. */}
      <p className="muted" style={{ textAlign: 'center', fontSize: 12, margin: '4px 0 0' }} onClick={() => setVersionTaps((n) => n + 1)}>
        Meleo v{APP_VERSION}
      </p>
      {(import.meta.env.DEV || versionTaps >= 5) && (
        <p className="muted" style={{ textAlign: 'center', fontSize: 10, margin: '2px 0 0', opacity: 0.6 }}>
          {viewportDiag()}
        </p>
      )}
      {editingGoal && <GoalEditorModal prefs={schedulePrefs} onClose={() => setEditingGoal(false)} />}
    </div>
  )
}
