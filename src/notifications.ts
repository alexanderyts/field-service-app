import { db } from './db'

const ENABLED_KEY = 'fieldservice_notify_enabled'
const LEAD_KEY = 'fieldservice_notify_lead_min'
const SENT_KEY = 'fieldservice_notify_sent_ids'

/** How far ahead of a return visit to fire the reminder. */
export const NOTIFY_LEAD_OPTIONS = [
  { minutes: 60, label: '1 hour before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 1440, label: 'The day before' },
] as const

export type NotifyLeadMinutes = (typeof NOTIFY_LEAD_OPTIONS)[number]['minutes']

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationsEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === 'yes' } catch { return false }
}

export function setNotificationsEnabled(v: boolean) {
  try { localStorage.setItem(ENABLED_KEY, v ? 'yes' : 'no') } catch { /* localStorage unavailable */ }
}

export function getNotifyLeadMinutes(): NotifyLeadMinutes {
  try {
    const v = Number(localStorage.getItem(LEAD_KEY))
    if (NOTIFY_LEAD_OPTIONS.some((o) => o.minutes === v)) return v as NotifyLeadMinutes
  } catch { /* localStorage unavailable */ }
  return 180
}

export function setNotifyLeadMinutes(v: NotifyLeadMinutes) {
  try { localStorage.setItem(LEAD_KEY, String(v)) } catch { /* localStorage unavailable */ }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  return Notification.requestPermission()
}

/** Shows a notification the way each platform allows. Chrome for Android refuses the page-
    context `new Notification()` constructor outright ("Illegal constructor") — an installed
    PWA there can only notify through its service-worker registration — so that path is tried
    first wherever a registration exists, and the constructor is the fallback for browsers
    that still support it (AUDIT F034). Returns whether anything was shown. */
async function showNotification(title: string, options: NotificationOptions): Promise<boolean> {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) {
      await reg.showNotification(title, options)
      return true
    }
  } catch { /* fall through to the constructor */ }
  try {
    new Notification(title, options)
    return true
  } catch {
    return false
  }
}

function getSentIds(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]')) } catch { return new Set() }
}

function saveSentIds(ids: Set<number>) {
  // Capped so this can't grow forever — only the most recent couple hundred need
  // remembering, since anything older has long since passed anyway.
  try { localStorage.setItem(SENT_KEY, JSON.stringify(Array.from(ids).slice(-200))) } catch { /* localStorage unavailable */ }
}

/** Checks upcoming return visits and fires a local notification for any that have entered
    the configured lead window and haven't already been notified about. Important
    limitation: this only runs while the app is actually open (checked on load and every
    few minutes while it stays open) — there's no backend here to wake the phone when the
    app is fully closed, unlike a native app's push notifications. */
export async function checkReturnVisitNotifications() {
  if (!notificationsSupported() || !notificationsEnabled()) return
  if (Notification.permission !== 'granted') return

  const appointments = await db.appointments.toArray()
  const leadMs = getNotifyLeadMinutes() * 60 * 1000
  const now = Date.now()
  const sent = getSentIds()
  let changed = false

  for (const a of appointments) {
    if (a.date < now) continue // already passed
    if (a.date - now > leadMs) continue // still too far out
    if (sent.has(a.id)) continue

    const shown = await showNotification('Upcoming return visit', {
      body: `${a.title} — ${new Date(a.date).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}`,
      tag: `visit-${a.id}`,
    })
    // Only remember it as sent if it was actually shown — otherwise a platform that refused
    // once would silence that visit forever.
    if (shown) {
      sent.add(a.id)
      changed = true
    }
  }

  // Forget ids whose appointment has already passed — they can never re-enter the lead
  // window, so dropping them keeps the remembered set bounded by the number of *upcoming*
  // visits. That's more correct than the old fixed cap, which (in theory) could slice off
  // a still-upcoming id and re-notify it.
  const futureIds = new Set(appointments.filter((a) => a.date >= now).map((a) => a.id))
  for (const id of sent) {
    if (!futureIds.has(id)) { sent.delete(id); changed = true }
  }

  if (changed) saveSentIds(sent)
}
