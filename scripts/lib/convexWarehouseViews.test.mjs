// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  DEFAULT_WAREHOUSE_DATASET,
  fieldExpression,
  staleWarehouseViews,
  warehouseTableNames,
  warehouseViewSql,
  warehouseViewsToPublish,
} from "./convexWarehouseViews.mjs";
import { loadConvexSnapshot, makeRunner } from "./loadConvexSnapshot.mjs";

describe("warehouse views", () => {
  test("covers the business tables and skips auth scratch names", () => {
    const names = warehouseTableNames();
    expect(names).toContain("attendance");
    expect(names).toContain("requests");
    expect(names).toContain("staffProfiles");
    expect(names).toContain("savedBankAccounts");
    expect(names).not.toContain("pushTokens");
    expect(names).not.toContain("authSessions");
    expect(DEFAULT_WAREHOUSE_DATASET).toBe("convex_warehouse");
  });

  test("types scalars and leaves nested receipts as JSON", () => {
    expect(fieldExpression({ name: "email", type: "STRING" })).toBe("JSON_VALUE(document, '$.email')");
    expect(fieldExpression({ name: "year", type: "INT64" })).toBe(
      "SAFE_CAST(JSON_VALUE(document, '$.year') AS INT64)"
    );
    expect(fieldExpression({ name: "amount", type: "FLOAT64" })).toBe(
      "SAFE_CAST(JSON_VALUE(document, '$.amount') AS FLOAT64)"
    );
    expect(fieldExpression({ name: "paid", type: "BOOL" })).toBe(
      "SAFE_CAST(JSON_VALUE(document, '$.paid') AS BOOL)"
    );
    expect(fieldExpression({ name: "signInTime", type: "TIMESTAMP" })).toBe(
      "TIMESTAMP_MILLIS(SAFE_CAST(JSON_VALUE(document, '$.signInTime') AS INT64))"
    );
    expect(fieldExpression({ name: "receipt", type: "JSON" })).toBe(
      "JSON_QUERY(document, '$.receipt')"
    );
    expect(() => fieldExpression({ name: "x", type: "BLOB" })).toThrow(/Unknown warehouse field type/);
  });

  test("builds a CREATE VIEW that reads the JSON snapshot", () => {
    const sql = warehouseViewSql("theshedsow", "convex_production", "convex_warehouse", "requests");
    expect(sql).toContain("CREATE OR REPLACE VIEW `theshedsow.convex_warehouse.requests`");
    expect(sql).toContain("FROM `theshedsow.convex_production.requests`");
    expect(sql).toContain("AS `amount`");
    expect(sql).toContain("AS `paidTime`");
    expect(sql).toContain("JSON_QUERY(document, '$.receipt')");
    expect(warehouseViewSql("p", "s", "w", "authSessions")).toBeNull();
  });

  test("only publishes views for tables that landed in this snapshot", () => {
    expect(warehouseViewsToPublish(["attendance", "authSessions", "requests"])).toEqual([
      "attendance",
      "requests",
    ]);
    expect(staleWarehouseViews(["attendance", "obsolete", "requests"], ["attendance"])).toEqual([
      "obsolete",
      "requests",
    ]);
  });
});

const ok = (stdout = "") => ({ status: 0, stdout, stderr: "", error: null });
const argLine = (args) => args.join(" ");

describe("loadConvexSnapshot warehouse views", () => {
  test("creates typed views after publish and drops stale warehouse leftovers", () => {
    const calls = [];
    const run = makeRunner((command, args) => {
      calls.push([command, ...args]);
      const line = argLine(args);
      if (line.includes("ls --format=json --max_results=1000 convex_warehouse")) {
        return ok(JSON.stringify([{ tableId: "attendance" }, { tableId: "obsolete" }]));
      }
      if (line.includes("ls --max_results=1")) return ok();
      return ok("[]");
    });

    loadConvexSnapshot({
      project: "theshedsow",
      dataset: "convex_production",
      location: "australia-southeast1",
      warehouseDataset: "convex_warehouse",
      manifest: {
        loadedAt: "2026-08-31T12:00:00.000Z",
        tables: [{ table: "attendance", rows: 1, file: "attendance.jsonl" }],
      },
      run,
    });

    const lines = calls.map((call) => call.slice(1).join(" "));
    const viewAt = lines.findIndex(
      (line) =>
        line.includes("CREATE OR REPLACE VIEW `theshedsow.convex_warehouse.attendance`") &&
        line.includes("FROM `theshedsow.convex_production.attendance`")
    );
    const dropObsolete = lines.findIndex((line) => line.includes("convex_warehouse.obsolete"));
    const dropStaging = lines.findLastIndex((line) =>
      line.includes("rm --recursive --force theshedsow:convex_production_load_20260831t120000z")
    );
    expect(viewAt).toBeGreaterThan(0);
    expect(dropObsolete).toBeGreaterThan(viewAt);
    expect(dropStaging).toBeGreaterThan(dropObsolete);
  });

  test("skips warehouse views when warehouseDataset is empty", () => {
    const calls = [];
    const run = makeRunner((command, args) => {
      calls.push([command, ...args]);
      return ok("[]");
    });
    loadConvexSnapshot({
      project: "theshedsow",
      dataset: "convex_production",
      location: "australia-southeast1",
      warehouseDataset: "",
      manifest: {
        loadedAt: "2026-08-31T12:00:00.000Z",
        tables: [{ table: "attendance", rows: 0, file: "attendance.jsonl" }],
      },
      run,
    });
    const lines = calls.map((call) => call.slice(1).join(" "));
    expect(lines.some((line) => line.includes("convex_warehouse"))).toBe(false);
  });
});
