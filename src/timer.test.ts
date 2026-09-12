import { describe, it, expect } from 'vitest'
import { startTimer, pauseTimer, resumeTimer, elapsedMs, stopTimer, fmtElapsed, normalizeTimer, isRunning } from './timer'

const MIN = 60_000
const t0 = 1_800_000_000_000

describe('timer arithmetic', () => {
  it('accrues while running', () => {
    const t = startTimer(t0)
    expect(elapsedMs(t, t0 + 5 * MIN)).toBe(5 * MIN)
  })
  it('holds while paused and continues on resume', () => {
    let t = startTimer(t0)
    t = pauseTimer(t, t0 + 10 * MIN)
    expect(isRunning(t)).toBe(false)
    expect(elapsedMs(t, t0 + 30 * MIN)).toBe(10 * MIN)
    t = resumeTimer(t, t0 + 30 * MIN)
    expect(elapsedMs(t, t0 + 45 * MIN)).toBe(25 * MIN)
  })
  it('pause and resume are no-ops in the wrong state', () => {
    const t = startTimer(t0)
    expect(resumeTimer(t, t0 + 1)).toBe(t)
    const p = pauseTimer(t, t0 + MIN)
    expect(pauseTimer(p, t0 + 2 * MIN)).toBe(p)
  })
  it('survives the app being killed: hours later, elapsed is still from the timestamps', () => {
    const t = startTimer(t0)
    expect(elapsedMs(t, t0 + 3 * 60 * MIN)).toBe(180 * MIN)
  })
  it('stops to whole minutes with the real interval', () => {
    const t = startTimer(t0)
    expect(stopTimer(t, t0 + 95 * MIN + 29_000)).toEqual({ minutes: 95, startedAt: t0, endedAt: t0 + 95 * MIN + 29_000 })
  })
  it('never goes negative if the clock moved backwards', () => {
    const t = startTimer(t0)
    expect(elapsedMs(t, t0 - MIN)).toBe(0)
  })
})

describe('fmtElapsed', () => {
  it('reads m:ss under an hour and h:mm:ss above', () => {
    expect(fmtElapsed(0)).toBe('0:00')
    expect(fmtElapsed(65_000)).toBe('1:05')
    expect(fmtElapsed(3_725_000)).toBe('1:02:05')
  })
})

describe('normalizeTimer', () => {
  it('rejects junk and repairs partial records', () => {
    expect(normalizeTimer(null)).toBeNull()
    expect(normalizeTimer({})).toBeNull()
    expect(normalizeTimer({ startedAt: 'x' })).toBeNull()
    expect(normalizeTimer({ startedAt: t0, accumulatedMs: -5, category: 'weird', activityNote: 7 })).toEqual({
      startedAt: t0, runningSince: undefined, accumulatedMs: 0, category: 'ministry', activityNote: '',
    })
  })
})
