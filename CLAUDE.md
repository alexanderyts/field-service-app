# Field Service App — Claude Context

A local-first PWA for Jehovah's Witnesses ministry management. Tracks contacts, call logs, time, return visits, and schedules. **All data stays on the user's device — no backend, no server, no accounts.**

---

## Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite 8 |
| PWA | vite-plugin-pwa + Workbox |
| Database | Dexie.js 4 + dexie-react-hooks (`useLiveQuery`) → IndexedDB |
| Map | Leaflet + react-leaflet |
| Geocoding | Nominatim (OpenStreetMap) — free, no API key |
| Font | Satoshi via Fontshare CDN (`index.html`) |
| Lint | oxlint |

No UI component library. All components are hand-rolled. No backend whatsoever.

---

## Project Structure

```
src/
  App.tsx              # Root: tab routing, splash/policy phase, mapFocus state
  App.css              # All shared + per-tab CSS (single file, no CSS modules)
  index.css            # Global resets, design tokens (CSS vars), base element styles
  db.ts                # Dexie schema + all TypeScript interfaces
  timeStats.ts         # Credit-hour cap logic (55h/mo), monthly/yearly helpers
  scripture.ts         # Scripture reference formatter + autocorrect
  useGeolocation.ts    # GPS hook wrapping navigator.geolocation
  main.tsx             # Entry point
  components/
    Onboarding.tsx     # SplashScreen + PrivacyGate + hasAcceptedPolicy()
    Contacts.tsx       # Contact list, new contact modal, contact detail modal, call logger
    MapView.tsx        # Leaflet map with contact pins, focus-on-mount
    Schedule.tsx       # Survey, week view, Add Time (calendar + numpad), Return Visits
    Reports.tsx        # Run-on-demand monthly report with animated reveal
    Misc.tsx           # Credit hours toggle, privacy summary, donate section
    ConfirmDialog.tsx  # Reusable confirm/cancel modal
```

---

## App Startup Flow

Phase state: `'splash' | 'splash-out' | 'policy' | 'app'`

1. **splash** (0–1.8s) — animated splash screen
2. **splash-out** (1.8–2.2s) — fade-out animation
3. **policy** — shown on first boot; user must accept privacy policy
4. **app** — main app with 5-tab nav

`hasAcceptedPolicy()` checks `localStorage.getItem('fieldservice_privacy_v1') === 'yes'`.

---

## Tabs

| Tab | Key | Icon |
|---|---|---|
| Contacts | `contacts` | ◎ |
| Schedule | `schedule` | ◫ |
| Map | `map` | ◈ |
| Reports | `reports` | ▦ |
| More | `misc` | ⋯ |

---

## Database (`db.ts`)

**Dexie DB name:** `FieldServiceDB` — current version **5**

### Tables

**`people`** — contacts
```ts
Person { id, name, street?, city?, state?, zip?, lat?, lng?,
         status: ContactStatus, dateMet, phone?,
         married?, spouseName?, hasKids?, kidsInfo?,
         hasPets?, petsInfo?, notes?, createdAt }
ContactStatus = 'interested' | 'return-visit' | 'bible-study'
              | 'not-interested' | 'do-not-call' | 'moved'
```

**`calls`** — call log entries per contact
```ts
Call { id, personId, date, notHome?, notes?, scriptures?,
       leftAtDoor?, followUpDate?, lat?, lng? }
```

**`timeLogs`** — time tracking entries
```ts
TimeLog { id, date, minutes, category: TimeCategory, note? }
TimeCategory = 'ministry' | 'ldc' | 'hlc' | 'convention'
             | 'assembly' | 'bethel' | 'other'
```

**`appointments`** — return visits / scheduled follow-ups
```ts
Appointment { id, title, date, durationMinutes, personId?, notes? }
```

**`schedulePrefs`** — single-row user schedule settings
```ts
SchedulePrefs { id, completedSurvey, daysOut: number[],
                weeklyHours, yearlyHours,
                creditMode: 'weekly' | 'as-needed',
                startMinutes, sessionHours }
```

### Version History
- v1: initial schema
- v2: added calls, appointments; migrated old `visits` table
- v3: added schedulePrefs
- v4: dropped timeGoals + availability tables
- v5: dropped literature table; cleaned up old fields on calls

---

## localStorage Keys

| Key | Purpose |
|---|---|
| `fieldservice_privacy_v1` | `'yes'` when privacy policy accepted |
| `fieldservice_credit_hours` | `'yes'` when credit hour categories are enabled |
| `fieldservice_minute_bank` | Integer (minutes) accumulated toward next auto-hour |

---

## Time Tracking Logic (`timeStats.ts`)

- **Credit categories:** everything except `'ministry'` — `isCredit(cat) = cat !== 'ministry'`
- **Monthly cap:** if any credit hours used in a month, only up to **55h total** count toward the yearly goal
- `monthTotals(logs)` → `{ ministry, credit, total, creditUsed, applied }`
- `yearlyApplied(logs, year)` → sums capped monthly applied totals
- `yearlyTotals(logs, year)` → raw total (no cap), for display only

---

## Key Design Decisions

### Local-first / Privacy
- Zero backend. IndexedDB via Dexie is the only storage (plus a few localStorage flags).
- Nominatim geocoding sends only the address string — no user identity.
- Privacy policy on first boot releases developer from liability under US + AU law.
- `Clear All Data` in More tab wipes all DB tables + localStorage and reloads.

### Schedule → Add Time
- **Date field** opens a custom `CalendarPicker` modal (no date input native).
- **Hours/Minutes** open a custom `NumPad` modal — big tappable digit grid.
- **Round-up dialog:** when minutes > 30, asks user whether to round up to next hour.
  - Yes → logs `(hours + 1) * 60` minutes
  - No → logs `hours * 60` minutes; leftover minutes go to the minute bank
- **Minute bank:** stored in `fieldservice_minute_bank` localStorage. When it reaches 60, auto-adds a 1-hour `'ministry'` entry for the same date. Displayed as an amber pill + progress bar in the Schedule header when non-zero.
- **Category pills** replace the old dropdown. Credit mode off → Ministry, Other. Credit mode on → Ministry, LDC, Convention, Assembly, Bethel, Other.
- When `Other` is selected, a "type of ministry" input appears; its value goes into `note`.

### Reports
- Does NOT auto-run. Shows a "Ready when you are" screen with a **Run Report** button.
- After running, each card animates in with CSS staggered reveal (`report-body` > `:nth-child(N)`).
- **↺ Re-run** button in top right re-triggers the animation via `runKey` state.
- useLiveQuery keeps data live — current-month report auto-updates without re-running.

### More Tab
- **Count credit hours** checkbox → writes to `fieldservice_credit_hours` localStorage.
  - Schedule's Add Time reads this on every render (no prop drilling needed).
- Privacy section: collapsible summary of why the app is law-compliant.
- Donate section: PayPal to `alexander.yts@gmail.com`.

### Map
- Default center: `{ lat: 32.3, lng: -90.0 }` (Mississippi area)
- Contacts with lat/lng get a Leaflet marker + popup (name, status, address, "Jump to Contact")
- "Jump to Map" button in contact detail navigates to Map tab focused on that pin
- `mapFocus` state lives in `App.tsx` and is cleared after the map mounts on it

### Contacts
- Only `name` is required to save a contact
- Address geocodes automatically via Nominatim on save (if address provided, no existing lat/lng)
- Contact status tags are color-coded chips using CSS variables (`--tag-*`)
- Call logger: not-at-home mode, scripture field, left-at-door note, follow-up date

---

## CSS Architecture

Single `App.css` for component styles. `index.css` for global tokens + base elements.

**Key CSS variables (in `:root`):**
```css
--bg, --surface, --surface-2, --border
--text, --text-h, --muted
--accent (#2f6f5e), --accent-soft, --accent-hover
--danger, --danger-soft
--credit (#c17d1c), --credit-soft   /* amber — credit hours */
--visit (#6d5dd3), --visit-soft     /* violet — return visits */
--shadow-sm, --shadow-md
--tag-*  /* per-status contact tag colors */
```

**Notable CSS classes:**
- `.card` — surface card with border + shadow
- `.card.highlight` — green gradient background
- `.chip` / `.chip.active` — pill buttons (day toggles, category selector)
- `.cat-pills` — flex wrap container for category pill buttons
- `.date-display-btn` — styled button that looks like an input, opens calendar
- `.numpad-display-btn` — large number display that opens numpad
- `.cal-modal` + `.cal-grid` + `.cal-day` — custom calendar picker
- `.numpad-modal` + `.numpad-grid` + `.numpad-key` — custom numpad
- `.minute-bank-pill` + `.minute-bank-track` — amber bank indicator
- `.report-body` + `@keyframes report-reveal` — staggered card animation
- `.report-run-wrap` — "Ready when you are" prompt layout
- `.collapse-header` — transparent full-width button for collapsible cards
- `.view-header` — flex row with title left, action buttons right
- `.field` / `.field-label` / `.field-row` — form layout system
- `.modal-backdrop` + `.modal` — overlay modal system
- `.confirm-modal` / `.confirm-backdrop` — ConfirmDialog specific

---

## Dev Server

```
E:\Field Service App\dev-server.cmd   # Sets nodejs PATH, runs npm run dev
.claude/launch.json                   # Points preview tool to this cmd on port 5173
```

Run with: `npm run dev` (port 5173)
Build with: `npm run build` (tsc + vite)

---

## What NOT to Do

- Do not add a backend or any server-side data storage
- Do not add user accounts or authentication
- Do not use external UI component libraries (everything is hand-rolled)
- Do not create CSS modules — all styles go in `App.css` or `index.css`
- Do not bump the Dexie version without writing a proper `.upgrade()` migration
- Do not add comments explaining what code does — only add comments for non-obvious WHY
- Do not use native `<input type="date">` or `<input type="number">` in Add Time — the custom CalendarPicker and NumPad are intentional for mobile UX
