# Staff sit on top of attendance members

Until 2.6.0 a staff person and an attendance member were joined only by email.
A staff person's member row carried their staff email, their sign-ins were
keyed by that email instead of by a member, and leaving staff meant a job that
moved every sign-in onto the member row and swapped the staff email for a
personal one. The two identities drifted apart in ways the app couldn't see:

- Insights counted one person twice when they had sign-ins both ways.
- Signing out a staff sign-in that had been keyed by member did nothing.
- Leavers converted on 1 Oct 2026 showed as plain members on events from the
  years they were staff (292 sign-ins on the dev copy of production).
- A re-hired leader came back as a second person.

From 2.6.0 the member row is the person, and staff is a layer on top:

- **`staffProfiles.memberId` links each year's profile to the person.** Every
  `attendance` row points at a member. Someone is staff in a staff year when
  that year's profile has at least one assignment; past years keep showing
  them as staff, later years show the plain member.
- **A member's `email` is always their own.** The staff email lives only on
  the profile.
- **Campus and Role for staff are read from the profile**, never stored on the
  member row. Leaving staff therefore needs no data moved, only the empty
  Campus and Role filled.
- **Rows are created at known moments**: when someone is assigned for the
  current year in Admin, on October 1 for next year's staff who aren't linked
  yet, or as a fallback when a staffer with no row is signed in. Admin → Merges
  shows next year's staff before October 1 so new leaders who came as members
  can be linked to their existing row instead of getting a second one.
- **The API still speaks the old shapes.** Roster and sign-in list rows for
  staff keep `key: staff:<email>` and `email`, and `signIn`/`signOut` still take
  an email for staff, so phones on older builds work against the new backend.

## Rollout

Widen, backfill, narrow. 2.6.0 adds `memberId` and switches every reader and
writer; `memberBackfill:run` then links profiles (through old
`member.leftStaff` entries, then by staff email), re-keys email-only sign-ins
by member, moves personal emails into `email`, clears Campus and Role copied
from profiles, links this year's staff and rebuilds Insights.
`memberBackfill:report` must read all zeros (bar next year's staff with no
history) before 2.6.1 drops `attendance.email`, its two indexes and
`attendanceMembers.personalEmail`. Between the 2.6.0 deploy and the backfill,
email-keyed sign-ins read as "Unknown", so the backfill runs straight after the
deploy. On the dev copy of production it took about 75 seconds, kept every
event's attendee list identical, and is idempotent.

## Consequences

- A member can be linked from profiles on both SOW domains in one year (one
  person with two addresses); that is the same person, not a clash.
- Merging two rows keeps the one with more events attended; which row id
  survives is no longer the admin's choice, though whose details win still is.
- Branches cut from a main older than 2.6.0 can't deploy to a deployment that
  has run the backfill: the old schema has no `staffProfiles.memberId`.
