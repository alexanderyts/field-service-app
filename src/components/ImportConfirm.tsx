import { useEffect, useState } from 'react'
import ModalPortal from '../ModalPortal'
import { type SharePayload, decodeSharePayload, describePayload, importSharedPayload } from '../share'

/** Confirms and performs an incoming share import — reached both from a scanned deep-link
    (App.tsx reads the URL hash) and from picking a `.meleo` file. Decodes the payload,
    shows what it is and who sent it, and on confirm writes it as a brand-new local record. */
export default function ImportConfirm({ encoded, onClose }: { encoded: string; onClose: () => void }) {
  const [payload, setPayload] = useState<SharePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    decodeSharePayload(encoded)
      .then((p) => { if (!cancelled) setPayload(p) })
      .catch(() => { if (!cancelled) setError("This share link or file isn't valid — it may be from a newer version of Meleo, or got cut off.") })
    return () => { cancelled = true }
  }, [encoded])

  async function confirmImport() {
    if (!payload || busy) return
    setBusy(true)
    try {
      await importSharedPayload(payload)
      setDone(true)
    } catch {
      setError('Could not import this item. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const desc = payload ? describePayload(payload) : null

  return (
    <ModalPortal>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-toolbar">
            <button className="icon-btn close-x" onClick={onClose} title="Close">×</button>
          </div>

          {error ? (
            <>
              <h3 style={{ marginTop: 0 }}>Couldn't import</h3>
              <p className="muted">{error}</p>
              <button className="secondary" onClick={onClose}>Close</button>
            </>
          ) : done && desc ? (
            <>
              <h3 style={{ marginTop: 0 }}>Imported ✓</h3>
              <p className="muted">
                {desc.name} was added to your {desc.kindLabel === 'contact' ? 'contacts' : desc.kindLabel === 'street' ? 'streets' : 'territories'}.
              </p>
              <button onClick={onClose}>Done</button>
            </>
          ) : desc ? (
            <>
              <h3 style={{ marginTop: 0 }}>Import shared {desc.kindLabel}?</h3>
              <p className="muted">
                <strong>{desc.name}</strong>, shared by <strong>{payload!.from || 'a Meleo user'}</strong>. It'll be
                added as a new {desc.kindLabel} on this device.
              </p>
              <div className="row">
                <button onClick={confirmImport} disabled={busy}>{busy ? 'Importing…' : `Import ${desc.kindLabel}`}</button>
                <button className="secondary" onClick={onClose}>Cancel</button>
              </div>
            </>
          ) : (
            <p className="muted">Reading share…</p>
          )}
        </div>
      </div>
    </ModalPortal>
  )
}
