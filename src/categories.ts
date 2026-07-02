import type { TimeCategory } from './db'

export const CATEGORY_LABELS: Record<TimeCategory, string> = {
  ministry: 'Ministry',
  ldc: 'LDC (Construction)',
  hlc: 'HLC',
  convention: 'Convention',
  assembly: 'Assembly',
  bethel: 'Bethel',
  other: 'Other',
}

export const CATEGORY_EMOJI: Record<TimeCategory, string> = {
  ministry: '🏠',
  ldc: '🔨',
  hlc: '🏥',
  convention: '🎤',
  assembly: '🎙️',
  bethel: '🏛️',
  other: '✨',
}

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as TimeCategory[]
