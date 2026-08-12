# Legacy "Other" time migrates to Credit, not Ministry

**Status:** accepted

When the seven time categories collapse to **Ministry** and **Credit**, every non-ministry
category migrates to Credit — including `other`. The rule is deliberately blunt: Ministry stays
Ministry, everything else becomes Credit.

This is worth recording because `other` is the one category where the blunt rule is arguably
wrong. Its prompt read **"Type of ministry"** and offered *"Letter writing, Cart witnessing"* as
examples — both of which are field ministry, and `CONTEXT.md` defines them as Ministry. It was
also offered even when credit hours were switched off, so every user saw it. But `isCredit()`
has always returned true for `other`, so that time has always counted as Credit against the 55h
cap, and has always been submitted to the congregation in the Credit column.

## Considered options

**Migrate `other` to Ministry** — matches what the label promised, and makes the stored history
match the domain definition. Rejected: in any month where Ministry + Credit exceeded 55h, the
cap was binding, so reclassifying would *raise* that month's applied total. The app would then
disagree with a Service Report the person had already submitted to their congregation. Silently
rewriting figures someone has already reported is a worse failure than an imprecise label.

**Migrate `other` to Credit** — chosen. Every historical figure stays byte-identical to what it
is today and to what was submitted. The cost is that any letter-writing or cart-witnessing time
logged under `other` remains labelled Credit in the person's own history.

## Consequences

- No month's applied total, yearly progress, or service-year figure changes as a result of the
  migration. That is the point of choosing it, and is worth asserting in a test.
- `CONTEXT.md` still (correctly) defines letter writing and cart witnessing as **Ministry**. This
  ADR is a knowing exception for *historical* rows only — going forward that time is logged as
  Ministry with an Activity Note.
- The `other` prompt's copy must change as part of the same work. Leaving "Type of ministry" with
  ministry examples on a control that produces Credit is the original defect, and migrating
  without fixing it would preserve the trap for new entries.
