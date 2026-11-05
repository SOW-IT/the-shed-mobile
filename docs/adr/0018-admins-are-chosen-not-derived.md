# Admins are chosen, not derived from departments

Until 2.10.27 admin was derived from the org structure: the Data and IT
department, every department in the Human Resources division, the heads of the
Human Resources and Governance divisions, and the Director. On prod that was
15 people in staff year 2027, and the only way to add or remove one was to
move them between departments.

Daniel asked for admins to pick admins instead (2026-11-05): Data and IT plus
whoever an admin chooses, starting with himself.

What we weighed:

- **Who is always an admin.** With nobody fixed, removing the last chosen
  admin would lock everyone out of Admin. The Director and Data and IT stay
  admins whatever the list says, so whoever maintains the app can always fix
  it, and the list itself can be empty.
- **Per year or ongoing.** Departments and roles are per staff year and are
  copied forward. Admin rights are about trust in a person, so the list is
  one `admins` table keyed by email that carries over 1 October. It still
  only counts while the person has a staff profile in the current year, so a
  leaver stops being an admin without anyone remembering to remove them.
- **Who can be chosen.** Anyone with a staff profile this year except campus
  leaders, who are students and see no staff tools.
- **Acting as.** A persona is a role, not a person, so acting as People and
  Culture staff no longer shows the admin views; only the Director and Data
  and IT personas do.
- **Locked names.** The Human Resources and Governance divisions no longer
  grant anything, so they can be renamed like any other division.

People and Culture, Training and Development and the HR and Governance heads
stopped being admins when this shipped unless they were added to the list.
Mentoring and Announcements follow admin, so they lost those too.
