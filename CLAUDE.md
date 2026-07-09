# Meleo — Claude Context

A local-first PWA for Jehovah's Witnesses ministry management ("Ministry Companion"). Tracks contacts,
call logs, time, return visits, schedules, and hand-traced territories/streets. **All data stays on the
user's device — no backend, no server, no accounts.** Sharing between devices is peer-to-peer via QR
codes / files, never a server.

> The app is named **Meleo** (from Greek ἐπιμελέομαι, "to take care of"). The npm package and Dexie DB
> still use the older `field-service` / `FieldServiceDB` / `fieldservice_*` names — don't rename those,
> they'd break existing installs.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript ~6.0 + Vite 8 |
| PWA | vite-plugin-pwa 1.3 + Workbox (generateSW) |
| Database | Dexie.js 4 + dexie-react-hooks (`useLiveQuery`) → IndexedDB |
| Map | Leaflet + react-leaflet 5 |
| Geocoding | Nominatim (OSM) for addresses/reverse-geocode; Overpass API for road-snapping traces — free, no key |
| Sharing | pako (deflate) + qrcode — compressed payload in a URL hash → QR or `.meleo` file |
| PDF forms | pdf-lib — fills the real S-205b auxiliary-pioneer AcroForm |
| Font | Satoshi, **bundled locally** as woff2 (`src/assets/fonts/`, `@font-face` in `index.css`) — works offline |
| Lint | oxlint |

No UI component library. All components are hand-rolled. No backend whatsoever.

---

## Project Structure

```
src/
  main.tsx             # Entry: applies theme pre-paint, wraps App in ErrorBoundary
  App.tsx              # Root: phase gating, tab routing, cross-tab nav state, deep-link import capture
  App.css              # All shared + per-tab component CSS (single file, no CSS modules)
  index.css            # Global resets, design tokens (CSS vars), 4 themes, base element styles
  db.ts                # Dexie schema (v8) + all TypeScript interfaces + house-number sort/resolve helpers
  ErrorBoundary.tsx    # Top-level crash catcher
  ModalPortal.tsx      # Portal + body-scroll-lock wrapper used by every modal
  version.ts           # APP_VERSION (stamped into backups)
  legal.ts             # Copyright / developer email / "not affiliated" strings
  profile.ts           # User's own name (localStorage) — used as the "from" on shares
  scripture.ts         # Scripture reference formatter + autocorrect
  usStates.ts          # State name/abbreviation expansion
  contactStatus.ts     # ContactStatus labels + display order
  categories.ts        # TimeCategory labels/emoji/order
  useGeolocation.ts    # GPS hook wrapping navigator.geolocation
  timeStats.ts         # Credit-hour cap (55h/mo), monthly/yearly + service-year helpers
  goalSegments.ts      # Day goal-ring arc math for the Schedule calendar
  minuteBankFly.ts     # The "minute bank" fly-to-pill animation helper
  auxPioneering.ts     # Auxiliary-pioneer config (localStorage) + target-hour math
  auxSlip.ts           # Fills the S-205b auxiliary-pioneer PDF (pdf-lib)
  tips.ts              # Tip/support link config for the More tab
  share.ts             # Cross-device share: encode/decode/QR/file + import-as-new-records
  backup.ts            # Full local JSON backup / restore / wipe-all
  notifications.ts     # In-app return-visit reminders (no backend push)
  pwaInstall.ts        # Install prompt + persistent-storage request
  roadSnap.ts          # Snap traced waypoints onto real OSM road geometry (Overpass)
  territoryImage.ts    # Schematic canvas rendering of traced streets (no map tiles → no tainted canvas)
  devSeed.ts           # Demo/seed data (loaded from More tab)
  components/
    Onboarding.tsx     # SplashScreen + PrivacyGate + ProfileGate (+ hasAcceptedPolicy/hasSeenProfilePrompt)
    Tutorial.tsx       # Guided tour + first-run TutorialPrompt
    InstallPrompt.tsx  # "Add to Home Screen" banner
    Contacts.tsx       # THE MINISTRY TAB: People/Streets/Territories sub-views, contact form/detail, call logger
    StreetEntries.tsx  # Streets sub-view: street list, StreetDetail, house-number pad, ensureStreetEntry
    Territories.tsx    # Territories sub-view: grouped-territory list + detail
    Territory.tsx      # Map-side custom-territory manager: trace/draw modal, send-to-ministry, grouping
    MapView.tsx        # Leaflet map: contact pins, territory traces, satellite toggle, place search
    Schedule.tsx       # Survey, week/calendar views, Add Time (calendar+numpad), return visits (~3k lines)
    Reports.tsx        # On-demand monthly report + service-year figures
    ServiceYearReview.tsx # Animated end-of-service-year summary
    Misc.tsx           # More tab: support, theme, profile, notifications, backup/restore, clear data
    ShareModal.tsx     # Reusable QR/file share flow (contact/street/territory)
    ImportConfirm.tsx  # Confirm + import a scanned/opened share payload
    SharedBits.tsx     # SharedBadge + SharedWarning (attribution UI)
    ConfirmDialog.tsx  # Reusable confirm/cancel modal
```

---

## App Startup Flow

Phase state (`App.tsx`): `'splash' | 'splash-out' | 'policy' | 'profile' | 'app'`

1. **splash** (~0–2.45s) — Greek→Latin wordmark animation (pure CSS, `.splash-*`)
2. **splash-out** (~2.45–2.85s) — fade-out
3. **policy** — first boot: user must accept the privacy policy (`hasAcceptedPolicy()`)
4. **profile** — first boot: optional name prompt (`hasSeenProfilePrompt()`)
5. **app** — main app with 5-tab nav

`nextPhase()` skips whichever gates are already satisfied. `main.tsx` applies the saved theme to
`<html data-theme>` **before first paint** so a non-light theme never flashes light.

---

## Tabs

| Tab | Key | Label | Icon | Component |
|---|---|---|---|---|
| Ministry | `contacts` | Ministry | ◎ | `Contacts.tsx` |
| Schedule | `schedule` | Schedule | ◫ | `Schedule.tsx` |
| Map | `map` | Map | ◈ | `MapView.tsx` |
| Reports | `reports` | Reports | ▦ | `Reports.tsx` |
| More | `misc` | More | ⋯ | `Misc.tsx` |

Schedule/Reports/Misc/Map are code-split (`lazy`) and warmed during idle after launch. Contacts is
eager (default tab). Cross-tab navigation is state in `App.tsx`: `openContactId`, `mapFocus`,
`pendingDraw` (Map draw tool), `pendingImport` (share import).

### Ministry tab sub-views
`Contacts.tsx` hosts a segmented control: **People** / **Streets** / **Territories** (each shows a count).
The **+ New Entry** chooser offers: New Contact, New Street, New Custom Territory (jumps to Map draw
tool), and Import a Shared Item (file).

---

## Database (`db.ts`)

**Dexie DB name:** `FieldServiceDB` — current version **8**

### Tables & interfaces

**`people`** — contacts
```ts
Person { id, name, street?, city?, state?, zip?, lat?, lng?,
         status: ContactStatus, dateMet, phone?,
         married?, spouseName?, hasKids?, kidsInfo?, hasPets?, petsInfo?,
         notes?, createdAt, sharedWith?, receivedFrom? }
ContactStatus = 'interested' | 'return-visit' | 'bible-study' | 'informal-visit'
              | 'not-interested' | 'do-not-call' | 'moved'
```

**`calls`** — call log entries per contact
```ts
Call { id, personId, date, notHome?, notes?, scriptures?,
       leftAtDoor?, followUpDate?, literaturePlaced?, lat?, lng? }
```

**`timeLogs`** — time tracking entries
```ts
TimeLog { id, date, minutes, category: TimeCategory, note? }
TimeCategory = 'ministry' | 'ldc' | 'hlc' | 'convention' | 'assembly' | 'bethel' | 'other'
```

**`appointments`** — return visits / scheduled follow-ups
```ts
Appointment { id, title, date, durationMinutes, personId?, notes? }
```

**`schedulePrefs`** — single-row user schedule settings
```ts
SchedulePrefs { id, completedSurvey, isPioneer?, daysOut, weeklyHours, yearlyHours,
                daySchedule?, dateOverrides?, goalPeriod?, monthlyHours?, scheduleDefaultExpand? }
DayScheduleBlock { start, end, category }   // per-day planning windows (never auto-logged)
```

**`streetEntries`** — a road being worked door-to-door (the address-book side of a street)
```ts
StreetEntry { id, name, city?, state?, zip?, houses: StreetHouse[],
              notes?, assignedTo?, points?, createdAt, sharedWith?, receivedFrom? }
StreetHouse { id, number, status?: HouseStatus, note? }   // number is a free string ("123A")
HouseStatus = 'not-home' | 'no-trespassing' | 'other'
```

**`territories`** — hand-traced, disposable groups of streets (draft OR grouped/durable)
```ts
Territory { id, name, createdAt, completed, grouped?, assignedTo?,
            streets: TerritoryStreet[], sharedWith?, receivedFrom? }
TerritoryStreet { id, name, points, done, entryId?, assignedTo? }
```

**`territoryCompletions`** — write-once record of a territory being completed (for Reports)
```ts
TerritoryCompletion { id, completedAt, name, streetCount }
```

Helpers in `db.ts`: `compareHouseNumbers(a,b)` (walk-order house sort) and
`resolveStreetEntry(street, entries)` (entryId → name fallback).

### Version History
- v1: initial schema
- v2: added calls, appointments; migrated old `visits`
- v3: added schedulePrefs
- v4: dropped timeGoals + availability
- v5: dropped literature table; cleaned old call fields
- v6: added territories
- v7: added territoryCompletions
- v8: added streetEntries

> `Person.sharedWith/receivedFrom`, `StreetEntry.notes`, `TerritoryStreet.entryId`, etc. are optional and
> **non-indexed**, so they were added to interfaces **without** a Dexie version bump. Only add a
> `.version().stores()` entry when changing indexes or table structure.

---

## Streets ⇄ Territories (single source of truth)

A **street** is one `StreetEntry` no matter where it's shown. A `TerritoryStreet` inside a territory is
just a trace + a link (`entryId`) to its backing `StreetEntry`; the entry holds the house numbers, notes,
share state, etc. So the same street is managed identically in the Streets tab and inside a Territory.

- `ensureStreetEntry(street, extra?)` (`StreetEntries.tsx`) — resolves or creates the backing entry,
  returning its id. Called by grouping, import, and "Manage" (self-heals legacy territory streets).
- **Draft custom territory** (`Territory.tsx`, opened from the Map): trace streets by tapping points
  (snapped to real roads via `roadSnap.ts`). Two exits, each with a confirm dialog explaining the
  destination:
  - **Send to Ministry** → moves a single street into the Streets list.
  - **Group Selected into a Territory** → creates a durable `grouped` territory in the Territories tab
    AND backs each street with a Streets entry (tagged with the territory via the badge/filter).
- **Streets list** badges streets that belong to a territory and has an All / Standalone / In-a-territory
  filter.
- `territoryImage.ts` renders schematic previews; `TerritoryMiniMap` (`Territory.tsx`) renders live tiles.

---

## localStorage Keys

Convention `fieldservice_*`. `backup.ts` exports every `fieldservice_*` key **except** its
`SETTINGS_BLOCKLIST` (per-device consent/UX + transient bookkeeping).

| Key | Purpose |
|---|---|
| `fieldservice_privacy_v2` | `'yes'` when privacy policy accepted (v1 was pre-Meleo rename) |
| `fieldservice_profile_prompted` | `'yes'` once the name prompt was shown |
| `fieldservice_first_name` / `_last_name` | User's own name (share attribution, personalization) |
| `fieldservice_tutorial_seen` | `'yes'` once the guided-tour prompt was shown |
| `fieldservice_credit_hours` | `'yes'` when credit-hour categories are enabled |
| `fieldservice_minute_bank` | Integer minutes accumulated toward the next auto-hour |
| `fieldservice_theme` | `'light' | 'dark' | 'pastel' | 'mark'` |
| `fieldservice_dark_mode` | Legacy boolean, read as a fallback for `_theme` |
| `fieldservice_participated_months` | Months the user marked as "participated in ministry" |
| `fieldservice_notify_enabled` / `_notify_lead_min` / `_notify_sent_ids` | Return-visit reminder settings + dedupe |
| `fieldservice_aux_*` | Auxiliary-pioneer config (see `auxPioneering.ts`) |

---

## Time Tracking Logic (`timeStats.ts`)

- **Credit categories:** everything except `'ministry'` — `isCredit(cat) = cat !== 'ministry'`
- **Monthly cap:** `CREDIT_CAP_HOURS = 55`. Ministry always applies in full; credit tops it up but the
  combined ministry+credit applied to the yearly goal is capped at 55h/mo. `total` stays uncapped for display.
- `monthTotals(logs)` → `{ ministry, credit, total, creditUsed, applied }`
- Yearly and **service-year** (Sept 1–Aug 31) variants: `serviceYearBounds`, `serviceYearlyApplied`,
  `serviceYearlyTotals`, etc. Pioneers track against 600h/yr; non-pioneers against an optional self-set
  goal; auxiliary pioneers against 15h/30h months (`auxPioneering.ts`).

---

## Sharing (`share.ts` + `ShareModal` / `ImportConfirm` / `SharedBits`)

Peer-to-peer, no server. A contact/street/territory is serialized, deflated (pako), base64url-encoded,
and put in a deep-link URL **hash** (`#i=…`). Small payloads → a scannable **QR**; large ones → a
`.meleo` **file** via the OS share sheet. Receiving scans the QR (opens the app at that hash) or imports
the file; `App.tsx` captures the hash at load and offers `ImportConfirm`. Imports always create **new**
records tagged `receivedFrom`; the owner's copy accumulates `sharedWith`. `SharedBadge`/`SharedWarning`
surface that attribution and warn before editing a shared item.

---

## Backup & Notifications

- **Backup (`backup.ts`, More tab):** full local JSON `exportBackup()` / `importBackup()` (self-describing,
  versioned) + `wipeAllData()`. The only way a tester's data survives a device wipe and the bridge to any
  future native build. Includes all Dexie tables + non-blocklisted `fieldservice_*` keys.
- **Notifications (`notifications.ts`):** return-visit reminders fire **only while the app is open** (no
  backend to wake the device). Configurable lead time; `checkReturnVisitNotifications()` runs on reaching
  the app and every 5 min after.

---

## Themes

Four themes, selected in More → Personalize, stored in `fieldservice_theme`, applied as
`<html data-theme>` (light is the default with no attribute). Defined entirely as CSS-var overrides in
`index.css`: **light**, **dark**, **pastel** (lavender-blush), **mark** (deep navy). Saturated
brand/category/tag hues are brightened per dark theme for contrast.

---

## Key Design Decisions

### Local-first / Privacy
- Zero backend. IndexedDB (Dexie) is the only storage, plus `fieldservice_*` localStorage flags.
- Nominatim/Overpass calls send only address strings / coordinates — never identity.
- Privacy policy on first boot; `Clear All Data` (More tab) wipes all tables + localStorage and reloads.

### Schedule → Add Time
- **Date** opens a custom `CalendarPicker`; **Hours/Minutes** open a custom `NumPad` (no native
  `type="date"`/`type="number"` here — intentional for mobile UX).
- **Round-up dialog** when minutes > 30; leftover minutes go to the **minute bank**
  (`fieldservice_minute_bank`) which auto-adds a 1-hour ministry entry at 60, with a fly-to-pill animation.
- Category **pills** (not a dropdown). Per-day planning uses `DayScheduleBlock`s; goal rings via
  `goalSegments.ts`.

### Reports
- Does NOT auto-run — shows a "Ready when you are" screen with a Run button; cards animate in with a
  staggered CSS reveal; `↺ Re-run` re-triggers via `runKey`. Includes territory completions and
  service-year figures; `ServiceYearReview` is the animated year summary.

### Map
- Default center `{ lat: 32.3, lng: -90.0 }`. Contact pins + popups, territory traces overlaid,
  satellite/street tile toggle, place search. "Jump to Map" from a contact/street focuses the pin via
  `mapFocus` state (cleared after mount).

### Contacts
- Only `name` is required. Address auto-geocodes via Nominatim on save (with a live address-autocomplete
  combobox). Status chips are color-coded via `--tag-*`. Call logger handles not-home, scriptures
  (autocorrected), literature placed, left-at-door, follow-up. "New Contact" can be pre-filled from a
  street or a specific house (`ContactPrefill`).

### More tab
- Sections: **Support & share** (tips via `tips.ts`, share the app), **Personalize** (theme, profile
  name, notifications, minute animation, count-credit-hours, default calendar expand), **Your data**
  (backup/restore, load demo data, clear all data), plus the collapsible privacy summary.

---

## CSS Architecture

Single `App.css` for components; `index.css` for global tokens + 4 themes + base elements.

**Key CSS variables (`:root`, overridden per `[data-theme]`):**
```
--bg, --bg-translucent, --surface, --surface-2, --border
--text, --text-h, --muted
--accent / --accent-soft / --accent-hover
--danger / --danger-soft, --credit / --credit-soft, --visit / --visit-soft
--cat-* (per TimeCategory), --tag-* (per ContactStatus)
--shadow-sm, --shadow-md, --title-shadow
```

**Notable classes:** `.card` / `.card.highlight`, `.chip` / `.chip.active`, `.segmented` (sub-view/filter
toggles), `.field` / `.field-label` / `.field-row`, `.modal` / `.modal-backdrop` (+ `.modal-expanded`),
`.list` / `.list-item`, `.badge`, `.house-list` / `.house-row`, `.draft-street-*` /
`.manage-territory-modal`, `.numpad-*`, `.cal-*`, `.minute-bank-*`, `.report-*`, `.splash-*`,
`.misc-section-title`, `.combobox` / `.combobox-list`.

---

## Dev Server

```
E:\Field Service App\dev-server.cmd   # Sets nodejs PATH, runs npm run dev
.claude/launch.json                   # Points the preview tool to this cmd on port 5173
```

Run: `npm run dev` (port 5173) · Build: `npm run build` (`tsc -b && vite build`) ·
Pages build: `npm run build:pages` · Lint: `npm run lint` (oxlint) · Test: `npm test` (Vitest)

---

## Working Conventions (Definition of Done)

A change is "done" when:
- **Green gates:** `npm run build` (tsc **strict** + vite), `npm run lint`, and `npm test` all pass —
  the same three the CI runs before every deploy (`.github/workflows/deploy-pages.yml`).
- **Pure logic is tested:** new pure functions (math, parsing, sorting, formatting) get a Vitest
  test next to them (`*.test.ts`). UI/DB glue isn't required to be tested.
- **Docs aren't allowed to drift:** if a change touches the schema, tabs, architecture, or a
  localStorage key, update **this CLAUDE.md in the same commit**. Doc drift is treated as a
  workflow failure, not a later cleanup.
- **Behavior is verified for runtime changes** (drive the flow / screenshot, not just typecheck),
  and the commit/PR says how it was verified.
- **Findings are tracked in [AUDIT.md](AUDIT.md):** a finding closes only with *named proof* (a test,
  a fixing commit, or a manual-verification note). The human owns waivers and closure.
- **Versioning (semver `MAJOR.MINOR.PATCH`):** MINOR = new feature, PATCH = fix/polish, MAJOR reserved
  for the first public release / breaking changes. When cutting a version, update [CHANGELOG.md](CHANGELOG.md),
  `src/version.ts` (`APP_VERSION`), and `package.json` together.

---

## What NOT to Do

- Do not add a backend or any server-side data storage.
- Do not add user accounts or authentication.
- Do not use external UI component libraries (everything is hand-rolled).
- Do not create CSS modules — all styles go in `App.css` or `index.css`.
- Do not bump the Dexie version for a new optional/non-indexed field; only bump for index/table changes,
  and write a proper `.upgrade()` migration when you do.
- Do not rename the `FieldServiceDB` DB or `fieldservice_*` keys — it breaks existing installs.
- Do not add comments explaining WHAT code does — only non-obvious WHY.
- Do not use native `<input type="date">` / `type="number"` in Schedule's Add Time — the custom
  CalendarPicker and NumPad are intentional.
- Do not store two divergent copies of a street — a `TerritoryStreet` links to its `StreetEntry` via
  `entryId`; go through `ensureStreetEntry`/`resolveStreetEntry`.
