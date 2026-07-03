// US state/territory name normalization. Keeps the "State" field tidy so a typed
// abbreviation ("CA", "ca", "N.Y.") becomes the full name ("California", "New York")
// and a sloppily-cased full name gets title-cased. Idempotent: full names already
// present (e.g. from the Nominatim address autofill) pass through unchanged.

const ABBREV_TO_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', GU: 'Guam', AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
}

const NAME_SET = new Set(Object.values(ABBREV_TO_NAME).map((n) => n.toLowerCase()))

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

/**
 * Normalize a free-typed US state. A 2-letter code (tolerant of dots/spaces, any case)
 * expands to the full name; a recognized full name is returned canonically-cased; anything
 * else is title-cased so it still looks tidy. Empty input is returned untouched.
 */
export function expandState(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return input.trim()

  // Strip dots/spaces for the abbreviation match ("N.Y." / "n y" -> "NY").
  const code = trimmed.replace(/[.\s]/g, '').toUpperCase()
  if (ABBREV_TO_NAME[code]) return ABBREV_TO_NAME[code]

  const lower = trimmed.toLowerCase()
  if (NAME_SET.has(lower)) return titleCase(trimmed)

  return titleCase(trimmed)
}
