# Meleo — Code, Stability & Functionality Review

_Reviewed: the full `src/` tree, built and tested in a clean environment. Line numbers are from
the versions reviewed and have since drifted — use the symbol names._

> **Implementation status (2026-08-12, v0.17.0).** This review is **not** fully implemented.
> Five findings have landed: F-A1 and F-A2 (as AUDIT F011/F012, in 0.16.1), and F-B1, F-B2, F-B4
> (as AUDIT F013/F014/F015, in 0.17.0). Everything else below is **open**. The two remaining
> `high`-severity ones are now tracked as **AUDIT F022** (F-A3) and **AUDIT F023** (F-A4) and are
> the recommended next work. Each finding is marked ✅ / ⬜ below.
>
> **§4 (Ministry/Credit) has been corrected** — the original said no data migration was required.
> That is wrong for anything the user can see. See the section for the mechanism.

---

## 1. Executive summary

Meleo is a **mature, unusually well-disciplined codebase** for a solo project: TypeScript
`strict` is on and clean, there's a real test suite, a documented `CLAUDE.md`, and a running
audit register. The architecture (local-first Dexie + peer-to-peer sharing, no backend) is
coherent and the pure-math layer is careful and well-covered.

The genuine risks are **not** crashes — they're **silent data loss and lost-update races**, which
matter more here than almost anywhere because there is no server copy to fall back on. They
cluster in three places: (1) the minute-bank write path, (2) read-modify-write on JSON
array/map fields read from `useLiveQuery` snapshots, and (3) the untrusted-input boundaries.

The project is in a genuinely shippable state. Everything below is hardening, not "it's broken."

---

## 2. Findings, ranked

### A. Data loss & lost-update races

**F-A1 — critical — ✅ fixed (AUDIT F011, `d5c6624`).** Logged time was written to the DB only
*after* ~1.1s of animation, while the minute bank had already decremented in localStorage. A
backgrounded/killed PWA in that window silently lost the time. `bankQuickLogMinutes` now persists
all rows and the bank **before** animating.

**F-A2 — high — ✅ fixed (AUDIT F012, `d5c6624`).** Every `dateOverrides`/`daySchedule` mutation
spread the `prefs` captured in the current render closure, so a second action before
`useLiveQuery` re-propagated could double-log time or resurrect a submitted block. All such
writes now route through `mutateSchedulePrefs`, which re-reads the row inside a transaction.

**F-A3 — high — ⬜ open (AUDIT F022).** Editing a contact wipes an accurate coordinate when
geocoding fails. Any address-field edit clears `coords`; on save, if there's an address but
Nominatim returns null (offline, rate-limited, or a rural address OSM can't resolve), the update
writes `lat/lng: undefined`, destroying a good GPS/autocomplete pin.
*Note: the "address cleared" case has since been handled, which makes this look fixed. It isn't —
the geocode-failure path still wipes.*
_Fix:_ only overwrite coords when a geocode actually succeeds; otherwise keep the existing pin.

**F-A4 — high — ⬜ open (AUDIT F023).** Per-keystroke read-modify-write on `houses[]`.
`updateHouse` fires on every keystroke and rebuilds `entry.houses` from the `useLiveQuery`
snapshot, as do `removeHouse` and status changes. Two edits inside one query round-trip both read
the same stale array; the second overwrites the first.
_Fix:_ same pattern as F-A2 — mutate inside a transaction that re-reads the row; debounce the note
input and flush on blur.

**F-A5 — medium — ⬜ open.** Several multi-step flows aren't transactional. `confirmGroup` creates
backing entries *outside* the transaction (duplicates on retry); `sendStreetToMinistry` adds then
removes in two separate awaits (both copies exist if interrupted); `bulkDeletePeople` deletes
person/calls/appointments in a sequential loop with no transaction (orphans), unlike the correctly
transactional single delete. `completeTerritory` writes a completion then deletes the territory,
untransacted — and that completion is the sole source of the Reports figure.
_Fix:_ wrap each flow in one `db.transaction('rw', …)` and rebuild arrays from an in-transaction read.

**F-A6 — low/medium — ⬜ open.** Minute-bank category attribution is lossy: `redeemMinuteBank`
hard-codes `category: 'ministry'` regardless of what fed the bank, while the auto-roll-over uses
whatever category triggered it. Because credit vs. ministry drives the 55h cap, this can
misclassify time near the cap.
_Fix:_ simplest correct behaviour is to bank **ministry minutes only** and log credit whole. Settle
alongside §4.

### B. Untrusted-input hardening

**F-B1 — high — ✅ fixed (AUDIT F013, `3217bce`).** Decompression bomb: the inflate step had no
output cap, so a crafted payload under the 256 KB encoded cap could inflate to hundreds of MB.
Now a streaming inflate aborts past 4 MB. Proof: a real deflate bomb in `src/share.test.ts`.

**F-B2 — high — ✅ fixed (AUDIT F014, `3217bce`).** "id stripping" was compile-time only —
`Omit<Person,'id'>` is erased at runtime, so a crafted payload could inject a primary key.
`stripInjectedKeys` now removes every importer-assigned field before each write.

**F-B3 — medium — ⬜ open.** `importBackup` ignores its own `formatVersion`/`dbVersion`. A backup
from a *newer* build imported into an older one silently clears real tables and inserts
incompatible rows. _Fix:_ refuse, with a friendly message, when the backup is newer than the app
can handle. *(Scheduled as PLAN 1.4.)*

**F-B4 — medium — ✅ fixed (AUDIT F015, `2f984ae`).** `getAuxConfig` spread parsed JSON over the
defaults, so `{"months":null}` produced `months: null` and threw a `TypeError` out of both
Schedule and Reports. `normalizeAuxConfig` now coerces each field independently.

**F-B5 — medium — ⬜ open.** Nested arrays are unbounded despite `MAX_LIST`: element *count* is
capped but not element contents, so each `TerritoryStreet.points` array is unbounded. _Fix:_ bound
points-per-street and houses-per-street too.

**F-B6 — low — ⬜ open.** Restore doesn't clear stale `fieldservice_*` keys, so leftovers mix with
the restored set.

**F-B7 — low — ⬜ open.** The v1→v2 `visits`→`calls` migration swallows errors (`.catch(() => [])`),
so a dropped-store race loses old visit history silently.

### C. Robustness / defensive gaps

**F-C1 — medium — ⬜ open.** No client-side timeout or abort on *any* external fetch. Overpass's
`[timeout:20]` is server-side only; the socket can hang for minutes, and `finishStreet` leaves the
button stuck on "Matching to street…" with no recovery but closing the modal. _Fix:_ an
`AbortController` + timeout on every fetch; clear loading flags in `finally`.

**F-C2 — low/medium — ⬜ open.** Double-submit windows: "Submit Time" stays live during the ~620ms
collect animation; `StreetEntryForm.save` has no `saving` guard and its dup-check can race.

**F-C3 — low — ⬜ open.** `NaN` propagation: `effectiveMonthlyGoalMin` has no guard if a
restored/legacy `weeklyHours` is `undefined`/`NaN` — the goal becomes `NaN` and renders as broken
rings. _Fix:_ coerce with a `Number.isFinite` fallback.

**F-C4 — low — ⬜ open.** `dateOverrides` grows unbounded — an entry (often `[]`) per touched date,
never pruned, re-serialized into every update and every backup.

**F-C5 — low — ⬜ open.** `emailReport` can exceed `mailto:` length limits for a big month.

**F-C6 — low — ⬜ open.** Address autocomplete doesn't sequence overlapping responses → stale
suggestions.

**F-C7 — low — ⬜ waived.** Streets-list territory badge over-matches by name. Already
`AUDIT.md` F003.

### D. Already tracked in AUDIT.md

`F008` oversized `Schedule.tsx`/`Contacts.tsx` — the single biggest maintainability lever.
`F009` no CSP. `F010` no automated dependency updates.

---

## 3. Change plan — from "scheduling-first" to "time-tracking-first"

**Today** the Schedule tab leads with the Service Schedule planner and repeatedly frames the gap
between what you've *planned* and your goal ("… more to schedule"). The survey pushes everyone
toward building a weekly schedule.

**Recommended reframe (safe, incremental, no data changes):**

1. **Make logged time the hero** — reorder so actually-logged progress sits at the top and the
   planner collapses below it. Pure JSX + CSS.
2. **Neutralize the "not yet scheduled" nudges** — the two "… more to schedule" strings. Keep the
   goal-*progress* copy; that's tracking, not nagging.
3. **Make scheduling opt-in** — lead the day menu with "Add Service Time" (logging) and demote
   "Add Scheduled Service Time". Let the survey offer "I just want to track my time".
4. **Keep the planner fully functional** — nothing removed, re-weighted.

Do this **after** the write-path work, so the UI is reordered over solid foundations.

---

## 4. Change plan — time types: **Ministry** and **Credit** *(corrected)*

**The design.** Two categories: **Ministry** and **Credit**. A Credit log may optionally carry an
**Activity Note** naming what it was ("LDC", "Circuit assembly") — for the person's own records
only. The congregation's Service Report has no field for the type: Credit hours are submitted as
one figure regardless of what earned them, with anything descriptive going in the remarks. So the
type is a **personal annotation, not a dimension of the data model**. See `CONTEXT.md`.

**What stays free.** `isCredit(cat) = cat !== 'ministry'` already treats all six credit categories
identically for the 55h cap and every total. So the *arithmetic* needs no change at all — a new
`'credit'` category is `!== 'ministry'` and every cap/total keeps working untouched.

**⚠️ Correction: a data migration IS required.** The original review said old rows could simply be
mapped at display time and that a migration was optional tidying. That's wrong, and the mechanism
is easy to miss:

```
CATEGORY_ORDER = Object.keys(CATEGORY_LABELS)     // categories.ts
```

`CATEGORY_ORDER` isn't just a label list — it's what the display code **iterates**. Shrink it to
two entries and:

- `daySegments` (`goalSegments.ts`) loops it to build every goal ring, so a historical `ldc` row is
  **never visited and silently vanishes from the ring**
- the week legend, the calendar's predominant-category, and the month scans do the same
- `CATEGORY_LABELS['ldc']` becomes `undefined` → blank text in Recent Entries and Reports
- `EditLogModal`'s `<select>` has no matching option → blank, and saving silently reassigns

Net effect: a user with a year of LDC hours opens the app and finds them **missing from their
rings and legends while still counted in the totals** — which reads as data loss. The one-time
`.upgrade()` migration is therefore the *safer* path, not optional.

**Recommended plan:**

1. **Data:** add `'credit'` to `TimeCategory` and an optional non-indexed `activityNote?: string`
   to `TimeLog` (no `.version()` bump needed for a non-indexed field).
2. **Migration:** a one-time Dexie `.upgrade()` rewriting every non-ministry row to
   `category: 'credit'` with `activityNote` set to the old label ("LDC", "HLC", …). Lossless,
   because the label was only ever a label.
3. **UI:** two pills. Selecting **Credit** reveals an optional type control — quick-picks plus free
   text — reusing the reveal mechanic already built for `'other'`.
4. **Toggle:** `fieldservice_credit_hours` keeps its meaning — off = Ministry only, on = Ministry +
   Credit.
5. **Test:** assert a legacy row still renders after migration. That's the regression this
   correction exists to prevent.

**✅ Resolved — what `'other'` becomes.** Today `'other'` is offered *even when credit hours are
turned off*, its prompt reads **"Type of ministry"** with the examples *"Letter writing, Cart
witnessing"* — and yet `isCredit('other')` is **true**, so it counts as credit against the 55h cap.
Letter writing and cart witnessing are field ministry, so the control has always promised one
thing and done another.

**Decision: Ministry stays Ministry; everything else, `'other'` included, migrates to Credit** —
see [ADR-0001](docs/adr/0001-legacy-other-time-migrates-to-credit.md). This keeps every historical
figure identical to what was already submitted to the congregation, which matters more than the
label being retroactively right. Assert it with a test: the migration must not move any month's
applied total.

**The `'other'` prompt copy must change in the same work.** Leaving "Type of ministry" with
ministry examples on a control that produces Credit is the original defect; migrating without
fixing it preserves the trap for new entries. Going forward, letter writing and cart witnessing
are logged as **Ministry** with an Activity Note.

**F-A6 ties in here:** cleanest is to bank **ministry minutes only** and log credit whole, which
removes the misattribution near the cap.

---

## 5. Suggested sequencing

1. ✅ Harden the write path — F-A1, F-A2.
2. ✅ Untrusted input — F-B1, F-B2, F-B4.
3. **⬅ next:** clear the remaining `high` findings — F-A3 (AUDIT F022) and F-A4 (AUDIT F023), plus
   F-B3 (PLAN 1.4) and F-A5.
4. Ship the Ministry/Credit change **with its migration**, resolving F-A6 and the `'other'` question.
5. Reframe scheduling → tracking (§3).
6. Robustness pass — F-C1 fetch timeouts, F-C2 double-submit guards, F-C3 NaN guard.
7. Then the `AUDIT.md` F008 split — it pays for itself across all of the above.
