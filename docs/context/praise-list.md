# Praise List

The worship songs SOW plays at weeklies and events, and the requests that add
to it. This context owns the songs, their review and the duplicate checks.
Like [Design Requests](./design-requests.md) it owns no org structure: who
may request comes from that year's staff, and who reviews is a per-year list
kept with the year's settings in [Org](./org.md).

## Language

**Song**:
One row in `musicRequests`: a title, artist and link (Spotify, YouTube or any
other address), with optional artwork, recording code (ISRC) and a note from
the requester. It is **Pending** until a Praise Manager reviews it, then
**Approved** or **Declined** (with an optional reason sent to the requester).
_Avoid_: track, music request (in user-facing copy)

**Praise List**:
Every Approved song, searchable and sortable, under the Approved Playlist tab
at `/music`. Only staff with a role this year open it.
_Avoid_: playlist (alone), song list

**Request**:
A Pending song and the person who asked for it. Requesters follow theirs under
**Mine**, can edit or delete one while it's Pending, and are notified when it's
reviewed. Requests from several songs at once (up to 50, or a pasted Spotify or
YouTube playlist) are one request per song. Every Praise Manager hears about a
request by push and by email, with the song's link and the requester's note; a
batch is one push and one email listing every song.
_Avoid_: submission, ticket

**Praise Manager**:
Someone an admin has chosen on the Praise List's **Praise Managers** tab for
one staff year
(`yearSettings.praiseManagerEmails`, carried into the next year on 1 October
while they're still on staff). They approve and decline under **To review**,
edit and delete any Pending or Approved song, and their own songs go straight
onto the Praise List. They need a role in the current staff year, so last
year's Praise Managers can't review during the October grace. An admin can act
as Praise Manager to see the queue, read-only. See **Acting as** in
[Org](./org.md).
_Avoid_: worship leader, music admin, reviewer

**Same recording**:
Two songs with the same Spotify track, YouTube video (whatever link form) or
ISRC. A recording that is Pending or Approved can't be requested again.
_Avoid_: duplicate (alone), copy

**Possible duplicate**:
A different recording with the same title and artist, compared without case,
punctuation or spacing. The requester is asked before it's sent.

**Declined before**:
A song whose only match is Declined. It doesn't block anything: the form says
it was declined before and lets it be requested again as a new request, and
the requester's own declined song has a **Request again** button under Mine.
The declined song stays as it was, so the earlier decision and reason are kept.
A Declined song can't be edited or deleted.
_Avoid_: rejected, blocked
