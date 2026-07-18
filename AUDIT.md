# Audit Register

A durable log of findings (bugs, hardening, tech-debt) and how each was closed — so audits
leave a checkable trail instead of living in chat history. Inspired by SavePoint's model.

**Rules**
- Each finding gets a stable id `F###`, never reused.
- A finding closes as **verified** only with *named proof*: a passing test, a commit that fixes
  it, or an explicit manual-verification note.
- **waived** = a deliberate decision to not fix (with the reason). The human owns waivers.
- **open** = known, not yet addressed.

**Severity:** critical · high · medium · low

| ID | Severity | Finding | Status | Proof / notes |
|----|----------|---------|--------|---------------|
| F001 | medium | Grouped territory streets drawn twice on the map; the second pass overwrote the done/not-done color | verified | Fixed in `1dd6240` — `sentStreets` excludes territory-backed entries via `entryId`. Manual map check. |
| F002 | medium | Two traces of the same road silently merged into one street entry | verified | Resolved by design in `5325993` — `ensureStreetEntry` reuses by `entryId` only + `uniqueStreetName` "(2)/(3)". Proof: `src/db.test.ts` |
| F003 | low | Streets-list territory badge can false-positive on a name collision (standalone street sharing a name with a territory street) | waived | Rare; `entryId` makes all new data collision-proof. Legacy name-fallback kept intentionally. Revisit only if it bites. |
| F004 | low | `scripture.ts` header comment claimed a space-form ("1 cor 13 4-7") normalizes, but a `chapter:verse` colon is required | verified | Fixed comment + locked behavior in `0b63717`. Proof: `src/scripture.test.ts` |
| F005 | medium | Share import (the one untrusted-input boundary) had no size caps or shape validation | verified | Hardened in `280cf5d` — encoded/file size caps, per-kind shape checks, list caps. Proof: `src/share.test.ts` |
| F006 | medium | TypeScript `strict` mode was off (null-safety not enforced) | verified | Enabled in `2f4814e`; compiles with 0 errors. Proof: `npm run build` green. |
| F007 | low | CI gated on test + typecheck but not lint | verified | `npm run lint` added to `deploy-pages.yml` in `2f4814e`. Proof: green CI run. |
| F008 | low | `Schedule.tsx` (~3k lines) and `Contacts.tsx` (~1.1k lines) are oversized; maintainability debt (not a bug) | open | Split into folders of focused files; extract pure logic into tested modules. |
| F009 | low | No Content-Security-Policy on the HTML shell | open | Optional defense-in-depth; limited by heavy inline `style={{}}` needing `'unsafe-inline'`. |
| F010 | low | No automated dependency-update mechanism | open | Consider enabling Dependabot. `npm audit` currently clean (0 vulns). |
| F011 | critical | Minute-bank quick-log wrote `timeLogs` only *after* ~1.1s of animation; a backgrounded/killed PWA in that window silently lost the logged time (and any rolled-over hour) while the bank had already decremented in localStorage | verified | Fixed in `d5c6624` — `bankQuickLogMinutes` now persists all DB rows then the bank *before* animating; animations are purely cosmetic. Gates green (`npm run build`/`lint`/`test`, 55/55). |
| F012 | high | Schedule-plan writes (`saveDayBlocks`, `removeDaySchedule`, `submitScheduledTime`/`Block`, `deleteScheduledBlock`, `clearDay`, `clearWeekSchedule`) spread a render-time `useLiveQuery` `prefs` snapshot; a second action before re-propagation could double-log time or resurrect/drop a scheduled block | verified | Fixed in `d5c6624` — all such writes route through `mutateSchedulePrefs`/a Dexie `rw` transaction that re-reads the prefs row and recomputes from the fresh copy. Gates green (`npm run build`/`lint`/`test`, 55/55). |
| F013 | high | Editing a contact and saving while a geocode fails (offline / rate-limited / unresolvable address) wiped an existing accurate coordinate to `undefined`, destroying the map pin | verified | Fixed in `bde3245` — `Contacts.commitSave` only overwrites `lat/lng` when the address is cleared or a geocode succeeds; a failed geocode keeps the existing coords. Gates green. |
| F014 | high | Per-keystroke read-modify-write on `StreetEntry.houses[]` built each write from the lagging `useLiveQuery` snapshot; concurrent house edits clobbered each other and fast note typing dropped characters | verified | Fixed in `bde3245` — `addHouses`/`updateHouse`/`removeHouse` re-read the row inside a Dexie `rw` transaction; the note field batches to local state and flushes on blur via `HouseNoteInput`. Gates green. |
