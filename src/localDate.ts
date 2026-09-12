/** Parses a `YYYY-MM-DD` (from a date input) as a local date, avoiding the UTC-midnight shift. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Formats a Date as `YYYY-MM-DD` using local time — the inverse of parseLocalDate. Do not
    use `toISOString().slice(0,10)` here, since that converts to UTC first and rolls the date
    to tomorrow for anyone west of UTC in the evening. */
export function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function toLocalDateStr(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function toLocalTimeStr(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** Combines a `YYYY-MM-DD` and `HH:mm` pair (from separate date/time inputs) into a local timestamp. */
export function combineDateTime(dateStr: string, timeStr: string): number {
  const d = parseLocalDate(dateStr)
  const [h, m] = timeStr.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** A timestamp for reading, not editing: "8/5/2025, 2:25 PM" — date plus hour and minute, never
    seconds. Bare `toLocaleString()` prints "2:25:39 PM", which no call, visit, or "met" line
    needs (AUDIT F048). `locale` is only for tests; the UI always uses the device's. */
export function fmtDateTime(ts: number, locale?: string): string {
  return new Date(ts).toLocaleString(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
