import { useState } from 'react'
import { COPYRIGHT_LINE, DEVELOPER_EMAIL, NOT_AFFILIATED } from '../legal'
import { getProfileName, saveProfileName } from '../profile'
import { applyFirstRunRole } from '../roleSetup'
import type { Role } from '../schedulePrefsRole'

// Bumped from v1 -> v2 because the policy text itself changed (app renamed to Meleo, new
// contact email) — existing testers should see and re-accept the updated document, not have
// their old acceptance of a different document silently carried forward.
const POLICY_KEY = 'fieldservice_privacy_v2'

export function hasAcceptedPolicy(): boolean {
  try { return localStorage.getItem(POLICY_KEY) === 'yes' } catch { return false }
}

function storeAcceptance() {
  try { localStorage.setItem(POLICY_KEY, 'yes') } catch {}
}

/** ἐπιμελέομαι (epimeleomai) — "to take care of, to attend to with diligence"; it's the
    word Luke uses for the Samaritan tending the wounded man. The app's name sits inside it
    letter-for-letter: epi-MELEO-mai. The Greek fades in, the outer ἐπι/μαι quietly drop
    away, and the remaining μελέο wipes into the Latin wordmark "Meleo". Pure CSS animation
    (see .splash-* in App.css) — it just plays once on mount, no JS orchestration needed. */
export function SplashScreen({ leaving }: { leaving: boolean }) {
  return (
    <div className={`splash${leaving ? ' splash-leaving' : ''}`}>
      <div className="splash-inner">
        <div className="splash-icon">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="27" y="9" width="15" height="31" rx="2.4" stroke="var(--splash-accent-2)" strokeWidth="2.2" />
            <circle cx="29.4" cy="25" r="1.3" fill="var(--splash-accent-2)" />
            <circle cx="12.5" cy="20" r="3.3" stroke="var(--splash-accent)" strokeWidth="2.4" />
            <path d="M12.5 23.3c-3.9 1.5-6.5 4.3-6.5 7.7v9" stroke="var(--splash-accent)" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M12.5 23.3c3.9 1.5 6.5 4.3 6.5 7.7v9" stroke="var(--splash-accent)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
        <div className="splash-wordstack">
          <div className="splash-halo" />
          <div className="splash-word-layer splash-greek">
            <span className="splash-g-part splash-g-prefix">ἐπι</span>
            <span className="splash-g-part splash-g-core">μελέο</span>
            <span className="splash-g-part splash-g-suffix">μαι</span>
          </div>
          <div className="splash-wipe-edge" />
          <div className="splash-word-layer splash-latin">Meleo</div>
        </div>
        <p className="splash-tagline">Ministry Companion</p>
      </div>
    </div>
  )
}

/** The full Privacy Policy & Terms of Use, shown on request from the welcome screen. */
function PolicyText() {
  return (
    <>
      <p className="privacy-effective">Effective June 30, 2026</p>
    <div className="privacy-sections">
      <section>
        <h4>Not Affiliated</h4>
        <p>{NOT_AFFILIATED}</p>
      </section>

      <section>
        <h4>1. About This App</h4>
        <p>
          Meleo ("the App") is a free personal ministry record-keeping tool provided by an
          independent developer. It is provided as-is, with no warranties of any kind, express or implied.
        </p>
      </section>

      <section>
        <h4>2. Data Storage — Local Only</h4>
        <p>
          All data you enter — including contacts, addresses, phone numbers, call logs, time records, and
          schedules — is stored exclusively on your device using your browser's built-in local storage
          (IndexedDB). <strong>The App has no server of its own, and the developer has no access to anything
          you enter.</strong> Nothing you record is uploaded or synced anywhere; sharing between devices
          happens only by a QR code, link, or file you choose to send.
        </p>
      </section>

      <section>
        <h4>3. Your Responsibility for Stored Data</h4>
        <p>
          You are solely responsible for the personal information you choose to store in this App, including
          names, addresses, phone numbers, and notes about other individuals. By using this App, you confirm
          that you will handle all such information lawfully, respectfully, and in compliance with all
          applicable laws in your jurisdiction. The developer is not responsible for how you use, store, or
          manage this information.
        </p>
      </section>

      <section>
        <h4>4. No Data Collection or Tracking</h4>
        <p>
          This App does not collect, process, sell, or share any personal data about you or the contacts you
          create. There are no analytics, tracking scripts, advertising networks, or backend infrastructure of
          any kind. The map features do talk to outside map services, and it is only fair to say exactly what
          they receive: when you save an address or type one in, the <strong>address text</strong> (never a
          name, phone number, or note) is sent to OpenStreetMap's Nominatim service to find its position;
          when you trace a street, the <strong>area's coordinates</strong> are sent to the Overpass API to snap
          the line to a real road; and the map tiles you look at are fetched from Esri, which therefore sees
          the <strong>area being viewed</strong>. "Get Directions" opens the address in Google Maps. Each of
          these also sees your device's IP address, as any web request does. If you never enter an address
          and never open the map, none of them are contacted.
        </p>
      </section>

      <section>
        <h4>5. Your Right to Delete Data</h4>
        <p>
          You may delete any or all data at any time from within the App, or by clearing your browser's site
          data. No copy of your data exists anywhere other than on your own device.
        </p>
      </section>

      <section>
        <h4>6. Children's Privacy</h4>
        <p>
          This App is intended for use by adults (18 and older). Do not use this App to store personal
          information about minors without appropriate legal authority to do so.
        </p>
      </section>

      <section>
        <h4>7. Device Security</h4>
        <p>
          Your locally stored data is protected only by your device's own security. The developer recommends
          using a screen lock and enabling full-disk encryption on your device to protect the information you
          store. The developer is not responsible for unauthorized access to data resulting from inadequate
          device security.
        </p>
      </section>

      <section>
        <h4>8. Limitation of Liability</h4>
        <p>
          THIS APP IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
          LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE DEVELOPER SHALL NOT BE LIABLE FOR ANY
          DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING BUT NOT
          LIMITED TO LOSS OF DATA, PRIVACY BREACHES, OR UNAUTHORIZED ACCESS) ARISING OUT OF OR IN CONNECTION
          WITH YOUR USE OF THIS APP OR YOUR STORAGE OR HANDLING OF PERSONAL DATA WITHIN IT, EVEN IF ADVISED
          OF THE POSSIBILITY OF SUCH DAMAGES. YOUR USE OF THIS APP IS ENTIRELY AT YOUR OWN RISK.
        </p>
      </section>

      <section>
        <h4>9. Indemnification</h4>
        <p>
          By accepting these terms, you agree to indemnify, defend, and hold harmless the developer from and
          against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable
          attorneys' fees) arising out of or relating to your use of the App, your storage or handling of
          personal data within it, or your violation of any applicable law or these terms.
        </p>
      </section>

      <section>
        <h4>10. US Data Privacy Compliance</h4>
        <p>
          Because this App stores all data exclusively on your device with no server-side collection,
          processing, or transmission, it is designed to be consistent with applicable US data privacy
          frameworks, including the California Consumer Privacy Act (CCPA/CPRA), the Virginia Consumer Data
          Protection Act (CDPA), and similar state statutes effective in 2026. You are solely responsible for
          ensuring that your own use of this App — including the personal information you choose to record —
          complies with the laws of your state and jurisdiction.
        </p>
      </section>

      <section>
        <h4>11. Updates to This Policy</h4>
        <p>
          This policy may be updated periodically. Continued use of the App following any update constitutes
          your acceptance of the revised terms. The effective date at the top of this document indicates when
          the current version was last revised.
        </p>
      </section>

      <section>
        <h4>12. Copyright &amp; Ownership</h4>
        <p>
          {COPYRIGHT_LINE} The App, including its name, design, code, and content, is the
          intellectual property of the developer and is protected by applicable copyright and
          other laws. You may not copy, modify, distribute, sell, or create derivative works from
          the App without the developer's prior written permission.
        </p>
      </section>

      <section>
        <h4>13. Contact</h4>
        <p>
          For questions or concerns about this policy, contact:{' '}
          <strong>{DEVELOPER_EMAIL}</strong>
        </p>
      </section>
    </div>
    </>
  )
}

/**
 * First run, one screen (Phase 3e — it used to be policy, then name, then the tour offer,
 * then the Service intro, then the goal survey): what Meleo does with your data in plain
 * words, the full policy one tap away, an optional name, and the one question that decides
 * what Service counts. Then straight into Service. The tour is offered from More instead.
 */
export function WelcomeGate({ onDone }: { onDone: () => void }) {
  const existing = getProfileName()
  const [firstName, setFirstName] = useState(existing.firstName)
  const [lastName, setLastName] = useState(existing.lastName)
  const [role, setRole] = useState<Role | null>(null)
  const [auxTarget, setAuxTarget] = useState<15 | 30>(30)
  const [agreed, setAgreed] = useState(false)
  const [showPolicy, setShowPolicy] = useState(false)
  const [busy, setBusy] = useState(false)

  async function start() {
    if (!agreed || !role || busy) return
    setBusy(true)
    if (firstName.trim() || lastName.trim()) saveProfileName(firstName, lastName)
    await applyFirstRunRole(role, auxTarget)
    storeAcceptance()
    onDone()
  }

  const roleBtn = (r: Role, label: string, hint: string) => (
    <button className={`welcome-role${role === r ? '' : ' secondary'}`} aria-pressed={role === r} onClick={() => setRole(r)}>
      <strong>{label}</strong>
      <span>{hint}</span>
    </button>
  )

  return (
    <div className="privacy-screen">
      <div className="privacy-header-bar">
        <div className="brand-mark" />
        <span className="privacy-app-name">Meleo</span>
      </div>

      <div className="privacy-scroll">
        <h2 className="privacy-title">Welcome</h2>

        <ul className="welcome-points">
          <li><strong>It stays on this phone.</strong> No account and no server — the developer can't see anything you enter.</li>
          <li><strong>Maps ask outside services</strong> about the addresses and areas you look up — never names, phone numbers or notes.</li>
          <li><strong>Back up now and then</strong> from More: a backup file is the only copy of your data off this phone.</li>
          <li>{NOT_AFFILIATED}</li>
        </ul>
        <button type="button" className="link-btn" onClick={() => setShowPolicy((v) => !v)} aria-expanded={showPolicy}>
          {showPolicy ? 'Hide the full privacy policy' : 'Read the full privacy policy & terms'}
        </button>
        {showPolicy && <PolicyText />}

        <h4 className="welcome-q">Which best describes you?</h4>
        <div className="welcome-roles">
          {roleBtn('publisher', 'Publisher', 'Report whether you shared each month.')}
          {roleBtn('auxiliary', 'Auxiliary pioneer', '15 or 30 hours this month.')}
          {roleBtn('pioneer', 'Regular pioneer', '600 hours a service year.')}
        </div>
        {role === 'auxiliary' && (
          <div className="cat-pills" role="group" aria-label="Hours this month" style={{ marginTop: 8 }}>
            <button className={`chip${auxTarget === 15 ? ' active' : ''}`} aria-pressed={auxTarget === 15} onClick={() => setAuxTarget(15)}>15 hours</button>
            <button className={`chip${auxTarget === 30 ? ' active' : ''}`} aria-pressed={auxTarget === 30} onClick={() => setAuxTarget(30)}>30 hours</button>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>You can change this, add credit hours or a personal goal anytime (Service → Change my goal).</p>

        <h4 className="welcome-q">Your name <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></h4>
        <div className="field-row">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" aria-label="First name" />
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" aria-label="Last name" />
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Stays on this phone — shown as "from" when you share something.</p>
      </div>

      <div className="privacy-footer">
        <label className="checkbox-row privacy-check">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I agree to the Privacy Policy and Terms of Use</span>
        </label>
        <button className="full" disabled={!agreed || !role || busy} onClick={start}>
          {role ? 'Get started' : 'Choose one above to start'}
        </button>
      </div>
    </div>
  )
}
