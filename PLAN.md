# Meleo — Comprehensive Improvement Plan

Everything proposed **after** `REVIEW.md`, reorganized into one prioritized roadmap: the
feature/optimization ideas, the UI-polish pass, the survey rework, and the per-tab UX review.

**Out of scope here (owned by `REVIEW.md`):** the scheduling→tracking reframe (§3), the
Ministry→Credit category change (§4), and the `Schedule.tsx`/`Contacts.tsx` split (AUDIT F008).
The write-path, share-hardening and restore-safety work that used to sit in this list has
landed — see `AUDIT.md` F011–F015 and F022–F025.

Legend — each task carries: **[UI]** UI-only · **[DATA]** needs data/logic/schema change ·
effort **S/M/L** · and dependencies where they matter.

Status markers: ✅ done · 🟡 partly done.

> **Status as of 0.20.0 (2026-09-07).** Phase 0 is largely complete; Epic 1.1 and 1.4 have
> shipped. Two Phase-0 items are deliberately half-finished and are split below so the
> remainder isn't lost.
>
> **Wave 0 is cleared.** AUDIT F022–F025 all landed in 0.17.1, and F026–F030 landed after.
> F031–F033 (added by the 2026-09-06 review pass) are all closed as of 0.20.0. Five audit
> findings remain open — F008, F009, F010, F017, F018 — and every one is post-1.0.
> `REVIEW.md` stands at 14 of 20 closed.
>
> **The 1.0 line is complete.** All six items shipped in 0.19.1 and 0.20.0 — see the section at
> the end. What remains in this file is the next release's work, not the current one's.

---

## Guiding principles (the "why" behind the ordering)

1. **Protect the data first.** Local-first with no backend means the scariest failure is loss,
   not a bug. Durability leads.
2. **Flatten the frequent action.** The per-tab review found the same thing five times: the
   things done dozens of times a day are the deepest to reach.
3. **Tracking-first, scheduling optional.** Continue the `REVIEW.md` direction into every surface.
4. **Foundations before polish.** A few shared systems unblock many downstream items.
5. **Every change keeps the gates green** (`build`, `lint`, `test`) and follows the `CLAUDE.md`
   definition-of-done.

---

## Phase 0 — Foundations

- **F0.1a Define design tokens** ✅ *(0.17.0)* — spacing, type and motion scales in `:root`,
  measured from the values `App.css` already used most so adoption is a rename, not a redesign.
- **F0.1b Adopt tokens across `App.css`** — converge the existing one-off values. **[UI] M.**
  *Blocked on a visual-regression check: a repo-wide value sweep can't be verified by eye.*
- **F0.2a Accessible names + decorative-emoji hiding** ✅ *(0.17.0)* — 34 icon-only controls
  named; `aria-current` on the active tab.
- **F0.2b Focus trap + Esc in `ModalPortal`** — **[UI] M.** Deferred with reasoning; nested
  modals mean focus must restore to the layer beneath, and the custom NumPad/CalendarPicker
  complicate the focusable query. Needs manual keyboard testing. *(AUDIT F018.)*
  **Move this up if accessibility is claimed anywhere public** — a store listing or the privacy
  copy saying so makes it a 1.0 item rather than a post-1.0 one.
- **F0.2c 44px touch targets** 🟡 — `.icon-btn` (44×44) and `.tabbar button` (~49px) already
  comply. `.chip` is ~32px and can't grow without reflowing every tab or making wrapped rows'
  hit areas overlap. Needs a container-level rethink. *(AUDIT F017.)*
- **F0.3 Typed settings module** ✅ *(0.17.0)* — `src/settings.ts` owns theme, credit-hours and
  the new backup timestamp, with total getters; all 10 call sites swept. Notify and aux already
  had owning modules and were left with them. Two keys remain module-locals in `Schedule.tsx`
  (`_minute_bank`, `_participated_months`) — move them to an owner when next touched. Report
  recipient (4.5) and PIN (7.1) get added here when those features land.
- **F0.4 Monthly rollup cache table** — **do not build as specified.** A cache and a submitted
  record are two different things, and the performance claim is unmeasured. Full reasoning in
  [ADR-0002](docs/adr/0002-monthly-rollup-cache-vs-record.md). **Next step: measure Reports
  first**, then build only what the measurement justifies. Epic 8.2 is the likelier real fix.

---

## Epic 1 — Data durability & trust *(highest priority)*

- **1.1 "Last backed up" signal + honest copy** ✅ *(0.17.0)* — "Last backup: 3 days ago" /
  "You've never backed up"; plain permanence copy. Recorded only at real completion points; a
  dismissed share sheet doesn't count. *(Download-path imprecision waived as AUDIT F016.)*
- **1.2 Auto-backup** — periodic silent JSON snapshot to OPFS (or a prompted file save),
  rotating a few generations, with an overdue nudge. **[DATA] M.**
- **1.3 One-tap re-export via File System Access API** — remember a file handle so "Back up now"
  overwrites the same file. **[DATA] S–M.** *Bonus: this is the only export path that confirms
  a real write, so it closes AUDIT F016.*
- **1.4 Restore safety** ✅ *(0.17.1, completed 0.19.1)* — `formatVersion` gate on import
  (refuses newer-than-app, before any table is touched) and "Restore from Backup" renamed
  "Restore (replaces current data)". *(AUDIT F024.)* The two remaining halves landed in 0.19.1:
  restore now gates on `dbVersion` too (AUDIT F032) and clears stale `fieldservice_*` keys
  before writing the file's settings, so a restore leaves the backed-up state rather than the
  union of two (`REVIEW.md` F-B6).
- **1.5 Offline geocode queue** — save the record immediately and queue the lookup for retry
  when back online. **[DATA] M.** *Depends on fetch timeouts (Epic 8); the minimal version of the
  same problem shipped as AUDIT F022.*

---

## Epic 2 — Fast capture *(highest-felt UX win; cross-tab)*

- **2.1 One-tap "Log time"** — a prominent primary button opening straight to duration entry,
  defaulting to today, with preset chips. **[UI] M.** *Depends on the Ministry/Credit change.*
- **2.2 One-tap visit / not-home from the Ministry list** — inline affordance on each People
  row, expandable for notes. **[UI] M.**
- **2.3 Contextual "+"** — the Ministry header "+" acts on the current sub-view; Import moves to
  overflow. **[UI] S.**
- **2.4 Actionable map pins** — "Log a call" / quick-status, and "Add contact here". **[DATA] M.**
- **2.5 Global quick-add** — one entry point offering Log time / Log visit / Add contact from
  anywhere. **[UI] M**, after 2.1–2.2.

---

## Epic 3 — Studies, follow-ups & search

- **3.1 First-class study model** — promote "Bible study" from a Contact Status to its own
  entity (publication, current lesson, attendees, cadence, last/next date). **[DATA] L.**
  (Dexie bump + migration.)
- **3.2 Bible study tracker** — a view over 3.1. **[DATA] M.**
- **3.3 Follow-up radar** — interested contacts gone quiet, plus upcoming return visits. **[DATA] M.**
- **3.4 Search & filter** — contacts, streets, time logs. **[UI+DATA] M.**
- **3.5 Unify "what's next" vocabulary** — one word "Status" throughout; wire up or drop the
  orphaned `Call.followUpDate`. **[UI] S** / **[DATA] S.**

---

## Epic 4 — Reports as submission

- **4.1 "What to submit this month" block** — lead card mapping to the real Service Report
  fields: Shared (yes/no), Studies, Ministry hours, Credit hours. **[DATA] M.** *Does **not**
  require 3.1 — a studies count is already derivable from Contact Status today.*
- **4.2 Persistent monthly report records** — store each month's submitted figures so history is
  durable and next month can pre-fill. **[DATA] M.** *A record, not a cache — see ADR-0002.*
- **4.3 Auto-run + right-size the ceremony** — drop the fake 1s "Gathering…" gate; make
  `ServiceYearReview` far easier to reach. **[UI] S.**
- **4.4 Label "logged vs counts toward goal"** — shared inline legend so the 55h Credit Cap reads
  as a feature, not a rendering bug. **[UI] S.**
- **4.5 Remember the recipient + reliable send** — persist the email (F0.3), add copy-to-clipboard
  alongside `mailto:`. **[DATA] S.** *Also mitigates `REVIEW.md` F-C5.*
- **4.6 CSV / PDF export** of time logs and contacts. **[DATA] M.**
- **4.7 Aux-pioneer S-205b in context** — surface the slip on an aux month's card. **[DATA] S.**

---

## Epic 5 — Onboarding & first-run

- **5.1 Survey rework** — a 3-step wizard, one decision per screen: role (Regular / Auxiliary /
  Publisher-just-tracking), then goal with live feedback, then an optional "plan your week" with
  a prominent "skip — just track my time." **[UI+DATA] L.**
- **5.2 Empty-state pass** — real first-run states everywhere. **[UI] M.** Builds on F0.1.
- **5.3 Map first-run** — overlay centred on the user, naming what the tab does. **[DATA] M.**
- **5.4 Tour refresh** — update `Tutorial.tsx` for the new flows. **[UI] S.**

---

## Epic 6 — UI system & polish

- **6.1 Tab-bar VisualViewport fix** — **verify on real iOS + Android**. **[UI] S.**
- **6.2 Motion system + reduced-motion** — refactor onto F0.1a tokens; global
  `prefers-reduced-motion` path. **[UI] M.**
- **6.3 Spacing/type application** — see **F0.1b**; same blocker. **[UI] M.**
- **6.4 Contrast audit** across all four themes. **[UI] S–M.**
- **6.5 Map clarity** — name the two exits by destination, label the grouping checkboxes, arm the
  trace map on open, two-segment Satellite/Street control, search pick-list. **[UI] M.**
- **6.6 More-tab consolidation** — un-bury Personalize, move Clear-All next to Backup, split
  share-import onto its own card. **[UI] S–M.**

---

## Epic 7 — Privacy & security

- **7.1 App lock** — optional PIN/passphrase gate on launch. **[DATA] M.**
- **7.2 At-rest encryption** — **recommended against as specified.** It adds an unrecoverable
  loss mode to an app whose whole promise is that the data survives, against a thin threat
  model. Full reasoning, and the conditions under which it could ship, in
  [ADR-0003](docs/adr/0003-at-rest-encryption.md).

---

## Epic 8 — Performance & tech foundation

- **8.1 Bundle-split heavy libs** — dynamic-import `pdf-lib`; keep `pako`/`qrcode`/Leaflet out of
  first paint. **[UI/build] M.**
- **8.2 Scope live queries + memoize** — query by the `date`/`personId` indexes for the visible
  range instead of pulling whole tables. **[DATA] M.** *Do this before considering F0.4 — it is
  the likely real fix for Reports.*
- **8.3 Virtualize long lists.** **[UI] M.**
- **8.4 Compound indexes** — e.g. `calls [personId+date]`. **[DATA] S.**
- **8.5 Geocode cache** — cut calls and rate-limit risk; pairs with 1.5. **[DATA] S.**
- **8.6 Integration tests** — extend the `fake-indexeddb` harness (added in 0.17.1 for
  `records.ts`) to `exportBackup`'s stamping rules and the share round-trip. **[test] M.**
- **8.7 Service-worker update prompt.** **[UI] S.**

---

## Epic 9 — OS integration & extras

- **9.1 Live start/stop timer** — "heading out" → accrues → stop logs it. **[DATA] M.**
  *Promoted to Wave 2: it's the best product win for the tracking-first direction and is
  independent of nearly everything above.*
- **9.2 Calendar export (.ics)** — return visits into the phone's real calendar. **[DATA] S.**
- **9.3 Manifest app shortcuts + Web Share Target.** **[UI/manifest] S.**
- **9.4 Streaks / milestones** — gentle, no pressure. **[DATA] S–M.**
- **9.5 Partner/companion mode** — share a day's plan or territory via the existing P2P share.
  **[DATA] M.**
- **9.6 Do-not-call safety** — prominent DNC styling + a confirm when logging at a DNC address.
  **[UI] S.**

---

## The 1.0 line

The test: *would a first public release be **wrong**, rather than merely unfinished, without
this?* Six items passed it. Nothing else did. **All six have shipped.**

| Item | Source | Why it couldn't wait | Shipped |
|---|---|---|---|
| Ministry/Credit + migration, incl. the `'other'` copy fix | `REVIEW.md` §4, F-A6, ADR-0001 | Field ministry was being logged as capped Credit, by design of the copy. A release is a promise you can't quietly re-migrate later. | ✅ 0.20.0 |
| Fetch timeouts + abort (6 sites) | `REVIEW.md` F-C1 | The only remaining defect that left the app visibly stuck with no recovery — and it fires on exactly the flaky rural connection this app is used on. | ✅ 0.19.1 |
| Goal `NaN` guard in `timeStats.ts` | `REVIEW.md` F-C3 | A legacy or restored `weeklyHours` rendered every goal ring broken on both Schedule and Reports. | ✅ 0.19.1 |
| Share string + nested-array caps | `REVIEW.md` F-B5, AUDIT F033 | Closed the last hole in the app's only untrusted-input boundary, which is also the one surface a stranger can hand you. | ✅ 0.19.1 |
| Restore clears stale keys + checks `dbVersion` | `REVIEW.md` F-B6, AUDIT F032 | Restore is the whole safety net of a no-backend app; it should leave the device in a known state, not the union of two. | ✅ 0.19.1 |
| Doc reconciliation | AUDIT F031 | Three docs disagreed about what the app is. Cheapest item here, and the one that made the rest legible. | ✅ 0.19.1–0.20.0 |

**1.0 is unblocked.** What's left below is the next release's work. The remaining call is a
release decision (store listing, the accessibility question in F0.2b), not an engineering one.

**Everything else is post-1.0**, including the five remaining audit findings. F008 is
maintainability, not a defect; F009, F010, F017 and F018 are all real and none of them changes
what a user's data does. Epics 2–9 are the next release's features — calling them 1.0 blockers is
what kept this line undrawn.

**Waves after 1.0.**

- **Wave 2 — the felt wins.** Epic 2 (fast capture) + **9.1** (live timer) + 5.2/5.3 + 6.1, and
  the `REVIEW.md` §3 reframe.
- **Wave 3 — depth.** Epic 3, then Epic 4.
- **Wave 4 — system polish & perf.** Epic 6 (rest) + Epic 8. Measure Reports here; decide F0.4.
- **Wave 5 — privacy & delight.** Epic 7.1 + Epic 9. Then AUDIT F008.
