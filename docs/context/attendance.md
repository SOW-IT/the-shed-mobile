# Attendance

Roll-call at SOW events, and the leader-facing metrics built from it. Ported
from *time-to-rollcall*. Reads staff identity and universities from
[Org](./org.md); writes neither.

## Language

**Member**:
A person in the attendance pool, with one `attendanceMembers` row for good.
May have no account and no `staffProfile` at all: attendance-only members are
the common case. Every sign-in points at a Member (`attendance.memberId`),
staff included.
_Avoid_: attendee, participant, person

**Staff on top**:
Staff is a layer over a Member, one year at a time. Each year's
`staffProfile` points at its person's member row (`staffProfiles.memberId`),
and someone is staff in a staff year when that year's profile has at least one
assignment. In those years their name, Campus and Role come from the profile;
in every other year they read as the plain Member underneath, with that row's
own Campus and Role. A profile with no assignments doesn't make anyone staff.
While someone is staff this staff year, the edit sheet keeps their row's own
Campus and Role as they are and offers no Delete, even when opened from an
event in another year. When their profile has no name, the row's own name
stands in; the edit sheet asks for one if neither has it, and an email is
never used as a name.
_Avoid_: overlay, shadow row

**Staff email** / **Personal email**:
The staff email lives only on the `staffProfile`. A member row's `email` is
always the person's own. The edit sheet shows the staff email (read-only) for
someone who is staff in the year being viewed, and labels their own email
Personal email. A Member's own email can't be an SOW address (@sow.org.au,
@sowaustralia.com) or anyone's staff email from any year.
_Avoid_: work email, org email (for the personal one)

**Getting a member row**:
Someone assigned for the current staff year in Admin gets their member row
straight away: the one an earlier profile of theirs already points at, or a
new one. Someone assigned for next year waits for October 1, unless an
earlier profile already points at their row or an admin links them on Admin →
Merges first. Signing in a staffer who somehow has no row creates or links it.
_Avoid_: ensure, shadow

**Staff leaver**:
Someone who was staff last staff year and isn't this year. Nothing moves when
they leave: their member row and every sign-in stay as they are, and from the
new year they read as that plain Member. At 01:30 Sydney on October 1 (and
when an admin removes this year's profile) their row's empty Campus is filled
from their last staff role and an empty Role becomes Member, and a
`member.leftStaff` entry goes in the audit log. A Role a leader set, such as
Alumni, is kept.
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
Folding two records for one person into one. When the staff person being kept
has no member row yet, the Member simply becomes theirs: their profile is
linked to it and nothing moves. Otherwise the row with more events attended
survives (the older one on a tie), every sign-in moves onto it, an event both
were signed in to becomes one record (earlier sign-in time, both notes), and
every profile that pointed at the other row points at the survivor. The
survivor keeps the kept person's name and church (taking the other row's
church only where the kept person has none). Someone who is staff in the year
being viewed can't be merged away, and two people who were both staff in the
same year can't be merged.
_Avoid_: combine, dedupe, delete (deleting throws the attendance away)

**Suggested merge**:
A staff person in the current or next staff year who looks like a Member not
yet linked to anyone's profile: a similar name (same, spaced or ordered
differently, an added middle name, or a shortened first name) and no different
campus. Admin → Merges lists them while there are any; Merge opens the usual
merge review, and "Not the same" stops that pair being suggested. Linking next
year's staff here before October 1 keeps their history on one row.

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
A pre-computed metrics aggregate for the SOW Sub-group and one trailing
range, keyed by staff year. Current and incoming years may both have rows at
once; Insights reads the current year only, never raw attendance. Campuses
have no Snapshots since 2.5.0: their view comes from their Weeklies.
_Avoid_: aggregate, cache, rollup

**Nightly rebuild**:
The crons that keep Insights fresh. SOW's Snapshots are recomputed every
night; each campus's weeklies view redoes only what the attendance change
log says changed since the night before (often nothing). A roll-call or event
change is visible in Insights the next morning. The October 1 prefill job also
rebuilds the year that has just ended so the incoming year's Snapshots start
honest.
_Avoid_: dirty, dirty recompute (the old 15-minute mechanism, removed in 1.11)

**Weekly** (held weekly):
A campus's weekly meeting: an event with a Term and week (its `weekly` mark,
shown with the *Weeklies* tag). Its name is the week code, "T3W5" or "S2W5",
and labels like BAM or PPN are Weeklies tags. It counts as held only if someone signed in
to it, so a cancelled week isn't a missed week. A weekly shared with other
campuses (a Mega or combined weekly) isn't any campus's weekly in Insights.
_Avoid_: meeting, event (for this)

**Term**:
A run of a campus's held Weeklies, worked out from the dates rather than
entered: a gap of 18 days or more ends a run, and the run is named by the
month it starts in (UNSW: T1 Jan–May, T2 Jun–Aug, T3 Sep–Dec; other
campuses run **Semesters**, Sem 1 Jan–Jun and Sem 2 Jul–Dec). Runs with the
same name are one term. Years here are calendar years, not staff years.
_Avoid_: semester (for UNSW), staff year (for this)

**Regular** / **Irregular**:
For one Term: a Regular came to half or more of its held Weeklies (counting
last term's too until four have been held); an Irregular is anyone else
listed. The half is a setting.
_Avoid_: member (Member means anyone in the attendance pool), active,
inactive

**Newcomer**:
Someone whose first-ever Weekly at this campus was this Term. They stay a
newcomer for the term unless they've come four or more times at the Regular
share, when they count as Regular.
_Avoid_: new member, first-timer

**Visitor**:
Someone whose Home campus is another campus and who has come to fewer than
two of this campus's Weeklies this Term. With more, they're judged as
Regular, Irregular or Newcomer like anyone else, but listed under other
campuses.
_Avoid_: guest (that's a non-student, see [Org](./org.md)), other campus
(for the person)

**Needs follow-up**:
The gentle, explainable list for the current Term: people who were coming
(Regular, judged on the Weeklies before) but missed the last two, then
Newcomers who missed the last one while their visit is recent. Visitors have
their own list. A prompt for a leader, never a judgement.

**TWIG** / **PPN** (SOW Insights):
A TWIG is an event with the Other-events TWIG tag and no PPN tag; a PPN here
is one with both (the SOW monthly night). SOW Insights counts only Held ones
and lists the rest as No roll taken. See [sow-insights.md](../sow-insights.md).
_Avoid_: TWIG PPN for a campus PPN (that has the PPN tag alone)

**Campus leader** / **Organiser**:
For a staff year, a campus leader has a staff profile with a university role
(Student Leader, President, Vice President, Executive); an organiser has a
profile with at least one assignment, none of them a university role. A
profile with no assignments isn't staff (see Staff on top), so TWIG Insights
lists that person as having no staff profile. TWIG Insights counts only
campus leaders. The Churches page filter calls organisers **Staff**, next to
**Campus leaders** and **Members** (not staff that year, as in Staff on top:
no profile, or one with no assignments), shown only to staff and campus
leaders.
_Avoid_: leader (ambiguous with the weekly Leader category)

**Sign-in tag**:
The Newcomer or Visitor label beside a name on an event's sign-in screen
while the event is on, taken from last night's Insights build, so a leader
can welcome them. Only those two categories are shown there.
_Avoid_: badge (that's the campus pill)
