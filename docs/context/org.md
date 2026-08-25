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

**Visitor**:
A signed-in account that is not Staff — someone who signed in with a personal
Google account rather than an `@sow.org.au` one. A visitor has an account and
no profile.
_Avoid_: guest, public user, non-staff

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
Not a role — a derived permission. The Data and IT department plus every
department in the Human Resources division. Only admins assign roles and manage
structure, and nobody can change their own role.
