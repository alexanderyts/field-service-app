/**
 * A short, plain-English "how long ago" label — e.g. "just now", "3 days ago", "3 weeks ago".
 *
 * `now` is injected rather than read from the clock so the behaviour is testable and can't
 * drift with the machine's date, matching how the rest of the date logic here is written
 * (`remainingWeeksInMonth`, `weeklyHoursNeeded`).
 *
 * Deliberately coarse: rounding down to whole units ("1 month ago", not "4.6 weeks ago") is
 * what a person wants from a reassurance line. Units step at natural reading points rather
 * than exact calendar boundaries — a "month" is 30 days and a "year" is 365, since this is
 * a rough recency cue, not a date calculation.
 */
export function formatTimeAgo(thenMs: number, nowMs: number): string {
  const seconds = Math.floor((nowMs - thenMs) / 1000)

  // A clock that has moved backwards (timezone change, manual adjustment, a restored file
  // stamped in the future) reads as "just now" rather than "in 3 days" or "-1 days ago".
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return plural(minutes, 'minute')

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return plural(hours, 'hour')

  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return plural(days, 'day')

  const weeks = Math.floor(days / 7)
  if (days < 30) return plural(weeks, 'week')

  const months = Math.floor(days / 30)
  if (days < 365) return plural(months, 'month')

  return plural(Math.floor(days / 365), 'year')
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}
