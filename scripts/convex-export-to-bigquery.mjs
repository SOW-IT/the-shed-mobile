#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_DATASET,
  DEFAULT_LOCATION,
  DEFAULT_PROJECT,
  convertExportDir,
} from "./lib/convexExportToBigQuery.mjs";
import { DEFAULT_WAREHOUSE_DATASET } from "./lib/convexWarehouseViews.mjs";
import { loadConvexSnapshot, makeRunner } from "./lib/loadConvexSnapshot.mjs";

const usage = `Usage:
  node scripts/convex-export-to-bigquery.mjs --dir <export-dir> --out <ndjson-dir>
  node scripts/convex-export-to-bigquery.mjs --zip <snapshot.zip> --out <ndjson-dir>

Options:
  --load                 Load the converted files into BigQuery (requires bq)
  --project <id>         GCP project (default ${DEFAULT_PROJECT})
  --dataset <id>         BigQuery dataset (default ${DEFAULT_DATASET})
  --warehouse <id>       Typed-view dataset (default ${DEFAULT_WAREHOUSE_DATASET})
  --location <region>    Dataset location (default ${DEFAULT_LOCATION})
  --loaded-at <iso>      Override _loadedAt for tests
`;

const parseArgs = (argv) => {
  const args = {
    dir: null,
    zip: null,
    out: null,
    load: false,
    project: DEFAULT_PROJECT,
    dataset: DEFAULT_DATASET,
    warehouseDataset: DEFAULT_WAREHOUSE_DATASET,
    location: DEFAULT_LOCATION,
    loadedAt: new Date().toISOString(),
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case "--dir":
        args.dir = next;
        i++;
        break;
      case "--zip":
        args.zip = next;
        i++;
        break;
      case "--out":
        args.out = next;
        i++;
        break;
      case "--project":
        args.project = next;
        i++;
        break;
      case "--dataset":
        args.dataset = next;
        i++;
        break;
      case "--warehouse":
        args.warehouseDataset = next;
        i++;
        break;
      case "--location":
        args.location = next;
        i++;
        break;
      case "--loaded-at":
        args.loadedAt = next;
        i++;
        break;
      case "--load":
        args.load = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}\n${usage}`);
    }
  }
  return args;
};

const run = makeRunner(spawnSync);

const unzipToTemp = (zipPath) => {
  const dest = mkdtempSync(join(tmpdir(), "convex-export-"));
  const result = run("unzip", ["-q", zipPath, "-d", dest], { allowFailure: true });
  if (result.status !== 0) {
    rmSync(dest, { recursive: true, force: true });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`unzip ${zipPath} failed:\n${output}`);
  }
  return dest;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  if (!args.out || (!args.dir && !args.zip)) {
    throw new Error(usage);
  }
  if (args.dir && args.zip) {
    throw new Error("Pass --dir or --zip, not both");
  }

  let exportDir = args.dir;
  let cleanup = null;
  if (args.zip) {
    exportDir = unzipToTemp(args.zip);
    cleanup = () => rmSync(exportDir, { recursive: true, force: true });
  }

  try {
    const manifest = convertExportDir(exportDir, args.out, args.loadedAt);
    process.stdout.write(
      `Converted ${manifest.tables.length} table(s) to ${args.out}\n`
    );
    for (const table of manifest.tables) {
      process.stdout.write(`  ${table.table}: ${table.rows} row(s)\n`);
    }
    if (!args.load) return;

    loadConvexSnapshot({
      project: args.project,
      dataset: args.dataset,
      warehouseDataset: args.warehouseDataset,
      location: args.location,
      manifest,
      run,
    });
  } finally {
    cleanup?.();
  }
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
