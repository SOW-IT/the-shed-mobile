# Daily Convex snapshot into BigQuery

THE SHED's live data lives in Convex. Leaders already have Insights in the app.
What we did not have is SQL over the same tables: attendance, requests, org,
and the audit log, in one place, without paging through Convex.

The daily production backup already writes a zip to Cloud Storage. From 1.11.3
that zip is also loaded into BigQuery dataset `convex_production` in project
`theshedsow`. Each table is replaced wholesale. The previous day's warehouse
copy is gone; the zip on GCS is the history.

## Considered options

**Fivetran / Convex streaming export.** Rejected for now. Streaming export is
a Convex Pro feature, and it would add another vendor between us and the
warehouse. The zip we already trust is enough for overnight analytics.

**A Convex cron that inserts into BigQuery.** Rejected. Actions time out,
attendance and the audit log are the large tables, and the directory-sync
service account is a Workspace impersonation identity, not a BigQuery one.
The backup service account already has GCP access through Workload Identity.

**Flattened columns autodetected from JSON.** Rejected. Nested receipts,
assignments and Insights snapshots do not survive schema autodetect when a
field is sometimes missing, sometimes an object. Each warehouse table has
`_id`, `_creationTime`, `document` (JSON) and `_loadedAt`. Analysts pick
fields out with `JSON_VALUE`. A later pass can add typed views once a query
has proven the shape.

## What is not copied

Auth sessions, refresh tokens, verification codes, and push device tokens stay
out. File storage stays out, as it does from the zip. Bank account numbers and
staff emails do go in. They are already in the GCS zip. The warehouse is the
same GCP project and the same backup identity.

Scratch tables (`contactRateLimit`, `attendanceMetricsDirty`) are skipped.
They are not analytics.

## Consequences

The zip backup job must not depend on BigQuery succeeding. Warehouse IAM is a
separate grant (`roles/bigquery.jobUser` on the project, `roles/bigquery.dataEditor`
on the dataset). If that grant is missing, the zip still lands and the
BigQuery job fails on its own.

This is a snapshot, not change-data-capture. A row deleted in Convex yesterday
is gone from BigQuery after tonight's load. Point-in-time questions go to the
zip, not the dataset.

The three bounded contexts do not gain a fourth. BigQuery is a copy, not a
source of truth, and the app does not read it.
