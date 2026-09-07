import { useState } from 'react'
import ModalPortal from '../ModalPortal'
import { getProfileName } from '../profile'
import {
  type ShareKind,
  type SharePayload,
  buildShareUrl,
  canShareAsLink,
  encodeSharePayload,
  generateQrDataUrl,
  recordShare,
  shareEncodedFile,
} from '../share'

/** The share flow, reused by contact/street/territory detail views. Asks who the item is
    going to (recorded locally for attribution + the edit-warning), then offers the three
    transports the same payload can travel by: a QR to scan face-to-face, a tappable link to
    send, or a file for payloads too large to be either. */
export default function ShareModal({
  kind,
  recordId,
  itemName,
  buildPayload,
  onClose,
}: {
  kind: ShareKind
  /** The Dexie id of the shared record, so the share is logged onto it (`sharedWith`). Omit
      for ephemeral items with no standalone record yet (e.g. a draft traced street). */
  recordId?: number
  itemName: string
  buildPayload: (from: string) => SharePayload | Promise<SharePayload>
  onClose: () => void
}) {
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [encoded, setEncoded] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [tooBig, setTooBig] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const from = fullProfileName()
      if (recordId != null) await recordShare(kind, recordId, recipient.trim() || 'Someone')
      const payload = await buildPayload(from)
      const enc = await encodeSharePayload(payload)
      setEncoded(enc)
      if (canShareAsLink(enc)) setUrl(buildShareUrl(enc))
      const dataUrl = await generateQrDataUrl(buildShareUrl(enc))
      if (dataUrl) setQr(dataUrl)
      else setTooBig(true)
    } catch {
      setError('Could not prepare the share. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setMsg('Link copied — paste it into a message.')
    } catch {
      // No clipboard permission (or an insecure origin): showing the link is still a way out.
      setMsg(url)
    }
  }

  async function sendLink() {
    if (!url) return
    setMsg(null)
    const shareData = { title: `Meleo — ${itemName}`, text: `“${itemName}” — open this in Meleo:`, url }
    try {
      if (typeof navigator !== 'undefined' && navigator.canShare?.(shareData)) {
        await navigator.share(shareData)
        return
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    await copyLink()
  }

  async function shareQrImage() {
    if (!qr) return
    try {
      const blob = await (await fetch(qr)).blob()
      const file = new File([blob], `meleo-${kind}-qr.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Meleo ${kind}` })
        return
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
    const a = document.createElement('a')
    a.href = qr
    a.download = `meleo-${kind}-qr.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  async function shareFile() {
    if (!encoded) return
    setMsg(null)
    const how = await shareEncodedFile(encoded, `meleo-${kind}-${itemName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`)
    setMsg(how === 'shared' ? 'Shared — the other device can open it in Meleo.' : 'File downloaded — send it to the other person to import.')
  }

  const started = qr !== null || tooBig
  const them = recipient.trim() || 'them'

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close" aria-label="Close">×</button>
          </div>
          <h3 style={{ marginTop: 0 }}>Share “{itemName}”</h3>

          {!started ? (
            <>
              <label className="field">
                <span className="field-label">Who are you sharing this with?</span>
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. John Smith" autoFocus />
              </label>
              <p className="muted" style={{ fontSize: 12 }}>
                Scan it in person, or send it as a link. Nothing is sent to a server — the data travels inside the
                link itself.
              </p>
              <button onClick={generate} disabled={busy}>{busy ? 'Preparing…' : 'Create Share Code'}</button>
              {error && <p className="error">{error}</p>}
            </>
          ) : (
            <>
              {qr && (
                <>
                  <img src={qr} alt="Share QR code" style={{ width: '100%', maxWidth: 280, margin: '0 auto', display: 'block', borderRadius: 8 }} />
                  <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
                    Together right now? Have {them} scan this with their <strong>camera app</strong>.
                  </p>
                </>
              )}
              {tooBig && (
                <p className="muted" style={{ fontSize: 13 }}>
                  This item is too large for a scannable code{url ? ', so send it as a link or a file' : ", so it has to travel as a file"} —
                  {' '}{them} opens it in Meleo to import.
                </p>
              )}

              <div className="share-send">
                <span className="share-send-label">{qr ? 'Not together? Send it instead' : 'Send it'}</span>
                {url && <button onClick={sendLink}>Send link</button>}
                {url && <button className="secondary" onClick={copyLink}>Copy link</button>}
                <button className="secondary" onClick={shareFile}>Share as file</button>
                {qr && <button className="secondary" onClick={shareQrImage}>Save QR image</button>}
              </div>

              {msg && <p className="muted share-send-msg">{msg}</p>}
              {import.meta.env.DEV && url?.includes('localhost') && (
                <p className="error" style={{ fontSize: 12 }}>
                  Dev server: this link points at <strong>localhost</strong>, so it only opens on this machine. To test
                  on a phone, run the dev server with <strong>--host</strong> and load the app over your network address.
                </p>
              )}
              <button className="secondary" onClick={onClose}>Done</button>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}

function fullProfileName(): string {
  const { firstName, lastName } = getProfileName()
  return `${firstName} ${lastName}`.trim()
}
