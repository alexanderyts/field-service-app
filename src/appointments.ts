import type { Appointment, Call } from './db'

/**
 * Which return visits a list should still show.
 *
 * Every list used to filter `date >= now`, so the moment a visit's time passed it vanished
 * from the contact row, the contact's card, and the Schedule list at once — a missed visit
 * left no trace anywhere (AUDIT F036). Now a past visit stays visible, marked overdue, until
 * one of two things happens: a call to that person is logged on or after the visit (the visit
 * was made, or at least the door was tried), or `graceDays` pass (it is stale, not pending).
 */
export const OVERDUE_GRACE_DAYS = 14

export function isOverdue(appt: Pick<Appointment, 'date'>, now: number): boolean {
  return appt.date < now
}

/** True while a visit should still be shown: no call to its person logged on or after the
    visit's *day*, and (once overdue) within the grace window. The day, not the time: a visit
    set for 5 PM and made at 11 AM is done — Service → Today → Log visit relies on that. */
export function isPending(
  appt: Pick<Appointment, 'date' | 'personId'>,
  calls: Pick<Call, 'personId' | 'date'>[],
  now: number,
  graceDays = OVERDUE_GRACE_DAYS
): boolean {
  if (isOverdue(appt, now) && now - appt.date > graceDays * 24 * 60 * 60 * 1000) return false
  if (appt.personId == null) return true
  const d = new Date(appt.date)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return !calls.some((c) => c.personId === appt.personId && c.date >= dayStart)
}

/** Upcoming and still-pending overdue visits, soonest first (overdue ones therefore lead). */
export function pendingAppointments<A extends Pick<Appointment, 'date' | 'personId'>>(
  appts: A[],
  calls: Pick<Call, 'personId' | 'date'>[],
  now: number,
  graceDays = OVERDUE_GRACE_DAYS
): A[] {
  return appts.filter((a) => isPending(a, calls, now, graceDays)).sort((a, b) => a.date - b.date)
}

/** The next pending visit per person — overdue first, then soonest. */
export function nextPendingByPerson(
  appts: Pick<Appointment, 'date' | 'personId'>[],
  calls: Pick<Call, 'personId' | 'date'>[],
  now: number,
  graceDays = OVERDUE_GRACE_DAYS
): Map<number, number> {
  const next = new Map<number, number>()
  for (const a of pendingAppointments(appts, calls, now, graceDays)) {
    if (a.personId != null && !next.has(a.personId)) next.set(a.personId, a.date)
  }
  return next
}

/** "Today", "Tomorrow", "Overdue · Mon, Sep 8", or "Thu, Sep 18" for a visit badge — relative
    where that reads faster, absolute otherwise. `locale` is for tests only. */
export function visitBadgeLabel(date: number, now: number, locale?: string): string {
  const day = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
  const diffDays = Math.round((day(date) - day(now)) / (24 * 60 * 60 * 1000))
  const abs = new Date(date).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 0) return `Overdue · ${abs}`
  return abs
}

/** The Service tab's "Today" list: pending visits due by the end of today — today's and the
    still-pending overdue ones — for a contact (a visit with no contact has no one to log). */
export function dueToday<A extends Pick<Appointment, 'date' | 'personId'>>(
  appts: A[],
  calls: Pick<Call, 'personId' | 'date'>[],
  now: number
): A[] {
  const d = new Date(now)
  const endOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  return pendingAppointments(appts, calls, now).filter((a) => a.date < endOfToday && a.personId != null)
}
