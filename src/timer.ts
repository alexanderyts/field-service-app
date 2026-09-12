import type { TimeCategory } from './db'

/**
 * The live service timer (tracking-first Wave 4): "heading out" → accrues → stop logs it.
 *
 * State is one localStorage record so a killed or backgrounded PWA loses nothing — on
 * relaunch the same record is still running from the same `startedAt`. Everything here is
 * pure arithmetic on that record; `TimerCard` is the only DOM side. The key is owned here and
 * blocklisted from backups: a half-run timer is device state, not a record.
 */
export const TIMER_KEY = 'fieldservice_timer'

export interface TimerState {
  /** Epoch ms when the current running stretch began; undefined while paused. */
  runningSince?: number
  /** Ms accumulated from earlier stretches (before the current one, or while paused). */
  accumulatedMs: number
  /** Epoch ms of the very first start — becomes `TimeLog.startedAt`. */
  startedAt: number
  category: TimeCategory
  activityNote: string
}

export function startTimer(now: number, category: TimeCategory = 'ministry', activityNote = ''): TimerState {
  return { runningSince: now, accumulatedMs: 0, startedAt: now, category, activityNote }
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.runningSince == null) return t
  return { ...t, accumulatedMs: t.accumulatedMs + Math.max(0, now - t.runningSince), runningSince: undefined }
}

export function resumeTimer(t: TimerState, now: number): TimerState {
  if (t.runningSince != null) return t
  return { ...t, runningSince: now }
}

export function isRunning(t: TimerState): boolean {
  return t.runningSince != null
}

/** Total elapsed ms so far — recomputed from timestamps, so a throttled or frozen tab
    catches up the moment it is looked at again. */
export function elapsedMs(t: TimerState, now: number): number {
  return t.accumulatedMs + (t.runningSince != null ? Math.max(0, now - t.runningSince) : 0)
}

/** What a stop should log: whole minutes (a 29-second stretch is 0), plus the real interval. */
export function stopTimer(t: TimerState, now: number): { minutes: number; startedAt: number; endedAt: number } {
  return { minutes: Math.floor(elapsedMs(t, now) / 60_000), startedAt: t.startedAt, endedAt: now }
}

export function fmtElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

// ── persistence ──────────────────────────────────────────────────────────────

export function normalizeTimer(input: unknown): TimerState | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const r = input as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  const startedAt = num(r.startedAt)
  if (startedAt == null) return null
  const runningSince = num(r.runningSince)
  return {
    startedAt,
    runningSince: runningSince ?? undefined,
    accumulatedMs: num(r.accumulatedMs) ?? 0,
    category: r.category === 'credit' ? 'credit' : 'ministry',
    activityNote: typeof r.activityNote === 'string' ? r.activityNote.slice(0, 200) : '',
  }
}

export function loadTimer(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    return raw ? normalizeTimer(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveTimer(t: TimerState | null): void {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t))
    else localStorage.removeItem(TIMER_KEY)
  } catch { /* localStorage unavailable */ }
}
