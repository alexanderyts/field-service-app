# Changelog

Meleo uses semantic versioning — **MAJOR.MINOR.PATCH**:

- **MAJOR (`X.0.0`)** — the first public release, and any later breaking change. **Not yet reached**
  — the app is still pre-1.0, so all history below lives in `0.x`. `1.0.0` is reserved for the first
  "released / feature-complete" cut (see the note at the end).
- **MINOR (`0.X.0`)** — a new feature or capability.
- **PATCH (`0.0.X`)** — fixes, polish, refinements, and infrastructure.

**Current version: `0.20.4`.** History runs from the initial scaffold forward.

> Keep this in sync with `src/version.ts` (`APP_VERSION`, shown in the More tab and stamped into
> backups) and `package.json` — bump all three together when cutting a version.

---

## 0.1.0 — Foundation · 2026-07-01
- Initial project scaffold: React 19 + TypeScript + Vite 8 + Dexie (IndexedDB) + vite-plugin-pwa
- Full first feature set: contacts, call logs, time tracking, weekly schedule, reports

## 0.1.1 — Deployment pipeline · 2026-07-02
- GitHub Pages deploy path alongside Netlify
- Deploy via GitHub Actions (replacing the legacy branch pipeline)
- Remove the dead gh-pages branch script

## 0.2.0 — Schedule planning & territory completions · 2026-07-02
- Simplified tutorial; single-month / single-year progress display; track territory completions
- Split-week navigation reworked as real segment stops (+ tutorial polish)
- Calendar week number and single-day partial-week label

## 0.3.0 — Minute bank · 2026-07-02
- Minute-bank pill: banks leftover minutes, tap-to-redeem, auto-converts at 60; cleared on data reset
- Fly-to-bank animation originating from the minutes field, with a weighted arc and count-up/down
- Several animation refinements for real-time smoothness; immediate modal close on log

## 0.4.0 — Schedule planning expansion · 2026-07-02
- Full-day planning windows, credit suggestions, goal feedback, calendar re-styling, return-visit reminders
- Wider day-schedule modal, per-day edit/reset, credit-category picker
- Typed multi-block day scheduling + contextual calendar legend
- One-off (single-date) day schedules; all-month progress bars

## 0.5.0 — Streets & the Ministry tab · 2026-07-02
- Street entries with a contextual house-number pad, dropdown tag filter, editable return visits & time entries

## 0.6.0 — More tab: Tips, Backup, PWA install · 2026-07-03
- Concise copy pass; Tips/Legal in the More tab; HLC category; bundled Satoshi font; numpad polish
- Full local Backup & Restore (JSON export/import)
- "Add to Home Screen" prompt + persistent-storage request
- Data-driven tip services (one-time / monthly, multi-service ready)

## 0.7.0 — Meleo rebrand, themes & profile · 2026-07-03
- **Renamed to Meleo** — new splash animation (Greek→Latin wordmark), person-and-door icon, contact email
- "Mark" theme — deep-navy palette with a medium-green accent (fourth theme)
- First-boot name prompt; static map compass

## 0.7.1 — Schedule calendar & progress card · 2026-07-03
- Interactive Schedule calendar view
- (Uploaded assets)
- Redesigned the Schedule tab's progress card

## 0.8.0 — Auxiliary pioneering + S-205b PDF · 2026-07-03
- Calendar-accurate auxiliary-pioneering math, a gear menu, and S-205b-E form export (pdf-lib)

## 0.9.0 — Territories & QR sharing · 2026-07-03
- Temporary-territory tooling: grouping, assignment, and a Ministry-tab view
- QR / deep-link peer-to-peer sharing for contacts, streets, and territories

## 0.9.1 — Fixes & Schedule refinements · 2026-07-03
- Fix DST drift in the auxiliary-pioneering week counter
- Overhaul the Schedule tab's Service Schedule window; refine the house-number pad and territory tooling

## 0.10.0 — Territory tracing & live maps · 2026-07-03
- Tap-to-place waypoints with snap-to-road (Overpass)
- Live combined territory map; single-street live map (+ schedule polish)

## 0.10.1 — Declutter & overhaul · 2026-07-03
- Declutter the Service Schedule window (Phase 1)
- Territory / street / Ministry overhaul (Phase 2)

## 0.11.0 — Schedule unification, code-split & usability · 2026-07-04
- Unify the Service Schedule expanded views (one nav bar, equal-height)
- Audit pass: code-split tabs, map/tab-bar clearance, shared StepperNav, hardening
- Usability batch: factory reset, calendar-follows-month, participation, map access, themed splash, new icon
- Service Schedule redesign: unified goal rings + morphing expand/minimize

## 0.11.1 — More-tab polish · 2026-07-04
- Share-app card, Meleo copyright, developer name
- (Uploaded assets)

## 0.12.0 — Guided tour · 2026-07-04
- Guided tour with visual feature cards, refined copy, feedback section
- Tutorial: realistic schedule shots; More tab organized into sections

## 0.12.1 — Map upgrades · 2026-07-04
- Tips options, Map territory modal, Ministry counts, per-block submit, legend
- Map: satellite/street toggle + place search; no street duplication when grouping
- Map: size the map so its bottom clears the floating tab bar

## 0.13.0 — Streets ⇄ Territories unification · 2026-07-05
- Back every territory street with one real Streets entry (single source of truth via `entryId`);
  add per-street notes, create-contact (house + street level), per-street share, and confirm dialogs
  on send-to-ministry and grouping
- Refresh CLAUDE.md to the current app (Meleo, v8 schema, streets/territories, sharing)

## 0.14.0 — Territory location & street signifiers · 2026-07-05
- Capture a street's city/state/zip at trace time; show a territory's location
- Fix map double-draw of grouped streets; dedupe the territory location label
- Keep same-named street traces separate, with a `(2)`/`(3)` signifier

## 0.15.0 — Testing & CI gate · 2026-07-05
- Add Vitest + unit tests for the pure logic (55h credit cap, house sort, scripture, aux, share validation)
- Run the tests in CI before every build/deploy

## 0.16.0 — Security & modernization · 2026-07-09
- Harden share import (the one untrusted-input boundary): size caps + per-kind shape validation + tests
- Enable TypeScript `strict` mode (0 errors); add `npm run lint` to the CI gate
- Adopt an audit register (`AUDIT.md`) + a Definition of Done (from SavePoint's model)

## 0.16.1 — Schedule write-path hardening · 2026-07-18
- Fix silent time loss in the minute bank: quick-logged time and the banked-hour roll-over now persist to the DB *before* the ~1.1s fly-to-pill animation, so a backgrounded/killed PWA can no longer drop the write (F011)
- Fix stale-snapshot schedule writes: every `dateOverrides`/`daySchedule` mutation now re-reads the prefs row inside a Dexie transaction instead of spreading a possibly-stale `useLiveQuery` snapshot, preventing double-logged time and resurrected/dropped scheduled blocks (F012)

## 0.17.0 — Backup safety net, settings foundation & accessibility · 2026-08-12
- **Know when you last backed up**: the More tab now shows "Last backup: 3 days ago", or "You've never backed up" when there isn't one. Recorded only when an export actually completes — dismissing the iOS share sheet doesn't count. The backup card's copy now says plainly that clearing browser data or losing the device erases everything and this file is the only way back
- Add a typed settings module (`src/settings.ts`) wrapping the existing `fieldservice_*` keys; every getter is total, so a corrupt or unreadable value can no longer crash a render. All 10 credit-hours/theme call sites now go through it
- Harden the share importer against a decompression bomb (inflate output is now capped and aborts mid-stream) and against primary-key injection (ids are stripped at runtime, not just in the types) — REVIEW F-B1/F-B2
- Validate the stored aux-pioneering config field by field; a corrupt value used to throw a `TypeError` out of both Schedule and Reports — REVIEW F-B4
- Stop backups from carrying privacy-policy acceptance between devices: the blocklist named the retired `privacy_v1` key while the live one is `privacy_v2`, so the block had been inert. Restoring a backup now re-shows the first-launch privacy screen once, as intended
- Add spacing/type/motion design tokens to `:root`, measured from the values `App.css` already uses most; adopted only in newly-touched CSS
- Accessibility: 34 icon-only controls gained accessible names, decorative emoji are hidden from assistive tech, and the active tab is announced. Touch targets measured — `.icon-btn` and the tab bar already meet 44px; `.chip` can't without reflowing every tab (tracked as F017)
- New tests: 49 added (55 → 104), covering the settings module, the aux-config validator, the share hardening, and the new "time ago" formatter

## 0.17.1 — Data-loss fixes · 2026-08-12
- **Your map pins survive a failed address lookup.** Editing a contact's address while offline used to silently delete its map location. Now an address that only *looks* edited (typed and undone, or retyped the same) keeps its pin without a lookup at all; and if a genuinely new address can't be found, Meleo asks before dropping the old pin instead of deciding for you (F022)
- **Fast house edits no longer overwrite each other.** Setting one house's status and then editing another's note within a moment could silently revert the first. House notes now save when you finish typing rather than on every keystroke, so characters can't be dropped either (F023)
- **A backup from a newer version of Meleo is refused instead of applied.** Restoring one would have wiped your data and replaced it with records this version can't read. The message names the version that made the file. "Restore from Backup" is now labelled "Restore (replaces current data)" (F024)
- **Bulk-deleting contacts, grouping a territory, sending a street to Ministry, and completing a territory** are each one all-or-nothing operation now. Interrupted partway, they used to leave orphaned call history, duplicate street entries, a street in two places at once, or — worst — a completed territory with its completion record lost for good (F025)
- New tests: 31 added (104 → 135), including the first that drive a real IndexedDB — grouping streets into a territory, sending a street to Ministry, completing a territory, deleting contacts, and importing a share are now covered end-to-end rather than by inspection
- Resolved 4 high-severity advisories in a build-time dependency; `npm audit` is clean again (F027)

## 0.18.0 — Finish a territory from the Territories tab · 2026-08-12
- **You can now complete a grouped territory.** "Complete Territory" only existed on the Map's scratch draft, so the real territories in Ministry → Territories — the ones you actually work through — could never be finished or counted. Completing one records it in Reports and clears the grouping (F026)
- **Mark a territory's streets finished as you go.** Grouped territories had no way to tick a street off, so a territory could never read as fully worked. Finished streets show struck through
- Completing a territory never destroys what you learned working it: every street stays in Ministry → Streets with its house numbers, statuses and notes. "Delete Territory" stays separate, for one created by mistake

## 0.18.1 — Reports names the territories it counted · 2026-08-12
- **"2 completed this month" now says *which* two.** The Custom Territories card showed a bare number with no way to check it from inside the app — so a count that looked wrong couldn't be confirmed or disputed. It now lists each completed territory by name, with the date and street count, and the emailed report carries the same list

## 0.19.0 — Send a share as a link · 2026-08-12
- **You can now send a share to someone who isn't next to you.** A QR only works face-to-face — the receiver points their camera at your screen — so "Save / send QR image" was a dead end: you'd text someone a *picture* of a code they can't scan. The share screen now offers **Send link** (straight to Messages, WhatsApp, email) and **Copy link** alongside the QR
- **"Share as file" is always available**, not just for items too large to fit in a code
- The share screen now says to scan with your **camera app** — Meleo has no built-in scanner, and the old wording didn't make that clear
- Running the dev server? The share screen now warns when a link points at `localhost`, which can only ever open on the machine that made it

## 0.19.1 — Hardening for 1.0 · 2026-09-07
*(Committed separately; released together with 0.20.0 below, which is the version stamp.)*
- **Meleo no longer hangs waiting on a lookup that will never answer.** Address search, the map's place search, the street "Matching to street…" step and the aux-pioneer slip all had no time limit, so on a weak signal they could sit there indefinitely with no way out but closing the window. Each now gives up after a sensible wait and tells you, instead of spinning (F-C1)
- **A broken goal can't blank out your progress rings.** If a restored or older backup carried an unreadable weekly-hours figure, every ring on Schedule and Reports drew as empty. The goal now falls back to zero cleanly (F-C3)
- **Restoring a backup now leaves your device exactly as the backup had it.** Settings the backup didn't mention used to survive the restore and mix in, so you ended up with a blend of the old and new state rather than the one you restored (F-B6). Restore also refuses a file written by a newer *database* version, the same way it already refused a newer file format (F032)
- **A shared contact or territory can no longer arrive with an absurdly large name or note.** Sharing checked how *many* items a share carried but never how big any one of them was, and nested lists weren't checked at all (F033)

## 0.20.0 — Ministry and Credit · 2026-09-07
- **Time is now logged as one of two things: Ministry or Credit.** The old list of seven — LDC, HLC, Convention, Assembly, Bethel, Other — asked you to file every entry into a category the congregation's report doesn't even have a field for. Credit is submitted as a single figure regardless of what earned it, so that's how Meleo records it now
- **What the time actually was is still yours to keep.** Every entry can carry a short note — "LDC", "Circuit assembly", "Cart witnessing" — with one-tap picks for the common ones. It's for your own records: it never changes a total, a goal, or the 55-hour cap
- **Your existing entries were converted automatically, and nothing moved.** Every past LDC, HLC, Convention, Assembly, Bethel and Other entry is now Credit with its old name kept as its note. Your monthly and yearly totals are identical to what they were — those categories always counted as credit anyway, so only the label changed
- **"Type of ministry" no longer files your time as credit.** That box suggested "Letter writing, Cart witnessing" — real field ministry — but everything entered through it counted against the 55-hour credit cap. Letter writing and cart witnessing are Ministry, and now log as Ministry with a note (F-A6 / ADR-0001)
- **Turning credit hours off now means Ministry only**, as the setting always implied
- **The minute bank holds ministry minutes only.** Leftover minutes from credit time used to go into the same pot and come back out labelled as whichever kind of time happened to fill it — which could quietly misfile hours right at the cap, where the difference matters most. Credit is logged whole instead
- New tests: 6 added covering the conversion itself — a real older database is built, upgraded, and checked to confirm no entry is left unlabelled and no month's counted total changes

## 0.20.1 — Loose ends from the review · 2026-09-07
- **A double tap can't log time twice or add a street twice.** "Submit Time" stayed live for a moment after the first tap while the minutes animated into the bank, and "Save Street" had no guard while it checked for a duplicate name — either could write two entries from one fast double tap (F-C2)
- **Address suggestions can't go stale.** If you kept typing, a slow reply to an earlier version of the address could arrive last and overwrite the right suggestions with old ones. Only the newest lookup is shown now (F-C6)
- **A long monthly report no longer arrives cut off.** Some mail apps truncate a mail link around 2,000 characters; a big month with several completed territories could pass that silently. Past the limit the full report is copied to your clipboard and the email opens with a note to paste it — and there's a new **Copy Report** button either way (F-C5)
- **Old one-off schedule changes are cleaned up.** Every date you ever cleared or edited individually was kept forever and re-saved into every backup. Anything older than the previous service year is now dropped on the next schedule change; this year and last are untouched (F-C4)
- **A very old upgrade no longer hides a failure.** The early visits→calls conversion used to swallow any error and carry on with the history missing; it now only skips a genuinely absent table and otherwise stops so nothing is silently lost (F-B7)
- Dependabot now opens a weekly pull request when a dependency has a fix, so security advisories can't accumulate unnoticed again (F010)
- New tests: 3 added (168 → 171) covering the schedule-override cleanup

## 0.20.2 — The two giant files are split up · 2026-09-07
- **No visible change.** `Schedule.tsx` (3,477 lines) and `Contacts.tsx` (1,214) are now a short root file each over a folder of small, single-purpose files — the pure date and planning logic in files with no React in them at all. Nothing about how the app works changed; every test, the build, and a real-browser check of the Schedule tab all pass as before (F008)
- The two files each had their own copy of the same date helpers; there is one now (`localDate.ts`)
- The minute bank and "participated this month" settings now go through the same typed settings module as every other setting, with tests

## 0.20.3 — Browser security policy · 2026-09-07
- **The app now tells the browser exactly what it's allowed to load and run.** Only Meleo's own code can execute — no injected or inline script ever will — and the only outside places it may contact are the map-tile and address-lookup services it already uses. Nothing changes day to day; it closes the door on a whole class of tampering (F009)
- Checked by opening the real built app in a browser and exercising the map (both tile sources), the Schedule tab and a contact's share code, with no policy refusals

## 0.20.4 — Popups work from the keyboard · 2026-09-07
- **Every popup can now be used without a mouse or touch.** Opening one moves the keyboard focus inside it, Tab moves between its controls without escaping to the page behind, and Esc closes it — the same as tapping outside. When it closes, focus goes back to where you were; with a confirm on top of another popup, back to the popup underneath (F018)
- Nothing changes for touch use; this is for keyboard and screen-reader users

---

## Toward 1.0.0
The app is feature-rich, tested, hardened, and CI-gated. `1.0.0` is the natural next milestone —
cut it when you're ready to call the app "publicly released / feature-complete." From there, MINOR
adds features and PATCH ships fixes, exactly as above.
