# 15. Past years keep their own role titles

Date: 2026-10-23

## Status

Accepted

## Context

The 2026-06-15 `backfillAssignments` migration rebuilt every department head's
role from Structure as "Head of Department". In 2019 and 2020 SOW called that
role "Department Overseer", so seven people's records were renamed into the
present. Other old titles (Campus Chaplain, Interim Director) survived only
because no logic depends on them. Roles that the app's logic does depend on
(Head of Department, Head of Division, Director) can't simply be stored under
an old name: Structure, approvals, the org chart and the year copy all look
for the app's name.

## Decision

A row in a year's `roles` list may carry `standsFor`, naming the app role it
retitles that year (`{year: 2019, name: "Department Overseer", standsFor:
"Head of Department"}`). Records keep the app's role, so every rule keeps
working. Anything that shows a role for a year (org chart, profile history,
Admin's Users list, mentoring lines, the side menu) shows that year's title
through `roleTitle`, `roleLabel` and `formatAssignment(a, titles)`. Titled
rows are never offered as roles to assign, and copying a year carries them
forward, so a rename applies from its year onward and never to earlier ones.

There is no admin control yet. Past years are corrected with the internal
`history:setRoleTitle` and `history:setPastAssignments`, which refuse the
current and next year.

## Consequences

- Historical names are preserved without teaching every role check about old
  names.
- A display path that formats a role without the year's titles shows today's
  name. New role displays must pass the titles.
- A future rename of a current role is a data change (and later perhaps an
  Admin control), not a code change.
