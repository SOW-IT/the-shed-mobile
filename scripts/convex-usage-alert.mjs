#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const GB = 1024 ** 3;
const PLAN_DATABASE_BANDWIDTH_GB = Number(process.env.CONVEX_PLAN_DB_BANDWIDTH_GB || 1);
const PLAN_FILE_STORAGE_GB = Number(process.env.CONVEX_PLAN_FILE_STORAGE_GB || 1);
const WARN_AT = Number(process.env.CONVEX_USAGE_WARN_RATIO || 0.7);
const BILLING_DAY = Number(process.env.CONVEX_BILLING_DAY || 4);
const TEAM_ID = process.env.CONVEX_TEAM_ID || "519695";
const PROJECT_ID = process.env.CONVEX_PROJECT_ID || "2236890";
const FUNCTION_USAGE_QUERY_ID =
  process.env.CONVEX_FUNCTION_USAGE_QUERY_ID || "76c86baa-418e-4d7f-ac21-46f397030595";
const DATABASE_BANDWIDTH_COLUMN = 5;
const DEPLOYMENT_COLUMN = 12;

const token = process.env.CONVEX_ACCESS_TOKEN;
if (!token) {
  console.error("CONVEX_ACCESS_TOKEN is not set.");
  process.exit(1);
}

const isoDate = (date) => date.toISOString().slice(0, 10);

const billingWindow = (now) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), BILLING_DAY));
  if (start > now) start.setUTCMonth(start.getUTCMonth() - 1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
};

const fetchFunctionUsage = async (from, to) => {
  const url = new URL(`https://api.convex.dev/api/dashboard/teams/${TEAM_ID}/usage/query`);
  url.searchParams.set("queryId", FUNCTION_USAGE_QUERY_ID);
  url.searchParams.set("projectId", PROJECT_ID);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Origin: "https://dashboard.convex.dev" },
  });
  if (!response.ok) {
    throw new Error(`Usage query failed: HTTP ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || (rows.length > 0 && !Array.isArray(rows[0]))) {
    throw new Error("Usage query returned an unexpected shape; the dashboard API may have changed.");
  }
  return rows;
};

const databaseBandwidthByDeployment = (rows) => {
  const totals = new Map();
  for (const row of rows) {
    const deployment = String(row[DEPLOYMENT_COLUMN] ?? "unknown");
    const bytes = Number(row[DATABASE_BANDWIDTH_COLUMN]) || 0;
    totals.set(deployment, (totals.get(deployment) ?? 0) + bytes);
  }
  return totals;
};

const productionFileStorageBytes = () => {
  if (!process.env.CONVEX_DEPLOY_KEY) return null;
  const out = execFileSync("npx", ["convex", "data", "_storage", "--prod", "--limit", "8000", "--format", "jsonl"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let total = 0;
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    total += Number(JSON.parse(line).size) || 0;
  }
  return total;
};

const gb = (bytes) => (bytes / GB).toFixed(2);

const run = async () => {
  const now = new Date();
  const { start, end } = billingWindow(now);
  const rows = await fetchFunctionUsage(isoDate(start), isoDate(now));
  const bandwidth = databaseBandwidthByDeployment(rows);
  const bandwidthTotal = [...bandwidth.values()].reduce((a, b) => a + b, 0);
  const storage = productionFileStorageBytes();
  const daysIn = Math.max(1, Math.round((now - start) / 86_400_000));
  const daysTotal = Math.round((end - start) / 86_400_000);
  const projectedBandwidth = (bandwidthTotal / daysIn) * daysTotal;

  const lines = [
    `Billing period ${isoDate(start)} to ${isoDate(end)}, day ${daysIn} of ${daysTotal}.`,
    `Database bandwidth: ${gb(bandwidthTotal)} GB of ${PLAN_DATABASE_BANDWIDTH_GB} GB` +
      ` (${[...bandwidth.entries()].map(([d, b]) => `${d} ${gb(b)}`).join(", ")}),` +
      ` on track for ${gb(projectedBandwidth)} GB.`,
    storage === null
      ? "File storage: not measured (no CONVEX_DEPLOY_KEY)."
      : `File storage (production): ${gb(storage)} GB of ${PLAN_FILE_STORAGE_GB} GB.`,
  ];
  const warnings = [];
  if (bandwidthTotal >= WARN_AT * PLAN_DATABASE_BANDWIDTH_GB * GB) warnings.push("database bandwidth used");
  if (projectedBandwidth >= PLAN_DATABASE_BANDWIDTH_GB * GB) warnings.push("database bandwidth projected over the plan");
  if (storage !== null && storage >= WARN_AT * PLAN_FILE_STORAGE_GB * GB) warnings.push("file storage");

  const text = lines.join("\n");
  console.log(text);
  if (warnings.length > 0) console.log(`WARNING: ${warnings.join("; ")}`);

  const webhook = (process.env.GOOGLE_CHAT_WEBHOOK_URL ?? "").trim();
  const always = process.env.CONVEX_USAGE_ALWAYS_POST === "true";
  if (webhook && (warnings.length > 0 || always)) {
    const title = warnings.length > 0 ? `Convex usage warning: ${warnings.join("; ")}` : "Convex usage this period";
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${title}\n${text}` }),
    });
    if (!response.ok) throw new Error(`Google Chat post failed: HTTP ${response.status}`);
  }
  if (warnings.length > 0 && process.env.CONVEX_USAGE_FAIL_ON_WARNING === "true") process.exit(2);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
