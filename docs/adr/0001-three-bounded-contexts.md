# Three bounded contexts in one codebase

THE SHED began as the reimbursement flow and later absorbed Attendance, an
entire second product ported from *time-to-rollcall*. Rather than split the
repo or pretend it is one domain, we treat it as three bounded contexts —
**Org**, **Reimbursements** and **Attendance** — mapped in
[CONTEXT-MAP.md](../../CONTEXT-MAP.md).

Org is a shared kernel: it holds staff, roles, departments, divisions,
universities and the staff year, and both other contexts depend on it while
neither owns it. Reimbursements and Attendance have no relationship with each
other at all — no shared table, term or flow.

## Considered Options

**One context.** Rejected: the two feature areas share no vocabulary. Nothing
in the approval chain refers to a Member or a sub-group, and nothing in
Attendance refers to a Budget Manager or a receipt. A single glossary would be
two glossaries in one file.

**Org folded into Reimbursements, borrowed by Attendance.** Rejected: the
`universities` table exists as much for Attendance's sub-groups as for Student
Leader assignment, and the October 1 rollover is driven by neither context.
Giving Reimbursements ownership would make every Attendance change look like a
cross-context change.

## Consequences

The contexts do not map to directories — `convex/`, `shared/` and `src/` each
contain code for all three — so the glossaries live in `docs/context/` instead
of beside the code. This is a real cost: nothing mechanical enforces the
boundary, and only the map records it.
