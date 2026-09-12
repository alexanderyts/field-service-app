# Wave 5 — owner's observations + polish (0.25.0 / 0.25.1)

For the implementing model. Written 2026-09-12 after Waves 0–4 of `docs/tracking-first-plan.md`
shipped (0.24.0, deployed). Read `CLAUDE.md` first. Budget: one working session. Everything here
names the file, the symbol, and the exact change so nothing needs re-researching.

**Working rules that save tokens**
- Read only the anchors named here (`Grep` for the symbol, `Read` ±30 lines). Do not read
  `ScheduleMain.tsx` or `App.css` whole.
- Edit with the `Edit` tool. Shell heredocs with quotes break in this environment.
- Run gates once per section, not per edit: `npx tsc -b`, `npx vitest run`,
  `./node_modules/.bin/oxlint src` (exit code; the four `only-export-components` warnings are
  pre-existing and fine), `npm run build`.
- Browser check once at the end of each cut (dev server via `.claude/launch.json`, demo data
  from More → Load Demo Year). Screenshots time out on the first try in this pane; retry once.
  rAF animations do not complete while the pane is hidden — reload to see a settled state.
- Commit per section with the message shape used in `git log` (what + how verified). Two version
  cuts: **0.25.0** after A–C, **0.25.1** after D. Bump `src/version.ts`, `package.json`,
  `CHANGELOG.md` together; mark AUDIT rows closed with named proof.

---

## A. Tab bar sits too high at launch (owner observation 1) — `PLAN.md` 6.1

### What is actually happening
Installed iOS web apps (and WKWebView) launch with a **short layout viewport**: WebKit subtracts
the top safe-area inset from the bottom until a later native layout pass — usually the first
scroll or a content-height change — corrects it. `innerHeight` reads `screen.height − ~60px`
during that state. A `position: fixed; bottom:` element is therefore drawn ~60px above the
true screen bottom, then "settles" when the correction lands. That is exactly the symptom:
right after scrolling, or after switching tabs (new content height), it moves down. No CSS
or JS event fires for the correction (WebKit bug 191872).

This was solved in the owner's other app (Iron Log, `E:\claude\workout app\src\app\ui.js`
`viewportDeficit`/`syncViewportDeficit`, and `styles.css` `.tabbar`). Port that approach; do
not reinvent it. Meleo's bar is a floating card (`.tabbar`, `App.css` ~L439), not an
edge-painted bar, so only the deficit half is needed — the "paint the bar in the canvas colour"
half does not apply.

### Change
1. **`src/viewportFix.ts` (new, pure part tested).**
   ```ts
   /** Launch-time shortfall of the layout viewport on installed iOS: screen height minus
       innerHeight, portrait only, standalone only, clamped to a plausible range. 0 otherwise. */
   export function viewportDeficit(screenH: number, innerH: number, innerW: number, standalone: boolean): number {
     if (!standalone || innerW > innerH) return 0
     const d = Math.round(screenH - innerH)
     return d > 0 && d <= 120 ? d : 0
   }
   export function isStandalone(): boolean {
     return (navigator as { standalone?: boolean }).standalone === true
       || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
   }
   /** Installs the watcher: writes --deficit on <html>, keeps the document at least
       screen-height tall in standalone portrait (a persistently-taller-than-viewport document is
       what triggers WebKit's correction, measured ~40ms), and re-checks every frame while
       visible (one subtraction; free). Returns a disposer. */
   export function installViewportFix(): () => void { … }
   ```
   `installViewportFix`: compute `d`; `document.documentElement.style.setProperty('--deficit', d + 'px')`
   only when it changes; in standalone portrait set `documentElement.style.minHeight = screen.height + 'px'`
   (clear it otherwise); listen to `resize`, `orientationchange`, `pageshow`, `focus`, `scroll`
   (passive), `visibilitychange`, `visualViewport.resize`; plus a `requestAnimationFrame` loop
   that runs only while `document.visibilityState === 'visible'`. Test file covers
   `viewportDeficit` (four cases: browser tab → 0, landscape → 0, 62 → 62, 400 → 0).
2. **`src/main.tsx`:** call `installViewportFix()` once before render (next to the theme
   pre-paint).
3. **`src/App.css`:**
   - `.tabbar`: `bottom: calc(12px + env(safe-area-inset-bottom) - var(--deficit, 0px));` and add
     `transform: translateZ(0);` (its own compositing layer — Iron Log found labels below the short
     viewport line were not painted otherwise).
   - `.toast` (`~L3732`): same `- var(--deficit, 0px)` on its `bottom`.
   - `.app-main` `padding-bottom` is unaffected (it clears the bar in the corrected state, which
     is the state that persists).
4. **Diagnostics for the owner (cheap, worth it):** under the version line in `Misc.tsx`
   (`Meleo v…`), render a muted 11px line from a `viewportDiag()` helper in `viewportFix.ts`:
   `screen W×H · inner W×H · inset bottom N · deficit N`. Read the inset by measuring a probe
   element with `padding-bottom: env(safe-area-inset-bottom)` (computed style of a CSS var just
   echoes `env(...)`). This is how the owner confirms the fix on device without a debugger.
5. **`CLAUDE.md`:** one line under Key Design Decisions: "Installed-iOS launch viewport deficit is
   corrected by `viewportFix.ts` (`--deficit`); bottom-fixed elements subtract it."
   `PLAN.md` 6.1 → done.

**Verify:** unit test; build; the owner checks on the phone: bar in the same place on launch
as after a scroll, and the More-tab diag line reads `deficit 0` after settling. The browser
pane cannot reproduce this (not standalone iOS).

---

## B. Service tab flow (owner observation 2)

### Target order, top to bottom
1. `Service` title
2. **Log time** button + `TimerCard` (as now)
3. **Minute-bank pill** — moved here, directly under the timer, as its own `.minute-bank-row`
   (it is about logging, and it is what the fly animation lands on; the `.minute-bank-anchor`
   moves with it — the fly targets the anchor's live rect, so nothing else changes)
4. **Progress card** (as now)
5. **Service Schedule** (planner) — collapsed mini-week as now, now above the lists
6. **Return Visits** — first 3 pending, then a `Show all (N)` inline toggle
7. **Recent Entries** — first **3**, then a `See all` button opening a full-screen modal
8. `Change my goal`

Publishers without a goal keep `MonthlyParticipationBox` between 4 and 5.

### Change
- **`ScheduleMain.tsx`**
  - Cut the `.minute-bank-row` block (comment "The minute bank lives here now…" through the
    closing `</div>` of that row) out of the Recent Entries card and paste it right after
    `<TimerCard … />`.
  - Move the planner block (`{/* Service Schedule — mini week …` through the card's closing
    `</div>`; it currently sits just above `Change my goal`) to directly after the progress card
    (and after `MonthlyParticipationBox` for goal-less publishers).
  - `visibleLogCount` initial `4` → `3`; replace the `See more` button with
    `<button className="secondary small" onClick={() => setShowAllEntries(true)}>See all {logs.length}</button>`
    (only when `logs.length > 3`). Remove `setVisibleLogCount` growth.
  - Render `<EntriesModal logs={logs} onEdit={setEditingLog} onDelete={setConfirmDeleteLogId} onClose={…} />`
    when `showAllEntries`. The existing `EditLogModal` and delete `ConfirmDialog` stay where they
    are and keep working over the modal (ModalPortal stacks).
  - `progressScrollTarget()` (comment "The planner now sits below Recent Entries…") → the
    planner is now above them; keep pinning `schedCardRef`, just fix the comment.
- **`schedule/EntriesModal.tsx` (new):** `ModalPortal` with `onClose`; `.modal.modal-expanded`;
  heading "All entries"; list grouped by month (`MONTH_NAMES_LONG[m] YYYY` headers, newest first)
  with a month subtotal (`fmtDuration(sum)`), each row identical to the Recent Entries row
  (dot, duration · category — note, date, Edit, 🗑). No search or filters yet. Keep it under
  ~90 lines; reuse `.list`/`.list-item`/`.visit-info`/`.visit-actions`.
- **`schedule/ReturnVisits.tsx`:** `const [showAll, setShowAll] = useState(false)`; render
  `upcoming.slice(0, showAll ? undefined : 3)`; below the list, when `upcoming.length > 3`,
  a `secondary small` button `Show all (N)` / `Show fewer`.
- **CSS:** none new beyond `.entries-month-head { font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 10px 0 4px; display: flex; justify-content: space-between }`.
- **Docs:** `CLAUDE.md` Service-tab bullet lists the new order; `docs/tracking-first-plan.md`
  Wave 2 "Planner demoted" note gets a one-line "revised in Wave 5: planner above the lists".

**Verify (browser):** DOM order of `.view > .card` matches the list above; Recent Entries shows
3 rows and `See all N`; the modal lists every demo entry grouped by month; Return Visits shows 3
with `Show all`. Log a 1h 20m entry and confirm the pill under the timer receives the 20m.

---

## C. "Behind pace" is discouraging (owner observation 3)

Principle: the app shows the road ahead, never a label about the shortfall. Being behind is
expressed as a plan, not a verdict.

### Change
- **`src/milestones.ts`:** add
  ```ts
  /** Minutes per remaining day to reach the goal; 0 once reached or with no days left. */
  export function perDayToGoal(appliedMin: number, goalMin: number, daysLeft: number): number
  ```
  (`Math.ceil(remaining / daysLeft)`, remaining ≥ 0, daysLeft ≥ 1). Test: 3 cases.
- **`ScheduleMain.tsx`:**
  - `PACE_LABEL.behind` → `''` and render the chip only when `pace === 'ahead' | 'on-pace' | 'done'`
    (`PACE_LABEL[pace]` non-empty).
  - `paceText` for `behind` → `` `${fmtDuration(remaining)} to go · ${daysLeft} day(s) left · about ${fmtDuration(perDay)} a day` ``
    where `remaining = monthProgress.goalMin - monthProgress.applied`. Same shape for
    `not-started` when the month has begun (`elapsed ≥ 10%`): `${fmtDuration(goal)} this month · about ${perDay} a day`.
  - `.pace-chip.pace-behind` CSS rule → delete.
- **`Reports.tsx` `encouragement()`:** the `< 25` branch reads "Every hour counts…" — fine. No change.
- **`CHANGELOG`:** "Being behind is shown as what's left and a per-day amount, never as a label."

**Verify:** unit test; in the browser with demo data (currently behind) the chip is absent and
the line reads `Xh to go · N days left · about Ym a day`.

→ **Cut 0.25.0** here.

---

## D. Remaining polish — AUDIT F042–F046 (cut 0.25.1)

Do in this order; each is independent, so stop wherever the session ends and cut with what is
done. Anchors are symbols; line numbers drift.

### D1. Data guards — F044 (≈30 min)
- **`Misc.tsx`:** move the `Clear All App Data` button (inside the collapsed Legal & Privacy
  card, next to "Informational summary…") into the **Your data** card under Backup & Restore.
  Its `ConfirmDialog` message → "This permanently deletes all contacts, streets, territories,
  call history, time logs, return visits, and settings on this device. There is no server copy.
  Export a backup first if you might want any of it back." Add a second step: the confirm's
  confirm opens a `ConfirmDialog` "Delete everything?" / "Yes, I have a backup" → `clearAllData`.
- **`StreetEntries.tsx` house `×` button** (the per-row delete in the house list, near
  `.house-status`): wrap in a `ConfirmDialog` "Remove house {number}?" — pattern already used
  for street delete in the same file.
- **`Territory.tsx` draft `🗑 Remove`** (draft street row): same, "Remove {name} from this
  draft? The trace is lost."
- **`settings.ts`:** `export function isBackupOverdue(lastAt: number | null, now: number, days = 30): boolean`
  (never backed up counts as overdue only when `hasData`; keep it pure: `lastAt === null || now - lastAt > days*864e5`).
  Test: 3 cases in `settings.test.ts`.
- **`Misc.tsx` backup status:** add class `overdue` when `isBackupOverdue(lastBackupAt, Date.now())`;
  CSS `.backup-status.overdue { color: var(--credit) }` (amber token) beside the existing `.never`.
- **`Contacts.tsx`:** a one-line dismissible banner above the list, shown when
  `isBackupOverdue(getLastBackupAt(), Date.now())` **and** `people.length + streetCount > 0`:
  "It's been a while since your last backup — More → Export Backup." Dismiss stores
  `fieldservice_backup_nag_dismissed_at` (owner `settings.ts`; add to `CLAUDE.md` key table;
  blocklist it in `backup.ts`) and hides for 7 days.

### D2. Map and People first run — F045, PLAN 5.2/5.3 (≈45 min)
- **`useGeolocation.ts`:** map `err.code` to copy: 1 → "Location is turned off for Meleo. You
  can turn it on in your browser's site settings."; 2 → "Couldn't find your location — try
  again outdoors."; 3 → "Finding your location is taking too long."; else the generic. Return
  this friendly string as `error`. (`MapView.tsx` L142 and `ContactForm.tsx` render `error` as
  is — no change there.)
- **`MapView.tsx`:** show the error once per mount with a `×` dismiss (`useState` `errorDismissed`).
  When `pinned.length === 0 && !me` (no contact has coordinates and no GPS), render an overlay
  `div.map-empty` over the map: "Add an address to a contact and it'll appear here. Or tap
  Recenter on Me." Add `eventHandlers={{ tileerror: () => setTileError(true) }}` on the street
  `TileLayer`; one muted banner "Map tiles need a connection." when set; clear on `load`.
- **`Contacts.tsx` empty state:** `people.length === 0 ? "No contacts yet — tap + New Entry to add someone you met." : "No contacts match."`;
  hide the search/sort/filter row when `people.length === 0`.
- **`Contacts.tsx` sort:** add `visit` to `SortKey` ("Next visit"): sort by
  `nextAppointment.get(id)` ascending, undefined last. Default stays `name`.

### D3. Small polish — F046 (≈20 min)
- **`index.css`:** append a global reduced-motion rule:
  `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important } }`
  (keep the existing splash rule; the Schedule expand animation is JS-driven and unaffected).
- **`index.css`** `--tag-not: #8a8478` → `#6b665c` (light theme only; dark themes already lighter).
- **`App.css`:** `.house-status`, `.segmented button` → `min-height: 44px`;
  `.install-banner-close` → `width: 44px; height: 44px`.
- **`App.tsx` splash:** when `hasAcceptedPolicy()` is already true, use 900 ms / 1300 ms instead
  of 2450 / 2850 (first launch keeps the full animation; every later launch is a short fade).
- **`territoryImage.ts`:** delete `renderStreetsImage` (no callers; keep `STREET_COLORS`).
- **`vite.config.ts`** `globPatterns`: add `webp` (tutorial images offline).

### D4. Offline tiles and bundle — F043 (≈40 min)
- **`vite.config.ts` `workbox`:** add
  ```ts
  runtimeCaching: [{
    urlPattern: ({ url }) => url.hostname === 'server.arcgisonline.com',
    handler: 'CacheFirst',
    options: { cacheName: 'map-tiles', expiration: { maxEntries: 800, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
  }],
  ```
  Nominatim/Overpass stay uncached (address-specific; caching would breach their usage policy).
  Drop `pdf` from `globPatterns` and add a second `runtimeCaching` entry
  (`urlPattern: /S-205b.*\.pdf$/`, `CacheFirst`) so the 555 kB form caches on first use.
- **`Territories.tsx`:** `const TerritoryMiniMap = lazy(() => import('./Territory').then(m => ({ default: m.TerritoryMiniMap })))`
  and the same for `StreetSnapshotModal`; wrap each use in `<Suspense fallback={<div className="tab-loading" />}>`.
  Confirm with `npm run build` that `leaflet` no longer appears in the `index-*.js` chunk
  (`grep -c leaflet dist/assets/index-*.js` → 0).
- **`CLAUDE.md`:** CSP section note that tiles are also runtime-cached by the service worker.

### D5. Per-render work in the hub — F042 (≈60 min, only if time remains)
- **`ScheduleMain.tsx`:** replace `db.calls.toArray()` with a month-bounded indexed query for
  `scripturesThisMonth`; `people`/`territoryCompletions` likewise via `createdAt`/`completedAt`
  `between` for the displayed month (keep a separate `people` read for `bibleStudies`, a
  `where('status').equals('bible-study').count()` if `status` is indexed — check `db.ts`
  `stores`; otherwise filter the small array). Wrap `monthProgress`, `yearProgress`, `perDayCat`,
  `weekMinistry/weekCredit` in `useMemo` keyed on `[logs, weekStartMs, displayedMonth.year, displayedMonth.month]`.
- Move the animated `displayedBank` counter into the pill component (`MinuteBankPill`, new,
  ~40 lines) so the rAF counter re-renders the pill, not the hub.
- **`Reports.tsx`:** lift the email field into `ReportEmail` (child component with its own
  state) so keystrokes stop recomputing the report.
- No behaviour change; gates + one browser pass.

→ **Cut 0.25.1** with whatever of D1–D5 landed; list the rest as still open in AUDIT.

---

## Out of scope for this session
Dropbox sync (ADR-0004), F017 chip height, the tutorial image re-shoot, Epic 2.2–2.5.
