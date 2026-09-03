// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  REPORT_VIEWS,
  reportViewSql,
  reportViewsToPublish,
} from "./convexWarehouseReports.mjs";
import { staleWarehouseViews } from "./convexWarehouseViews.mjs";
import { loadConvexSnapshot, makeRunner } from "./loadConvexSnapshot.mjs";

describe("report views", () => {
  test("covers Insights charts plus org, attendance and requests", () => {
    const names = REPORT_VIEWS.map((view) => view.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "insights_summary",
        "insights_weekly_trend",
        "insights_follow_ups",
        "insights_breakdowns",
        "staff_assignments",
        "attendance_signins",
        "event_subgroups",
        "requests_status",
        "request_recipients",
      ])
    );
    expect(reportViewsToPublish(["staffProfiles"])).toEqual(["staff_assignments"]);
    expect(reportViewsToPublish(["attendance"])).toEqual([]);
    expect(reportViewsToPublish(["requests"])).toEqual(
      expect.arrayContaining(["requests_status", "request_recipients"])
    );
  });

  test("Insights views unnest chart series into scalar rows", () => {
    const sql = reportViewSql(
      "theshedsow",
      "convex_production",
      "convex_warehouse",
      "insights_weekly_trend"
    );
    expect(sql).toContain("CREATE OR REPLACE VIEW `theshedsow.convex_warehouse.insights_weekly_trend`");
    expect(sql).toContain("JSON_QUERY_ARRAY(s.document, '$.data.weeklyTrend')");
    expect(sql).toContain("AS `at`");
    expect(sql).toContain("AS `label`");
    expect(sql).toContain("AS `value`");
    expect(sql).not.toContain("AS `data`");
    const mix = reportViewSql(
      "theshedsow",
      "convex_production",
      "convex_warehouse",
      "insights_campus_mix"
    );
    expect(mix).toContain("AS `at`");
    expect(mix).toContain("AS `label`");
    expect(mix).toContain("AS `primary`");
    expect(mix).toContain("AS `rest`");
  });

  test("staff assignments keep people with no assignment row", () => {
    const sql = reportViewSql(
      "theshedsow",
      "convex_production",
      "convex_warehouse",
      "staff_assignments"
    );
    expect(sql).toContain("LEFT JOIN UNNEST");
    expect(sql).toContain("AS department");
    expect(sql).toContain("AS university");
  });

  test("request recipients flatten bank lines; requests_status has no JSON columns", () => {
    const pay = reportViewSql(
      "theshedsow",
      "convex_production",
      "convex_warehouse",
      "request_recipients"
    );
    expect(pay).toContain("$.receipt.recipients");
    expect(pay).toContain("AS bsb");
    const status = reportViewSql(
      "theshedsow",
      "convex_production",
      "convex_warehouse",
      "requests_status"
    );
    expect(status).toContain("AS amount");
    expect(status).not.toContain("JSON_QUERY");
    expect(reportViewSql("p", "s", "w", "nope")).toBeNull();
  });

  test("keeps report views when dropping stale warehouse leftovers", () => {
    expect(
      staleWarehouseViews(
        ["attendance", "insights_summary", "obsolete"],
        ["attendance", "attendanceMetricsSnapshots"]
      )
    ).toEqual(["obsolete"]);
  });
});

const ok = (stdout = "") => ({ status: 0, stdout, stderr: "", error: null });
const argLine = (args) => args.join(" ");

describe("loadConvexSnapshot report views", () => {
  test("publishes staff_assignments after the JSON snapshot", () => {
    const calls = [];
    const run = makeRunner((command, args) => {
      calls.push([command, ...args]);
      return ok("[]");
    });
    loadConvexSnapshot({
      project: "theshedsow",
      dataset: "convex_production",
      location: "australia-southeast1",
      warehouseDataset: "convex_warehouse",
      manifest: {
        loadedAt: "2026-08-31T12:00:00.000Z",
        tables: [{ table: "staffProfiles", rows: 1, file: "staffProfiles.jsonl" }],
      },
      run,
    });
    const lines = calls.map((call) => call.slice(1).join(" "));
    expect(
      lines.some((line) =>
        line.includes("CREATE OR REPLACE VIEW `theshedsow.convex_warehouse.staff_assignments`")
      )
    ).toBe(true);
    expect(
      lines.some((line) =>
        line.includes("CREATE OR REPLACE VIEW `theshedsow.convex_warehouse.insights_summary`")
      )
    ).toBe(false);
  });
});
