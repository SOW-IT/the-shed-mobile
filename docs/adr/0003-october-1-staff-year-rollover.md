# The October 1 staff-year rollover contract

The staff year flips at Sydney midnight on October 1. That single instant
changes what `currentStaffYear()` returns for every query, cron and recompute in
the app, which makes it the highest-risk date in this codebase's calendar —
four releases in the 1.10.x line were rollover fixes.

The contract:

**The flip is derived, not stored.** `staffYearForDate` computes it; nothing
records "the year changed". Any behaviour that must survive the flip has to be
correct on both sides of it without a migration step.

**A cron prefills two years out.** `admin:rollOverStaffYear` runs at
`1 14 30 9 *` (Sep 30 14:01 UTC = Oct 1 00:01 Sydney), one minute after the
flip, so `currentStaffYear()` is already the new year. It copies the new current
year into the new *next* year — firing on 2026-10-01 copies 2027 into 2028 — so
admins configure the following year from a populated copy rather than a blank
one. It then emails a summary and schedules a full Insights recompute, because
snapshots are keyed by staff year and every one of them reads as "not ready" the
moment the clock moves.

**It is idempotent by record, not by guess.** `alreadyCopiedFrom` checks
`rolloverCopiedFrom` and `rolloverCompletedAt` on the destination year's
settings. A retry returns `{ skipped: true }` without mutating or re-emailing,
so it cannot clobber intentional next-year admin edits. `copyYear` with
`force: true` is the deliberate redo.

**The summary email is the only receipt.** It goes to `info@sow.org.au` and
reports every table copied — divisions, departments, universities, roles, staff
profiles, budget manager, director threshold. Universities matter here
specifically: they drive the `Campus` field's locked options, so a silent no-op
in that copy would surface to admins as options unlocking for no visible reason.

**Campus locks span two years, roles do not.** The `Campus` field's
`lockedValues` are the union of the previous and current staff years'
universities. Locking only the current year would unlock a campus the instant
the year flips, while every Member still sat on it — and a member is very
unlikely to leave their university on October 1. A campus absent for a full year
falls out of the union and becomes droppable then. `Role` deliberately does not
union: its locked set already has a static floor in `ROLES`, and a retired
per-year role name *should* be droppable, being an admin's vocabulary for that
year rather than a fact about a person.

## Consequences

Testing anything seasonal means holding data still and moving only the clock —
the pattern in `convex/rolloverInsights.test.ts`, which pins
`staffYearStartMs(2027)` and steps across it. Tests that call
`staffYearForDate(new Date())` inherit today's year and will not catch flip
bugs.

No dry-run procedure against restored production data exists. This was
considered and deliberately deferred; the risk it leaves is that the copy is
verified against test fixtures only, and the failures this codebase has actually
had were in the snapshot and composition layers rather than in the copy itself.
