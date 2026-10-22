# The roll call's order is precomputed per event, within a database I/O budget

"Not signed in" has always been sorted by how likely someone is to come, but
until 2.10.2 the score only saw the latest 60 events of the current staff
year, compared them field by field (tag matches, then group matches, then
campus, then totals), and was recomputed inside `attendance.roster` on every
load. Since the staff year restarts on 1 October, the order was empty for
weeks every year, and a past year's roll call read up to 60 events of
attendance live each time it loaded (1.26 MB on dev for one 2026 weekly).

The Free plan's 1 GB of database I/O a month is shared by prod and dev and
was already exceeded (`docs/convex-reads-2026-10-21.md`), with `roster`
re-running on every sign-in for every phone that has the roll call open.

From 2.10.2:

- **One score**, in `shared/rollCallLikelihood.ts`: every sign-in in the 180
  days before the event, weighted 0.1, plus 1 for a shared group, 0.5 for a
  shared tag and 4 for the same campus's weekly series, halving every 45
  days counted back from the event's start; then +1 when the person's campus
  is one of the event's. The weights came from a backtest over dev's copy of
  the data, tuned on 2025 and checked on 2026 (top ten of the remaining list
  at sign-in: 12.5% before, 30.6% after; median position 75 to 22). 180 days
  scored the same as 365, at half the history.
- **Precomputed per event** in `rollCallOrders` (top 150 member ids and
  scores, about 7 KB). `roster` reads that row and nothing else from the
  history; without one it sorts by campus, then name.
- **Ranked only when needed**: on save when the event starts within a week
  (or started in the last 30 days) and its date, groups, tags or weekly mark
  changed, and nightly for events on now or in the next week. A rank whose
  inputs (the event's fields plus every history event and sign-in it reads)
  hash the same as last time stops before scoring, and a new order equal to
  the stored one isn't written, so subscribed roll calls don't re-run.
- **The nightly snapshot is incremental**: it re-reads only the last 14
  days' events, re-reading sign-ins only when `eventAttendanceCounts` moved,
  keeps older events from itself, skips the write when nothing changed, and
  packs each member's events into a base-36 string. A full re-read every two
  weeks picks up member merges and edits to older events.

Measured on dev (2026-10-23): a quiet night reads 60 KB and writes nothing;
the full re-read reads 1.6 MB and writes the 57 KB snapshot; an unchanged
rank reads 64 KB; `roster` reads 402 KB for the event that took 1.26 MB.

Trade-offs: the order is a night behind (today's sign-ins count tomorrow),
an event more than 30 days old has no order unless it already had one, and
a member merge or an edit to an event over two weeks old reaches the order
within two weeks.
