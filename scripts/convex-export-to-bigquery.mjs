#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_DATASET,
  DEFAULT_LOCATION,
  DEFAULT_PROJECT,
  TABLE_SCHEMA,
  convertExportDir,
} from "./lib/convexExportToBigQuery.mjs";

const usage = `Usage:
  node scripts/convex-export-to-bigquery.mjs --dir <export-dir> --out <ndjson-dir>
  node scripts/convex-export-to-bigquery.mjs --zip <snapshot.zip> --out <ndjson-dir>

Options:
  --load                 Load the converted files into BigQuery (requires bq)
  --project <id>         GCP project (default ${DEFAULT_PROJECT})
  --dataset <id>         BigQuery dataset (default ${DEFAULT_DATASET})
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

const run = (command, commandArgs, { allowFailure = false } = {}) => {
  const result = spawnSync(command, commandArgs, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`${command} ${commandArgs.join(" ")} failed:\n${output}`);
  }
  return result;
};

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

const bqArgs = (project, location, rest) => [
  `--project_id=${project}`,
  `--location=${location}`,
  ...rest,
];

const ensureDataset = (project, dataset, location) => {
  const listed = run("bq", bqArgs(project, location, ["ls", "--max_results=1", dataset]), {
    allowFailure: true,
  });
  if (listed.status === 0) return;
  const created = run(
    "bq",
    bqArgs(project, location, [
      "mk",
      "--dataset",
      `--description=Daily Convex production snapshot for THE SHED`,
      `${project}:${dataset}`,
    ]),
    { allowFailure: true }
  );
  const output = `${created.stdout ?? ""}${created.stderr ?? ""}`;
  if (created.status === 0 || /already exists/i.test(output)) return;
  throw new Error(
    `Could not create BigQuery dataset ${project}:${dataset}. Grant the backup service account roles/bigquery.jobUser on the project and roles/bigquery.dataEditor on the dataset.\n${output.trim()}`
  );
};

const loadTable = (project, dataset, location, table, file, rows) => {
  const qualified = `${project}:${dataset}.${table}`;
  if (rows === 0) {
    run(
      "bq",
      bqArgs(project, location, [
        "query",
        "--nouse_legacy_sql",
        `CREATE OR REPLACE TABLE \`${project}.${dataset}.${table}\` (_id STRING, _creationTime TIMESTAMP, document JSON, _loadedAt TIMESTAMP)`,
      ])
    );
    return;
  }
  run(
    "bq",
    bqArgs(project, location, [
      "load",
      "--replace",
      "--source_format=NEWLINE_DELIMITED_JSON",
      `--schema=${TABLE_SCHEMA}`,
      qualified,
      file,
    ])
  );
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

    ensureDataset(args.project, args.dataset, args.location);
    for (const table of manifest.tables) {
      loadTable(
        args.project,
        args.dataset,
        args.location,
        table.table,
        table.file,
        table.rows
      );
      process.stdout.write(`Loaded ${table.table} (${table.rows} row(s))\n`);
    }
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
