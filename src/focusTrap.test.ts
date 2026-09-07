import { describe, it, expect } from 'vitest'
import { tabTarget, FOCUSABLE_SELECTOR } from './focusTrap'

// AUDIT F018 — the Tab-cycling rule for an open dialog, tested as the pure decision it is.
// The DOM half (finding the elements, restoring focus, Esc) is checked in a real browser.

const items = ['name', 'city', 'save', 'cancel'] as const

describe('tabTarget — Tab stays inside an open dialog', () => {
  it('moves forward and backward through the items', () => {
    expect(tabTarget(items, 'name', false)).toBe('city')
    expect(tabTarget(items, 'city', true)).toBe('name')
  })

  it('wraps at both ends instead of escaping to the page behind', () => {
    expect(tabTarget(items, 'cancel', false)).toBe('name')
    expect(tabTarget(items, 'name', true)).toBe('cancel')
  })

  it('brings focus onto the first (or, with Shift, last) item when it is on none of them', () => {
    // The dialog host has focus right after opening; the first Tab must land on a control.
    expect(tabTarget(items, null, false)).toBe('name')
    expect(tabTarget(items, null, true)).toBe('cancel')
    // Something that was focused and then removed from the dialog.
    expect(tabTarget(items, 'gone' as unknown as (typeof items)[number], false)).toBe('name')
  })

  it('swallows the key when a dialog has nothing focusable', () => {
    expect(tabTarget([], null, false)).toBeNull()
  })

  it('never treats the dialog host itself as a Tab stop', () => {
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
    expect(FOCUSABLE_SELECTOR).not.toMatch(/\[tabindex\](,|$)/)
  })
})
