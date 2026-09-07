# ADR-0003 — At-rest encryption is not adopted

- **Status:** accepted (recommended against as specified)
- **Date:** 2026-09-06
- **Relates to:** `PLAN.md` 7.1 (app lock), 7.2 (at-rest encryption)

## Context

`PLAN.md` 7.2 proposed encrypting stored fields under a user-chosen PIN or passphrase.

## Decision

Do not adopt it as specified.

**It adds an unrecoverable loss mode to an app whose entire promise is that the data survives.**
There is no server and no reset: forget the PIN and the data is gone permanently. Meleo's stated
value is that a person's ministry history lives on their own device and outlasts everything —
encryption under a forgettable secret directly contradicts that.

**It complicates backup, restore and share simultaneously.** All three are the app's durability
story, and all three would need to negotiate key material.

**The threat model is thin.** IndexedDB is already origin-isolated; another site cannot read it.
The realistic threat is someone picking up an unlocked phone, and that is what 7.1 (app lock)
addresses at a fraction of the cost and with no loss mode.

## Consequences

- **7.1 (app lock) proceeds**; it covers the realistic threat.
- 7.2 stays unbuilt. **If it is ever revisited, three conditions are non-negotiable:** explicit
  opt-in (never a default or a nudge), a printed recovery key generated at setup, and UI that
  states plainly that losing the key loses the data.
