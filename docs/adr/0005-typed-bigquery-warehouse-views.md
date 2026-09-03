# Typed BigQuery views over the Convex snapshot

The daily zip still lands in Cloud Storage, and `convex_production` still
holds one JSON `document` per Convex row. That shape is a faithful copy of
the backup. It is awkward to query.

From 1.11.7 the same load also creates dataset `convex_warehouse`: one view
per business table, with typed columns (`email STRING`, `amount FLOAT64`,
`signInTime TIMESTAMP`, nested receipts left as JSON). Analysts query the
views. Restore and re-load still use the zip and the JSON tables.

## Considered options

**Replace `convex_production` with flattened tables.** Rejected. Autodetect
already failed on nested receipts and optional fields (ADR 0004). A typed
load would also make the snapshot a second schema we have to migrate when
Convex changes.

**Same dataset, `vw_` prefix.** Rejected. The JSON snapshot job drops tables
that are not in tonight's zip. Views in that dataset would be deleted unless
every drop path learned about them. A second dataset keeps the copy and the
warehouse from stepping on each other.

**Looker-only modelled fields.** Rejected. SQL in BigQuery is the thing we
already have, and the same views work for Looker, sheets, and `bq query`.

## Consequences

The JSON snapshot remains the warehouse source of truth for "what Convex
contained last night". The views are a projection. If a Convex field is
renamed, update `WAREHOUSE_TABLES` in `scripts/lib/convexWarehouseViews.mjs`
or the column goes NULL.

The backup zip job still must not depend on BigQuery. Creating the views
needs `datasets.create` (already granted via `roles/bigquery.user`) on
`convex_warehouse`. The service account that creates that dataset owns it.

This is still a snapshot, not history. Point-in-time questions stay on the
zip. The app still does not read BigQuery.
