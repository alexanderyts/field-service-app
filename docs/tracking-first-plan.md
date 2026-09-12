# Tracking-first: implementation plan

Supersedes `REVIEW.md` §3 ("scheduling-first → time-tracking-first"). The reframe there was
copy and ordering; this plan goes further: the intake, the progress card, logging, a live
timer, and the report's submit box. Approved direction (2026-09-12): **the app rewards
counting time and meeting goals; planning is optional and secondary.**

This file is written for the implementing model. It states facts about the code as it is at
v0.20.4, the decisions already made, and what "done" means for each wave. Read `CLAUDE.md`
first; its Definition of Done applies to every commit here.

---

## 0. Ground rules for the implementer

- **Do not change how logged time is drawn.** The split ministry/credit `.progress-bar`,
  `HourGoalBar`, the week-view `.day-track` slots, and the `GoalRing` arcs in the mini-week
  and `ScheduleCalendarView` stay pixel-identical. They move and lose their "Expand" gate;
  they are not restyled. The owner asked for this explicitly.
- **No Dexie version bump.** Every new field below is optional and non-indexed. Do not add a
  `.version()` entry. `db.migration.test.ts` must keep passing unchanged.
- **Every write path that already exists keeps its guards.** `mutateSchedulePrefs` (F012),
  the persist-before-animate order in `bankQuickLogMinutes` (F011), the `submitted` latch in
  `DayActionModal` (F-C2), and `quickLogStrategy` (F-A6) are load-bearing. Reuse them; do
  not fork them.
- **Pure logic gets a Vitest file next to it.** New math (timer elapsed, milestone detection,
  report figures, role derivation) lives in a `.ts` module with no React import, and is
  tested. Component glue is not required to be tested.
- **Verify in the browser, not just `tsc`.** Each wave ends with driving the built page
  (`npm run build && npm run preview`) and a screenshot. The browser pane throttles timers
  when hidden; use JS-driven clicks and tool-side waits (see memory note
  `browser-pane-quirks`).
- **Gates:** `npm run build`, oxlint run directly (the `npm run lint` wrapper can report a
  false failure; gate on the binary's exit code), `npm test`.
- **Docs in the same commit:** `CLAUDE.md` (tabs table, localStorage table, Schedule notes),
  `CONTEXT.md` (new terms), `CHANGELOG.md`, `src/version.ts` + `package.json` on each cut.
- **Tutorial copy and screenshots** in `src/components/Tutorial.tsx` describe the old
  layout ("Block out when you'll be out…"). Update the two Schedule steps' copy in Wave 1;
  re-shoot the two images (`scheduleWeekShot`, `scheduleCalendarShot`) at the end of Wave 2.

---

## 1. Current state (facts, not opinions)

Files: `src/components/Schedule.tsx` (root, 56 lines), `src/components/schedule/*`
(`ScheduleMain.tsx` 1,301 lines is the hub; `Survey.tsx`, `DayActionModal.tsx`,
`ScheduleCalendarView.tsx`, `AuxPioneeringBox.tsx`, `MonthlyParticipationBox.tsx`,
`HourGoalBar.tsx`, `plan.ts`, `dates.ts`), `src/timeStats.ts`, `src/auxPioneering.ts`,
`src/settings.ts`, `src/components/Reports.tsx`.

- `SchedulePrefs` has `isPioneer?`, `goalPeriod?: 'none'|'weekly'|'monthly'|'yearly'`,
  `weeklyHours`, `yearlyHours`, `monthlyHours?`, `daysOut`, `daySchedule`, `dateOverrides`.
  Missing `isPioneer` is read as `true` (legacy default) everywhere.
- Auxiliary pioneering is **not** in `SchedulePrefs`. It is `fieldservice_aux_pioneering`
  in localStorage, owned by `auxPioneering.ts`, toggled from `AuxPioneeringBox` inside the
  expanded progress card, non-pioneers only.
- Credit-hours on/off is `fieldservice_credit_hours` (`settings.ts`), set by the survey.
- Participation is `fieldservice_participated_months` (`settings.ts`), one boolean per month.
- Survey: title "Plan Your Schedule", subtitle "we'll build your weekly schedule for you",
  save button "Build My Schedule". `collectsSchedule` is always true for pioneers; they
  cannot skip the days/windows step. `SurveyIntro` offers "Take the Survey" / "Skip for now".
- `ScheduleMain` layout, top to bottom: header ("Schedule" + "Redo survey"), progress card
  (one bar by default; month/year bars and `AuxPioneeringBox` only when `progressExpanded`),
  Service Schedule card (mini-week / week / calendar), `MonthlyParticipationBox` (publisher
  without goal), `ReturnVisits`, Recent Entries (holds the small "+ Quick add time" button
  and the minute-bank pill).
- Default bar for a publisher with no goal and no aux month: "Days left in <month>".
- `DayActionModal` `step === 'menu'` lists "Add Scheduled Service Time" (or "Edit Schedule")
  **before** "Add Service Time for This Day". Its `window` step says "… more to schedule".
  The Service Schedule `InfoTip` also says "… more to schedule".
- `quickLogStrategy` returns `'confirm'` for ministry logs with ≥30 leftover minutes; the
  dialog offers "Round up to Nh" (writes time not spent) vs "bank the minutes".
- `Reports.tsx` requires a "Run Report" tap and a 1,000 ms artificial delay. The report has
  no Bible-studies figure and no participation line. The Service Report submitted to the
  congregation is: participated (yes/no), Bible studies (count), hours (pioneers and
  auxiliaries only), credit in remarks. See `CONTEXT.md` › Reporting.
- Tab label is "Schedule" (`src/App.tsx` `TABS`, key `'schedule'`). Keep the key; only the
  label and icon may change.

---

## 2. Decisions already made

| # | Decision | Default the implementer should take |
|---|---|---|
| D1 | Role is a first-class concept: **Publisher / Auxiliary pioneer / Regular pioneer**. | Add `role?: 'publisher' \| 'auxiliary' \| 'pioneer'` to `SchedulePrefs`. Derive it for legacy rows: `isPioneer !== false` → `'pioneer'`; else aux config enabled → `'auxiliary'`; else `'publisher'`. Keep `isPioneer` written in sync (`role === 'pioneer'`) so every existing read keeps working. Do **not** move the aux config out of localStorage in this plan; it stays the source for which months are aux months. |
| D2 | Planning (days, windows) is opt-in and never asked in the intake. | Remove the days/windows card from `Survey.tsx`. The planner is reached from the (collapsed) Service Schedule card as today. |
| D3 | Month and service-year progress are always visible for anyone with an hours goal. | Delete `progressExpanded`. Publishers with no goal see participation + Bible studies instead of a bar. |
| D4 | Logging is the primary action on the tab. | A primary "Log time" button at the top of the tab, defaulting to today, with preset chips. |
| D5 | Round-up is removed. Leftover ministry minutes always bank. | `quickLogStrategy` never returns `'confirm'`. **Human-owned:** the owner may veto this before Wave 3 ships; the test that pins it must be named in the commit. |
| D6 | The tab is renamed. | Label "Service", icon unchanged unless a better glyph is trivially available. Key stays `'schedule'`. |
| D7 | The report leads with what is actually submitted. | A "What to submit" card at the top of `Reports.tsx`, auto-shown (no Run button, no delay). The animated reveal may stay for the cards below it. |
| D8 | Live timer stores real intervals. | `TimeLog` gains optional `startedAt?: number` and `endedAt?: number` (epoch ms). Non-indexed; no version bump. |

Open items the implementer must **ask about**, not decide: none are blocking. D5 is the
only one with a veto window.

---

## 3. Waves

Each wave is one or more commits and one version cut. Cut order: 0.20.5, 0.21.0, 0.22.0,
0.23.0, 0.24.0, 0.24.x. Do not merge waves.

### Wave 0 — Hardening (0.20.5) ✅ shipped 2026-09-12

Goal: close the highs from the 2026-09-12 review before touching the tab, so the reframe is
built on safe write paths. Findings are registered as **AUDIT.md F034–F041**; each closes only
with named proof. Order within the wave:

1. **F034 Android notifications.** `notifications.ts`: `navigator.serviceWorker.ready` →
   `reg.showNotification`, fallback to `new Notification`; `.catch` at the `App.tsx` call
   site. Proof: manual on a real Android install; note it in the commit.
2. **F035 call save latency.** `CallLogger.saveCall` and `ContactForm.save` write first and
   patch coordinates afterward. Proof: fake-indexeddb test in `records.ts` that the row
   exists before any location resolves.
3. **F036 overdue return visits.** New pure module `appointments.ts` with
   `isOverdue(appt, now)` / `visibleAppointments(appts, calls, now)`; the three lists use it;
   an "Overdue" badge. Tested.
4. **F039 + F040 share hardening.** Type every field in `assertValidPayload`, bound `from`,
   reassign street ids, and move `importSharedPayload` into `records.ts` inside one
   transaction. Tests: wrong-type cases in `share.test.ts`; orphan-free failure in
   `records.test.ts`.
5. **F041 restore migration.** Factor the v9 upgrade into `migrateLegacyRows(tx)`; run it in
   `importBackup` when the file's `dbVersion` is older. Test: restore a v8-shaped file and
   assert categories are `'ministry'|'credit'`.
6. **F037 privacy copy.** Rewrite the policy's data-sharing sections to name Nominatim,
   Overpass, the tile hosts, and Google Maps directions, and what each receives.
7. **F038 keyboard rows.** Rows become buttons; `aria-pressed` on segmented controls and
   chips; `aria-label`s on per-row selects; `ModalPortal` gets `aria-labelledby`.

8. **F047 map tiles.** Replace the CARTO street tiles (watermarked "API KEY REQUIRED") with
   Esri `World_Street_Map`; attribution and `CLAUDE.md` host list updated. Verify on the
   built page with a screenshot. This is the one Wave 0 item a user sees on day one.

Wave 0 does not touch `ScheduleMain`, `Survey`, or `Reports`.

**Design pass (AUDIT F048), spread across the waves that touch each screen:** one shared
display-rounding helper so week/month goals read the same on Schedule and Reports (Wave 2);
`fmtDateTime` without seconds in `localDate.ts` used by contact "Met", call rows, and return
visits (Wave 0, it is a one-line helper); day modal down to a single Edit (Wave 3); resting
red Delete pills replaced by a per-row overflow or swipe (Wave 3 for Recent Entries and
Return Visits); Map controls collapsed over the map and the legend behind a toggle (Wave 5);
City/State/Zip on one row and the duplicate "Date & time" heading dropped (Wave 0).

### Wave 1 — Intake and copy (0.21.0) ✅ shipped 2026-09-12

Goal: the first five minutes tell the user the app counts their time.

1. **`src/schedulePrefsRole.ts` (new, pure, tested).** `deriveRole(prefs, auxConfig)` per
   D1, and `roleTracksHours(role, auxConfig, year, month)` replacing the inline
   `nonPioneerTracksHours` expression in `ScheduleMain`. Tests: legacy row with no
   `isPioneer`; `isPioneer:false` + aux enabled; publisher with `goalPeriod:'monthly'`.
2. **`Survey.tsx` rewrite.** Title "Set your goal". First card: three role buttons. Then:
   - Pioneer: yearly goal (default 600) → credit question. No days card.
   - Auxiliary: 15h or 30h, and the mode picker that today lives in `AuxPioneeringBox`
     (this month / chosen months / continuous). Writes via `saveAuxConfig`; `AuxPioneeringBox`
     stays for later edits but is no longer the only entry.
   - Publisher: "Just track my participation" (default) or "Set a personal goal" →
     the existing weekly/monthly/yearly picker.
   - Save button "Start tracking". `SurveyIntro` copy: "Tell Meleo what you're aiming for.
     Takes 20 seconds." Buttons "Set my goal" / "Skip for now".
   - Writes `role`, keeps writing `isPioneer`, `goalPeriod`, `weeklyHours`, `yearlyHours`,
     `monthlyHours`, `completedSurvey`. Leaves `daysOut`/`daySchedule` untouched on redo.
3. **Copy sweep.** Header "Redo survey" → "Change my goal", moved to the bottom of the tab
   next to Recent Entries. Delete the three "more to schedule" strings; replace the
   Service Schedule InfoTip text with "Planned: Xh. Logged: Yh." `DayActionModal` menu:
   "Log time for this day" first, "Plan this day" second. Tab label per D6. Tutorial
   Schedule step copy: "Log your time and watch the month fill toward your goal. Planning
   your week is optional." Update `CLAUDE.md` tabs table and Schedule notes.
4. **Verify:** fresh profile → intake as each role → land on the tab with the right bar.
   Redo intake on a legacy `isPioneer`-less row starts pre-answered as Pioneer.

### Wave 2 — Progress as hero (0.22.0) ✅ shipped 2026-09-12 (tutorial images not re-shot: the week grid and calendar they show are unchanged)

Goal: opening the tab feels like checking a scoreboard.

1. **`src/milestones.ts` (new, pure, tested).** `milestoneReached(prevApplied, nextApplied,
   goalMin)` → `null | 25 | 50 | 75 | 100`. `paceStatus(appliedMin, goalMin, elapsedPct)` →
   `'ahead' | 'on-pace' | 'behind' | 'done'` using `monthElapsedPct` from `dates.ts`.
2. **Progress card restructure in `ScheduleMain`.** Remove `progressExpanded`. Order:
   - Month: `fmtDuration(applied) / goal`, the existing split bar, one pace line
     ("On pace", "Xh ahead", "Xh to go with N days left"). Uses `monthProgress` as today.
   - Service year (pioneer, or publisher with yearly goal): existing raw+applied bar and
     legend, unchanged.
   - Week pace line (pioneer with `hasSchedule`, aux month, or weekly goal): keep the
     existing bar, move it **below** month and year.
   - Publisher with no goal: no bar. Show `MonthlyParticipationBox` here (moved up from
     below the planner) plus "Bible studies this month: N" (count of `people` with
     `status === 'bible-study'`).
   - Delete the "Days left in month" bar.
3. **Celebration.** On a log write that crosses a milestone (compute prev/next in the
   save path, not in render), show a non-blocking toast; at 100 on the month or the service
   year, reuse the `participation-cue` visual with confetti-free copy ("Goal reached for
   September"). Keep it under 2 s and never on the critical write path (persist first,
   F011 order).
4. **Planner demoted.** Service Schedule card defaults to collapsed and sits below the
   progress card and below Recent Entries. No other change to it. `scheduleDefaultExpand`
   keeps its meaning.
5. **Verify** with demo data (More → load demo data): pioneer, aux month, publisher with
   and without goal. Screenshot each. Re-shoot the two tutorial images.

### Wave 3 — Logging first, banking only (0.23.0) ✅ shipped 2026-09-12 — deviation: the form is `LogTimeForm` rendered as the day modal's time step (opened for today by the top button), not a separate sheet; same banking path, less surface

Goal: logging takes one tap to start and never records time that was not spent.

1. **`LogTimeSheet.tsx` (new, `schedule/`).** A `ModalPortal` sheet opened by a primary
   "Log time" button at the top of the tab (above the progress card). Date defaults to
   today with a "Change" link to `CalendarPicker`; preset chips 30m / 1h / 1h 30m / 2h /
   3h plus the existing `NumPad` for custom; category pills (only when credit is enabled);
   the Activity Note field with `CREDIT_ACTIVITY_SUGGESTIONS`. Submit calls the existing
   `quickLogTime` path in `ScheduleMain` (lift it into a small hook or pass callbacks; do
   not duplicate the banking logic). Must pass `onClose`. Latch a `submitted` flag (F-C2).
   The old "+ Quick add time" button in Recent Entries opens the same sheet.
2. **`DayActionModal` shrinks.** Its `logTime` step is deleted and "Log time for this day"
   opens `LogTimeSheet` with that date. The modal keeps menu / window / dayOptions.
3. **D5 in `timeStats.ts`.** `quickLogStrategy` returns `'bank'` for any leftover ministry
   minutes; remove `'confirm'` from its union and delete the round-up `ConfirmDialog` and
   `quickLogConfirm` state in `ScheduleMain`. Update `timeStats.test.ts`; the test name
   should say "never rounds up".
4. **Minute bank stays** exactly as is (pill, fly animation, redeem). Add to `Reports.tsx`
   body and the on-screen submit card: "Carried forward: Xm" from `getMinuteBank()`.
5. **Verify:** log 1h 45m ministry → 1h logged, 45m banked, no dialog. Log 2h credit →
   whole. Double-tap Submit → one row.

### Wave 4 — Live timer and the submit box (0.24.0)

Goal: real intervals, and a report that matches the form.

1. **`src/timer.ts` (new, pure, tested).** State `{ startedAt: number, pausedAt?: number,
   accumulatedMs: number, category, activityNote }` in localStorage key
   `fieldservice_timer` (add to the `CLAUDE.md` key table; owner `timer.ts`; blocklist it
   in `backup.ts` since it is transient). Functions: `start`, `pause`, `resume`,
   `elapsedMs(state, now)`, `stop(state, now) → { minutes, startedAt, endedAt }`. Tests
   cover pause/resume arithmetic and a stop after the app was killed (state older than
   now by hours still yields the right elapsed).
2. **`TimerCard.tsx`** at the top of the tab, beside "Log time": Start → running display
   (tick with `setInterval`, recompute from `elapsedMs` so a throttled tab catches up) →
   Pause / Stop. Stop opens `LogTimeSheet` prefilled with the elapsed h:mm, category, and
   note; saving writes `startedAt`/`endedAt` onto the `TimeLog` (D8) and clears the key.
   On mount, if a timer exists, resume showing it (recovery after kill).
3. **Reports "What to submit" card** (D7): participated (from `getParticipatedMonth`, or
   implied yes when hours > 0), Bible studies count, hours (only when role tracks hours;
   whole hours, with "Xm carried forward"), credit hours line when > 0 with "note in
   remarks". Remove the Run button and the 1 s delay for this card; the rest of the report
   may keep its staggered reveal. Add the same figures to `reportBody()` at the top.
4. **Verify:** start timer, background the tab 2 min, return → elapsed correct; kill and
   relaunch → timer still running; stop → entry with real start/end; report shows it.

---

### Wave 5 — Polish (0.24.x)

**AUDIT.md F042–F046**, done after the tab work so it is not done twice:

- **F042 perf** is done *inside* Waves 2–4 while `ScheduleMain`, `Reports`, and `Contacts`
  are open: indexed month-bounded queries, `useMemo` on log derivations, the bank counter in
  its own component, the email field lifted out of `Reports`.
- **F043 offline map + bundle:** tile `CacheFirst` route with caps; `lazy()` the
  Leaflet-bearing pieces of `Territories.tsx`; drop the PDF and pdf-lib from precache;
  add `webp`; `registerSW` with a reload toast.
- **F044 data guards:** wipe moved under "Your data" with "Export first"; confirm/undo on
  house delete and draft-street remove; `isBackupOverdue` + amber status + one banner.
- **F045 Map and People first run:** friendly GPS copy, empty-state overlay, tile-error
  banner, real "no contacts yet" state, `sortKey='visit'`, relative visit badge. Overlaps
  PLAN.md 5.2/5.3; close those there.
- **F046 small items:** global reduced-motion rule, `:focus-visible`, `--tag-not` contrast,
  44 px on `.house-status` / `.segmented button` / install-banner close, skip the splash
  once the policy is accepted, delete `renderStreetsImage`.

## 4. What is explicitly out of scope

- Moving `fieldservice_aux_pioneering` or participation into Dexie (ADR-worthy, later).
- F017 chip height.
- Epic 2.2–2.5 (one-tap visit from the People list, contextual "+", map pins, global
  quick-add). They follow this plan; they do not block it.
- Any change to `ScheduleCalendarView` rendering, `goalSegments.ts`, or `GoalRing`.

---

## 5. Definition of done for the whole plan

- Six version cuts on `master`, each with green build/lint/test and a CHANGELOG entry
  that names how it was verified.
- `REVIEW.md` §3 marked "superseded by docs/tracking-first-plan.md"; `PLAN.md` Wave 2
  points here.
- Screenshots of the tab for each role and of the report submit card attached to the last
  commit message or PR.
