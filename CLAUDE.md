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
| Map tiles | Esri (`server.arcgisonline.com`): World Street Map, World Imagery, place labels — keyless. CARTO dropped in 0.20.5 (F047) |
| Sharing | pako (deflate) + qrcode — compressed payload in a URL hash → QR, link, or `.meleo` file |
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
  ModalPortal.tsx      # Portal + body-scroll-lock + keyboard (focus in, Tab trap, Esc, focus restore) for every modal
  focusTrap.ts         # The pure Tab-cycling rule ModalPortal uses (unit-tested)
  version.ts           # APP_VERSION (stamped into backups)
  legal.ts             # Copyright / developer email / "not affiliated" strings
  profile.ts           # User's own name (localStorage) — used as the "from" on shares
  settings.ts          # Typed, crash-safe accessors for theme / credit-hours / last-backup keys
  streets.ts           # Street identity: ensureStreetEntry / findStreetTraceMidpoint
  records.ts           # Multi-table operations, each in one transaction (tested via fake-indexeddb) — incl. logCall + importSharedPayload
  timeRecords.ts       # Time-log writes (logTime, logWithBank, redeemMinuteBank, submitPlanned, clearDay) — one transaction each; apart from records.ts so the startup bundle doesn't load schedule code
  monthReport.ts       # Pure: the month's Service Report (participation, visited Bible studies, whole hours, comments) + which month is due
  rowGuards.ts         # Runtime type checks for rows from outside (share payloads, backup restore): TABLE_ROW_GUARDS per table
  appointments.ts      # Which return visits are still pending (until a call on/after the visit's day, or 14 days overdue), dueToday, badge label
  address.ts           # Address comparison, so a save knows whether the address really changed
  timeAgo.ts           # "3 days ago" formatter (now injected, for testability)
  scripture.ts         # Scripture reference formatter + autocorrect
  usStates.ts          # State name/abbreviation expansion
  contactStatus.ts     # ContactStatus labels + display order
  categories.ts        # TimeCategory labels/emoji/order + credit activity quick-picks
  useGeolocation.ts    # GPS hook wrapping navigator.geolocation
  timeStats.ts         # Credit-hour cap (55h/mo), monthly/yearly + service-year helpers
  goalSegments.ts      # Day goal-ring arc math for the Schedule calendar
  milestones.ts        # Milestone crossing (25/50/75/100), month pace status/delta, tone rules (per-day ≤ 3h shown; week stretch > 1.5× average) — pure, tested
  territoriesFeature.ts # Streets & territories opt-in: useTerritoriesEnabled() = the More switch, else on iff streets/territories exist
  roleSetup.ts         # applyFirstRunRole: the welcome screen's role → a ready prefs row + aux config (never overwrites; tested)
  schedulePrefsRole.ts # Role derivation, whether hours are tracked / reported this month, roleSummary (More's goal line)
  minuteBankFly.ts     # The "minute bank" fly-to-pill animation helper
  timer.ts             # Live service timer: pure start/pause/resume/stop arithmetic + its localStorage record (tested). Stop keeps the record (`stoppedAt`) until the log is written or discarded
  viewportFix.ts       # Installed-iOS launch-viewport deficit correction (--deficit); bottom-fixed chrome subtracts it
  auxPioneering.ts     # Auxiliary-pioneer config (localStorage) + target-hour math
  auxSlip.ts           # Fills the S-205b auxiliary-pioneer PDF (pdf-lib)
  tips.ts              # Tip/support link config for the More tab
  share.ts             # Cross-device share: encode/decode/QR/file + import-as-new-records
  backup.ts            # Full local JSON backup / restore / wipe-all; restore refuses the whole file if any row fails rowGuards
  notifications.ts     # In-app return-visit reminders (no backend push)
  pwaInstall.ts        # Install prompt + persistent-storage request
  roadSnap.ts          # Snap traced waypoints onto real OSM road geometry (Overpass)
  territoryImage.ts    # Schematic canvas rendering of traced streets (no map tiles → no tainted canvas)
  devSeed.ts           # Demo/seed data (loaded from More tab)
  localDate.ts         # parse/format YYYY-MM-DD + HH:mm as LOCAL time (never toISOString — it shifts the date west of UTC); fmtDateTime (no seconds)
  csp.ts               # Content-Security-Policy + the build-only Vite plugin that injects it (see section below)
  components/
    Onboarding.tsx     # SplashScreen + WelcomeGate (policy summary + full text on request, role, optional name) + hasAcceptedPolicy
    Tutorial.tsx       # Guided tour, 5 steps + thank-you; offered from More only (no first-run prompt since 0.27.0)
    InstallPrompt.tsx  # "Add to Home Screen" banner
    Contacts.tsx       # THE PEOPLE TAB root (key 'contacts'): List | Map (| Streets | Territories) segments + list; hosts the lazy MapView
    contacts/          # ContactForm (doorstep layout + "More details"), ContactDetail (Log visit / Schedule visit first),
                       #   CallLogger (Talked / Not home, "Now · change"), ReturnVisitEditor (create or edit), VisitDateChips
                       #   (Tomorrow / +1 wk / +2 wk / Pick…, shared); geocode.ts (Nominatim lookups, pure)
    StreetEntries.tsx  # Streets sub-view: street list, StreetDetail, house-number pad
    Territories.tsx    # Territories sub-view: grouped-territory list + detail
    Territory.tsx      # Map-side custom-territory manager: trace/draw modal, send-to-ministry, grouping
    MapView.tsx        # People → Map: contact pins, territory traces, on-map controls (layer, find me, search, key)
    Schedule.tsx       # THE SERVICE TAB root (tab key 'schedule'): intake-or-main switch only
    schedule/          # dates.ts (incl. addDays — never step days by 24 h, DST) / plan.ts / animate.ts (pure, no React) + useMilestoneToast.ts + one file per piece: ScheduleMain
                       #   (week view, logging, minute bank — the hub, 1.3k), ScheduleCalendarView, DayActionModal,
                       #   Survey, EditLogModal, EditAppointmentModal, TimeInputModal, NumPad, InfoTip, HourGoalBar,
                       #   AuxPioneeringBox, ContactPicker, ReturnVisits
    Reports.tsx        # THE REPORT TAB: the month's hand-off card (copy per field, Share, Mark as submitted) + personal recap
    ServiceYearReview.tsx # Animated end-of-service-year summary
    Misc.tsx           # More tab: support, theme, profile, notifications, backup/restore, clear data
    ShareModal.tsx     # Reusable QR/file share flow (contact/street/territory)
    ImportConfirm.tsx  # Confirm + import a scanned/opened share payload
    SharedBits.tsx     # SharedBadge + SharedWarning (attribution UI)
    ConfirmDialog.tsx  # Reusable confirm/cancel modal
```

---

## App Startup Flow

Phase state (`App.tsx`): `'splash' | 'splash-out' | 'welcome' | 'app'`

1. **splash** (~0–2.45s first launch, ~0.9s after) — Greek→Latin wordmark animation (pure CSS, `.splash-*`)
2. **splash-out** — fade-out
3. **welcome** — first boot only (`!hasAcceptedPolicy()`): one screen — plain-language summary, the full
   policy on request, the role question (`applyFirstRunRole`), optional name, agree checkbox
4. **app** — main app with 4-tab nav, landing on **Service**

Before 0.27.0 first run was five steps (policy, name, tour prompt, Service intro, survey).
`SurveyIntro` still greets a device that accepted the policy but has no prefs row. `main.tsx` applies the saved theme to
`<html data-theme>` **before first paint** so a non-light theme never flashes light.

---

## Tabs

| Tab | Key | Label | Icon | Component |
|---|---|---|---|---|
| Service | `schedule` | Service | ◫ | `Schedule.tsx` — the landing tab since 0.27.0 |
| People | `contacts` | People | ◎ | `Contacts.tsx` (was "Ministry"; holds the Map since 0.27.0) |
| Report | `reports` | Report | ▦ | `Reports.tsx` (label singular since 0.26.0) |
| More | `misc` | More | ⋯ | `Misc.tsx` |

Keys predate the labels and never change (saved state, the tutorial). Schedule/Reports/Misc are
code-split (`lazy`) and warmed during idle after launch; Contacts is eager; MapView is lazy inside
Contacts. Cross-tab navigation state in `App.tsx`: `openContactId`, `pendingImport` (share import).

### People tab sub-views
`Contacts.tsx` hosts a segmented control: **List** / **Map**, plus **Streets** / **Territories** when
Streets & territories is on (`territoriesFeature.ts`; More → App Settings). Map focus ("Jump to Map")
and the pending draw request are local state here. With the feature on, **+ New Entry** offers New
Contact, New Street, New Custom Territory (opens Map with the draw tool) and Import a Shared Item;
with it off the button is **+ New Contact**. Off also hides traces, the draw tool, the tour's
territory steps and the Report territory card — nothing is deleted.

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
TimeLog { id, date, minutes, category: TimeCategory, note?, activityNote?, startedAt?, endedAt? }
TimeCategory = 'ministry' | 'credit'
// activityNote = free text naming what it was ("LDC", "Cart witnessing"). Annotation only:
// it touches no total, no cap and no goal, and is not a reportable field. The seven-category
// model collapsed to these two in 0.20.0 (db v9 upgrade backfills activityNote from the old
// label); `isCredit` has always been `!== 'ministry'`, so no month's applied total moved.
```

**`appointments`** — return visits / scheduled follow-ups
```ts
Appointment { id, title, date, durationMinutes, personId?, notes? }
```

**`schedulePrefs`** — single-row user schedule settings
```ts
SchedulePrefs { id, completedSurvey, role?, isPioneer?, daysOut, weeklyHours, yearlyHours,
                daySchedule?, dateOverrides?, goalPeriod?, monthlyHours?, scheduleDefaultExpand? }
// role = 'publisher' | 'auxiliary' | 'pioneer' (0.21.0). isPioneer stays in sync; a row without
// role is derived by schedulePrefsRole.ts (missing isPioneer = pioneer; aux enabled = auxiliary).
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

Each key should have exactly **one owning module** — never read or write one as a bare string
literal from a component. Owners: `settings.ts` (theme, credit-hours, last-backup),
`profile.ts` (name + prompt flag), `notifications.ts` (notify\_\*), `auxPioneering.ts` (aux),
`minuteBankFly.ts` (animation toggle), `Onboarding.tsx` (privacy), `Tutorial.tsx` (tour seen).
Every key now has one; the last two module-locals (`_minute_bank`, `_participated_months`)
moved into `settings.ts` in 0.20.2.

| Key | Purpose | Owner |
|---|---|---|
| `fieldservice_privacy_v2` | `'yes'` when privacy policy accepted (v1 was pre-Meleo rename) | `Onboarding.tsx` |
| `fieldservice_profile_prompted` | Legacy (the name screen is gone since 0.27.0); no longer read or written | — |
| `fieldservice_first_name` / `_last_name` | User's own name (share attribution, personalization) | `profile.ts` |
| `fieldservice_tutorial_seen` | Legacy (no first-run tour prompt since 0.27.0); still blocklisted in backups | — |
| `fieldservice_credit_hours` | `'yes'` when credit-hour categories are enabled | `settings.ts` |
| `fieldservice_minute_bank` | Integer minutes accumulated toward the next auto-hour (ministry minutes only — credit logs whole) | `settings.ts` |
| `fieldservice_theme` | `'light' | 'dark' | 'pastel' | 'mark'` | `settings.ts` |
| `fieldservice_dark_mode` | Legacy boolean, read as a fallback for `_theme`; cleared on any theme write | `settings.ts` |
| `fieldservice_last_backup_at` | Epoch ms of the last completed backup export; absent = never. Blocklisted, so it never travels inside a backup | `settings.ts` |
| `fieldservice_timer` | The live service timer's state (start timestamp, accumulated ms, category, `stoppedAt` once stopped and awaiting its log). Blocklisted — device state, not a record | `timer.ts` |
| `fieldservice_backup_nag_dismissed_at` | Epoch ms the back-up reminder was last dismissed (hidden 7 days after). Blocklisted | `settings.ts` |
| `fieldservice_install_dismissed` | This browser dismissed the Add-to-Home-Screen banner. Blocklisted (0.25.2) so a restore onto a new phone still offers it | `InstallPrompt.tsx` |
| `fieldservice_participated_months` | Months the user ticked as "shared in the ministry" (logged time or calls also count, see `monthReport.ts`) | `settings.ts` |
| `fieldservice_territories` | `'on'`/`'off'` — the Streets & territories switch; absent = on iff streets/territories exist | `settings.ts` |
| `fieldservice_reported_months` | `{"YYYY-M": epochMs}` — months whose report was marked submitted. A record: travels in backups | `settings.ts` |
| `fieldservice_notify_enabled` / `_notify_lead_min` / `_notify_sent_ids` | Return-visit reminder settings + dedupe | `notifications.ts` |
| `fieldservice_aux_*` | Auxiliary-pioneer config (see `auxPioneering.ts`) | `auxPioneering.ts` |

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
and put in a deep-link URL **hash** (`#i=…`). That one URL travels by three transports, offered together
in `ShareModal`: a scannable **QR** (≤ `MAX_QR_URL_LEN`, face-to-face only — the receiver scans with their
phone's *camera app*; there is no scanner inside Meleo), a tappable **link** to send or copy
(≤ `MAX_LINK_URL_LEN`, via `canShareAsLink`), and a `.meleo` **file** via the OS share sheet, which is the
only transport with no size ceiling. `App.tsx` captures the hash at load and offers `ImportConfirm`. `decodeSharePayload` types every field
(AUDIT F039) and `importSharedPayload` lives in `records.ts` as one transaction (F040). Imports always create **new**
records tagged `receivedFrom`; the owner's copy accumulates `sharedWith`. `SharedBadge`/`SharedWarning`
surface that attribution and warn before editing a shared item.

---

## Backup & Notifications

- **Dropbox:** no integration. The user how-to is `docs/dropbox-sync-guide.md`; an in-app sync is
  proposed and recommended against for now in `docs/adr/0004-dropbox-sync.md`.
- **Backup (`backup.ts`, More tab):** full local JSON `exportBackup()` / `importBackup()` (self-describing,
  versioned) + `wipeAllData()`. The only way a tester's data survives a device wipe and the bridge to any
  future native build. Includes all Dexie tables + non-blocklisted `fieldservice_*` keys.
- **Notifications (`notifications.ts`):** return-visit reminders fire **only while the app is open** (no
  backend to wake the device). Shown through the service-worker registration where one exists — Chrome for
  Android refuses page-context `new Notification()` (AUDIT F034). Configurable lead time; `checkReturnVisitNotifications()` runs on reaching
  the app and every 5 min after.

---

## Themes

Four themes, selected in More → Personalize, stored in `fieldservice_theme`, applied as
`<html data-theme>` (light is the default with no attribute). Defined entirely as CSS-var overrides in
`index.css`: **light**, **dark**, **pastel** (lavender-blush), **mark** (deep navy; labelled "Navy" since 0.27.0, key unchanged). Saturated
brand/category/tag hues are brightened per dark theme for contrast.

---

## Key Design Decisions

### Local-first / Privacy
- Zero backend. IndexedDB (Dexie) is the only storage, plus `fieldservice_*` localStorage flags.
- Nominatim/Overpass calls send only address strings / coordinates — never identity.
- Privacy policy on first boot; `Clear All Data` (More tab) wipes all tables + localStorage and reloads.

### Service tab (key `schedule`)

- **Intake (`Survey.tsx`)** asks one deciding question — Publisher / Auxiliary pioneer / Regular
  pioneer — then only what that role needs (yearly goal + credit; aux months + target; optional
  personal goal). Days and time windows are never asked; planning is opt-in on the tab itself.
  "Change my goal" at the bottom of the tab opens it as a pop-up with Cancel (0.27.0 — it no longer
  flips `completedSurvey`) and leaves `daysOut`/`daySchedule` untouched. Auxiliary pioneering is set
  only there; `AuxPioneeringBox` is a summary + S-205b-E slip + Change link.
- The tab order (0.27.0): the report-due banner (days 1–10), Log time + `TimerCard`, the minute-bank pill,
  `TodayCard` (today's + overdue visits, **Log visit** opens `ContactDetail` over the tab with the
  form ready — contacts opened from Service never switch tabs), the progress card (month
  → service year → week pace, plus a pace chip/line from `milestones.ts` — no "behind" chip; short
  reads as a forward per-day plan), participation (publishers without a goal: one tick inline in the progress card), the planner
  (Service Schedule card, collapsed), Return Visits (3 + "Show all"), Recent Entries (3 + "See
  all" → `EntriesModal`, month-grouped). Milestone toasts
  fire from a render-side baseline comparison so every write path is covered. Goals are displayed
  through `displayGoalMin` on both this tab and Reports (docs/tracking-first-plan.md).

### Service → Add Time
- The primary **Log time** button (top of the tab) and a day tap both open `DayActionModal`,
  whose time step is `LogTimeForm` — presets + a custom `NumPad` (no native `type="number"` —
  intentional for mobile UX). The date is the day tapped; today for the button.
- **Never rounds up** (tracking-first D5): leftover ministry minutes go to the **minute bank**
  (`fieldservice_minute_bank`) which auto-adds a 1-hour ministry entry at 60, with a fly-to-pill
  animation; tapping the pill logs exactly the banked minutes. The bank holds **ministry minutes
  only** — credit is logged whole, so nothing it emits can be misattributed at the 55h cap.
- Category **pills** (not a dropdown). Per-day planning uses `DayScheduleBlock`s; goal rings via
  `goalSegments.ts`.

### Report (tab key `reports`)
- Leads with the **hand-off card** (0.26.0), in the form's order: Shared in the ministry · Bible
  studies · Hours · Comments, each with a **Copy** button (for NW Publisher or the slip), then
  **Share report** (OS share sheet; copy fallback) and **Mark as submitted**
  (`fieldservice_reported_months`). All figures come from pure `monthReport.ts`:
  participation = tick OR any time OR any call; Bible studies = `bible-study` contacts with a
  (not-at-home excluded) call that month, uncounted ones named; Hours = whole Ministry hours,
  shown only when `roleReportsHours()` (pioneer, or an aux month — never for a personal goal);
  Comments = credit hours and their activity notes.
- Days 1–10: last month is "due" (`dueReportMonth`) until marked submitted or empty — the tab
  opens on it and the Service tab shows a "report is ready" banner that links here.
- Below: the person's own recap (encouragement only when hours are tracked, highlights,
  territories, credit cap, service year; `ServiceYearReview` is the animated year summary).

### Map
- A view inside People (0.27.0). Default center `{ lat: 32.3, lng: -90.0 }`. Contact pins + popups,
  territory traces (feature on). Controls sit on the map (layer, 📍 find me, 🔍 search, Key legend)
  instead of above it (AUDIT F048(6)). "Jump to Map" from a contact/street focuses the pin once;
  opening the Map segment directly never does (AUDIT F053). Every `TileLayer` sets
  `crossOrigin="anonymous"` so the tile cache stores CORS, not opaque, responses (F056).

### Contacts
- Only `name` is required. Address auto-geocodes via Nominatim on save (with a live address-autocomplete
  combobox). Status chips are color-coded via `--tag-*`. Call logger handles not-home, scriptures
  (autocorrected), literature placed, left-at-door, follow-up. "New Contact" can be pre-filled from a
  street or a specific house (`ContactPrefill`).

### More tab
- Order (0.27.0): **Your goal** (`roleSummary` + Change → `GoalEditorModal`, shared with Service) ·
  **Backup** (status line, Export / Restore, open a .meleo file, clear all data) · Add to Home Screen ·
  **Settings** (collapsed: theme, name, credit hours, minute animation, calendar default, reminders) ·
  **Features** (Streets & territories) · **Help & feedback** (tour, feedback mail to `DEVELOPER_EMAIL`,
  share the app) · **Support** (one sentence + tips via `tips.ts`) · dev-only demo loader · Legal.
  The viewport diagnostic under the version shows only in dev or after 5 taps on the version.

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
--space-1..8 (2/4/6/8/10/12/14/16px), --fs-xs..2xl (--fs-base is 13px), --lh-tight/base/relaxed
--dur-fast/--dur/--dur-slow, --ease-standard/--ease-emphasized
```

The spacing/type/motion scales were **measured from the values `App.css` already used most**, so
adopting a token is a rename, not a redesign. Use them in new or touched CSS; a repo-wide sweep of
the existing one-off values is deliberately deferred until there's a visual-regression check.

**Notable classes:** `.card` / `.card.highlight`, `.chip` / `.chip.active`, `.segmented` (sub-view/filter
toggles), `.field` / `.field-label` / `.field-row`, `.modal` / `.modal-backdrop` (+ `.modal-expanded`),
`.list` / `.list-item`, `.badge`, `.house-list` / `.house-row`, `.draft-street-*` /
`.manage-territory-modal`, `.numpad-*`, `.cal-*`, `.minute-bank-*`, `.report-*`, `.splash-*`,
`.misc-section-title`, `.combobox` / `.combobox-list`.

---

## Content-Security-Policy (`csp.ts`)

The production `index.html` carries a `<meta http-equiv="Content-Security-Policy">`, injected
at build by `cspPlugin()` in `vite.config.ts` (AUDIT F009). It is **not** applied in dev — the
dev server needs its HMR WebSocket and injects its own client.

- `script-src 'self'` — nothing inline, no eval, no other host. This is the part that matters.
- Every outside host is named: `nominatim.openstreetmap.org`, `overpass-api.de` (connect);
  `server.arcgisonline.com` (all map tiles, img — Esri street, imagery, and labels; CARTO was
  dropped in 0.20.5 when it began watermarking keyless tiles, AUDIT F047).
- Esri map tiles are also **runtime-cached** by the service worker (`CacheFirst`, capped) so
  worked areas render offline; the aux-slip PDF + pdf-lib are runtime-cached on first use rather
  than precached (AUDIT F043). Nominatim/Overpass are never cached (per their policies).
- `data:` is allowed for `img-src` and `connect-src` on purpose — QR codes are `data:` PNGs and
  `ShareModal` `fetch()`es that URL to build a shareable file. Removing either breaks sharing
  silently.
- `style-src` keeps `'unsafe-inline'`: React `style={{}}` and Leaflet's positioning both need
  it. Tightening that is a component rewrite, not a policy change.

**Adding a new outside service means adding its host to `CSP_DIRECTIVES` in the same commit** —
the browser will otherwise refuse the request with only a console message, and nothing in the
test suite can see that. `src/csp.test.ts` pins the load-bearing directives. When in doubt,
`npm run build && npm run preview` and drive the built page in a real browser; that is the only
check that catches a policy that quietly blocks something (the sister project once shipped a CSP
that silently killed every inline script and passed every test).

## Dev Server

```
E:\Field Service App\dev-server.cmd   # Sets nodejs PATH, runs npm run dev
.claude/launch.json                   # "Field Service App" = dev server :5173; "Meleo built" = build + vite preview :4173
```

| Command | What it does |
|---|---|
| `node scripts/verify.mjs` (`npm run verify`) | **The one gate.** tsc, oxlint, vitest, build, main-chunk budget (320 kB), CSP present / no inline script. Ends with one `VERIFY PASS …` or `VERIFY FAIL at <step>` line; judge by that and the exit code. CI runs the same script. |
| `npm run release -- <patch\|minor\|major> "Title"` | Bumps package.json + lock + `APP_VERSION`, stamps CHANGELOG `## Unreleased`, runs verify, writes `.git/RELEASE_MSG`. Never commits or pushes. `--dry-run` previews. |
| `/?demo=1` (dev server only) | Wipes local data, loads the demo year (history up to yesterday), skips onboarding. |
| `scripts/smoke-snippet.js` | Paste as one browser `javascript_exec` after `?demo=1`: visits every tab, returns JSON with `ok`, titles, Service card order, report card, CSP refusals. |

### Working in this environment (AI sessions)
- A global **RTK hook rewrites shell commands**: `npm run lint` becomes an ESLint wrapper that
  falsely fails on oxlint; `cat`/`head`/`grep` output gets truncated or filtered. So: read with
  **Read**, search with **Grep**, change files with **Edit/Write**, gate with
  `node scripts/verify.mjs` (the hook leaves `node …` alone). Never trust `npm run lint` here.
- Multi-file mechanical edits: Write a `.mjs` script to the scratchpad and run `node <file>`.
  Commit messages: Write them to a file, then `git commit -F <file>`.
- Add a bullet under CHANGELOG `## Unreleased` as you work; `npm run release` stamps it.
- Push only when the owner says so — a push to `master` deploys (docs-only pushes don't).
- Browser pane: first screenshot often times out (retry once); hidden panes throttle timers
  (drive with JS clicks); old HMR errors linger in the console buffer (trust a fresh reload).

---

## Working Conventions (Definition of Done)

A change is "done" when:
- **Green gates:** `node scripts/verify.mjs` prints `VERIFY PASS` — the same script CI runs on
  every push and pull request (`.github/workflows/deploy-pages.yml`).
- **Pure logic is tested:** new pure functions (math, parsing, sorting, formatting) get a Vitest
  test next to them (`*.test.ts`). Multi-table DB operations belong in `records.ts` (time logs: `timeRecords.ts`) rather than
  inline in a component, and are tested against `fake-indexeddb` — a flow you can't call without
  rendering React is a flow you can't test. Component/UI glue isn't required to be tested.
- **Docs aren't allowed to drift:** if a change touches the schema, tabs, architecture, or a
  localStorage key, update **this CLAUDE.md in the same commit**. Doc drift is treated as a
  workflow failure, not a later cleanup.
- **Behavior is verified for runtime changes** (drive the flow / screenshot, not just typecheck),
  and the commit/PR says how it was verified.
- **Findings are tracked in [AUDIT.md](AUDIT.md):** a finding closes only with *named proof* (a test,
  a fixing commit, or a manual-verification note). The human owns waivers and closure.
- **Versioning (semver `MAJOR.MINOR.PATCH`):** MINOR = new feature, PATCH = fix/polish, MAJOR reserved
  for the first public release / breaking changes. Cut versions with `npm run release` (never by
  hand); `src/version.test.ts` fails if `APP_VERSION`, package.json and the lock file disagree.

---

### Modals

Every `<ModalPortal>` **must pass `onClose`** — the same handler the backdrop tap uses — so Esc
closes it (AUDIT F018). Focus handling is inherited: focus moves into the dialog on open (onto an
`autoFocus`ed input if there is one, else the host — never the first button, which for a confirm
is Delete), Tab/Shift+Tab cycle inside it, and on close focus returns to where it was when the
dialog opened (for a dialog over a dialog, to the control in the one underneath). A new modal gets
all of this for free; the only thing it has to do is pass `onClose`.

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
