# The October 1 staff-year rollover contract

The staff year flips at Sydney midnight on October 1. That single instant
changes what `currentStaffYear()` returns for every query, cron and recompute in
the app, which makes it the highest-risk date in this codebase's calendar —
four releases in the 1.10.x line were rollover fixes.

The contract:

**The flip is derived, not stored.** `staffYearForDate` computes it; nothing
records "the year changed". Any behaviour that must survive the flip has to be
correct on both sides of it without a migration step.

**A cron prefills two years out, starting 21:00 Sydney on 30 Sep.** The pair is
always incoming → incoming+1, not `currentStaffYear() → nextStaffYear()`. On
the 2026-10-01 rollover that is 2027 into 2028, whether the job runs at 21:00
on the 30th or after the flip. Admins then configure next from a populated
copy rather than a blank one. Cron: `0 11 30 9 *` (11:00 UTC = 21:00 AEST;
midnight 1 Oct is always AEST). Three hours is slack for the copy plus the
Insights fan-out to *finish* before the flip. Cron name: `staff year prefill`.
Function: `prefillNextStaffYear`. `rollOverStaffYear` stays as an alias so old
runbooks still work. The clock is the rollover.

**The 21:00–midnight window.** Evening sign-ins must not leave the incoming
snapshot stuck at 21:00. From 21:00 until the flip, a dirty recompute updates
both the current year and the incoming year. After midnight the usual
current-year dirty cron is enough. Midnight Insights shows the 21:00 snapshot
immediately (ready, possibly missing a couple of evening sign-ins) and catches
up within 15 minutes if anything was dirty. Org edits to 2027 after 21:00 are
not copied into 2028. No second copy. 2028 is next, not live.

**Snapshots are identified by staff year.** The glossary already said so; the
table did not. Identity is (sub-group, range, collaborative, staff year), so
2026 and 2027 rows can sit together. The prefill writes Insights for the
incoming year during 30 Sep. At midnight the read switches year and the tab
is already populated. Skip still schedules that incoming-year recompute:
snapshots go stale because the *clock* moved, whether or not this year's copy
had already run.

**It is idempotent by record, not by guess.** `alreadyCopiedFrom` checks
`rolloverCopiedFrom` and `rolloverCompletedAt` on the destination year's
settings. The two callers then diverge deliberately: the prefill cron
(`prefillNextStaffYear`) returns `{ skipped: true }` without copying again or
re-emailing, because an unattended retry must be harmless; the manual
`copyYear` mutation *throws* a `ConvexError`, because a human who asked for a
copy that would be a no-op should be told rather than silently ignored.
`copyYear` with `force: true` is the deliberate redo. Neither can clobber
intentional next-year admin edits.

**The summary email is the only notice that the prefill ran.** It goes to
`info@sow.org.au` and `it@sow.org.au` as two independent sends rather than
one multi-recipient email: `emails.send` throws on a Resend error, so a
single bad address would otherwise suppress the summary for everyone. It
reports every table copied: divisions, departments, universities, roles, staff
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

**Auth grace lasts until the calendar year catches up.** From rollover until
Sydney midnight 1 Jan, someone with no current-year profile still acts as
Staff on last year's profile, with `year` equal to the current staff year.
Full powers: they can submit, approve, and use Admin. New Requests land in
the new year. On 1 Jan they become unprovisioned if they still have no
current-year row. This is not seven days.

**Receipt files are kept for two staff years.** After the flip, at 01:00
Sydney 1 Oct (`0 15 30 9 *`), delete stored files on Requests whose staff
year is previous-previous or older: `_creationTime < staffYearStartMs(currentStaffYear() - 1)`.
On 1 Oct 2026 that is everything through 30 Sep 2025. Current and previous
staff years are left alone. Not 365 days after `paidTime`. The job must run
*after* midnight so `currentStaffYear()` is already the new year. Attachment
records stay, flagged deleted. All files in those old years, paid or not.

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
