# Meleo — Domain Language

The vocabulary this project uses for the ministry domain. One meaning per term, used exactly
in code, UI copy, and docs. This is a glossary only — no implementation detail, no decisions.
Architectural decisions live in `docs/adr/`; findings live in `AUDIT.md`.

> **Where the code differs (as of 0.19.0).** The **Time** section below describes the *target*
> model, not the shipped one. `db.ts` still declares seven Time Categories and `categories.ts`
> still labels all seven; **Activity Note does not exist yet**. The change and its required
> migration are `REVIEW.md` §4, and the drift is tracked as AUDIT F031 — delete this note when
> that work lands. Everything outside the Time section describes the app as it is today.

---

## Time

*(Target model — see the note above.)*

**Time Log** — one recorded block of time: a date, a number of minutes, a Time Category, and
an optional Activity Note. The atomic unit of everything the Reports tab reports on.

**Time Category** — what kind of time a Time Log is. There are exactly two: **Ministry** and
**Credit**. The category is the only part of a Time Log that changes any calculation.

**Ministry** — field service. Counts toward the yearly goal **in full**, however many hours,
and is never reduced by the Credit Cap. Door-to-door, return visits, Bible studies, letter
writing, and cart/public witnessing are all Ministry.

**Credit** — time that is not field service but still counts toward the yearly goal: LDC, HLC,
Bethel, and qualifying convention/assembly time. Subject to the Credit Cap.

**Credit Cap** — 55 hours per month. Credit tops Ministry up to that combined ceiling; it can
never *reduce* what Ministry alone already earned. A month's raw total stays visible uncapped,
so hours that didn't count are still shown rather than hidden.

**Activity Note** — optional free text naming what a Time Log actually was ("LDC", "Cart
witnessing", "Circuit assembly"). Purely for the person's own records. It **never** affects
the Credit Cap, any total, or any goal, and it is **not** a reportable field — see Service
Report. Available on both Ministry and Credit logs.

> Why this is only a note: the congregation's Service Report has no field for it. A person
> submits their Credit hours as a single figure regardless of what earned them; anything
> descriptive goes in the report's remarks. So the type of credit is a personal annotation,
> not a dimension of the data model.

---

## Reporting

**Service Report** — the monthly figures submitted to the congregation. Distinct from the
Reports *tab*, which shows a person their own numbers. The Service Report carries Ministry
hours, Credit hours, whether the person shared in the ministry, and Bible studies — and
nothing that breaks Credit down by type.

**Service Year** — September 1 – August 31, labelled by the year it ends in (Sept 2025 – Aug
2026 is service year 2026). Nothing carries over between service years.

**Participation** — whether a person shared in the ministry at all in a given month. Reported
as a yes/no, independently of hours; a person with zero hours may still have participated.

---

## People and places

**Contact** — a person met in the ministry, with a Contact Status and a call history.

**Call** — one recorded interaction with a Contact, including a not-at-home attempt.

**Return Visit** — a scheduled follow-up with a Contact.

**Street** — one road being worked door-to-door, holding its house numbers, notes, and share
state. A street is a single record no matter where it is shown; a Territory that includes it
links to that same record rather than holding a second copy.

**House** — one address on a Street, identified by a free-form number ("123A") so it can be
sorted in walk order.

**Territory** — a hand-traced group of Streets. A **draft** territory is scratch work on the
Map; a **grouped** territory is durable and appears in the Ministry tab.

**Trace** — the hand-drawn line of points describing a Street's geometry, snapped to real
roads where possible.

---

## Planning

**Service Schedule** — the person's plan for when they intend to go out. Planning is optional
and never logs time by itself; a plan is a Scheduled Block until the person submits it.

**Scheduled Block** — one planned window on a day: a start, an end, and a Time Category.

**Minute Bank** — leftover minutes held aside rather than logged, which convert to a logged
hour once they reach 60.
