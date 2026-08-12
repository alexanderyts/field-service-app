# Meleo — Comprehensive Improvement Plan

Everything proposed **after** `REVIEW.md`, reorganized into one prioritized roadmap: the
feature/optimization ideas, the UI-polish pass, the survey rework, and the per-tab UX review.

**Out of scope here (in `REVIEW.md`, referenced as dependencies):** minute-bank
persist-before-animate + transactional schedule writes, share/backup hardening, the
Ministry→Credit category change, the scheduling→tracking reframe, and the
`Schedule.tsx`/`Contacts.tsx` split (F008).

Legend — each task carries: **[UI]** UI-only · **[DATA]** needs data/logic/schema change ·
effort **S/M/L** · and dependencies where they matter.

Status markers: ✅ done · 🟡 partly done · ⚠️ challenged, see the note.

> **Status as of 0.17.0 (2026-08-12).** Phase 0 is largely complete; Epic 1.1 shipped. Two
> Phase-0 items are deliberately half-finished and are split below so the remainder isn't
> lost. Open findings from this work live in `AUDIT.md` (F013–F023), not here.
>
> **`REVIEW.md` is roughly 2 of 20 findings implemented, not "already implemented."** Only
> F-A1 and F-A2 have landed (as AUDIT F011/F012), plus F-B1/F-B2/F-B4 in 0.17.0. The two
> remaining `high`-severity ones are tracked as AUDIT F022 and F023 and should be cleared
> before new Epic-1 features — per this plan's own principle #1.

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
- **F0.2c 44px touch targets** 🟡 — `.icon-btn` (44×44) and `.tabbar button` (~49px) already
  comply. `.chip` is ~32px and can't grow without reflowing every tab or making wrapped rows'
  hit areas overlap. Needs a container-level rethink. *(AUDIT F017.)*
- **F0.3 Typed settings module** ✅ *(0.17.0)* — `src/settings.ts` owns theme, credit-hours and
  the new backup timestamp, with total getters; all 10 call sites swept. Notify and aux already
  had owning modules and were left with them. Two keys remain module-locals in `Schedule.tsx`
  (`_minute_bank`, `_participated_months`) — move them to an owner when next touched. Report
  recipient (4.5) and PIN (7.1) get added here when those features land.
- **F0.4 Monthly rollup cache table** ⚠️ **— do not build as specified.** Two problems:
  1. *It conflates a cache with a record.* A cache is derivable and disposable; a submitted
     Service Report is authoritative and must never be lost — and may legitimately differ from
     what a recomputation says today. Putting both in one table means the cache can never be
     safely rebuilt. If both are wanted, they are two tables.
  2. *The performance claim is unmeasured.* Summing a solo user's few thousand `timeLogs` rows
     takes microseconds. The cost is a Dexie migration (this codebase's riskiest change type)
     plus a permanent cache-invalidation duty on the write paths that just produced two
     critical bugs. If Reports is actually slow, the likelier cause is its six full-table
     `useLiveQuery` scans — which **Epic 8.2** fixes at a fraction of the risk.

  **Next step: measure Reports first.** Build only what the measurement justifies.

---

## Epic 1 — Data durability & trust *(highest priority)*

- **1.1 "Last backed up" signal + honest copy** ✅ *(0.17.0)* — "Last backup: 3 days ago" /
  "You've never backed up"; plain permanence copy. Recorded only at real completion points; a
  dismissed share sheet doesn't count. *(Download-path imprecision recorded as AUDIT F016.)*
- **1.2 Auto-backup** — periodic silent JSON snapshot to OPFS (or a prompted file save),
  rotating a few generations, with an overdue nudge. **[DATA] M.**
- **1.3 One-tap re-export via File System Access API** — remember a file handle so "Back up now"
  overwrites the same file. **[DATA] S–M.** *Bonus: this is the only export path that confirms
  a real write, so it closes AUDIT F016.*
- **1.4 Restore safety** — `formatVersion` gate on import (refuse newer-than-app) and rename
  "Restore from Backup" → "Restore (replaces current data)". **[DATA] S.** *(`REVIEW.md` F-B3,
  still open. Cheap; good candidate for the next session.)*
- **1.5 Offline geocode queue** — save the record immediately and queue the lookup for retry
  when back online. **[DATA] M.** *Depends on fetch timeouts (Epic 8) and overlaps AUDIT F022,
  which is the minimal version of the same problem.*

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

- **4.1 "What to submit this month" block** ⚠️ *dependency corrected* — lead card mapping to the
  real Service Report fields: Shared (yes/no), Studies, Ministry hours, Credit hours. **[DATA] M.**
  *This does **not** require 3.1 — a studies count is already derivable from Contact Status
  today. Decoupling it unblocks 4.1 from a large migration.*
- **4.2 Persistent monthly report records** — store each month's submitted figures so history is
  durable and next month can pre-fill. **[DATA] M.** *A record, not a cache — see F0.4.*
- **4.3 Auto-run + right-size the ceremony** — drop the fake 1s "Gathering…" gate; make
  `ServiceYearReview` far easier to reach. **[UI] S.**
- **4.4 Label "logged vs counts toward goal"** — shared inline legend so the 55h Credit Cap reads
  as a feature, not a rendering bug. **[UI] S.**
- **4.5 Remember the recipient + reliable send** — persist the email (F0.3), add copy-to-clipboard
  alongside `mailto:`. **[DATA] S.**
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
- **7.2 At-rest encryption** ⚠️ **— recommended against as specified.** Encrypting fields under a
  user PIN adds an *unrecoverable* loss mode to an app whose entire promise is that the data
  survives: forget the PIN and it's gone, with no server and no reset. It also complicates
  backup, restore and share at once. The threat model is thin — IndexedDB is already
  origin-isolated, and the realistic threat (someone picking up an unlocked phone) is what 7.1
  addresses. **If kept:** explicit opt-in, a printed recovery key, and UI that says plainly that
  losing it loses the data.

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
- **8.6 Integration tests** — `fake-indexeddb` around the write paths and the share round-trip.
  **[test] M.** *Would let `exportBackup`'s stamping rules and the import writes be tested
  directly rather than by inspection.*
- **8.7 Service-worker update prompt.** **[UI] S.**

---

## Epic 9 — OS integration & extras

- **9.1 Live start/stop timer** ⚠️ *resequenced* — "heading out" → accrues → stop logs it.
  **[DATA] M.** *This plan calls it "the best product win for the tracking-first direction" and
  then schedules it last. It's independent of nearly everything above — **move it to Wave 2**,
  alongside Epic 2.*
- **9.2 Calendar export (.ics)** — return visits into the phone's real calendar. **[DATA] S.**
- **9.3 Manifest app shortcuts + Web Share Target.** **[UI/manifest] S.**
- **9.4 Streaks / milestones** — gentle, no pressure. **[DATA] S–M.**
- **9.5 Partner/companion mode** — share a day's plan or territory via the existing P2P share.
  **[DATA] M.**
- **9.6 Do-not-call safety** — prominent DNC styling + a confirm when logging at a DNC address.
  **[UI] S.**

---

## Suggested sequencing

**Wave 0 — clear the open data-loss findings (next).** AUDIT F022 (geocode failure wipes a good
coordinate) and F023 (house edits clobber each other), plus **1.4** and `REVIEW.md` F-A5. All
small, all `high`-or-adjacent, and principle #1 says they come before new features.

**Wave 1 — durability & the category change.** The rest of Epic 1, and the Ministry→Credit
change (see `REVIEW.md` §4 — note the migration is *required*, not optional).

**Wave 2 — the felt wins.** Epic 2 (fast capture) + **9.1** (live timer) + 5.2/5.3 + 6.1.

**Wave 3 — depth.** Epic 3, then Epic 4. **4.1 no longer waits on 3.1.**

**Wave 4 — system polish & perf.** Epic 6 (rest) + Epic 8. Measure Reports here; decide F0.4.

**Wave 5 — privacy & delight.** Epic 7.1 + Epic 9.

> **No 1.0 line is drawn yet.** This plan is ~50 items with a dozen large ones and several Dexie
> migrations; `CLAUDE.md` reserves MAJOR for the first public release. Worth deciding *now*
> which items 1.0 actually requires, rather than discovering it at item 40.
