# Flat BigQuery views for Looker Studio and Sheets

Typed copies of Convex tables still leave nested JSON (`assignments`,
`receipt`, Insights `data`). Looker Studio and Connected Sheets cannot chart
those fields.

From 1.11.8 the nightly load also creates **flat report views** in
`convex_warehouse`: one row per chart point, assignment, sign-in or payment
line, all scalar columns. They match the Insights tab (summary, weekly trend,
follow-ups, campus mix) plus Org (staff assignments), Attendance (sign-ins
with event names) and Requests (status and recipients).

The JSON snapshot and the 1:1 typed views stay. Report views are a projection
on top.

## Considered options

**Ask analysts to unnest in Looker.** Rejected. Connected Sheets has no
UNNEST, and the Insights payload is several nested arrays.

**Materialized tables.** Rejected for now. Views stay in sync with tonight's
snapshot without extra storage or slot time. If Sheets gets slow we can
materialize the same SQL.

## Consequences

Connect Looker Studio or Sheets to dataset `convex_warehouse` and pick
`insights_*`, `staff_assignments`, `attendance_signins`, `requests_status`.
`request_recipients` includes BSB and account numbers — treat it as finance
data.

If an Insights field is renamed in Convex, update
`scripts/lib/convexWarehouseReports.mjs` or the column goes NULL.
