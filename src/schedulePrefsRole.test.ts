import { describe, it, expect } from 'vitest'
import { deriveRole, roleTracksHours, roleSummary } from './schedulePrefsRole'
import type { AuxConfig } from './auxPioneering'

const off: AuxConfig = { enabled: false, mode: null, targetHours: 30, weeklyHours: 7, months: [], monthTargets: {} }
const thisMonth: AuxConfig = { ...off, enabled: true, mode: 'this-month', targetHours: 15, months: ['2026-8'] }

describe('deriveRole', () => {
  it('reads an explicit role first', () => {
    expect(deriveRole({ role: 'publisher', isPioneer: true }, thisMonth)).toBe('publisher')
  })
  it('treats a legacy row with no isPioneer as a pioneer', () => {
    expect(deriveRole({}, off)).toBe('pioneer')
    expect(deriveRole({ isPioneer: true }, off)).toBe('pioneer')
  })
  it('reads a non-pioneer with aux enabled as auxiliary, else publisher', () => {
    expect(deriveRole({ isPioneer: false }, thisMonth)).toBe('auxiliary')
    expect(deriveRole({ isPioneer: false }, off)).toBe('publisher')
  })
})

describe('roleTracksHours', () => {
  it('a pioneer always tracks', () => {
    expect(roleTracksHours('pioneer', { goalPeriod: 'none' }, off, 2026, 0)).toBe(true)
  })
  it('an auxiliary tracks only in an aux month', () => {
    expect(roleTracksHours('auxiliary', { goalPeriod: 'none' }, thisMonth, 2026, 8)).toBe(true)
    expect(roleTracksHours('auxiliary', { goalPeriod: 'none' }, thisMonth, 2026, 9)).toBe(false)
  })
  it('a publisher tracks with a personal goal, or in an aux month set up later', () => {
    expect(roleTracksHours('publisher', { goalPeriod: 'none' }, off, 2026, 8)).toBe(false)
    expect(roleTracksHours('publisher', { goalPeriod: 'monthly' }, off, 2026, 8)).toBe(true)
    expect(roleTracksHours('publisher', { goalPeriod: 'none' }, thisMonth, 2026, 8)).toBe(true)
  })
})

describe('roleSummary', () => {
  const off = { enabled: false, mode: null, targetHours: 30, weeklyHours: 7, months: [], monthTargets: {} } as const
  const base = { yearlyHours: 0, weeklyHours: 0, goalPeriod: 'none' as const }
  it('names the role and what is counted', () => {
    expect(roleSummary({ ...base, role: 'pioneer', yearlyHours: 600 }, { ...off, months: [] })).toBe('Regular pioneer · 600h a service year')
    expect(roleSummary({ ...base, role: 'publisher' }, { ...off, months: [] })).toBe('Publisher · sharing each month')
    expect(roleSummary({ ...base, role: 'publisher', goalPeriod: 'monthly', monthlyHours: 10 }, { ...off, months: [] })).toBe('Publisher · goal 10h a month')
    expect(roleSummary({ ...base, role: 'auxiliary' }, { ...off, enabled: true, mode: 'this-month', targetHours: 15, months: ['2026-8'] })).toBe('Auxiliary pioneer · 15h this month')
  })
})
