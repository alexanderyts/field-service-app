import type { TimeCategory } from './db'
import { CATEGORY_ORDER } from './categories'

/** One colored arc of a day's goal ring. `frac` is that arc's share of the weekly goal
    (minutes ÷ goal), `logged` picks the filled band (done) vs the hollow band (still planned). */
export interface RingSeg {
  color: string
  frac: number
  logged: boolean
}

/** Turn a day's scheduled blocks + logged minutes into ring segments, all measured against the
    SAME weekly goal so a day reads identically in the mini-week, the calendar, and (as a total)
    anywhere else. Logged arcs come first so the filled "done" portion is contiguous from 12
    o'clock; the hollow arc is only the *still-to-do* part of the plan (scheduled minus logged),
    so a fully-logged scheduled day is all-filled, not double-counted. Empty when there's no goal. */
export function daySegments(
  scheduled: { category: TimeCategory; minutes: number }[],
  logged: Partial<Record<TimeCategory, number>>,
  goalMin: number,
): RingSeg[] {
  if (goalMin <= 0) return []
  const schedByCat = new Map<TimeCategory, number>()
  for (const b of scheduled) schedByCat.set(b.category, (schedByCat.get(b.category) ?? 0) + b.minutes)
  const segs: RingSeg[] = []
  for (const cat of CATEGORY_ORDER) {
    const min = logged[cat] ?? 0
    if (min > 0) segs.push({ color: `var(--cat-${cat})`, frac: min / goalMin, logged: true })
  }
  for (const cat of CATEGORY_ORDER) {
    const remaining = (schedByCat.get(cat) ?? 0) - (logged[cat] ?? 0)
    if (remaining > 0) segs.push({ color: `var(--cat-${cat})`, frac: remaining / goalMin, logged: false })
  }
  return segs
}
