import { useState } from 'react'
import { db } from '../db'
import ConfirmDialog from './ConfirmDialog'

const CREDIT_CAT_LABELS: Record<string, string> = {
  ldc: 'LDC (Construction)',
  convention: 'Convention',
  assembly: 'Assembly',
  bethel: 'Bethel',
  other: 'Other',
}

export default function Misc() {
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [creditEnabled, setCreditEnabled] = useState(() => localStorage.getItem('fieldservice_credit_hours') === 'yes')

  function toggleCredit(v: boolean) {
    setCreditEnabled(v)
    localStorage.setItem('fieldservice_credit_hours', v ? 'yes' : 'no')
  }

  async function clearAllData() {
    await Promise.all([
      db.people.clear(),
      db.calls.clear(),
      db.timeLogs.clear(),
      db.appointments.clear(),
      db.schedulePrefs.clear(),
    ])
    localStorage.removeItem('fieldservice_privacy_v1')
    window.location.reload()
  }

  return (
    <div className="view">
      <h2 className="applet-title">More</h2>

      {/* ── Credit hours ────────────────────────────────────── */}
      <div className="card">
        <label className="checkbox-row">
          <input type="checkbox" checked={creditEnabled} onChange={(e) => toggleCredit(e.target.checked)} />
          <div>
            <strong>Count credit hours</strong>
            <p className="muted" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.5 }}>
              Adds LDC, Convention, Assembly, Bethel, and Other categories when logging time.
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
      </div>

      {/* ── Privacy ─────────────────────────────────────────── */}
      <div className="card">
        <button className="collapse-header" onClick={() => setPrivacyOpen((v) => !v)}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>🔒 Your Privacy</span>
          <span className="chevron">{privacyOpen ? '▾' : '▸'}</span>
        </button>

        {privacyOpen && (
          <div className="misc-privacy">
            <p className="misc-privacy-lead">
              Field Service is built around one simple idea: <strong>your data belongs to you</strong> — and only you.
            </p>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">📱</span>
              <div>
                <strong>Everything stays on your device.</strong>
                <p>Contacts, call logs, time records, and schedule data are stored exclusively in your browser's local storage (IndexedDB). Nothing is ever sent to a server.</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">🚫</span>
              <div>
                <strong>Zero data collection.</strong>
                <p>There are no analytics, no tracking scripts, no advertising, and no backend infrastructure. The developer has no access to anything you enter.</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">⚖️</span>
              <div>
                <strong>US data protection law compliant.</strong>
                <p>Because this app collects no personal data, processes nothing server-side, and sells nothing, it falls outside the applicability thresholds of the CCPA, Virginia CDPA, and all other current US state privacy frameworks. Your use of the app is covered by the Privacy Policy you agreed to at setup.</p>
              </div>
            </div>

            <div className="misc-privacy-item">
              <span className="misc-privacy-icon">🗑️</span>
              <div>
                <strong>You're in full control.</strong>
                <p>You can delete any contact, log, or record at any time. Or use the button below to wipe everything and start fresh.</p>
              </div>
            </div>

            <button className="danger" style={{ marginTop: 4 }} onClick={() => setConfirmClear(true)}>
              Clear All App Data
            </button>
          </div>
        )}
      </div>

      {/* ── Donate ──────────────────────────────────────────── */}
      <div className="card misc-donate">
        <div className="misc-donate-header">
          <span className="misc-donate-emoji">☕</span>
          <div>
            <h4 style={{ margin: 0 }}>Buy me a coffee at the next break</h4>
            <p className="muted" style={{ margin: '2px 0 0' }}>...if you feel so inclined 😄</p>
          </div>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Field Service is completely free — every feature, every update, forever. No subscriptions,
          no paywalls, no ads. But if this app has been useful to you, a small donation goes a long
          way toward keeping the lights on and building new features.
        </p>

        <div className="misc-donate-box">
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>Send via PayPal to</p>
          <p style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 700, color: 'var(--text-h)' }}>alexander.yts@gmail.com</p>
        </div>

        <a
          className="link-button"
          href="https://www.paypal.com/send?recipient=alexander.yts%40gmail.com"
          target="_blank"
          rel="noreferrer"
          style={{ textAlign: 'center' }}
        >
          Donate via PayPal
        </a>

        <p className="muted" style={{ fontSize: 12, margin: 0, textAlign: 'center' }}>
          Completely optional — thank you either way! 🙏
        </p>
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
    </div>
  )
}
