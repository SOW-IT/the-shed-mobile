# 22. Org search stores its text on each staff profile

Date: 2026-11-23

## Status

Accepted

## Context

Daniel asked for the Org Chart search to find people, roles and teams in every
staff year, not only the one on screen. Searching used to filter the loaded
year's chart in the browser. Doing that for every year would mean reading every
`staffProfiles` row (908 on prod, all years) on each keystroke, and the table
only grows.

## Decision

Each `staffProfiles` row carries `searchText`: its name plus the person's
Google and Workspace directory names, email, roles (with acronyms and that
year's role titles), and its departments (with each one's division),
divisions and campuses (with acronyms). `staffSearchText` in
`convex/orgSearch.ts` gathers those and `staffProfileSearchText` in
`shared/orgChart.ts` builds the text. A Convex search
index, `search_text`, covers it. A Convex search query matches any of its
words and only treats the last as a prefix, so `orgSearch:searchAllYears`
asks the index about one word at a time, longest first (up to three), each
as a prefix, and stops at the first word with fewer than 100 matches: that
set holds everyone the search can match. It keeps the rows where every typed
word appears and the year is visible to the caller (next year for admins
only, as on the chart), and returns up to 40, newest year first. When every
word has 100 or more matches it searches the union of those first hundreds
and says more may match.

Every write that changes a profile's name, email or assignments sets
`searchText` in the same patch or insert: Admin's assign and head changes,
the year copy, the admin seed, `history:setPastAssignments` and the email
rekey on sign-in. Linking a profile to its account at sign-in refreshes it,
which picks up the Google name. Changes that touch a whole year (renaming a
department, division or campus, moving a department to another division,
`history:setRoleTitle`) schedule `orgSearch:refreshYearSearchText` for that
year. A new writer of those fields has to do one or the other. `orgSearch:backfillSearchText` recomputes
every row in batches and only writes the ones that changed, so it fills the
field after this release and repairs any row a future writer misses.

Each word matches the start of a word in the text, so "dan ki" finds Daniel
Kim, but "aniel" finds nothing. A Google or directory name that changes without a profile write (the weekly
directory sync, a renamed Google account) stays stale until the backfill runs
again.

## Consequences

- A settled search (the box waits 250 ms after typing) read 96 to 190
  documents on a copy of prod, and 359 for "unsw president", where both words
  are common. The year's chart query reads 335.
- `searchText` duplicates fields on the same row. A writer that forgets it
  leaves that row out of search until the backfill runs again.
- After the deploy, run `npx convex run --prod orgSearch:backfillSearchText`
  once. Until then, only rows written since the deploy are searchable.
