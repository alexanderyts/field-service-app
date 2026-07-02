// Dev-only demo data generator — fills the app with ~1.5 years of realistic
// pioneer activity (Rankin County, MS) so the UI can be previewed as it would
// look after real-world use. Not part of the shipped app; only reachable from
// the dev-gated button in Misc.tsx.
import { db, type Person, type Call, type TimeLog, type Appointment, type ContactStatus, type TimeCategory } from './db'
import { serviceYearBounds, serviceYearlyApplied } from './timeStats'

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}
function randInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min
}
function round15(min: number) {
  return Math.round(min / 15) * 15
}
function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function atNoon(d: Date) {
  const r = new Date(d)
  r.setHours(12, 0, 0, 0)
  return r.getTime()
}
function atTime(d: Date, h: number, m: number) {
  const r = new Date(d)
  r.setHours(h, m, 0, 0)
  return r.getTime()
}
function randomDateBetween(rng: () => number, start: Date, end: Date) {
  return new Date(start.getTime() + rng() * (end.getTime() - start.getTime()))
}
function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'Michael', 'Linda', 'William', 'Barbara',
  'David', 'Jessica', 'Richard', 'Sarah', 'Joseph', 'Karen', 'Thomas', 'Ashley',
  'Charles', 'Amanda', 'Christopher', 'Melissa', 'Daniel', 'Deborah', 'Matthew', 'Stephanie',
  'Anthony', 'Rebecca', 'Mark', 'Sharon', 'Donald', 'Cynthia', 'Steven', 'Angela',
  'Paul', 'Brenda', 'Andrew', 'Emma', 'Joshua', 'Olivia', 'Kenneth', 'Tasha',
]
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson',
  'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Walker',
  'Harris', 'Young', 'King', 'Wright', 'Hill', 'Green', 'Baker', 'Nelson',
  'Carter', 'Mitchell', 'Roberts', 'Phillips', 'Campbell', 'Parker',
]

const TOWNS = [
  { city: 'Brandon', zip: '39042', lat: 32.2732, lng: -89.9764 },
  { city: 'Pearl', zip: '39208', lat: 32.266, lng: -90.1301 },
  { city: 'Flowood', zip: '39232', lat: 32.3466, lng: -90.1173 },
  { city: 'Richland', zip: '39218', lat: 32.2354, lng: -90.172 },
  { city: 'Florence', zip: '39073', lat: 32.1585, lng: -90.1359 },
  { city: 'Pelahatchie', zip: '39145', lat: 32.3132, lng: -89.809 },
  { city: 'Puckett', zip: '39151', lat: 32.0743, lng: -89.7473 },
  { city: 'Star', zip: '39167', lat: 32.1421, lng: -90.0126 },
]

const STREETS = [
  'Old Fannin Rd', 'Crossgates Blvd', 'Spillway Rd', 'Highway 471', 'Highway 43',
  'Government St', 'Municipal Dr', 'Castlewoods Blvd', 'Airport Rd', 'Highway 80',
  'Salem Rd', 'Steed Rd', 'River Oaks Dr', 'Luckney Rd', 'Post Rd', 'Cato Rd',
]

// Each topic pairs the scripture actually used with what was discussed and what the
// follow-up plan is, so a call's scripture/notes/next-visit all tell one coherent story
// instead of being picked independently.
interface Topic {
  scripture: string
  discuss: string
  followUp: string
}
const TOPICS: Topic[] = [
  { scripture: 'John 3:16', discuss: "Talked about God's love and the ransom.", followUp: 'Bringing a study aid on the ransom next visit.' },
  { scripture: 'Matthew 24:14', discuss: 'Discussed why the Kingdom is preached worldwide.', followUp: 'Wants to see the "Good News From God" brochure.' },
  { scripture: 'Psalm 37:29', discuss: 'Talked about the earth becoming a paradise.', followUp: 'Curious what happens to the earth — following up with more scriptures.' },
  { scripture: 'Revelation 21:4', discuss: 'Discussed the end of suffering and death.', followUp: 'Lost a family member recently — bringing comfort literature.' },
  { scripture: 'John 17:3', discuss: 'Talked about what it means to really know God.', followUp: 'Wants to start a regular Bible study.' },
  { scripture: 'Matthew 6:9,10', discuss: "Went over the Lord's Prayer and God's Kingdom.", followUp: 'Asked what the Kingdom actually does — following up with Daniel 2:44.' },
  { scripture: 'Acts 17:24-27', discuss: 'Discussed whether God feels near or distant.', followUp: 'Interested in why there are so many religions.' },
  { scripture: 'Isaiah 11:9', discuss: 'Talked about worldwide peace under Kingdom rule.', followUp: 'Skeptical people could ever live in real peace — bringing more scriptures.' },
  { scripture: 'Psalm 83:18', discuss: "Discussed God's personal name, Jehovah.", followUp: "Didn't know God had a name — wants to talk more." },
  { scripture: '2 Timothy 3:1-5', discuss: 'Talked about why the world feels like it\'s getting worse.', followUp: "Agreed things are bad — following up on what fixes it." },
  { scripture: 'Matthew 5:3', discuss: 'Discussed true happiness and spiritual needs.', followUp: 'Going through a hard time — checking back in.' },
  { scripture: 'John 5:28,29', discuss: 'Talked about the resurrection hope.', followUp: 'Lost a loved one — wants to know more about seeing them again.' },
]

// Household/first-impression notes for people still active in the door-to-door pipeline.
const HOUSEHOLD_NOTES = [
  'Friendly, open to a return visit.',
  "Busy with kids, best to catch in the evening.",
  'Has a dog, watch the gate.',
  'Wants literature on the Kingdom.',
  'Grew up Baptist, has some questions.',
  'Elderly, appreciates a short visit.',
  'Works nights, better on weekends.',
]

// Closing notes for households that declined further visits.
const DECLINE_NOTES = [
  'Said not interested, politely declined a return visit.',
  'Practices a different religion, asked not to return.',
  'Very busy, asked not to be called on.',
  'Already receives literature from another group, not interested.',
  'Said no thank you, not interested in a religious discussion.',
]

// Notes for contacts who've since moved out of the territory.
const MOVED_NOTES = [
  'Moved out of the area, no forwarding info.',
  'House appears vacant now.',
  'Family relocated for work.',
  'No longer at this address — new tenant unaware of them.',
]

// Notes for people met through informal witnessing (not a door-to-door call).
const INFORMAL_NOTES = [
  'Met at the grocery store, brief but friendly chat.',
  'Talked to at the park while walking the dog.',
  'Coworker, chatted during a break.',
  'Struck up a conversation at the laundromat.',
  'Met at a coffee shop, seemed curious.',
]

const PERSON_NOTES: Record<ContactStatus, string[]> = {
  interested: HOUSEHOLD_NOTES,
  'return-visit': HOUSEHOLD_NOTES,
  'bible-study': HOUSEHOLD_NOTES,
  'informal-visit': INFORMAL_NOTES,
  'not-interested': DECLINE_NOTES,
  'do-not-call': DECLINE_NOTES,
  moved: MOVED_NOTES,
}

const LDC_NOTES = [
  'Kingdom Hall roof repair', 'Parking lot resurfacing', 'HVAC maintenance day',
  'Landscaping and grounds cleanup', 'Interior painting', 'Regional building project support',
]

// Pioneer's chosen service days: Mon, Tue, Wed, Thu, Sat
const DAYS_OUT = [1, 2, 3, 4, 6]

function buildPeople(rng: () => number, start: Date, end: Date): Person[] {
  const STATUS_COUNTS: [ContactStatus, number][] = [
    ['interested', 15],
    ['return-visit', 10],
    ['bible-study', 5],
    ['informal-visit', 6],
    ['not-interested', 8],
    ['do-not-call', 3],
    ['moved', 4],
  ]
  const people: Person[] = []
  let id = 1
  for (const [status, count] of STATUS_COUNTS) {
    for (let i = 0; i < count; i++) {
      const town = pick(rng, TOWNS)
      const created = randomDateBetween(rng, start, end)
      const married = rng() < 0.5
      const hasKids = married && rng() < 0.6
      const hasPets = rng() < 0.35
      people.push({
        id: id++,
        name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
        street: `${randInt(rng, 100, 9999)} ${pick(rng, STREETS)}`,
        city: town.city,
        state: 'MS',
        zip: town.zip,
        lat: town.lat + (rng() - 0.5) * 0.03,
        lng: town.lng + (rng() - 0.5) * 0.03,
        status,
        dateMet: created.getTime(),
        phone: rng() < 0.6 ? `601-${randInt(rng, 200, 999)}-${String(randInt(rng, 0, 9999)).padStart(4, '0')}` : undefined,
        married,
        spouseName: married ? pick(rng, FIRST_NAMES) : undefined,
        hasKids,
        kidsInfo: hasKids ? pick(rng, ['Two young kids', 'One toddler', 'Three school-age kids', 'A teenager']) : undefined,
        hasPets,
        petsInfo: hasPets ? pick(rng, ['Friendly dog', 'Barking dog, careful', 'A couple of cats']) : undefined,
        notes: rng() < 0.7 ? pick(rng, PERSON_NOTES[status]) : undefined,
        createdAt: created.getTime(),
      })
    }
  }
  return people
}

const CALL_COUNTS: Record<ContactStatus, [number, number]> = {
  interested: [2, 5],
  'return-visit': [3, 8],
  'bible-study': [6, 14],
  'informal-visit': [1, 3],
  'not-interested': [1, 2],
  'do-not-call': [1, 1],
  moved: [1, 2],
}

function buildCalls(rng: () => number, people: Person[], end: Date): Call[] {
  const calls: Call[] = []
  let id = 1
  for (const p of people) {
    const [lo, hi] = CALL_COUNTS[p.status]
    const n = randInt(rng, lo, hi)
    let cursor = new Date(p.createdAt)
    const isDecline = p.status === 'not-interested' || p.status === 'do-not-call'
    for (let i = 0; i < n; i++) {
      cursor = addDays(cursor, randInt(rng, 5, p.status === 'bible-study' ? 10 : 21))
      if (cursor > end) break
      const notHome = rng() < (p.status === 'bible-study' ? 0.05 : isDecline ? 0.35 : 0.25)
      const canFollowUp =
        !notHome && !isDecline && (p.status === 'return-visit' || p.status === 'bible-study' || (p.status === 'interested' && rng() < 0.4))
      const willFollowUp = canFollowUp && rng() < 0.6

      // Notes/scripture tell one coherent story: what was actually discussed, and — if
      // a follow-up got scheduled — what that next visit is specifically about.
      let notes: string | undefined
      let scriptures: string | undefined
      if (!notHome) {
        if (isDecline) {
          notes = pick(rng, DECLINE_NOTES)
        } else {
          const topic = pick(rng, TOPICS)
          notes = willFollowUp ? `${topic.discuss} ${topic.followUp}` : topic.discuss
          scriptures = topic.scripture
        }
      }

      calls.push({
        id: id++,
        personId: p.id,
        date: atTime(cursor, randInt(rng, 9, 19), pick(rng, [0, 15, 30, 45])),
        notHome,
        notes,
        scriptures,
        leftAtDoor: notHome && rng() < 0.5 ? pick(rng, ['Tract', 'Invitation card', 'Note with contact info']) : undefined,
        followUpDate: willFollowUp ? atTime(addDays(cursor, randInt(rng, 3, 14)), randInt(rng, 9, 19), 0) : undefined,
      })
    }
  }
  return calls
}

function buildAppointments(rng: () => number, people: Person[], now: Date): Appointment[] {
  const candidates = people.filter((p) => p.status === 'interested' || p.status === 'return-visit' || p.status === 'bible-study')
  const chosen = shuffle(rng, candidates).slice(0, 12)
  const appts: Appointment[] = []
  let id = 1
  for (const p of chosen) {
    // A mix of just-past (recently kept) and upcoming (still on the follow-up list).
    const d = addDays(now, randInt(rng, -10, 21))
    appts.push({
      id: id++,
      title: `Return Visit — ${p.name}`,
      date: atTime(d, randInt(rng, 9, 19), pick(rng, [0, 15, 30, 45])),
      durationMinutes: 30,
      personId: p.id,
      notes: rng() < 0.7 ? pick(rng, TOPICS).followUp : undefined,
    })
  }
  return appts
}

function buildTimeLogs(rng: () => number, start: Date, end: Date): TimeLog[] {
  const logs: TimeLog[] = []
  let id = 1

  // Circuit assemblies (1 day) near the start and end of each service year (Sept–Aug);
  // the big convention (3 days) once, leading up to summer, each calendar year.
  const special = new Map<string, TimeCategory>()
  const mark = (d: Date, cat: TimeCategory) => special.set(d.toDateString(), cat)
  mark(new Date(2024, 9, 18), 'assembly') // early in service year 2025 (Sept 2024 – Aug 2025)
  mark(new Date(2025, 6, 19), 'assembly') // late in service year 2025, before the Aug close-out
  mark(new Date(2025, 9, 17), 'assembly') // early in service year 2026 (Sept 2025 – Aug 2026)
  for (const d of [new Date(2025, 5, 5), new Date(2025, 5, 6), new Date(2025, 5, 7)]) mark(d, 'convention')
  for (const d of [new Date(2026, 5, 4), new Date(2026, 5, 5), new Date(2026, 5, 6)]) mark(d, 'convention')

  // LDC is available year-round but concentrated in a couple of build-focus months per year.
  const ldcFocusMonths: Record<number, number[]> = { 2024: [9, 10], 2025: [2, 8], 2026: [2] }

  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const specialCat = special.get(d.toDateString())
    if (specialCat && d <= end) {
      logs.push({ id: id++, date: atNoon(d), minutes: randInt(rng, 360, 420), category: specialCat })
      continue
    }

    // LDC and ministry compete for the same day — a build day replaces a ministry
    // outing rather than stacking on top of it, which is what kept pushing focus
    // months past 100+ combined hours.
    const isFocusMonth = (ldcFocusMonths[d.getFullYear()] ?? []).includes(d.getMonth())
    const doLdc = rng() < (isFocusMonth ? 0.22 : 0.05)
    if (doLdc) {
      logs.push({
        id: id++,
        date: atNoon(d),
        minutes: round15(randInt(rng, isFocusMonth ? 180 : 90, isFocusMonth ? 300 : 180)),
        category: 'ldc',
        note: rng() < 0.4 ? pick(rng, LDC_NOTES) : undefined,
      })
      continue
    }

    const isServiceDay = DAYS_OUT.includes(d.getDay())
    if (rng() < (isServiceDay ? 0.85 : 0.12)) {
      logs.push({ id: id++, date: atNoon(d), minutes: round15(randInt(rng, 90, 220)), category: 'ministry' })
    }
  }
  return logs
}

// Replaces whatever the random pass generated for March and April 2025 with fixed,
// illustrative totals so the 55h/mo credit cap is directly visible in the Reports tab:
//   March 2025 — 72h ministry, no credit -> all 72h applied (no cap).
//   April 2025 — 24h ministry + 64h credit (convention/ldc/hlc) -> capped at 55h applied,
//                with the 33h overage still counted in the year's raw total, not lost.
function injectCapExampleMonths(logs: TimeLog[], nextId: () => number) {
  const add = (y: number, m: number, day: number, minutes: number, category: TimeCategory) =>
    logs.push({ id: nextId(), date: atNoon(new Date(y, m, day)), minutes, category })

  const kept = logs.filter((l) => {
    const d = new Date(l.date)
    const isMarch2025 = d.getFullYear() === 2025 && d.getMonth() === 2
    const isApril2025 = d.getFullYear() === 2025 && d.getMonth() === 3
    return !isMarch2025 && !isApril2025
  })
  logs.length = 0
  logs.push(...kept)

  for (const day of [3, 5, 7, 10, 12, 14, 17, 19, 21, 24, 26, 28]) add(2025, 2, day, 6 * 60, 'ministry') // 12 x 6h = 72h

  for (const day of [2, 7, 14, 21]) add(2025, 3, day, 6 * 60, 'ministry') // 4 x 6h = 24h
  add(2025, 3, 4, 7 * 60, 'convention')
  add(2025, 3, 5, 7 * 60, 'convention')
  add(2025, 3, 6, 6 * 60, 'convention') // 7+7+6 = 20h
  for (const day of [9, 11, 16, 18]) add(2025, 3, day, 6 * 60, 'ldc') // 4 x 6h = 24h
  for (const day of [23, 24, 25, 28]) add(2025, 3, day, 5 * 60, 'hlc') // 4 x 5h = 20h
}

// Tops up a completed service year with extra ministry entries (on otherwise-blank
// days) until it reaches the target — guarantees the goal is met regardless of how
// the random pass landed, without disturbing months that are already capped.
function topUpServiceYear(rng: () => number, logs: TimeLog[], label: number, targetMinutes: number, nextId: () => number) {
  const { start, end } = serviceYearBounds(label)
  const today = new Date()
  const loggedDays = new Set(
    logs.filter((l) => l.date >= start && l.date <= end).map((l) => new Date(l.date).toDateString())
  )
  const candidateDays: Date[] = []
  for (let d = new Date(start); d.getTime() <= end && d <= today; d = addDays(d, 1)) {
    if (!loggedDays.has(d.toDateString())) candidateDays.push(new Date(d))
  }
  const shuffled = shuffle(rng, candidateDays)

  let i = 0
  while (serviceYearlyApplied(logs, label) < targetMinutes && i < shuffled.length) {
    logs.push({ id: nextId(), date: atNoon(shuffled[i]), minutes: round15(randInt(rng, 90, 180)), category: 'ministry' })
    i++
  }
}

/** Wipes all app data and replaces it with ~1.5 years of realistic pioneer activity for previewing. */
export async function seedDemoData() {
  const rng = mulberry32(20250101)
  const start = new Date(2024, 8, 1) // Sept 1, 2024 — start of service year 2025
  const now = new Date()
  const end = new Date(Math.min(new Date(2026, 5, 30).getTime(), now.getTime() - 86400000))

  await Promise.all([
    db.people.clear(),
    db.calls.clear(),
    db.timeLogs.clear(),
    db.appointments.clear(),
    db.schedulePrefs.clear(),
  ])

  const people = buildPeople(rng, start, end)
  const calls = buildCalls(rng, people, end)
  const appointments = buildAppointments(rng, people, now)
  const timeLogs = buildTimeLogs(rng, start, end)

  let nextLogId = timeLogs.reduce((max, l) => Math.max(max, l.id), 0) + 1
  injectCapExampleMonths(timeLogs, () => nextLogId++)

  // Service year 2025 (Sept 2024 – Aug 2025) has now fully elapsed — make sure the
  // 600h requirement was actually met, so the August report shows a completed goal.
  topUpServiceYear(rng, timeLogs, 2025, 600 * 60 + randInt(rng, 0, 900), () => nextLogId++)

  await db.people.bulkAdd(people)
  await db.calls.bulkAdd(calls)
  await db.appointments.bulkAdd(appointments)
  await db.timeLogs.bulkAdd(timeLogs)
  await db.schedulePrefs.add({
    id: 1,
    completedSurvey: true,
    isPioneer: true,
    daysOut: DAYS_OUT,
    weeklyHours: 15,
    yearlyHours: 600,
    daySchedule: Object.fromEntries(DAYS_OUT.map((d) => [d, { start: 9 * 60, end: 9 * 60 + 2.5 * 60 }])),
    goalPeriod: 'none',
  })

  localStorage.setItem('fieldservice_privacy_v1', 'yes')
  localStorage.setItem('fieldservice_credit_hours', 'yes')
  localStorage.removeItem('fieldservice_minute_bank')
}
