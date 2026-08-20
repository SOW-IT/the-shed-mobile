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
Request itself — a Request exists long before its receipt does.

**Deadlock prevention**:
Refusing a submission up front when the year is missing an approver that
Request would need, rather than letting it strand mid-chain. The error names
the missing approver.
