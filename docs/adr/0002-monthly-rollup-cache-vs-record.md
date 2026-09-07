# ADR-0002 — A monthly rollup is a record, not a cache

- **Status:** accepted (do not build F0.4 as originally specified)
- **Date:** 2026-09-06
- **Supersedes:** the `PLAN.md` F0.4 "Monthly rollup cache table" item as written

## Context

`PLAN.md` F0.4 proposed a Dexie table holding per-month rollups of `timeLogs`, motivated by
Reports performance and by wanting month history to persist.

## Decision

Do not build it as specified. Two problems, either of which is disqualifying on its own.

**1. It conflates a cache with a record.** A cache is derivable and disposable — you must be
able to throw it away and rebuild it. A submitted Service Report is authoritative: it is what
the person actually handed to the congregation, and it may legitimately differ from what a
recomputation says today (a later-corrected log, a changed goal). Putting both in one table
means the cache can never be safely rebuilt, because rebuilding would overwrite the record.

If both are wanted, they are **two tables**. The record half is `PLAN.md` 4.2 and is worth
building on its own terms; the cache half needs a measurement first.

**2. The performance claim is unmeasured.** Summing a solo user's few thousand `timeLogs` rows
takes microseconds. The cost of the proposed fix is a Dexie migration — this codebase's riskiest
change type — plus a permanent cache-invalidation duty on the write paths that produced AUDIT
F011 and F012, the two most serious bugs the project has had.

If Reports is actually slow, the likelier cause is its six full-table `useLiveQuery` scans, which
`PLAN.md` Epic 8.2 fixes at a fraction of the risk.

## Consequences

- **Next step is a measurement**, not a build: profile Reports on a realistic dataset.
- Build only what the measurement justifies, and do Epic 8.2 first.
- `PLAN.md` 4.2 (persistent monthly report records) proceeds independently, as a record.
