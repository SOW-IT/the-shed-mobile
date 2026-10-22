# Org

Who works for SOW, in what role, in which year. The shared kernel: both
Reimbursements and Attendance read this context, and neither owns it.

## Language

**Staff year**:
The year SOW plans and staffs against. It runs October 1 to September 30, so it
is ahead of the calendar year for the last quarter. On 2026-10-01 the staff
year is already 2027. Every role, department and university is stored against
one.
_Avoid_: year (unqualified), financial year, school year

**Next staff year**:
The staff year after the current one. Admins may edit current and next only.
On 1 Oct 2026, current becomes 2027 and next becomes 2028.

**Rollover**:
The instant the staff year advances: Sydney midnight on 1 Oct. Derived from the
clock, not stored, and not a job. After that instant every query that asks
"what year is it?" has already moved.
_Avoid_: using this word for the copy or the cron

**Prefill**:
The annual copy of the incoming staff year into the year after it, so next is
already populated when the clock rolls over. On the 2026-10-01 rollover that
copy is 2027 into 2028. The clock is the rollover; this job is not.
_Avoid_: rollover (for this copy)

**Incoming staff year**:
The staff year that begins at this 1 Oct. On 30 Sep 2026 and on 1 Oct 2026 it
is 2027. The prefill copies this year into the one after it.

**Auth grace**:
The stretch after rollover while the calendar year has not yet caught up to
the staff year: Sydney midnight 1 Oct until Sydney midnight 1 Jan. A person
with no current-year profile may still act as Staff using last year's
profile. `year` stays the current staff year, so new Requests land in the
new year. Once the calendar year matches, they are unprovisioned.
_Avoid_: grace period, rollover window (those could mean the 21:00 copy)

**Staff**:
A person with a `staffProfile` for a given staff year. Someone can be staff in
2026 and not in 2027; "is staff" is never a standing fact, always a fact about
a year.
_Avoid_: employee, worker, team member

**Years served**:
For someone serving in a staff year (a `staffProfile` that year with a staff
or student leader role), how many staff years they've served up to and
including it, in any role; later years never count. Insights → General
averages it over everyone serving that year, and splits staff from student
leaders by their role in that year only.
_Avoid_: tenure (for the per-role count it used to be), years as staff

**Previously staff**:
On Admin → Users, a person who has a `staffProfile` in an earlier year but not
the year being edited, and who is in the Workspace directory or has signed in.
Assigning them for the viewed year creates that year's profile and links it to
the earlier one by email, including the sow.org.au / sowaustralia.com pair.
_Avoid_: rehire, returning employee, alumni

**Local church**:
The church someone goes to, from the shared list of churches (each with where
it meets and its service times): a staff member picks theirs in their
Profile; a plain member's is set in Edit member. Any staff member can add a
church or fill in a missing detail. The Churches page lists who goes where:
a staff member's church is there for anyone to see, a member's only for staff
and campus leaders.
_Avoid_: home church (ambiguous with a campus), church (alone, for SOW itself)

**Guest**:
A signed-in account that is not Staff — someone who signed in with Apple
rather than an `@sow.org.au` Google account (personal Google sign-in was
removed in 2.4.7; guests who used it before keep their account but can't
sign in with it again). A guest has an account and no profile. Guest is no
longer a Role (2.9.9): a non-student at events, such as a parent or a church
guest, is a hand-set Visitor.
Deleting a guest's account removes everything it had; deleting a staff
member's account removes only the sign-in, and their profiles stay.
_Avoid_: visitor (in Attendance that's someone from another campus), public
user, non-staff

**Assignment**:
A staff member's role plus its scope for one year — a department, a division or
a university, depending on which the role requires.

## Structure

**Division**:
The top level of the org structure. Contains departments.

**Department**:
A team within a division. Most staff belong to one.

**Campus**:
Any university a member may belong to, including universities where SOW runs
nothing. The superset.
_Avoid_: uni, school

**University**:
A Campus where SOW has activities and affiliations. **Every University is a
Campus; not every Campus is a University** — the campus list always contains
all of them and may carry extras. Student Leaders belong to a University rather
than a department. Stored in the `universities` table.
_Avoid_: affiliated campus, SOW campus, partner university

**Campus role**:
A role held at a University: Student Leader, President, Vice President,
Executive.

## Roles

**Head of Department**:
The approver for their department's requests.
_Avoid_: HOD (in prose), department lead, manager

**Head of Division**:
Belongs directly to a division rather than a department, with no Head of
Department above them.

**Director**:
Approves requests at or above the director threshold. At most one per year.

**Admin**:
Not a role — a derived permission. The Data and IT department, every
department in the Human Resources division, the head of the Human Resources
division, the head of the Governance division (not its other staff), and the
Director. Only admins assign roles and manage
structure, and nobody can change their own role.

**Role title**:
What a role was called in a given year. A year's role list can name an app
role differently ("Department Overseer" stood for Head of Department in 2019
and 2020), and everything showing that year uses the year's own title while
the role keeps working as the app's. Copying a year into the next carries its
titles forward, so a later rename never changes earlier years. Past years are
corrected with the internal `history:setRoleTitle` and
`history:setPastAssignments` (command line only; they refuse this year and
next). See [ADR 0015](../adr/0015-past-years-keep-their-role-titles.md).
_Avoid_: alias, display name

**Home editor**:
Not a role — a derived permission. Admins, anyone in the Marketing
department, and the head of the Engagement division (not its other staff,
e.g. Alumni). Home editors change the public Home tab's content.

## Announcements

**Announcement**:
A message an admin sends to leaders: a short title and a message, delivered
to the bell, as a push to anyone with the app and, if ticked, by email. It is
**scheduled** until it goes out, then **sent**; a scheduled one can be
**cancelled** and then never reaches anyone.
_Avoid_: broadcast, blast, notice (in code)

**All leaders**:
Everyone with a `staffProfile` in the current staff year, whatever their role.
An announcement with no campus, division, department or role chosen goes to
all leaders.
_Avoid_: everyone (in the UI), all staff

**Audience**:
Who an announcement goes to. Chosen campuses, divisions and departments add
up (anyone in any of them); chosen roles narrow that down. A role and its
group must be on the same assignment, so "Staff at UNSW" doesn't reach a
Student Leader at UNSW who is Staff in Events. Worked out again when it goes
out, from the staff year the sender chose it in, so a scheduled announcement
reaches whoever is in the audience then, even after the 1 October rollover.


## Mentoring

**Pairing**:
One Campus leader and their mentor for one staff year. Each Campus leader has
at most one mentor a year; a mentor can have any number. Changing the mentor
overwrites the pairing (keeping who changed it and when), and pairings never
carry over to the next year. Admins manage the current and next year; earlier
years are read-only.
_Avoid_: mentorship (in the UI), match

**Mentee**:
The Campus leader in a pairing: someone holding a university role (Student
Leader, President, Vice President or Executive) that year. Nobody else can be
paired as a mentee.

**Mentor**:
Either a leader with a `staffProfile` that year who is **not** a Campus
leader (Campus leaders don't mentor each other), or an external mentor. A
leader mentor sees their own current-year mentees under Mentoring; mentees
don't see their mentor.

**External mentor**:
A mentor who isn't a SOW leader that year, kept on a reusable list (name, and
optionally email, phone and notes) so they can be picked again in later
years. One can't be deleted while any pairing, in any year, names them.

**Imported pairing**:
A pairing copied once, in 2.10.1, from the old SHED app's `mentees/{year}`
documents. Its mentee was matched by old user id or email; a mentor with no
profile that year became an external mentor.
