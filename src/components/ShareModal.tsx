import { useState } from 'react'
import ModalPortal from '../ModalPortal'
import { getProfileName } from '../profile'
import {
  type ShareKind,
  type SharePayload,
  buildShareUrl,
  encodeSharePayload,
  generateQrDataUrl,
  recordShare,
  shareEncodedFile,
} from '../share'

/** The share flow, reused by contact/street/territory detail views. Asks who the item is
    going to (recorded locally for attribution + the edit-warning), then produces either a
    QR to scan or — for items too large to scan reliably — a shareable file. */
export default function ShareModal({
  kind,
  recordId,
  itemName,
  buildPayload,
  onClose,
}: {
  kind: ShareKind
  recordId: number
  itemName: string
  buildPayload: (from: string) => SharePayload | Promise<SharePayload>
  onClose: () => void
}) {
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [encoded, setEncoded] = useState<string | null>(null)
  const [tooBig, setTooBig] = useState(false)
  const [fileMsg, setFileMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const from = fullProfileName()
      await recordShare(kind, recordId, recipient.trim() || 'Someone')
      const payload = await buildPayload(from)
      const enc = await encodeSharePayload(payload)
      setEncoded(enc)
      const url = buildShareUrl(enc)
      const dataUrl = await generateQrDataUrl(url)
      if (dataUrl) setQr(dataUrl)
      else setTooBig(true)
    } catch {
      setError('Could not prepare the share. Please try again.')
    } finally {
      setBusy(false)
    }
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
    setFileMsg(null)
    const how = await shareEncodedFile(encoded, `meleo-${kind}-${itemName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`)
    setFileMsg(how === 'shared' ? 'Shared — the other device can open it in Meleo.' : 'File downloaded — send it to the other person to import.')
  }

  const started = qr !== null || tooBig

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>
          <h3 style={{ marginTop: 0 }}>Share “{itemName}”</h3>

          {!started ? (
            <>
              <label className="field">
                <span className="field-label">Who are you sharing this with?</span>
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. John Smith" autoFocus />
              </label>
              <p className="muted" style={{ fontSize: 12 }}>
                They scan the code with their phone's camera to import it into their own Meleo. Nothing is sent to a
                server — the data travels only in the link.
              </p>
              <button onClick={generate} disabled={busy}>{busy ? 'Preparing…' : 'Create Share Code'}</button>
              {error && <p className="error">{error}</p>}
            </>
          ) : qr ? (
            <>
              <img src={qr} alt="Share QR code" style={{ width: '100%', maxWidth: 280, margin: '0 auto', display: 'block', borderRadius: 8 }} />
              <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
                Have {recipient.trim() || 'them'} scan this with their camera.
              </p>
              <button className="secondary" onClick={shareQrImage}>Save / send QR image</button>
              <button className="secondary" onClick={onClose}>Done</button>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                This item is too large for a scannable code, so it's shared as a small file instead — send it to
                {recipient.trim() ? ` ${recipient.trim()}` : ' them'} and they open it in Meleo to import.
              </p>
              <button onClick={shareFile}>Share as File</button>
              {fileMsg && <p className="muted" style={{ fontSize: 13 }}>{fileMsg}</p>}
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
