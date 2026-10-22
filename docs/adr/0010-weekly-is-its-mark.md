# A weekly is its term and week, and tags come in two lists

Until 2.8.0 an event was a campus weekly if it carried a tag named exactly
"Weekly Meeting". Four server paths (the nightly Insights build, event
create/update, the SOW snapshots and the General tab averages) looked the tag
up by name. Since 2.5.1 a weekly also stored its term and week
(`events.weekly`), so there were two answers to "is this a weekly?", and they
drifted:

- A weekly made from an older phone, or with the tag picked by hand, had the
  tag but no term or week, and Insights guessed from its name.
- The 2.5.1-2.7.0 form sent the suggested term with an extra `key` field the
  server rejected, so creating a weekly without touching the term failed and
  leaders fell back to tagging an Other event. Every weekly created between
  11 and 14 Oct 2026 had no term or week.
- Renaming the tag would have made every campus look like it had no weeklies.

Names drifted too ("WM #4", "UTS S1W3 weeklies", "Weekiles T1W3"), with labels
like BAM or PPN typed into them, and one tag list mixed campus labels with SOW
programmes (PPN meant both a campus weekly's theme and the monthly SOW night).

## Decision

- **A weekly is an event with a `weekly` mark.** Nothing reads tag names to
  decide it. The *Weeklies* tag (renamed from Weekly Meeting) is still added
  to every weekly so lists and exports show it, and it can't be renamed or
  deleted.
- **The server fills in a missing mark** when an event arrives with the
  Weeklies tag and no mark: the term and week from the name where it has one
  (`markFromName`), otherwise the campus's next week (`suggestWeekly`). Week
  is 1 to 14 and the term is in the date's year. *Removed in 2.9.1, when 2.9.0
  became the oldest supported app: every weekly now arrives with its mark.*
- **The name is the week code** ("T3W5" at UNSW, "S2W5" elsewhere),
  pre-filled and editable. Labels are tags.
- **Every tag is in one list, Weeklies or Other events** (`attendanceTags.list`,
  missing means Other events). The same name can be in both lists as two tags,
  as PPN is. The form offers only the list for its kind.
- **One migration** (`weeklyMigration:run`, dry run first) renamed every
  weekly to its code, moved name labels into Weeklies tags, gave joint and
  old-phone weeklies a mark from their owning campus, merged Event and Other
  Events into Social, and added TWIG to the SOW monthly PPNs. *It ran on
  production on 2026-10-15 and was removed in 2.9.1.*

## Consequences

- Until 2.9.1 dropped them, phones on 2.7.0 and older showed one mixed tag
  list, so a wrong-list tag could be picked; the server kept it rather than
  silently dropping a leader's choice.
- Joint weeklies have a mark but Insights still leaves them out of campus terms
  (`jointWeeklies`), as ADR 0008 decided.
- Supersedes ADR 0008's "an untagged weekly is left out": what counts now is
  the mark.
