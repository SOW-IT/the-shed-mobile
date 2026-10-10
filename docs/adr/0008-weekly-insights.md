# Campus Insights from weekly meetings, stored per term

Campus leaders tracked weeklies in a spreadsheet: one tab per term, a
category per person kept by hand, and a percentage that divided by the wrong
number for one term. Insights showed rolling ranges (past week / month / year)
that didn't match how leaders think, and rebuilt every campus from 52 weeks of
raw attendance every night.

From 2.5.0 a campus's Insights view is built from its weekly meetings:

- **Terms are worked out from the weeklies, not entered.** A gap of 18+ days
  ends a run; the run is named by the month it starts in, and runs with the
  same name merge. Checked against UNSW's sheet and event names (T1 2025 – T3
  2026) and USYD/UTS/MQ semesters, it gets every term and week number right,
  including a term whose week 7 wasn't tagged.
- **Categories are computed**, from attendance plus Org roles and the Campus
  field, with the numbers in a settings row. Promoting a newcomer who keeps
  coming (as leaders do) took the UNSW sheet's Members from 26 to 48 of 66
  matched, and the Regular/Irregular split agrees with the sheet 82% of the
  time.
- **Follow-up is tested on history.** Replaying every weekly since 2025 at
  UNSW, USYD, UTS and MQ, people flagged as "was coming, missed the last 2"
  came back within three weeks 42–53% of the time against 81–87% for
  regulars not flagged, and 59 of 64 people who dropped out after a 50%+ term
  were flagged first. Newcomers come back 25–34% of the time after one miss
  and 10–14% after two, so they're flagged after one.
- **Years are calendar years**, unlike the Oct–Sep staff year, because terms
  are; roles and campus come from the staff year of a term's last weekly.
- **Built incrementally.** Each term's attendance facts are stored; a night
  only re-reads weeklies the attendance change log says changed, and only
  redoes the affected views. Finished terms are kept as computed.

## Considered options

**Admins enter term dates.** Exact, but a chore every term at every campus,
and nothing stops it going stale.

**Rolling windows (last N weeklies).** No terms needed, but it doesn't match
the sheets or how leaders plan.

**Leaders set categories.** Matches the sheet, but the sheet itself had drifted
(people marked Member at 0%), and it's work nobody keeps up.

**Keep rebuilding everything nightly.** Simpler, but it reads a year of raw
attendance for every campus every night to change, most nights, nothing.

## Consequences

- An untagged weekly (no *Weekly Meeting* tag) is left out; leaders need to
  tag weeklies.
- A member's Campus/Role field is current, not per year, so editing it changes
  only the latest term on the next build; finished terms keep what they
  showed.
- Changing what a view shows needs `VIEW_VERSION` bumped, or the stored views
  stay as they were until their data changes.
- The SOW view's campus comparison now reads each campus's recent weekly head
  counts from the weekly index instead of per-campus Snapshots, which are no
  longer built.
