import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_DATASET = "convex_production";
export const DEFAULT_LOCATION = "australia-southeast1";
export const DEFAULT_PROJECT = "theshedsow";

export const TABLE_SCHEMA =
  "_id:STRING,_creationTime:TIMESTAMP,document:JSON,_loadedAt:TIMESTAMP";

const SKIPPED_TABLES = new Set([
  "pushTokens",
  "contactRateLimit",
  "attendanceMetricsDirty",
]);

export const shouldExportTable = (name) => {
  if (!name || name.startsWith("_")) return false;
  if (name.startsWith("auth")) return false;
  if (SKIPPED_TABLES.has(name)) return false;
  return true;
};

export const creationTimeToTimestamp = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
};

export const documentToRow = (document, loadedAt) => {
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Each Convex document must be a JSON object");
  }
  if (typeof document._id !== "string" || document._id.length === 0) {
    throw new Error("Convex document is missing _id");
  }
  return {
    _id: document._id,
    _creationTime: creationTimeToTimestamp(document._creationTime),
    document,
    _loadedAt: loadedAt,
  };
};

const parseDocumentsJsonl = (table, contents) => {
  const rows = [];
  const lines = contents.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let document;
    try {
      document = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `${table}/documents.jsonl line ${i + 1} is not JSON: ${error instanceof Error ? error.message : error}`
      );
    }
    rows.push(document);
  }
  return rows;
};

export const convertExportDir = (exportDir, outDir, loadedAt = new Date().toISOString()) => {
  mkdirSync(outDir, { recursive: true });
  const entries = readdirSync(exportDir);
  const tables = [];

  for (const name of entries) {
    const tableDir = join(exportDir, name);
    if (!statSync(tableDir).isDirectory()) continue;
    if (!shouldExportTable(name)) continue;

    const documentsPath = join(tableDir, "documents.jsonl");
    let contents = "";
    try {
      contents = readFileSync(documentsPath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        throw new Error(`${name} is missing documents.jsonl`);
      }
      throw error;
    }

    const documents = parseDocumentsJsonl(name, contents);
    const ndjson = documents
      .map((document) => JSON.stringify(documentToRow(document, loadedAt)))
      .join("\n");
    const file = join(outDir, `${name}.jsonl`);
    writeFileSync(file, ndjson === "" ? "" : `${ndjson}\n`);
    tables.push({ table: name, rows: documents.length, file });
  }

  tables.sort((a, b) => a.table.localeCompare(b.table));
  const manifest = { loadedAt, tables };
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
};

export const stagingDatasetId = (dataset, loadedAt) => {
  const date = new Date(loadedAt);
  const stamp = Number.isNaN(date.getTime())
    ? "unknown"
    : date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d+Z$/i, "z")
        .toLowerCase();
  return `${dataset}_load_${stamp}`;
};

export const extraTables = (existingTables, manifestTableNames) => {
  const keep = new Set(manifestTableNames);
  return existingTables.filter((name) => !keep.has(name)).sort();
};

export const isLoadDataset = (dataset, name) =>
  typeof name === "string" && name.startsWith(`${dataset}_load_`);

export const jsonPayload = (text) => {
  if (!text) return "";
  const arrayStart = text.indexOf("[");
  const objectStart = text.indexOf("{");
  const starts = [arrayStart, objectStart].filter((index) => index >= 0);
  if (!starts.length) return text.trim();
  return text.slice(Math.min(...starts)).trim();
};

export const parseBqTableIds = (jsonText) => {
  const payload = jsonPayload(jsonText);
  if (!payload) return [];
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => row.tableId ?? row.id?.split(".").pop())
    .filter((name) => typeof name === "string" && name.length > 0);
};

export const parseBqDatasetIds = (jsonText) => {
  const payload = jsonPayload(jsonText);
  if (!payload) return [];
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => row.datasetId ?? row.id?.split(".").pop() ?? row.id?.split(":")[1])
    .filter((name) => typeof name === "string" && name.length > 0);
};
