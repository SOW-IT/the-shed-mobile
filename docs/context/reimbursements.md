# Reimbursements

Staff spend their own money on SOW's behalf and get it back. This context owns
the approval chain and the money; it owns no org structure — who may approve
what is entirely a question for [Org](./org.md).

## Language

**Request**:
A claim for money already spent, moving through the approval chain. The unit of
work in this context.
_Avoid_: claim, expense, reimbursement (the context is called
Reimbursements; a single one is a Request)

**Approval chain**:
The fixed order a Request passes through:
`Submit → Head of Department → Budget Manager → (Director, if ≥ threshold) → Finance Head → Receipt → Payment`.
Enforced server-side; each step is actionable only by its approver, only in
order, and never on your own Request.
_Avoid_: workflow, pipeline, approval flow

**Step**:
One position in the chain, with its own approver and its own state.

**Auto-approval**:
A step that resolves without action because the person who would review it is
the submitter. Finance department requests have no Head of Department step at
all.
_Avoid_: skip, bypass

**Budget Manager**:
The single approver, per year, who reviews every Request after its Head of
Department. Must belong to the Finance department. Without one assigned,
submission is refused.
_Avoid_: budget holder, finance approver

**Director threshold**:
The amount at or above which a Request gains a Director step. Per year.

**Receipt**:
Proof of spend attached after approval, before payment. Distinct from the
Request itself: a Request exists long before its receipt does.

**Receipt file**:
The stored blob on a Receipt. Kept for the current and previous staff years.
At rollover, files from previous-previous and older are deleted. The Request
and the file name stay; only the download dies.
_Avoid_: invoice (the domain word is Receipt; the UI still says receipt/invoice)

**Past years**:
Each list carries on past this staff year as you scroll, newest first, a
heading per year: Mine the caller's own Requests, Review every other person's
Request the caller approved or declined (grouped by the year it was reviewed
in; Review stays for anyone who has reviewed a Request, even if they approve
nothing now), and All (Finance, under Completed) every Request. On Mine and
All a Request belongs to the year it was made in, even when it was reviewed
in the next.

**Deadlock prevention**:
Refusing a submission up front when the year is missing an approver that
Request would need, rather than letting it strand mid-chain. The error names
the missing approver.

**Reminder**:
The morning message that chases a Request that has not moved: a day after
its last movement, then three days later, then weekly. It goes to whoever
the Request is waiting on. One person's reminders for the day, across every
context, arrive as one notification, push and email (the **digest**);
nobody with nothing waiting hears anything.
_Avoid_: nag, escalation (nothing is escalated: the same person is reminded)

**Waiting since**:
When a Request reached the step it is at now, from its audit trail. Review
shows it as "Waiting 6 days" and lists the longest waiting first.

**Step timing**:
How long each Step waited before it was actioned, over a staff year, with the
typical (median) and longest wait and who actioned it most. On Admin for
admins and the Finance Head.
