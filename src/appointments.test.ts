import { describe, it, expect } from 'vitest'
import { isPending, pendingAppointments, nextPendingByPerson, visitBadgeLabel } from './appointments'

// AUDIT F036: a missed return visit must stay visible until it is either followed up or stale.

const DAY = 24 * 60 * 60 * 1000
const now = new Date(2026, 8, 12, 12, 0).getTime()

describe('isPending', () => {
  it('always shows an upcoming visit', () => {
    expect(isPending({ date: now + DAY, personId: 1 }, [], now)).toBe(true)
  })
  it('keeps a missed visit visible when no later call was logged', () => {
    expect(isPending({ date: now - 2 * DAY, personId: 1 }, [], now)).toBe(true)
  })
  it('hides a missed visit once a call to that person is logged on or after it', () => {
    const calls = [{ personId: 1, date: now - DAY }]
    expect(isPending({ date: now - 2 * DAY, personId: 1 }, calls, now)).toBe(false)
  })
  it('ignores calls to other people and calls made before the visit', () => {
    const calls = [{ personId: 2, date: now - DAY }, { personId: 1, date: now - 3 * DAY }]
    expect(isPending({ date: now - 2 * DAY, personId: 1 }, calls, now)).toBe(true)
  })
  it('drops a visit older than the grace window', () => {
    expect(isPending({ date: now - 15 * DAY, personId: 1 }, [], now)).toBe(false)
    expect(isPending({ date: now - 13 * DAY, personId: 1 }, [], now)).toBe(true)
  })
})

describe('pendingAppointments / nextPendingByPerson', () => {
  const appts = [
    { id: 1, date: now + 3 * DAY, personId: 1 },
    { id: 2, date: now - DAY, personId: 1 },
    { id: 3, date: now + DAY, personId: 2 },
    { id: 4, date: now - 20 * DAY, personId: 3 },
  ]
  it('lists overdue first, then soonest, and drops stale ones', () => {
    expect(pendingAppointments(appts, [], now).map((a) => a.id)).toEqual([2, 3, 1])
  })
  it('gives each person their earliest pending visit', () => {
    const next = nextPendingByPerson(appts, [], now)
    expect(next.get(1)).toBe(now - DAY)
    expect(next.get(2)).toBe(now + DAY)
    expect(next.has(3)).toBe(false)
  })
})

describe('visitBadgeLabel', () => {
  it('reads relative for today and tomorrow, marks overdue, else the date', () => {
    expect(visitBadgeLabel(now + 3600_000, now, 'en-US')).toBe('Today')
    expect(visitBadgeLabel(now + DAY, now, 'en-US')).toBe('Tomorrow')
    expect(visitBadgeLabel(now - 4 * DAY, now, 'en-US')).toBe('Overdue · Tue, Sep 8')
    expect(visitBadgeLabel(now + 6 * DAY, now, 'en-US')).toBe('Fri, Sep 18')
  })
})
