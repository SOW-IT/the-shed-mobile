# Design Requests

Staff ask the Marketing team to design something: a poster, a reel, merch.
Not for events: an event's design and promotion is the Marketing form of its
[event request](./event-requests.md).
This context owns the request, its review by Marketing and its conversation.
Like [Reimbursements](./reimbursements.md) it owns no org structure: who
approves and who does the work comes from [Org](./org.md).

## Language

**Design request**:
One ask of the Marketing team, numbered within the staff year it was submitted
in ("Design request #4 (2027)"). Carries the requester's answers to the form.
_Avoid_: design ticket, job, brief

**Form**:
The questions a requester answers, defined on the server
(`convex/designRequestForm.ts`) and rendered by the app as sent, so a question,
hint or choice changes with a backend deploy rather than an app release. Each
question has a stable key; a few carry a role (the department, due date and
title a request is filed under) and some are part of the emailed summary.
_Avoid_: schema, template

**Answers**:
What the requester filled in, stored by question key and checked against the
form on the server: today that's department, request type, project details,
what to design, visual style examples, key message, promotional materials
budget, due date, drafts and run-by preferences, and other information. The
"Event-related" request type is **retired**: older requests keep it (and their
key Bible passage), but a new request can't pick it. The requester can edit them until
the request closes; every edit records which answers changed and tells
Marketing.

**Marketing Head**:
The Head of the Marketing department for the year, plus anyone they've
delegated to. The only person who approves or declines, never on their own
request. The Head's own requests are approved automatically; a delegate's own
request waits for the Head. Without a Head assigned, submission is refused.
_Avoid_: design lead, approver

**Marketing team**:
This staff year's Marketing department, plus the Marketing Head. Anyone on it
can mark an approved request complete and join its comments. The team's
emails go to one shared inbox, marketing@sow.org.au; members get in-app and
push notifications instead.

**Marketing queue** and **archive**:
The team's two views. The queue is every open request, from any year: what's
waiting for approval and what's approved but not finished. The archive is
every request from one staff year, for looking back.

**Status**:
`Waiting for approval → Approved → Complete`, or closed early as `Declined`
(by the Marketing Head, with a reason) or `Cancelled` (by the requester).
Waiting and Approved are **open**; open requests show in every year's list
until they close. Nothing is ever deleted.

**Legacy request**:
A request imported from the old web app's Firestore, keyed by its old year and
id so the import can be re-run. It keeps its old number and dates; questions
the old form didn't ask (Bible passage, budget) are empty, and it is filed
under the requester's current address. One from an earlier staff year that was
never finished comes in Complete with the note "Closed when imported from the
old SHED", so it doesn't sit in the Marketing queue for good. Once anyone acts
on it in THE SHED, a re-run leaves it alone.
