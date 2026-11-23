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

Each `staffProfiles` row carries `searchText`: its name, email, roles (with
their acronyms) and its departments, divisions and campuses (with theirs),
built by `staffProfileSearchText` in `shared/orgChart.ts`. A Convex search
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
renames of a department, division or campus, the year copy, the admin seed,
`history:setPastAssignments` and the email rekey on sign-in. A new writer of
those fields has to do the same. `orgSearch:backfillSearchText` recomputes
every row in batches and only writes the ones that changed, so it fills the
field after this release and repairs any row a future writer misses.

Each word matches the start of a word in the text, so "dan ki" finds Daniel
Kim, but "aniel" finds nothing. Year-specific role titles (ADR 0015) aren't in the text because they
live in another table; results still show them.

## Consequences

- A settled search (the box waits 250 ms after typing) read 96 to 190
  documents on a copy of prod, and 359 for "unsw president", where both words
  are common. The year's chart query reads 335.
- `searchText` duplicates fields on the same row. A writer that forgets it
  leaves that row out of search until the backfill runs again.
- After the deploy, run `npx convex run --prod orgSearch:backfillSearchText`
  once. Until then, only rows written since the deploy are searchable.
