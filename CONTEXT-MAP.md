# Context Map

THE SHED is one Expo + Convex codebase serving three bounded contexts. They
share a deployment, an auth session and a calendar, and almost nothing else:
the approval chain's vocabulary (Budget Manager, receipt, Director threshold)
never appears in Attendance, and Attendance's vocabulary (Member, sub-group,
roll-call, snapshot) never appears in the chain.

The contexts do not map to directories — `convex/`, `shared/` and `src/` each
hold code for all three — so each context's glossary lives under
`docs/context/` rather than beside its code.

## Contexts

- [Org](./docs/context/org.md): who works for SOW, in what role, in which year.
  The shared kernel — both other contexts depend on it, neither owns it.
- [Reimbursements](./docs/context/reimbursements.md): the money flow, from
  submitted request to paid receipt.
- [Attendance](./docs/context/attendance.md): who turned up to what, and the
  leader-facing metrics built from it.

## Relationships

- **Org → Reimbursements**: the approval chain is derived entirely from Org.
  Who may action a step is a question about that year's roles, departments and
  divisions; Reimbursements stores no org structure of its own.
- **Org → Attendance**: the year's universities become Attendance's
  sub-groups, and staff identity resolves through `staffProfiles` by email.
  Attendance never writes Org data.
- **Reimbursements ↔ Attendance**: no relationship. They share no table, no
  term and no flow. A change to one should never require reading the other.
- **The staff year is Org's**: both contexts key their data by it and both
  rebuild when it rolls over on October 1, but neither controls it. See
  [ADR 0003](./docs/adr/0003-october-1-staff-year-rollover.md).

A nightly BigQuery copy of production Convex sits outside all three contexts.
It is a snapshot for SQL, not a source of truth, and the app does not read it.
JSON tables live in `convex_production`; typed views for analysts live in
`convex_warehouse`. See [ADR 0004](./docs/adr/0004-convex-to-bigquery-snapshot.md)
and [ADR 0005](./docs/adr/0005-typed-bigquery-warehouse-views.md).
