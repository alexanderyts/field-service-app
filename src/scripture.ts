// Normalizes a typed-in scripture reference to "Book Chapter:Verse" form,
// expanding common abbreviations (e.g. "jn 3:16" -> "John 3:16", "1 cor 13:4-7" -> "1 Corinthians 13:4-7").
// A chapter:verse colon is required — "1 cor 13 4-7" (space before the verses) isn't recognized.
// Multiple references separated by , or ; are each normalized independently.

const BOOKS: [string, string[]][] = [
  ['Genesis', ['gen', 'ge', 'gn']],
  ['Exodus', ['exo', 'ex', 'exod']],
  ['Leviticus', ['lev', 'le', 'lv']],
  ['Numbers', ['num', 'nu', 'nm', 'nb']],
  ['Deuteronomy', ['deut', 'de', 'dt']],
  ['Joshua', ['josh', 'jos', 'jsh']],
  ['Judges', ['judg', 'jdg', 'jg']],
  ['Ruth', ['ru', 'rth']],
  ['1 Samuel', ['sam', 'sa', 's']],
  ['2 Samuel', ['sam', 'sa', 's']],
  ['1 Kings', ['kgs', 'ki', 'kin']],
  ['2 Kings', ['kgs', 'ki', 'kin']],
  ['1 Chronicles', ['chr', 'ch']],
  ['2 Chronicles', ['chr', 'ch']],
  ['Ezra', ['ezr']],
  ['Nehemiah', ['neh', 'ne']],
  ['Esther', ['esth', 'es']],
  ['Job', ['job', 'jb']],
  ['Psalms', ['ps', 'psa', 'psalm', 'psm']],
  ['Proverbs', ['prov', 'pr', 'prv']],
  ['Ecclesiastes', ['eccl', 'ec', 'qoh']],
  ['Song of Solomon', ['song', 'sos', 'ss', 'sng']],
  ['Isaiah', ['isa', 'is']],
  ['Jeremiah', ['jer', 'je']],
  ['Lamentations', ['lam', 'la']],
  ['Ezekiel', ['ezek', 'eze', 'ezk']],
  ['Daniel', ['dan', 'da']],
  ['Hosea', ['hos', 'ho']],
  ['Joel', ['joel', 'jl']],
  ['Amos', ['amos', 'am']],
  ['Obadiah', ['obad', 'ob']],
  ['Jonah', ['jonah', 'jon']],
  ['Micah', ['mic', 'mc']],
  ['Nahum', ['nah', 'na']],
  ['Habakkuk', ['hab', 'hb']],
  ['Zephaniah', ['zeph', 'zep']],
  ['Haggai', ['hag', 'hg']],
  ['Zechariah', ['zech', 'zec']],
  ['Malachi', ['mal', 'ml']],
  ['Matthew', ['matt', 'mt']],
  ['Mark', ['mark', 'mk', 'mrk']],
  ['Luke', ['luke', 'lk']],
  ['John', ['john', 'jn', 'jhn']],
  ['Acts', ['acts', 'ac']],
  ['Romans', ['rom', 'ro', 'rm']],
  ['1 Corinthians', ['cor', 'co']],
  ['2 Corinthians', ['cor', 'co']],
  ['Galatians', ['gal', 'ga']],
  ['Ephesians', ['eph', 'ephes']],
  ['Philippians', ['phil', 'php']],
  ['Colossians', ['col', 'co']],
  ['1 Thessalonians', ['thess', 'th']],
  ['2 Thessalonians', ['thess', 'th']],
  ['1 Timothy', ['tim', 'ti']],
  ['2 Timothy', ['tim', 'ti']],
  ['Titus', ['titus', 'tit']],
  ['Philemon', ['philem', 'phm']],
  ['Hebrews', ['heb']],
  ['James', ['james', 'jas']],
  ['1 Peter', ['pet', 'pe']],
  ['2 Peter', ['pet', 'pe']],
  ['1 John', ['jn', 'jhn', 'john']],
  ['2 John', ['jn', 'jhn', 'john']],
  ['3 John', ['jn', 'jhn', 'john']],
  ['Jude', ['jude', 'jud']],
  ['Revelation', ['rev', 're']],
]

// Build lookup: normalized "<numberprefix><abbrev>" -> canonical name, plus full names.
const LOOKUP = new Map<string, string>()
for (const [canonical] of BOOKS) {
  LOOKUP.set(canonical.toLowerCase().replace(/\s+/g, ''), canonical)
  LOOKUP.set(canonical.toLowerCase(), canonical)
}
for (const [canonical, abbrevs] of BOOKS) {
  const numMatch = canonical.match(/^(\d) (.+)$/)
  const prefix = numMatch ? numMatch[1] : ''
  for (const abbr of abbrevs) {
    const key = (prefix + abbr).toLowerCase()
    if (!LOOKUP.has(key)) LOOKUP.set(key, canonical)
  }
}

const ORDINAL_WORDS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  '1st': '1',
  '2nd': '2',
  '3rd': '3',
  i: '1',
  ii: '2',
  iii: '3',
}

const REF_PATTERN =
  /^\s*(\d{1,3}|1st|2nd|3rd|first|second|third|i|ii|iii)?\.?\s*([a-zA-Z]+)\.?\s+(\d{1,3})\s*(?::\s*(\d{1,3}(?:\s*-\s*\d{1,3})?(?:\s*,\s*\d{1,3}(?:\s*-\s*\d{1,3})?)*))?\s*$/i

/** Collapses whitespace and normalizes dash variants before parsing. */
function preClean(raw: string): string {
  return raw
    .replace(/[‒-―−]/g, '-') // en/em dash, minus sign -> hyphen
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeOne(raw: string): string {
  const trimmed = preClean(raw)
  if (!trimmed) return trimmed

  const match = trimmed.match(REF_PATTERN)
  if (!match) return trimmed

  const [, ordinalRaw, bookRaw, chapter, verses] = match
  const ordinal = ordinalRaw ? (ORDINAL_WORDS[ordinalRaw.toLowerCase()] ?? ordinalRaw.replace(/\D/g, '')) : ''
  const bookKey = (ordinal + bookRaw).toLowerCase().replace(/\s+/g, '')
  const bookKeyNoNum = bookRaw.toLowerCase()

  const canonical = LOOKUP.get(bookKey) ?? (ordinal ? undefined : LOOKUP.get(bookKeyNoNum))
  if (!canonical) return trimmed

  const versePart = verses ? `:${verses.replace(/\s*-\s*/g, '-').replace(/\s*,\s*/g, ', ')}` : ''
  return `${canonical} ${chapter}${versePart}`
}

/** Normalize a (possibly multi-reference) scripture string typed by the user. */
export function formatScripture(raw: string): string {
  if (!raw.trim()) return raw
  const cleaned = preClean(raw).replace(/\.\s*$/, '') // drop a stray trailing period
  return cleaned
    .split(/[;]/)
    .map((part) => part.split(',').map((p) => p.trim()))
    .map((parts) => {
      // A bare trailing number after a normalized ref (e.g. "John 3:16, 18") is
      // an additional verse for the same chapter — keep those grouped with commas
      // and only re-resolve parts that look like a full book+chapter reference.
      return parts
        .map((p) => normalizeOne(p))
        .join(', ')
    })
    .join('; ')
}

// Damerau-Levenshtein (adjacent transposition counts as 1 edit, like Levenshtein's
// insert/delete/substitute) — this makes common letter-swap typos (e.g. "jonh" for
// "john") score better than they would under plain Levenshtein.
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
        continue
      }
      dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
      }
    }
  }
  return dp[a.length][b.length]
}

export interface ScriptureAnalysis {
  /** Best-effort cleaned-up text to save immediately (used when recognized, or when nothing better can be guessed). */
  formatted: string
  /** True when the book name was matched exactly (or wasn't shaped like a reference at all). */
  recognized: boolean
  /** A plausible corrected reference, only set when recognized is false and a close book-name match was found. */
  suggestion?: string
}

/** Analyzes a single typed scripture reference, attempting fuzzy book-name correction. */
export function analyzeScripture(raw: string): ScriptureAnalysis {
  const trimmed = preClean(raw).replace(/\.\s*$/, '')
  if (!trimmed) return { formatted: trimmed, recognized: true }

  const match = trimmed.match(REF_PATTERN)
  if (!match) return { formatted: trimmed, recognized: true }

  const [, ordinalRaw, bookRaw, chapter, verses] = match
  const ordinal = ordinalRaw ? (ORDINAL_WORDS[ordinalRaw.toLowerCase()] ?? ordinalRaw.replace(/\D/g, '')) : ''
  const bookKey = (ordinal + bookRaw).toLowerCase().replace(/\s+/g, '')
  const bookKeyNoNum = bookRaw.toLowerCase()
  const versePart = verses ? `:${verses.replace(/\s*-\s*/g, '-').replace(/\s*,\s*/g, ', ')}` : ''

  const canonical = LOOKUP.get(bookKey) ?? (ordinal ? undefined : LOOKUP.get(bookKeyNoNum))
  if (canonical) {
    return { formatted: `${canonical} ${chapter}${versePart}`, recognized: true }
  }

  // Unrecognized book name — look for the closest known abbreviation/name. Ties
  // are broken in favor of same-length matches, since a typo is more often a
  // letter swap/substitution (length unchanged) than a missing/extra letter.
  let best: { key: string; score: number } | null = null
  for (const key of LOOKUP.keys()) {
    const dist = editDistance(bookKey, key)
    const score = dist + Math.abs(key.length - bookKey.length) * 0.5
    if (!best || score < best.score) best = { key, score }
  }
  const threshold = Math.max(1, Math.ceil(bookKey.length * 0.4))
  if (best && best.score <= threshold) {
    const suggestedCanonical = LOOKUP.get(best.key)!
    return {
      formatted: trimmed,
      recognized: false,
      suggestion: `${suggestedCanonical} ${chapter}${versePart}`,
    }
  }

  return { formatted: trimmed, recognized: false }
}
