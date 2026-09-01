// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const cli = join(dirname(fileURLToPath(import.meta.url)), "../convex-export-to-bigquery.mjs");
import {
  convertExportDir,
  creationTimeToTimestamp,
  documentToRow,
  extraTables,
  isLoadDataset,
  jsonPayload,
  parseBqDatasetIds,
  parseBqTableIds,
  shouldExportTable,
  stagingDatasetId,
} from "./convexExportToBigQuery.mjs";
import { loadConvexSnapshot, makeRunner } from "./loadConvexSnapshot.mjs";

const temps = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "convex-bq-test-"));
  temps.push(dir);
  return dir;
};

afterEach(() => {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
});

const writeTable = (root, table, lines) => {
  mkdirSync(join(root, table), { recursive: true });
  writeFileSync(join(root, table, "documents.jsonl"), lines.join("\n") + (lines.length ? "\n" : ""));
};

describe("shouldExportTable", () => {
  test("keeps business tables and drops auth, storage, and scratch tables", () => {
    expect(shouldExportTable("attendance")).toBe(true);
    expect(shouldExportTable("requests")).toBe(true);
    expect(shouldExportTable("users")).toBe(true);
    expect(shouldExportTable("savedBankAccounts")).toBe(true);
    expect(shouldExportTable("authSessions")).toBe(false);
    expect(shouldExportTable("authAccounts")).toBe(false);
    expect(shouldExportTable("authRefreshTokens")).toBe(false);
    expect(shouldExportTable("pushTokens")).toBe(false);
    expect(shouldExportTable("contactRateLimit")).toBe(false);
    expect(shouldExportTable("attendanceMetricsDirty")).toBe(false);
    expect(shouldExportTable("_storage")).toBe(false);
    expect(shouldExportTable("")).toBe(false);
  });
});

describe("documentToRow", () => {
  test("copies the document and converts _creationTime to ISO", () => {
    const document = {
      _id: "jd7abc",
      _creationTime: Date.UTC(2026, 7, 31, 11, 0, 0),
      email: "a@sow.org.au",
      receipt: { totalAmount: 12.5, recipients: [] },
    };
    expect(documentToRow(document, "2026-08-31T12:00:00.000Z")).toEqual({
      _id: "jd7abc",
      _creationTime: "2026-08-31T11:00:00.000Z",
      document,
      _loadedAt: "2026-08-31T12:00:00.000Z",
    });
  });

  test("rejects documents without an id", () => {
    expect(() => documentToRow({ email: "a@sow.org.au" }, "2026-08-31T12:00:00.000Z")).toThrow(
      /missing _id/
    );
    expect(() => documentToRow(null, "2026-08-31T12:00:00.000Z")).toThrow(/JSON object/);
  });
});

describe("creationTimeToTimestamp", () => {
  test("returns null for missing or invalid values", () => {
    expect(creationTimeToTimestamp(undefined)).toBeNull();
    expect(creationTimeToTimestamp(Number.NaN)).toBeNull();
    expect(creationTimeToTimestamp("not-a-number")).toBeNull();
  });
});

describe("convertExportDir", () => {
  test("writes ndjson for exported tables and a manifest", () => {
    const exportDir = tempDir();
    const outDir = tempDir();
    writeTable(exportDir, "attendance", [
      JSON.stringify({
        _id: "a1",
        _creationTime: Date.UTC(2026, 0, 1),
        eventId: "e1",
        email: "member@sow.org.au",
      }),
      JSON.stringify({
        _id: "a2",
        _creationTime: Date.UTC(2026, 0, 2),
        eventId: "e2",
      }),
    ]);
    writeTable(exportDir, "authSessions", [
      JSON.stringify({ _id: "s1", _creationTime: 1, refreshToken: "secret" }),
    ]);
    writeTable(exportDir, "_storage", [JSON.stringify({ _id: "file1" })]);
    writeTable(exportDir, "pushTokens", [
      JSON.stringify({ _id: "p1", _creationTime: 1, token: "device" }),
    ]);
    writeFileSync(join(exportDir, "generated_schema.jsonl"), "{}\n");
    mkdirSync(join(exportDir, "events"), { recursive: true });
    writeFileSync(join(exportDir, "events", "documents.jsonl"), "");

    const loadedAt = "2026-08-31T12:00:00.000Z";
    const manifest = convertExportDir(exportDir, outDir, loadedAt);

    expect(manifest.tables.map((table) => table.table)).toEqual(["attendance", "events"]);
    expect(manifest.tables[0].rows).toBe(2);
    expect(manifest.tables[1].rows).toBe(0);

    const attendance = readFileSync(join(outDir, "attendance.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(attendance).toHaveLength(2);
    expect(attendance[0]._id).toBe("a1");
    expect(attendance[0].document.email).toBe("member@sow.org.au");
    expect(attendance[0]._loadedAt).toBe(loadedAt);

    expect(readFileSync(join(outDir, "events.jsonl"), "utf8")).toBe("");
    expect(() => readFileSync(join(outDir, "authSessions.jsonl"))).toThrow();
    expect(() => readFileSync(join(outDir, "pushTokens.jsonl"))).toThrow();
  });

  test("fails when a table directory has no documents.jsonl", () => {
    const exportDir = tempDir();
    mkdirSync(join(exportDir, "requests"));
    expect(() => convertExportDir(exportDir, tempDir())).toThrow(/missing documents.jsonl/);
  });

  test("fails on a malformed jsonl line", () => {
    const exportDir = tempDir();
    writeTable(exportDir, "users", ["{"]);
    expect(() => convertExportDir(exportDir, tempDir())).toThrow(/line 1 is not JSON/);
  });
});

describe("CLI", () => {
  test("converts a zip export and skips auth tables", () => {
    const exportDir = tempDir();
    writeTable(exportDir, "staffProfiles", [
      JSON.stringify({
        _id: "p1",
        _creationTime: Date.UTC(2026, 9, 1),
        email: "a@sow.org.au",
        year: 2027,
      }),
    ]);
    writeTable(exportDir, "authSessions", [
      JSON.stringify({ _id: "s1", _creationTime: 1 }),
    ]);
    const zip = join(tempDir(), "snapshot.zip");
    const zipped = spawnSync("zip", ["-q", "-r", zip, "."], {
      cwd: exportDir,
      encoding: "utf8",
    });
    expect(zipped.status).toBe(0);

    const outDir = tempDir();
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "--zip",
        zip,
        "--out",
        outDir,
        "--loaded-at",
        "2026-08-31T12:00:00.000Z",
      ],
      { encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/staffProfiles: 1 row/);
    const rows = readFileSync(join(outDir, "staffProfiles.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0].document.email).toBe("a@sow.org.au");
    expect(() => readFileSync(join(outDir, "authSessions.jsonl"))).toThrow();
  });

  test("exits non-zero without --dir or --zip", () => {
    const result = spawnSync(process.execPath, [cli, "--out", tempDir()], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Usage:/);
  });
});

describe("snapshot publish plan", () => {
  test("names a run-specific staging dataset", () => {
    expect(stagingDatasetId("convex_production", "2026-08-31T12:00:00.000Z")).toBe(
      "convex_production_load_20260831t120000z"
    );
    expect(isLoadDataset("convex_production", "convex_production_load_20260831t120000z")).toBe(
      true
    );
    expect(isLoadDataset("convex_production", "convex_production")).toBe(false);
  });

  test("drops destination tables that are not in the current export", () => {
    expect(extraTables(["attendance", "scratch", "requests"], ["attendance", "requests"])).toEqual(
      ["scratch"]
    );
    expect(extraTables(["attendance"], ["attendance", "requests"])).toEqual([]);
  });

  test("parses bq ls json", () => {
    expect(parseBqTableIds('[{"tableId":"attendance"},{"tableId":"requests"}]')).toEqual([
      "attendance",
      "requests",
    ]);
    expect(parseBqTableIds("")).toEqual([]);
    expect(parseBqDatasetIds('[{"datasetId":"convex_production_load_old"}]')).toEqual([
      "convex_production_load_old",
    ]);
  });

  test("ignores bq warning text before the json payload", () => {
    const warned =
      'WARNING: `--format=json` with no dataset lists all datasets.\n[{"datasetId":"convex_production_load_old"}]\n';
    expect(jsonPayload(warned)).toBe('[{"datasetId":"convex_production_load_old"}]');
    expect(parseBqDatasetIds(warned)).toEqual(["convex_production_load_old"]);
    expect(
      parseBqTableIds('WARNING: "`format` is json"\n[{"tableId":"attendance"}]')
    ).toEqual(["attendance"]);
  });
});

const ok = (stdout = "") => ({ status: 0, stdout, stderr: "", error: null });
const fail = (stderr) => ({ status: 1, stdout: "", stderr, error: null });
const argLine = (args) => args.join(" ");

const mockBq = (handler) => {
  const calls = [];
  const run = makeRunner((command, args) => {
    calls.push([command, ...args]);
    return handler(args) ?? ok("[]");
  });
  return { run, calls };
};

describe("loadConvexSnapshot", () => {
  const loadedAt = "2026-08-31T12:00:00.000Z";
  const staging = "convex_production_load_20260831t120000z";
  const manifest = {
    loadedAt,
    tables: [
      { table: "attendance", rows: 2, file: "attendance.jsonl" },
      { table: "requests", rows: 0, file: "requests.jsonl" },
    ],
  };

  test("loads staging first, then publishes, then drops tables missing from this export", () => {
    const { run, calls } = mockBq((args) => {
      const line = argLine(args);
      if (line.includes("ls --format=json --max_results=1000") && !line.includes("convex_production")) {
        return ok(
          'WARNING: `--format=json` with no dataset lists all datasets.\n' +
            JSON.stringify([{ datasetId: "convex_production_load_old" }])
        );
      }
      if (line.includes(`ls --format=json --max_results=1000 convex_production`) &&
          !line.includes(staging)) {
        return ok(JSON.stringify([{ tableId: "attendance" }, { tableId: "scratch" }]));
      }
      if (line.includes("ls --max_results=1")) return ok();
      return ok("[]");
    });

    loadConvexSnapshot({
      project: "theshedsow",
      dataset: "convex_production",
      location: "australia-southeast1",
      manifest,
      run,
    });

    const lines = calls.map((call) => call.slice(1).join(" "));
    const loadAt = lines.findIndex((line) => line.includes("load") && line.includes(`${staging}.attendance`));
    const queryAt = lines.findIndex((line) => line.includes("CREATE OR REPLACE TABLE") && line.includes(`.${staging}.requests`));
    const copyAttendance = lines.findIndex((line) =>
      line.includes("cp") && line.includes(`${staging}.attendance`) && line.includes("convex_production.attendance")
    );
    const copyRequests = lines.findIndex((line) =>
      line.includes("cp") && line.includes(`${staging}.requests`)
    );
    const dropScratch = lines.findIndex((line) => line.includes("rm") && line.includes(".scratch"));
    const dropOld = lines.findIndex((line) => line.includes("convex_production_load_old"));
    const dropStaging = lines.findLastIndex((line) => line.includes(`rm --recursive --force theshedsow:${staging}`));

    expect(dropOld).toBeGreaterThanOrEqual(0);
    expect(loadAt).toBeGreaterThan(dropOld);
    expect(queryAt).toBeGreaterThan(loadAt);
    expect(copyAttendance).toBeGreaterThan(queryAt);
    expect(copyRequests).toBeGreaterThan(copyAttendance);
    expect(dropScratch).toBeGreaterThan(copyRequests);
    expect(dropStaging).toBeGreaterThan(dropScratch);
    const loads = lines.filter((line) => line.includes(" load "));
    expect(loads.length).toBeGreaterThan(0);
    expect(loads.every((line) => line.includes(`:${staging}.`))).toBe(true);
  });

  test("does not copy into production if a staging load fails", () => {
    const { run, calls } = mockBq((args) => {
      const line = argLine(args);
      if (line.includes("ls --max_results=1")) return ok();
      if (line.includes("load") && line.includes("attendance")) return fail("quota");
      return ok("[]");
    });

    expect(() =>
      loadConvexSnapshot({
        project: "theshedsow",
        dataset: "convex_production",
        location: "australia-southeast1",
        manifest,
        run,
      })
    ).toThrow(/quota/);

    const lines = calls.map((call) => call.slice(1).join(" "));
    expect(lines.some((line) => line.includes("cp --force"))).toBe(false);
    expect(lines.some((line) => line.includes(`rm --recursive --force theshedsow:${staging}`))).toBe(
      true
    );
  });
});
