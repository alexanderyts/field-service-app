# Changelog

Meleo uses semantic versioning — **MAJOR.MINOR.PATCH**:

- **MAJOR (`X.0.0`)** — the first public release, and any later breaking change. **Not yet reached**
  — the app is still pre-1.0, so all history below lives in `0.x`. `1.0.0` is reserved for the first
  "released / feature-complete" cut (see the note at the end).
- **MINOR (`0.X.0`)** — a new feature or capability.
- **PATCH (`0.0.X`)** — fixes, polish, refinements, and infrastructure.

**Current version: `0.16.0`.** History runs from the initial scaffold forward.

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

---

## Toward 1.0.0
The app is feature-rich, tested, hardened, and CI-gated. `1.0.0` is the natural next milestone —
cut it when you're ready to call the app "publicly released / feature-complete." From there, MINOR
adds features and PATCH ships fixes, exactly as above.
