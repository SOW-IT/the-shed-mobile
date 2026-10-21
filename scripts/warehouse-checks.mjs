#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { jsonPayload } from "./lib/convexExportToBigQuery.mjs";
import { REPORT_VIEWS } from "./lib/convexWarehouseReports.mjs";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

const project = arg("project", process.env.GCP_PROJECT || "theshedsow");
const dataset = arg("dataset", process.env.BQ_DATASET || "convex_production");
const warehouse = arg("warehouse", process.env.BQ_WAREHOUSE_DATASET || "convex_warehouse");
const location = arg("location", process.env.BQ_LOCATION || "australia-southeast1");
const bucket = arg("bucket", process.env.GCS_BACKUP_BUCKET || "");
const statePath = arg("state", "warehouse-checks-latest.json");
const DROP_RATIO = Number(process.env.WAREHOUSE_DROP_RATIO || 0.2);
const NEVER_EMPTY = ["users", "staffProfiles", "events", "attendance", "attendanceMembers", "requests"];
const stateObject = bucket ? `gs://${bucket}/convex/production/checks/latest.json` : null;

const sh = (cmd, args, allowFail = false) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
};

const bqJson = (sql) => {
  const output = sh("bq", ["--project_id", project, "--location", location, "query", "--use_legacy_sql=false", "--format=json", "--max_rows=10000", sql]);
  try {
    return JSON.parse(jsonPayload(output) || "[]");
  } catch (error) {
    throw new Error(`bq query printed something that is not JSON (${error.message}):\n${output}`);
  }
};

const rowCounts = () => {
  const rows = bqJson(`SELECT table_id, row_count FROM \`${project}.${dataset}.__TABLES__\``);
  return Object.fromEntries(rows.map((r) => [r.table_id, Number(r.row_count)]));
};

const viewsPresent = () => {
  const rows = bqJson(`SELECT table_name FROM \`${project}.${warehouse}.INFORMATION_SCHEMA.VIEWS\``);
  return new Set(rows.map((r) => r.table_name));
};

const previousState = () => {
  if (stateObject) sh("gcloud", ["storage", "cp", stateObject, statePath], true);
  return existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
};

const saveState = (state) => {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  if (stateObject) sh("gcloud", ["storage", "cp", statePath, stateObject]);
};

const run = async () => {
  const counts = rowCounts();
  const views = viewsPresent();
  const previous = previousState();
  const problems = [];

  for (const table of NEVER_EMPTY) {
    if (!(table in counts)) problems.push(`table ${table} is missing from ${dataset}`);
    else if (counts[table] === 0) problems.push(`table ${table} has no rows`);
  }
  if (previous?.counts) {
    for (const [table, before] of Object.entries(previous.counts)) {
      const after = counts[table];
      if (after === undefined) {
        problems.push(`table ${table} was in yesterday's snapshot and is gone`);
      } else if (before > 0 && after < before * (1 - DROP_RATIO)) {
        problems.push(`table ${table} fell from ${before} to ${after} rows`);
      }
    }
  }
  for (const view of REPORT_VIEWS) {
    if (!views.has(view.name)) problems.push(`report view ${view.name} is missing from ${warehouse}`);
  }

  const summary = [
    `${Object.keys(counts).length} tables in ${dataset}, ${views.size} views in ${warehouse}.`,
    ...Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, n]) => `${table}: ${n}${previous?.counts?.[table] !== undefined ? ` (was ${previous.counts[table]})` : ""}`),
  ].join("\n");
  console.log(summary);

  if (problems.length === 0) {
    saveState({ checkedAt: new Date().toISOString(), counts });
    console.log("Warehouse checks passed.");
    return;
  }
  const text = `Warehouse checks found ${problems.length} problem(s):\n${problems.map((p) => `- ${p}`).join("\n")}`;
  console.log(text);
  const webhook = (process.env.GOOGLE_CHAT_WEBHOOK_URL ?? "").trim();
  if (webhook) {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) console.error(`Google Chat post failed: HTTP ${response.status}`);
  }
  process.exit(2);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
