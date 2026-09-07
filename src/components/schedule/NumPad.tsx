import { useState } from 'react'
import ModalPortal from '../../ModalPortal'

// ── Numpad ───────────────────────────────────────────────────
export function NumPad({ initialValue, label, max, onConfirm, onClose }: {
  initialValue: string; label: string; max?: number; onConfirm: (v: string) => void; onClose: () => void
}) {
  const [input, setInput] = useState(initialValue === '0' ? '' : initialValue)

  function press(d: string) {
    const next = (input + d).replace(/^0+/, '') || ''
    if (max !== undefined && Number(next) > max) return
    setInput(next)
  }
  function back() { setInput(p => p.length <= 1 ? '' : p.slice(0, -1)) }
  function confirm() { onConfirm(input || '0'); onClose() }

  return (
    <ModalPortal onClose={onClose}>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal numpad-modal" onClick={(e) => e.stopPropagation()}>
        <div className="numpad-display">
          <span className="numpad-label">{label}</span>
          <span className="numpad-value">{input || '0'}</span>
        </div>
        <div className="numpad-grid">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} className="numpad-key" onClick={() => press(d)}>{d}</button>
          ))}
          <button className="numpad-key" onClick={back}>⌫</button>
          <button className="numpad-key" onClick={() => press('0')}>0</button>
          <button className="numpad-key done" onClick={confirm}>✓</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
