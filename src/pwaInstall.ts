// Add-to-Home-Screen / install support, shared by the top banner and the More-tab card.
//
// Two very different platforms:
//  - Android + desktop Chromium fire `beforeinstallprompt`, which we capture (it only fires
//    once, early) so a button anywhere in the app can trigger the native install dialog.
//  - iOS Safari has no such event — the only way to install is the manual Share → "Add to
//    Home Screen" gesture, so there we show instructions instead of a button.
//
// Installing matters for more than convenience: an installed PWA is exempt from iOS's
// 7-day eviction of IndexedDB/localStorage, so it's the main thing protecting a tester's
// data. `requestPersistentStorage()` is the complementary lever on Chromium/Firefox.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const subscribers = new Set<() => void>()
const notify = () => subscribers.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's own mini-infobar; we present our own prompt instead.
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/** True when the app is running as an installed PWA (home-screen / standalone), on either
    Chromium (display-mode) or iOS Safari (navigator.standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone
}

/** True on iOS/iPadOS, where install is a manual Share-sheet gesture (no install event). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iPadOS13Plus = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iphone|ipad|ipod/i.test(ua) || iPadOS13Plus
}

/** Whether a native install dialog is available right now (Chromium only). */
export function canPromptInstall(): boolean {
  return deferredPrompt !== null
}

/** Trigger the native install dialog (Chromium). Resolves with the user's choice, or
    'unavailable' if no prompt was captured (e.g. iOS, or already installed). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  await deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  notify()
  return outcome
}

/** Re-render subscribers when install availability changes. Returns an unsubscribe fn. */
export function subscribeInstall(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

/** Ask the browser to keep our storage across eviction/pressure. Idempotent and safe to
    call repeatedly (e.g. again after install). Returns whether storage is now persisted. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
