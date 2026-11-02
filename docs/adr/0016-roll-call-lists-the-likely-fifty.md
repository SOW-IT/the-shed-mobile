# The roll call lists the 50 most likely people and searches for the rest

Until 2.10.18 `attendance.roster` returned everyone in the pool, about 1,400
members plus the year's staff, so the phone could filter them as you typed.
Every call read every `attendanceMembers` row: 394 to 444 KB on dev's copy of
the data, 430 KB a call in prod, about 85% of it member rows nobody scrolls
to. `attendanceMembers.list` read the same rows for every 30-row page of the
Members tab (443 KB).

Two ways out were weighed (2026-11-02, measured on a local backend loaded
with dev's data):

- **Keep the screen and maintain a compact copy of every member**, updated
  by every write to `attendanceMembers`. The copy alone is about 88 KB (half
  of it member ids), so the roll call would still read about 150 KB, and a
  missed write path would leave the roll call stale.
- **List only the likely people and search for everyone else.** Replaying
  the last year's 144 events, the stored top 150 already held 78% of the
  people who signed in, and 8% were first sign-ins that are created anyway.

Daniel picked the second, with a list of 25 to 50. From 2.10.18:

- `roster` with a `limit` (the app sends 50) walks the event's
  `rollCallOrders` in score order, adds the campus bonus, and stops once no
  later score could reach the 50th place. When fewer than 50 are ranked it
  fills up with the year's staff, campus first. When at least 50 are ranked,
  the 50 are the first 50 of the old full list, in the same order. Without a
  `limit` (app versions before 2.10.18) it still returns everyone.
- `attendance.searchRoster` finds staff by name, email, role or campus and
  members through the `search_name` index (words, the last one as a prefix),
  names containing the typed text first. Self check-in's suggestions and its
  member picker use it too.
- Insights roles are read per person from `weeklyCategoryPeople`, a copy of
  `weeklyCategories` kept by the nightly Insights save, instead of a whole
  campus document (22 KB, or 70 KB for all campuses).
- The Members tab's default A to Z view pages through the `by_name` index,
  merging the year's staff in by name, and its total comes from
  `attendanceMemberCount`, which `memberCount.ts` keeps on every insert and
  delete and recounts nightly. Search, filters and other sorts still read
  everyone.

Measured after: the roll call reads 49 to 59 KB, a search 35 to 58 KB, and a
Members page 56 to 71 KB.

Trade-offs: "Not signed in" counts the listed people, not the whole pool; a
member outside the 50 is found by a word of their name, not by their email,
year or Instagram handle; and searching asks the server, so results arrive
after a short pause.
