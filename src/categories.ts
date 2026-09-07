import type { TimeCategory } from './db'

export const CATEGORY_LABELS: Record<TimeCategory, string> = {
  ministry: 'Ministry',
  credit: 'Credit',
}

export const CATEGORY_EMOJI: Record<TimeCategory, string> = {
  ministry: '🏠',
  credit: '⭐',
}

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as TimeCategory[]

/** Quick-picks offered when someone logs Credit time, so the common kinds are one tap rather
    than typed. They fill `TimeLog.activityNote` and nothing else — the type of credit is a
    personal annotation, never a category, because the Service Report has no field for it and
    Credit is submitted as a single figure regardless of what earned it (see CONTEXT.md).
    Free text stays available alongside these for anything not listed. */
export const CREDIT_ACTIVITY_SUGGESTIONS = ['LDC', 'HLC', 'Bethel', 'Convention', 'Assembly'] as const
