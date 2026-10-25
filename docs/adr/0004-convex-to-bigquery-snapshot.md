# Daily Convex snapshot into BigQuery

THE SHED's live data lives in Convex. Leaders already have Insights in the app.
What we did not have is SQL over the same tables: attendance, requests, org,
and the audit log, in one place, without paging through Convex.

The daily production backup already writes a zip to Cloud Storage. From 1.11.3
that zip is also loaded into BigQuery dataset `convex_production` in project
`theshedsow`. The loader fills a run-specific staging dataset first, then
copies those tables into `convex_production` and drops warehouse tables that
are no longer in the export. A failed staging load leaves last night's
snapshot in place. The zip on GCS is the history.

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

The zip backup job must not depend on BigQuery succeeding. The BigQuery job
reads the zip, so the backup service account needs `storage.objects.get` on
the backup bucket. It also needs `roles/bigquery.user` on the project (query
jobs and `datasets.create` for the staging dataset) and
`roles/bigquery.dataEditor` on `convex_production`. The destination dataset
may be pre-created; if it is missing the loader will create it with that
same `datasets.create` grant. If the grant is missing, the zip still lands
and the BigQuery job fails on its own.

This is a snapshot, not change-data-capture. A row deleted in Convex yesterday
is gone from BigQuery after tonight's load. A Convex table that disappears
from the zip is dropped from `convex_production` after the new tables copy
across. Point-in-time questions go to the zip, not the dataset.

A crash while copying staging tables into `convex_production` can still mix
one generation. That window is a table copy, not a load, and last night stays
intact if staging never finishes.

The three bounded contexts do not gain a fourth. BigQuery is a copy, not a
source of truth, and the app does not read it.

## File storage, added 20 October 2026

File storage stayed out of the zip, which left every receipt, event
attachment and avatar in exactly one place. The same nightly workflow now
copies files too, after the zip: `scripts/backup-storage-files.mjs` pages
through Convex's `_storage` table with the internal query
`storageBackup:listFiles`, downloads only the files whose SHA-256 is not yet
in `gs://<bucket>/storage/manifest.json`, and writes each one to
`gs://<bucket>/storage/files/<sha256>` with its content type. A file is
downloaded once, on the first night it exists; Convex egress is metered, and a
full copy every night was not acceptable. Two storage ids with the same bytes
share one object.

The annual receipt purge (`cleanup.purgeOldReceiptFiles`, 30 September) stays.
GCS is the long-term archive: when the app deletes a receipt, the copy in GCS
is kept, and the manifest moves that storage id into its `deleted` map with
the date it was last seen in Convex. Nothing is ever deleted from GCS by this
job. A receipt the app no longer holds is found by storage id in
`manifest.json` (`files`, then `deleted`), which names the object.

The file step runs with `continue-on-error`, so a failure there is visible on
the run but does not undo the database backup. It retries every missing file
the next night. Besides the write it already has, the backup service account
needs `storage.objects.get` on the bucket (the BigQuery job already needs it)
and permission to overwrite `storage/manifest.json` each night, which in GCS
means `storage.objects.delete` as well. File objects are written with
`--no-clobber`, so they never need it. If the bucket has a retention policy
or object versioning, the manifest overwrite is the thing to check first.

## Update, 2026-10-23: weekly

The backup, and with it this snapshot, now runs weekly (Sundays 15:17 UTC,
Monday early morning in Sydney) instead of daily. Each export reads the whole
production database, about 9.5 MB of database bandwidth a run, so a daily
backup cost about 0.29 GB of the Free plan's 1 GB a month. BigQuery is up to
a week behind Convex, and the newest zip can be up to a week old. Run
`convex-backup.yml` by hand when a fresher copy is needed.
