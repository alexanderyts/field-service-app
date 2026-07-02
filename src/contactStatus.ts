import type { ContactStatus } from './db'

export const STATUS_LABELS: Record<ContactStatus, string> = {
  interested: 'Interested',
  'return-visit': 'Return Visit',
  'bible-study': 'Bible Study',
  'informal-visit': 'Informal Visit',
  'not-interested': 'Not Interested',
  'do-not-call': 'Do Not Call',
  moved: 'Moved',
}

export const STATUS_ORDER: ContactStatus[] = [
  'interested',
  'return-visit',
  'bible-study',
  'informal-visit',
  'not-interested',
  'do-not-call',
  'moved',
]
