# Campus is a superset of University

**Campus** is any university an attendance Member may belong to. **University**
is a Campus where SOW has activities and affiliations. Every University is a
Campus; not every Campus is a University. Members attend events at universities
other than their own, so the campus list must be able to name places SOW runs
nothing.

This reads backwards in plain English — ordinarily every campus belongs to a
university — which is why it is written down.

Mechanically: the `Campus` member-metadata field's options are the stored
option map merged, on read, with the `universities` table
(`attendanceMetadata.list` → `mergeSelectValues`). The merge only ever adds, so
the containment holds by construction; the year's Universities are returned as
`lockedValues` and cannot be deleted, while admins may add extra options
freely. The same normalisation runs on write, so a re-save is not mistaken for
an edit and stored option ids never change meaning.

## Considered Options

**Constrain Campus to the `universities` table.** Rejected — it would break the
model outright. A Member at a university SOW has no presence at is a normal
case, not bad data.

**Make `Campus` a foreign key to `universities`.** Rejected for the same
reason, and it would force a row for every university in Australia.

## Consequences

A Member's home campus can be a string that matches no Sub-group, and such
Members never appear in cross-campus comparisons. That is correct — there is no
sub-group for them to be compared against — but it is invisible, and it is the
first thing to check when a Member seems missing from Insights.

The `universities` table keeps its name despite holding the *subset*. Renaming
it would be a Convex migration across ~49 files to solve a prose problem;
recording the containment here is the cheaper cure.
