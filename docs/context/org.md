# Org

Who works for SOW, in what role, in which year. The shared kernel: both
Reimbursements and Attendance read this context, and neither owns it.

## Language

**Staff year**:
The year SOW plans and staffs against. It runs October 1 to September 30, so it
is ahead of the calendar year for the last quarter — on 2026-10-01 the staff
year is already 2027. Every role, department and university is stored against
one.
_Avoid_: year (unqualified), financial year, school year

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
