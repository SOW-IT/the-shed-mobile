import {
  TABLE_SCHEMA,
  extraTables,
  isLoadDataset,
  parseBqDatasetIds,
  parseBqTableIds,
  stagingDatasetId,
} from "./convexExportToBigQuery.mjs";

const IAM_HINT =
  "Grant the backup service account roles/bigquery.user on the project (jobs and datasets.create), roles/bigquery.dataEditor on the destination dataset, and storage.objects.get on the backup bucket. Or pre-create the destination dataset and skip automatic dataset creation.";

export const makeRunner = (spawn) => (command, commandArgs, { allowFailure = false } = {}) => {
  const result = spawn(command, commandArgs, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`${command} ${commandArgs.join(" ")} failed:\n${output}`);
  }
  return result;
};

const bq = (run, project, args, allowFailure = false) =>
  run("bq", ["--quiet", `--project_id=${project}`, ...args], { allowFailure });

const ensureDataset = (run, project, dataset, location, description) => {
  const listed = bq(run, project, ["ls", "--max_results=1", dataset], true);
  if (listed.status === 0) return;
  const created = bq(
    run,
    project,
    [
      "mk",
      `--location=${location}`,
      "--dataset",
      `--description=${description}`,
      `${project}:${dataset}`,
    ],
    true
  );
  const output = `${created.stdout ?? ""}${created.stderr ?? ""}`;
  if (created.status === 0 || /already exists/i.test(output)) return;
  throw new Error(
    `Could not create BigQuery dataset ${project}:${dataset}. ${IAM_HINT}\n${output.trim()}`
  );
};

const listTables = (run, project, dataset) => {
  const listed = bq(
    run,
    project,
    ["ls", "--format=json", "--max_results=1000", dataset],
    true
  );
  if (listed.status !== 0) return [];
  return parseBqTableIds(listed.stdout ?? "");
};

const listDatasets = (run, project) => {
  const listed = bq(run, project, ["ls", "--format=json", "--max_results=1000"], true);
  if (listed.status !== 0) return [];
  return parseBqDatasetIds(listed.stdout ?? "");
};

const dropDataset = (run, project, dataset) => {
  bq(run, project, ["rm", "--recursive", "--force", `${project}:${dataset}`], true);
};

const dropStaleLoadDatasets = (run, project, dataset, keep) => {
  for (const name of listDatasets(run, project)) {
    if (!isLoadDataset(dataset, name) || name === keep) continue;
    dropDataset(run, project, name);
  }
};

const loadTable = (run, project, dataset, location, table, file, rows) => {
  const qualified = `${project}:${dataset}.${table}`;
  if (rows === 0) {
    bq(run, project, [
      "query",
      `--location=${location}`,
      "--nouse_legacy_sql",
      `CREATE OR REPLACE TABLE \`${project}.${dataset}.${table}\` (_id STRING, _creationTime TIMESTAMP, document JSON, _loadedAt TIMESTAMP)`,
    ]);
    return;
  }
  bq(run, project, [
    "load",
    `--location=${location}`,
    "--replace",
    "--source_format=NEWLINE_DELIMITED_JSON",
    `--schema=${TABLE_SCHEMA}`,
    qualified,
    file,
  ]);
};

const copyTable = (run, project, fromDataset, toDataset, table) => {
  bq(run, project, [
    "cp",
    "--force",
    `${project}:${fromDataset}.${table}`,
    `${project}:${toDataset}.${table}`,
  ]);
};

const dropTable = (run, project, dataset, table) => {
  bq(run, project, ["rm", "--force", "--table", `${project}:${dataset}.${table}`]);
};

export const loadConvexSnapshot = ({ project, dataset, location, manifest, run }) => {
  const staging = stagingDatasetId(dataset, manifest.loadedAt);
  const tableNames = manifest.tables.map((table) => table.table);
  dropStaleLoadDatasets(run, project, dataset, staging);
  ensureDataset(
    run,
    project,
    dataset,
    location,
    "Daily Convex production snapshot for THE SHED"
  );
  ensureDataset(
    run,
    project,
    staging,
    location,
    "Transient Convex snapshot load; replaced after a successful publish"
  );

  let stagingReady = false;
  try {
    for (const table of manifest.tables) {
      loadTable(run, project, staging, location, table.table, table.file, table.rows);
      process.stdout.write(`Staged ${table.table} (${table.rows} row(s))\n`);
    }
    stagingReady = true;
    for (const table of manifest.tables) {
      copyTable(run, project, staging, dataset, table.table);
      process.stdout.write(`Published ${table.table}\n`);
    }
    const existing = listTables(run, project, dataset);
    for (const extra of extraTables(existing, tableNames)) {
      dropTable(run, project, dataset, extra);
      process.stdout.write(`Dropped stale ${extra}\n`);
    }
  } catch (error) {
    if (!stagingReady) {
      dropDataset(run, project, staging);
    }
    throw error;
  }
  dropDataset(run, project, staging);
};
