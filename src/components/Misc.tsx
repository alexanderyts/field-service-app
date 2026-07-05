import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import ConfirmDialog from './ConfirmDialog'
import { exportBackup, importBackup, wipeAllData, type ImportSummary } from '../backup'
import { readMeleoFile } from '../share'
import { InstallCard } from './InstallPrompt'
import { tipServices, type TipKind } from '../tips'
import { APP_VERSION } from '../version'
import { COPYRIGHT_SUMMARY, NOT_AFFILIATED, DEVELOPER_NAME, DEVELOPER_EMAIL } from '../legal'
import { getProfileName, saveProfileName } from '../profile'
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

const CREDIT_CAT_LABELS: Record<string, string> = {
  ldc: 'LDC (Construction)',
  hlc: 'HLC',
  convention: 'Convention',
  assembly: 'Assembly',
  bethel: 'Bethel',
  other: 'Other',
}

export default function Misc({ onReplayTutorial, onImportEncoded }: { onReplayTutorial: () => void; onImportEncoded?: (encoded: string) => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [creditEnabled, setCreditEnabled] = useState(() => localStorage.getItem('fieldservice_credit_hours') === 'yes')
  const schedulePrefs = useLiveQuery(() => db.schedulePrefs.get(1), [])
  const defaultExpandCalendar = schedulePrefs?.scheduleDefaultExpand === 'calendar'
  async function setDefaultExpandCalendar(v: boolean) {
    await db.schedulePrefs.update(1, { scheduleDefaultExpand: v ? 'calendar' : 'week' })
  }
  const [theme, setThemeState] = useState<'light' | 'dark' | 'pastel' | 'mark'>(() => {
    const t = localStorage.getItem('fieldservice_theme')
    if (t === 'dark' || t === 'pastel' || t === 'mark') return t
    // Fallback for devices that enabled dark mode before the theme picker existed.
    if (localStorage.getItem('fieldservice_dark_mode') === 'yes') return 'dark'
    return 'light'
  })
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

  async function handleExport() {
    setExportMsg(null)
    setBackupBusy(true)
    try {
      const how = await exportBackup()
      setExportMsg(how === 'shared' ? 'Backup ready to save or send.' : 'Backup file downloaded.')
    } catch {
      setExportMsg('Could not create the backup. Please try again.')
    } finally {
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
    localStorage.setItem('fieldservice_credit_hours', v ? 'yes' : 'no')
  }

  function changeTheme(t: 'light' | 'dark' | 'pastel' | 'mark') {
    setThemeState(t)
    localStorage.setItem('fieldservice_theme', t)
    // Retire the old boolean key so it can't disagree with the new one.
    localStorage.removeItem('fieldservice_dark_mode')
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

      {/* ── 1. Tips ─────────────────────────────────────────── */}
      <div className="card misc-donate">
        <div className="misc-donate-header">
          <span className="misc-donate-emoji">☕</span>
          <div>
            <h4 style={{ margin: 0, lineHeight: 1.4 }}>Enjoying the app? Buy me a coffee at the next break :D</h4>
          </div>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          This app is 100% free — every feature, every update, forever. No ads, no paywalls, no
          subscriptions required.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          If it's saved you time or made your day a little easier, a tip is a nice way to say thanks —
          but never expected. It just helps keep the lights on and the updates coming.
        </p>

        <div className="tip-actions">
          {oneTimeTips.length === 1 ? (
            <a className="link-button tip-btn" href={oneTimeTips[0].oneTime} target="_blank" rel="noreferrer">One-Time Tip</a>
          ) : oneTimeTips.length > 1 ? (
            <button className="tip-btn" onClick={() => setTipMenu((m) => (m === 'oneTime' ? null : 'oneTime'))}>One-Time Tip</button>
          ) : null}

          {monthlyTips.length === 1 ? (
            <a className="link-button secondary tip-btn" href={monthlyTips[0].monthly} target="_blank" rel="noreferrer">Monthly Support</a>
          ) : monthlyTips.length > 1 ? (
            <button className="secondary tip-btn" onClick={() => setTipMenu((m) => (m === 'monthly' ? null : 'monthly'))}>Monthly Support</button>
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

        <p className="muted" style={{ fontSize: 12, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
          Totally optional. Only if you'd like.
        </p>
      </div>

      {/* ── Add to Home Screen ──────────────────────────────── */}
      <InstallCard />

      {/* ── Share the app ───────────────────────────────────── */}
      <div className="card">
        <strong>📣 Share Meleo</strong>
        <p className="muted" style={{ margin: '3px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
          Know someone who'd find this handy? Send them the link — it opens right in their browser,
          no sign-up or install required, and their data stays on their own device.
        </p>
        <div className="row">
          <button onClick={shareApp}>Share the App Link</button>
          <a className="link-button secondary" href={appUrl} target="_blank" rel="noreferrer">Open in Browser</a>
        </div>
        {shareMsg && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--accent)', wordBreak: 'break-all' }}>{shareMsg}</p>}
      </div>

      {/* ── Feedback & Suggestions ──────────────────────────── */}
      <div className="card">
        <strong>💬 Feedback &amp; Suggestions</strong>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: '6px 0 0' }}>
          Have an idea, a feature request, a bug to report, or need a hand with something? I'd genuinely
          love to hear it.
        </p>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 12px' }}>
          Meleo is a solo project, so I can't promise I'll be able to build everything — but every note
          helps me make the app better, and I read them all.
        </p>
        <a
          className="link-button"
          href="mailto:meleoapp@gmail.com?subject=Meleo%20feedback"
        >
          ✉️ meleoapp@gmail.com
        </a>
      </div>

      {/* ── 2. Theme ────────────────────────────────────────── */}
      <div className="card">
        <strong>Theme</strong>
        <p className="muted" style={{ margin: '3px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
          Pick the look that's easiest on your eyes.
        </p>
        <div className="cat-pills">
          {([
            ['light', '☀️ Light'],
            ['dark', '🌙 Dark'],
            ['pastel', '🌸 Pastel'],
            ['mark', '🌊 Mark'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              className={`chip${theme === key ? ' active' : ''}`}
              onClick={() => changeTheme(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3. App Settings (credit hours, minute bank, reminders) ── */}
      <div className="card">
        <button className="collapse-header" onClick={() => setSettingsOpen((v) => !v)}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>⚙️ App Settings</span>
          <span className="chevron">{settingsOpen ? '▾' : '▸'}</span>
        </button>

        {settingsOpen && (
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
                  Adds LDC, HLC, Convention, Assembly, Bethel, and Other categories when logging time.
                </p>
              </div>
            </label>
            {creditEnabled && (
              <div className="cat-pills" style={{ marginTop: 2 }}>
                {Object.entries(CREDIT_CAT_LABELS).map(([k, v]) => (
                  <span key={k} className="chip" style={{ fontSize: 12, padding: '5px 12px' }}>{v}</span>
                ))}
              </div>
            )}

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
        )}
      </div>

      {/* ── Backup & Restore ────────────────────────────────── */}
      <div className="card">
        <strong>💾 Backup &amp; Restore</strong>
        <p className="muted" style={{ margin: '3px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
          Your data lives only on this device. Save a backup file to keep it safe, move it to a new
          device, or carry it into a future version of the app. Back up regularly while field testing.
        </p>
        <div className="row">
          <button onClick={handleExport} disabled={backupBusy}>Export Backup</button>
          <button className="secondary" onClick={() => fileInputRef.current?.click()} disabled={backupBusy}>
            Restore from Backup
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
        <strong>📥 Import a Shared Item</strong>
        <p className="muted" style={{ margin: '3px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
          Someone shared a contact, street, or territory with you as a <strong>.meleo</strong> file? Open it here.
          (Most shares are QR codes — just scan those with your camera.)
        </p>
        <button className="secondary" onClick={() => shareImportInputRef.current?.click()}>Open a .meleo File</button>
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

      {/* ── 4. Guided tour ──────────────────────────────────── */}
      <div className="card">
        <strong>Guided Tour</strong>
        <p className="muted" style={{ margin: '3px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
          A quick walkthrough of each tab.
        </p>
        <button className="secondary" onClick={onReplayTutorial}>Take the Guided Tour</button>
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

      {/* ── 5. Legal & Privacy ──────────────────────────────── */}
      <div className="card">
        <button className="collapse-header" onClick={() => setLegalOpen((v) => !v)}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>🔒 Legal & Privacy</span>
          <span className="chevron">{legalOpen ? '▾' : '▸'}</span>
        </button>

        {legalOpen && (
          <div className="misc-privacy">
            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">ℹ️</span>
              <div>
                <strong>Not affiliated.</strong>
                <p>{NOT_AFFILIATED}</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">📱</span>
              <div>
                <strong>Your data stays on your device.</strong>
                <p>Contacts, call logs, time records, and schedules live only in your browser's local storage (IndexedDB). Nothing is sent to a server — no analytics, tracking, ads, or backend. The developer can't see anything you enter.</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">⚖️</span>
              <div>
                <strong>Terms of use.</strong>
                <p>The app is provided "as is," without warranty of any kind. You're responsible for the information you store and for using it lawfully. To the fullest extent permitted by law, the developer isn't liable for any damages or data loss arising from your use of the app. Use is at your own risk.</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">©️</span>
              <div>
                <strong>Copyright.</strong>
                <p>{COPYRIGHT_SUMMARY}</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">👋</span>
              <div>
                <strong>Developer.</strong>
                <p>Made by {DEVELOPER_NAME}. Questions or feedback? <a href={`mailto:${DEVELOPER_EMAIL}`}>{DEVELOPER_EMAIL}</a></p>
              </div>
            </div>

            <p className="muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '2px 0 0' }}>
              Informational summary — see the full Privacy Policy &amp; Terms you accepted at first launch.
            </p>

            <button className="danger" style={{ marginTop: 4 }} onClick={() => setConfirmClear(true)}>
              Clear All App Data
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all app data?"
        message="This permanently deletes all contacts, time logs, call history, and schedule settings. This cannot be undone."
        confirmLabel="Yes, delete everything"
        cancelLabel="Never mind"
        tone="danger"
        onConfirm={clearAllData}
        onCancel={() => setConfirmClear(false)}
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

      <p className="muted" style={{ textAlign: 'center', fontSize: 12, margin: '4px 0 0' }}>
        Meleo v{APP_VERSION}
      </p>
    </div>
  )
}
