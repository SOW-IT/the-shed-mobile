# Attendance

Roll-call at SOW events, and the leader-facing metrics built from it. Ported
from *time-to-rollcall*. Reads staff identity and universities from
[Org](./org.md); writes neither.

## Language

**Member**:
A person in the attendance pool. May have no account and no `staffProfile` at
all — attendance-only members are the common case. Staff who attend events are
Members too, resolved by email.
_Avoid_: attendee, participant, person

**Staff email** / **Personal email**:
A staff person's member row carries their staff email, which links it to their
`staffProfile` and keys their sign-ins; their own email is kept beside it as a
personal email. The edit sheet shows the staff email (read-only) only for
someone who is staff in the year being viewed, and an editable Email for
everyone — for staff, that is the personal one. Merging a member into staff
keeps the member's email as the personal one.
_Avoid_: work email, org email (for the personal one)

**Staff leaver**:
Someone who was staff last staff year and isn't this year. At 01:30 Sydney on
October 1 (after the flip) each one becomes a plain Member: every sign-in under
their staff email moves onto their member row, the staff email comes off for
their personal email (empty if none was recorded), and a staff Role becomes
Member (a non-staff Role a leader set, such as Alumni, is kept). Their past
events then show them as a Member, not staff. Someone taken off staff later in
the year is converted by hand (`staffLeavers:convertOutgoingStaff`).
_Avoid_: alumni (leaving staff isn't graduating; leaders set the Alumni role
when someone graduates), ex-staff

**Sub-group**:
The partition Attendance slices by: that staff year's Universities, plus the
synthetic org-wide `"SOW"`. `"SOW"` is never the name of a real `universities`
row. Stored verbatim in an event's `subgroups`.
_Avoid_: group, campus (a Sub-group may be `"SOW"`, which is not a campus),
university (the set is strictly larger)

**Home campus**:
Which Campus a Member belongs to, held in the `Campus` metadata field. Because
Campus is a superset of University (see [Org](./org.md)), a Member's home
campus may be somewhere SOW runs nothing — they can still attend another
university's events.
_Avoid_: member campus, university

**Collaborative event**:
An event tagged with more than one Sub-group. It appears under each of them.

**Multi-day event**:
An event whose end falls on a later calendar day than its start, such as a
camp or conference. It is still one event with one attendance list: each
Member signs in once, and its sign-ins show the day as well as the time.
Insights and the staff year go by the day it starts.
_Avoid_: per-day attendance (there isn't any), series

**Merge**:
Folding a duplicate Member into the one who is kept: every attendance record
moves across, and an event both were signed in to becomes one record (earlier
sign-in time, both notes). Only a Member without a staff profile can be merged
away; a staff person (a staff profile in any year) is always the one kept and
keeps their Org-owned name, email, campus and role. Two staff can never be
merged, and a Member can't carry a staff email.
_Avoid_: combine, dedupe, delete (deleting throws the attendance away)

**Roll-call**:
Signing Members in and out of an event. Once an event has ended, sign-ins made
during it can only be reversed within 10 minutes of being made (the undo
grace); post-event sign-ins can always be reversed.

**Locked option**:
A metadata select option that is derived from Org and so cannot be deleted —
the Campus field's Universities, the Role field's base roles. Admins may add
options below the locked set but not remove the locked ones. See
[ADR 0002](../adr/0002-campus-is-a-superset-of-university.md).

**Snapshot**:
A pre-computed metrics aggregate for one Sub-group and one trailing range,
keyed by staff year. Current and incoming years may both have rows at once;
Insights reads the current year only, never raw attendance.
_Avoid_: aggregate, cache, rollup

**Nightly rebuild**:
The one cron that keeps Snapshots fresh: every night it recomputes every
Sub-group for the current staff year. A roll-call or event change is visible
in Insights the next morning. The October 1 prefill job also rebuilds the year
that has just ended so the incoming year's Snapshots start honest.
_Avoid_: dirty, dirty recompute (the old 15-minute mechanism, removed in 1.11)

**Needs follow-up**:
The gentle, explainable list of Members whose attendance has dropped. A
prompt for a leader, never a judgement.
