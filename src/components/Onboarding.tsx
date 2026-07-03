import { useState } from 'react'
import { COPYRIGHT_LINE, DEVELOPER_EMAIL, NOT_AFFILIATED } from '../legal'
import { getProfileName, saveProfileName, markProfilePromptSeen } from '../profile'

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
            <rect x="27" y="9" width="15" height="31" rx="2.4" stroke="#5a7d3a" strokeWidth="2.2" />
            <circle cx="29.4" cy="25" r="1.3" fill="#5a7d3a" />
            <circle cx="12.5" cy="20" r="3.3" stroke="#2f6f5e" strokeWidth="2.4" />
            <path d="M12.5 23.3c-3.9 1.5-6.5 4.3-6.5 7.7v9" stroke="#2f6f5e" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M12.5 23.3c3.9 1.5 6.5 4.3 6.5 7.7v9" stroke="#2f6f5e" strokeWidth="2.4" strokeLinecap="round" />
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

export function PrivacyGate({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false)

  function accept() {
    if (!checked) return
    storeAcceptance()
    onAccept()
  }

  return (
    <div className="privacy-screen">
      <div className="privacy-header-bar">
        <div className="brand-mark" />
        <span className="privacy-app-name">Meleo</span>
      </div>

      <div className="privacy-scroll">
        <h2 className="privacy-title">Privacy Policy<br />& Terms of Use</h2>
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
              (IndexedDB). <strong>No data is ever transmitted to any server, cloud service, or third party.</strong>{' '}
              The developer has no access to any information you enter into this App.
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
              any kind.
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
      </div>

      <div className="privacy-footer">
        <label className="checkbox-row privacy-check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>I have read and agree to the Privacy Policy and Terms of Use</span>
        </label>
        <button className="full" disabled={!checked} onClick={accept}>
          Get Started
        </button>
      </div>
    </div>
  )
}

export function ProfileGate({ onDone }: { onDone: () => void }) {
  const existing = getProfileName()
  const [firstName, setFirstName] = useState(existing.firstName)
  const [lastName, setLastName] = useState(existing.lastName)

  function finish(save: boolean) {
    if (save && (firstName.trim() || lastName.trim())) saveProfileName(firstName, lastName)
    markProfilePromptSeen()
    onDone()
  }

  return (
    <div className="privacy-screen">
      <div className="privacy-header-bar">
        <div className="brand-mark" />
        <span className="privacy-app-name">Meleo</span>
      </div>

      <div className="privacy-scroll">
        <h2 className="privacy-title">What should<br />we call you?</h2>
        <p className="privacy-effective">Totally optional</p>

        <div className="privacy-sections">
          <section>
            <p>
              This stays on this device only — it's used to personalize the app for you, and
              for optional sharing features you may choose to use later. It's never sent
              anywhere.
            </p>
          </section>

          <div className="field-row">
            <div className="field">
              <label className="field-label">First name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div className="field">
              <label className="field-label">Last name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
            </div>
          </div>
        </div>
      </div>

      <div className="privacy-footer">
        <button className="full" onClick={() => finish(true)}>
          Continue
        </button>
        <button className="full secondary" onClick={() => finish(false)}>
          Skip for now
        </button>
      </div>
    </div>
  )
}
