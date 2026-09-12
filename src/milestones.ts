/**
 * The small pure rules behind the progress card's "reward" moments (docs/tracking-first-plan.md,
 * Wave 2). Everything here is arithmetic on minutes so it can be tested without a DOM.
 */

export type Milestone = 25 | 50 | 75 | 100
const MILESTONES: Milestone[] = [25, 50, 75, 100]

/** The highest milestone crossed going from `prevApplied` to `nextApplied` minutes against
    `goalMin`, or null if none was crossed (or there is no goal, or progress went down). */
export function milestoneReached(prevApplied: number, nextApplied: number, goalMin: number): Milestone | null {
  if (!(goalMin > 0) || nextApplied <= prevApplied) return null
  const prevPct = (prevApplied / goalMin) * 100
  const nextPct = (nextApplied / goalMin) * 100
  let hit: Milestone | null = null
  for (const m of MILESTONES) {
    if (prevPct < m && nextPct >= m) hit = m
  }
  return hit
}

export type Pace = 'done' | 'ahead' | 'on-pace' | 'behind' | 'not-started'

/**
 * How the month is going, judged against how much of it has elapsed: with 40% of the month
 * gone, 40% of the goal is "on pace". A few points either side still reads as on pace so the
 * label doesn't flicker day to day.
 */
export function paceStatus(appliedMin: number, goalMin: number, elapsedPct: number): Pace {
  if (!(goalMin > 0)) return 'not-started'
  if (appliedMin >= goalMin) return 'done'
  if (appliedMin === 0 && elapsedPct < 10) return 'not-started'
  const expected = (goalMin * elapsedPct) / 100
  const slack = goalMin * 0.05
  if (appliedMin >= expected + slack) return 'ahead'
  if (appliedMin <= expected - slack) return 'behind'
  return 'on-pace'
}

/** Minutes ahead of (positive) or behind (negative) where the month's pace says you should be. */
export function paceDeltaMin(appliedMin: number, goalMin: number, elapsedPct: number): number {
  if (!(goalMin > 0)) return 0
  return Math.round(appliedMin - (goalMin * elapsedPct) / 100)
}
