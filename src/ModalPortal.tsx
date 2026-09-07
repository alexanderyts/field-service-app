import { createPortal } from 'react-dom'
import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react'
import { FOCUSABLE_SELECTOR, tabTarget } from './focusTrap'

let lockCount = 0

/** One open dialog. The most recently mounted is the top of the stack and the only one the
    keyboard talks to; `restoreTo` is whatever had focus the moment it opened — for a dialog
    opened over another dialog, that is a control inside the one underneath. */
interface Layer {
  host: HTMLElement
  closeRef: MutableRefObject<(() => void) | undefined>
  restoreTo: HTMLElement | null
}
const layers: Layer[] = []

function focusablesIn(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.getClientRects().length > 0)
}

/** Installed on `document` (capture phase, so it wins over any handler inside the dialog)
    only while at least one dialog is open. */
function onKeyDown(e: KeyboardEvent) {
  const top = layers[layers.length - 1]
  if (!top) return
  if (e.key === 'Escape') {
    const close = top.closeRef.current
    if (close) {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    return
  }
  if (e.key === 'Tab') {
    const items = focusablesIn(top.host)
    const active = document.activeElement as HTMLElement | null
    const target = tabTarget(items, active && items.includes(active) ? active : null, e.shiftKey)
    e.preventDefault()
    target?.focus()
  }
}

/**
 * Renders its children directly onto document.body via a portal (instead of wherever
 * they happen to sit in the component tree) and locks page scroll while mounted.
 *
 * Rendering modals in-place inside the tab tree meant any ancestor that ever picked up
 * a `transform`, `filter`, or `will-change` (even transiently, e.g. an animation with
 * `fill-mode: both` leaving a non-'none' transform behind) silently became the CSS
 * containing block for these `position: fixed` overlays — they'd size/position against
 * that ancestor's box instead of the real viewport, which is what let the sticky header
 * clip into open modals. A portal makes that entire bug class structurally impossible:
 * the overlay is a direct child of body, so its containing block is always the viewport.
 *
 * The scroll lock uses a shared counter so one modal opening on top of another (e.g. a
 * confirm dialog over a form) doesn't unlock the page when the top one closes while the
 * one underneath is still open.
 *
 * Keyboard (AUDIT F018), inherited by every modal:
 * - Focus moves into the dialog on open (onto whatever the modal `autoFocus`es, else the
 *   host itself — never onto the first button, which for a confirm is "Delete").
 * - Tab / Shift+Tab cycle within the dialog instead of escaping to the page behind it.
 * - Esc calls `onClose` — the same handler as tapping the backdrop.
 * - On close, focus goes back to where it was when the dialog opened; for a dialog over a
 *   dialog, that is the control inside the one underneath, not the page.
 * The pure Tab-cycling rule is `focusTrap.ts` (unit-tested); this is the DOM side.
 */
export default function ModalPortal({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Read through a ref so the latest handler is used without re-running the mount effect.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (lockCount === 0) {
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeyDown, true)
    }
    lockCount++

    const host = hostRef.current!
    const layer: Layer = { host, closeRef, restoreTo: document.activeElement as HTMLElement | null }
    layers.push(layer)
    // A modal that autoFocuses an input has already placed focus; don't take it away.
    if (!host.contains(document.activeElement)) host.focus()

    return () => {
      const i = layers.indexOf(layer)
      if (i !== -1) layers.splice(i, 1)
      lockCount--
      if (lockCount === 0) {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', onKeyDown, true)
      }
      const back = layer.restoreTo
      if (back && document.contains(back)) back.focus()
      else layers[layers.length - 1]?.host.focus()
    }
  }, [])

  return createPortal(
    <div ref={hostRef} className="modal-host" tabIndex={-1} role="dialog" aria-modal="true">
      {children}
    </div>,
    document.body
  )
}
