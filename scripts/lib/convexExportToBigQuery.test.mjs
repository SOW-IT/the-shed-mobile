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
  shouldExportTable,
} from "./convexExportToBigQuery.mjs";

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
