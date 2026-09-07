// The keyboard half of a modal dialog (AUDIT F018), kept free of React and of any live DOM
// query so the decision — "Tab from here goes where?" — can be unit-tested. ModalPortal owns
// the DOM side: collecting the focusable elements, listening for keys, restoring focus.

/** Everything a keyboard user can land on. `[tabindex="-1"]` is excluded on purpose: that is
    the dialog host itself (focused programmatically on open, never a Tab stop). */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Where a Tab (or Shift+Tab) press should send focus so it cycles within `focusables`
 * instead of escaping to the page behind the dialog.
 *
 * - Off either end wraps to the other end.
 * - Focus that is not on any item (the dialog host, or something that was removed) goes to
 *   the first item — or the last for Shift+Tab — so the user is never stranded.
 * - No focusable items at all: `null`, meaning "swallow the key, stay put".
 */
export function tabTarget<T>(focusables: readonly T[], active: T | null, shiftKey: boolean): T | null {
  if (focusables.length === 0) return null
  const idx = active === null ? -1 : focusables.indexOf(active)
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (idx === -1) return shiftKey ? last : first
  if (shiftKey) return idx === 0 ? last : focusables[idx - 1]
  return idx === focusables.length - 1 ? first : focusables[idx + 1]
}
