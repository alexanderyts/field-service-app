import { createPortal } from 'react-dom'
import { useEffect, type ReactNode } from 'react'

let lockCount = 0

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
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (lockCount === 0) document.body.style.overflow = 'hidden'
    lockCount++
    return () => {
      lockCount--
      if (lockCount === 0) document.body.style.overflow = ''
    }
  }, [])

  return createPortal(children, document.body)
}
