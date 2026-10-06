# Event Requests

Staff plan an event and get it signed off: the event itself, then a
Marketing, a Risk and a Finance form, each reviewed by its own team. This
context owns the event, its three forms, their review and their
conversations. Like [Design Requests](./design-requests.md) it owns no org
structure: who fills in, who reviews and who approves all come from
[Org](./org.md).

## Language

**Event request**:
One event, numbered within the staff year it was created in ("#3 · 2027").
Carries the answers to the event form (the old web app's "Make an Event
Request": name, purpose, goals, theme, location, registration goal, audience,
dates, notes) and is filed under a **lead department**.
_Avoid_: event form (the old app's name), booking, ticket

**Lead department**:
The requester's department (they pick one if they're in several). Its members
and Head make up the **requester's side**: they can edit the event, fill in
its forms, reopen them and cancel the event.

**Form** (or sub-form):
One of the event's three: **Marketing**, **Risk** and **Finance**, each with
its own status, reviewer and comment thread. They are created with the event
and filled in, in any order, by the requester's side; a draft can be saved
and finished later.
_Avoid_: section, page

**Marketing form**:
The event's design and promotion: key message, visual style, the key Bible
passage, what to design (printed and digital, with details), drafts and
run-by preferences, promotion, when promotion starts and what to put in
posts. Defined on the server (`convex/eventRequestForm.ts`) like the design
request form. Choices that usually suit the event's size (from its
registration goal) are marked **Recommended**. The Marketing Head approves;
the Marketing team sees every one and hears when one is approved.

**Risk form**:
The risks, rated with SOW's **Risk Management Standard (2026)**: each risk's
kind (health and safety, people and culture, reputation, finance), its worst
**consequence** (level 1–5) and **likelihood** (rare to almost certain) give a
**score** (1–25) and **rating** (Low, Moderate, High, Very High, Extreme)
from the Standard's matrix. Anything above Low needs a plan to reduce it.
**Major risks considered** are the kinds the rows cover. Plus optional
**contingencies**. The Compliance Head approves. Ticking **no notable risks**
makes it **not required**.

**Finance form**:
A simple rundown: income lines and expense lines (what it's for and an
amount), totalled, with an optional link to a fuller spreadsheet. The Finance
Head approves; when total expenses are over the **event Director threshold**
($5,000 unless Admin sets another, separate from reimbursements'), the
Director approves first. $0 in and out makes it **not required**.

**Status** (of a form):
`Not submitted → Waiting for approval → Approved`, or `Changes requested`
(with the reviewer's reason) back to the requester's side, who fix it and
submit again. Resubmitting a Finance form starts its chain again from the
Director. There's no decline. **Not required** (no risks, no money) counts
as done; the team is still told, so they can comment if they disagree. An
approved form is locked until the requester's side **reopens** it.

**Status** (of the event):
`In progress → Approved` once every form is approved or not required, which
tells the requester's side and all three teams it can go ahead. Reopening a
form puts it back in progress. The requester's side can **cancel** it at any
point; it's kept, not deleted.

**Auto-approval**:
A form submitted by the person who approves its step (say, the Finance Head's
own event) skips that step. A delegate's own form doesn't.

**Team inbox**:
marketing@, compliance@ and finance@sow.org.au get the emails about their
form: submitted, not required, decided, moved on to the Finance Head, the
event edited or cancelled after it was sent to them, and the event approved.
Not comments.

**Who sees what**:
The requester's side sees their events (Mine). The three teams, their Heads
and the Director review what's waiting for them (To review, with a badge for
what's waiting on you). They, the Events department and admins can see every
event (All). Campus leaders don't use event requests.

**Legacy event**:
An event form imported from the old web app's Firestore, keyed by its old
year and id so the import can be re-run. Its Marketing and Finance forms come
across (the old five budget tables become labelled lines); its Registration
form doesn't. The old app had no Risk form for most events, so a finished one
comes in with Risk not required, and one still to happen needs its Risk form
filled in now. One that never finished and has already happened comes in
cancelled. Once anyone acts on it in THE SHED, a re-run leaves it alone.
