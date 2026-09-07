# Meleo — Code, Stability & Functionality Review

_Reviewed against the full `src/` tree, built and tested in a clean environment. Line numbers are
from the versions reviewed and have since drifted — use the symbol names._

> **Status (2026-09-06, v0.19.0). 9 of 20 findings closed, 1 waived, 10 open.**
> Closed: F-A1, F-A2 (0.16.1); F-B1, F-B2, F-B4 (0.17.0); F-A3, F-A4, F-A5, F-B3 (0.17.1, as
> AUDIT F022–F025 — each spot-checked in source on 2026-09-06). Waived: F-C7.
>
> Everything still open is low/medium hardening **except §4**, which is the only open item that
> writes wrong data in ordinary use. `AUDIT.md` is authoritative for finding status; this file is
> authoritative only for §3 and §4, the parts that still describe unbuilt work.

---

## 1. Executive summary

Meleo is a **mature, unusually well-disciplined codebase** for a solo project: TypeScript
`strict` is on and clean, there's a real test suite, a documented `CLAUDE.md`, and a running
audit register. The architecture (local-first Dexie + peer-to-peer sharing, no backend) is
coherent and the pure-math layer is careful and well-covered.

The genuine risks were never crashes — they were **silent data loss and lost-update races**,
which matter more here than almost anywhere because there is no server copy to fall back on.
They clustered in three places: the minute-bank write path, read-modify-write on JSON
array/map fields read from `useLiveQuery` snapshots, and the untrusted-input boundary. **All
three clusters are now closed.**

What remains is hardening plus one modelling error. The project is in a shippable state; §4 is
the thing to fix before calling it released.

---

## 2. Findings

### Closed — see `AUDIT.md` for named proof

| ID | Closed as | Summary |
|----|-----------|---------|
| F-A1 | F011 (`d5c6624`) | Minute-bank logged time persisted only *after* ~1.1s of animation |
| F-A2 | F012 (`d5c6624`) | Schedule writes spread a stale `useLiveQuery` prefs snapshot |
| F-A3 | F022 (`7f11c44`) | Geocode failure wiped an accurate coordinate |
| F-A4 | F023 (`2cf8732`) | Per-keystroke read-modify-write on `houses[]` |
| F-A5 | F025 (`03070ac`) | Four multi-table flows ran untransacted |
| F-B1 | F013 (`3217bce`) | Decompression bomb — inflate had no output cap |
| F-B2 | F014 (`3217bce`) | "id stripping" was compile-time only (`Omit<>` is erased) |
| F-B3 | F024 (`7f5273d`) | `importBackup` ignored its own `formatVersion` |
| F-B4 | F015 (`2f984ae`) | `getAuxConfig` spread parsed JSON over its defaults |

### A. Data loss & lost-update races

**F-A6 — low/medium — open.** Minute-bank category attribution is lossy: `redeemMinuteBank`
hard-codes `category: 'ministry'` regardless of what fed the bank, while the auto-roll-over uses
whatever category triggered it. Because credit vs. ministry drives the 55h cap, this can
misclassify time near the cap.
_Fix:_ bank **ministry minutes only** and log credit whole. **Settle as part of §4, not
separately** — it is the same modelling question.

### B. Untrusted-input hardening

**F-B5 — medium — open.** Element *counts* are capped (`MAX_LIST`); element *contents* are not.
No string in a payload is length-checked anywhere, and nested arrays
(`TerritoryStreet.points`, per-street `houses`) are unbounded for the same reason. Sharpened as
AUDIT F033.
_Fix:_ one `MAX_STR` plus a nested-length check in the per-kind validators in
`assertValidPayload`; extend `src/share.test.ts`.

**F-B6 — low — open.** Restore doesn't clear stale `fieldservice_*` keys, so leftovers mix with
the restored set — the device ends up as the union of two states rather than the backed-up one.
_Fix:_ clear every non-blocklisted `fieldservice_*` key before writing the file's settings.
Pairs naturally with AUDIT F032.

**F-B7 — low — open.** The v1→v2 `visits`→`calls` migration swallows errors
(`.catch(() => [])`), so a dropped-store race loses old visit history silently.

### C. Robustness / defensive gaps

**F-C1 — medium — open.** No client-side timeout or abort on *any* external fetch. Confirmed
2026-09-06: six `fetch(` sites in `src/` (`MapView.tsx`, `Contacts.tsx` ×2, `Territory.tsx`,
`auxSlip.ts`, `roadSnap.ts`) and **zero** occurrences of `AbortController`. Overpass's
`[timeout:20]` is server-side only; the socket can hang for minutes, and `finishStreet` leaves
the button stuck on "Matching to street…" with no recovery but closing the modal.
_Fix:_ an `AbortController` + timeout on every fetch; clear loading flags in `finally`.

**F-C2 — low/medium — open.** Double-submit windows: "Submit Time" stays live during the ~620ms
collect animation; `StreetEntryForm.save` has no `saving` guard and its dup-check can race.
(The contact form and call logger both already guard — copy that pattern.)

**F-C3 — low — open.** `effectiveMonthlyGoalMin` falls through to
`monthlyGoalFromWeekly(prefs.weeklyHours)` with no finite guard, so a restored or legacy
`weeklyHours` makes the goal `NaN` and renders broken rings on both Schedule and Reports.
_Fix:_ coerce with a `Number.isFinite` fallback **in `timeStats.ts`**, not at the three call
sites (`Schedule.tsx:1031`, `Schedule.tsx:1070`, `Reports.tsx:131`).

**F-C4 — low — open.** `dateOverrides` grows unbounded — an entry (often `[]`) per touched date,
never pruned, re-serialized into every update and every backup.

**F-C5 — low — open.** `emailReport` can exceed `mailto:` length limits for a big month.

**F-C6 — low — open.** Address autocomplete doesn't sequence overlapping responses → stale
suggestions.

**F-C7 — low — waived.** Streets-list territory badge over-matches by name. Already `AUDIT.md`
F003.

### D. Tracked in `AUDIT.md`

`F008` oversized `Schedule.tsx`/`Contacts.tsx` — the biggest maintainability lever.
`F009` no CSP. `F010` no automated dependency updates. `F017` `.chip` below 44px.
`F018` no focus trap in `ModalPortal`.

Added by the 2026-09-06 pass: `F031` `CONTEXT.md` documents a category model that doesn't exist ·
`F032` restore gates `formatVersion` but ignores `dbVersion` · `F033` no string-length caps in
share validation.

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

The write-path work this was gated behind has landed, so this is unblocked. It is still
post-1.0: it changes no data and fixes no defect.

---

## 4. Change plan — time types: **Ministry** and **Credit**

**The design.** Two categories: **Ministry** and **Credit**. A Credit log may optionally carry an
**Activity Note** naming what it was ("LDC", "Circuit assembly") — for the person's own records
only. The congregation's Service Report has no field for the type: Credit hours are submitted as
one figure regardless of what earned them, with anything descriptive going in the remarks. So the
type is a **personal annotation, not a dimension of the data model**. See `CONTEXT.md`.

**What stays free.** `isCredit(cat) = cat !== 'ministry'` already treats all six credit categories
identically for the 55h cap and every total. So the *arithmetic* needs no change at all — a new
`'credit'` category is `!== 'ministry'` and every cap/total keeps working untouched.

**A data migration IS required.** The mechanism is easy to miss:

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

**Plan:**

1. **Data:** add `'credit'` to `TimeCategory` and an optional non-indexed `activityNote?: string`
   to `TimeLog` (no `.version()` bump needed for a non-indexed field).
2. **Migration:** a one-time Dexie `.upgrade()` rewriting every non-ministry row to
   `category: 'credit'` with `activityNote` set to the old label ("LDC", "HLC", …). Lossless,
   because the label was only ever a label.
3. **UI:** two pills. Selecting **Credit** reveals an optional type control — quick-picks plus free
   text — reusing the reveal mechanic already built for `'other'`.
4. **Toggle:** `fieldservice_credit_hours` keeps its meaning — off = Ministry only, on = Ministry +
   Credit.
5. **F-A6:** bank **ministry minutes only** and log credit whole, which removes the
   misattribution near the cap.
6. **Test:** assert a legacy row still renders after migration, and assert the migration does not
   move any month's applied total. Those are the two regressions this section exists to prevent.
7. **Docs:** `CONTEXT.md`'s Time section becomes true on landing (AUDIT F031); update `CLAUDE.md`'s
   `TimeCategory` union and the `categories.ts` entry in the same commit, per the definition of
   done.

**What `'other'` becomes.** Today `'other'` is offered *even when credit hours are turned off*, its
prompt reads **"Type of ministry"** with the examples *"Letter writing, Cart witnessing"*
(`Schedule.tsx:2480–2481`) — and yet `isCredit('other')` is **true**, so it counts as credit
against the 55h cap. Letter writing and cart witnessing are field ministry, so the control has
always promised one thing and done another.

**Decision: Ministry stays Ministry; everything else, `'other'` included, migrates to Credit** —
see [ADR-0001](docs/adr/0001-legacy-other-time-migrates-to-credit.md). This keeps every historical
figure identical to what was already submitted to the congregation, which matters more than the
label being retroactively right.

**The `'other'` prompt copy must change in the same work.** Leaving "Type of ministry" with
ministry examples on a control that produces Credit is the original defect; migrating without
fixing it preserves the trap for new entries. Going forward, letter writing and cart witnessing
are logged as **Ministry** with an Activity Note.

---

## 5. Sequencing

1. ✅ **Done.** Write path (F-A1, F-A2), untrusted input (F-B1/B2/B4), both remaining `high`
   findings (F-A3, F-A4), plus F-A5 and F-B3 — all landed by 0.17.1.
2. **⬅ Next: the 1.0 line** (see `PLAN.md`). §4 with its migration and the `'other'` copy fix
   (resolving F-A6), F-C1, F-C3, F-B5 + AUDIT F033, F-B6 + AUDIT F032, and the doc
   reconciliation (AUDIT F031).
3. **Post-1.0.** The §3 reframe, F-C2, F-C4, F-C5, F-C6, F-B7, then AUDIT F008 — which pays for
   itself across all of it.
