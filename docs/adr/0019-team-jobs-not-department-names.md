# Team jobs, not department names

Until 2.10.28 the app named the departments it relied on: Finance paid
reimbursements and held the Finance Head and Budget Manager, Events saw every
event request, Marketing handled design requests and the Marketing form,
Compliance reviewed the Risk form, and Data and IT were always admins. Those
names were locked against renaming, and changing which department does a job
meant a code change.

Daniel asked (2026-11-05) for admins to choose these per staff year, so a
Marketing team renamed "Design" keeps approving Marketing forms and design
requests, and a future year can hand a job to another department.

What we weighed:

- **Where the choice lives.** On the department row it would mix a
  department's own details with what the app uses it for, and two jobs often
  share a department. We chose a `teamJobs` table, one row per staff year and
  job (`by_year_and_job`), read through `teamsFor(ctx, year)`. A year with no
  row for a job uses the old name, so nothing changed when this shipped.
- **Which year.** A department belongs to a staff year, so every check reads
  the teams of the year it is about: a reimbursement's year for its finance
  approvals, an event's approver years for its form heads, the caller's
  profile year for membership. A year with no choice of its own for a job
  uses the latest earlier year's, so a new staff year keeps last year's teams
  and neither the 30 Sep prefill nor the 1 October rollover resets them. A
  rename this year pins next year's inherited jobs to next year's own
  department of the old name while it still has one.
- **Renames and deletes.** Renaming a department moves its jobs with it,
  which is why the rename lock could go (Chaplaincy keeps its lock; nothing
  else reads its name). Deleting a department that still has a job is
  refused until an admin points the job somewhere else, instead of leaving
  the app without a finance team. Moving the finance job clears a Budget
  Manager who isn't in the new department.
- **Labels stay.** The Marketing, Risk and Finance forms keep their names;
  only who reviews them moves. Messages name the department doing the job
  ("the Design Head"), and the team inboxes (marketing@, compliance@,
  finance@) are unchanged.
- **Acting as.** Persona checks take the year's teams too, so acting as
  Design staff shows the design queue once Design has that job.

The same change moved settings out of Admin → Other to where they're used:
finance settings to their own screen, opened from the All tab of
Reimbursements and Event Requests (seen by the finance team, changed by the
Finance Head, their cover and admins), the grievance team's departments to
Grievances → Settings (changed by the team), and suggested merges to a
Possible duplicates screen opened from Attendance → Members (any staff role,
campus leaders included). Finance settings and merges aren't tabs because a
sixth tab doesn't fit a phone's tab bar. Admin keeps Users,
Structure, Teams (admins and team jobs) and System.
