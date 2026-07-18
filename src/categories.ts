import type { TimeCategory } from './db'

export const CATEGORY_LABELS: Record<TimeCategory, string> = {
  ministry: 'Ministry',
  credit: 'Credit',
  // Legacy labels — still shown when rendering entries logged before the Ministry/Credit
  // collapse. New credit entries use `credit` + an optional `creditType` instead.
  ldc: 'LDC (Construction)',
  hlc: 'HLC',
  convention: 'Convention',
  assembly: 'Assembly',
  bethel: 'Bethel',
  other: 'Other',
}

export const CATEGORY_EMOJI: Record<TimeCategory, string> = {
  ministry: '🏠',
  credit: '⏱️',
  ldc: '🔨',
  hlc: '🏥',
  convention: '🎤',
  assembly: '🎙️',
  bethel: '🏛️',
  other: '✨',
}

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as TimeCategory[]

/** Suggested sub-labels offered when logging Credit time — tapping one fills `creditType`;
    free text is always allowed too. Mirrors the old fixed categories so nothing is lost. */
export const CREDIT_TYPE_QUICKPICKS = ['LDC', 'HLC', 'Convention', 'Assembly', 'Bethel']
