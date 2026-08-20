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

**Roll-call**:
Signing Members in and out of an event. Sign-ins made during an event cannot be
reversed; post-event sign-ins can.

**Locked option**:
A metadata select option that is derived from Org and so cannot be deleted —
the Campus field's Universities, the Role field's base roles. Admins may add
options below the locked set but not remove the locked ones. See
[ADR 0002](../adr/0002-campus-is-a-superset-of-university.md).

**Snapshot**:
A pre-computed metrics aggregate for one Sub-group and one trailing range,
keyed by staff year. Insights reads snapshots, never raw attendance.
_Avoid_: aggregate, cache, rollup

**Dirty**:
A Sub-group whose Snapshot is known stale because a roll-call or event changed.
A 15-minute cron rebuilds only these; a weekly cron rebuilds everything.

**Needs follow-up**:
The gentle, explainable list of Members whose attendance has dropped. A
prompt for a leader, never a judgement.
