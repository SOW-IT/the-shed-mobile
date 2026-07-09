/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
});

describe("post-rollover auth grace", () => {
  test("requireProfile falls back to the previous-year profile for the first week", async () => {
    // Staff year 2027 begins at Sydney midnight Oct 1 2026 (= Sep 30 14:00 UTC).
    const start = staffYearStartMs(2027);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(start + 2 * 24 * 60 * 60 * 1000)); // 2 days in

    const t = convexTest(schema, modules);
    const email = "grace@sow.org.au";
    // Only a previous-year (2026) profile exists — the cliff case after Oct 1.
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email,
        year: 2026,
        assignments: [{ role: "Staff", department: "Finance" }],
        name: "Grace",
      });
      await ctx.db.insert("departments", {
        year: 2026,
        name: "Finance",
        division: "Governance",
      });
      await ctx.db.insert("departments", {
        year: 2027,
        name: "Finance",
        division: "Governance",
      });
    });

    const me = await t
      .withIdentity({ email, subject: email, issuer: "test" })
      .query(api.directory.me, {});
    expect(me).not.toBeNull();
    expect(me!.year).toBe(2027);
    expect(me!.email).toBe(email);
    expect(me!.profile).not.toBeNull();
  });

  test("directory.me has no profile after the grace window without a new-year row", async () => {
    const start = staffYearStartMs(2027);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(start + 8 * 24 * 60 * 60 * 1000)); // 8 days in

    const t = convexTest(schema, modules);
    const email = "late@sow.org.au";
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email,
        year: 2026,
        assignments: [{ role: "Staff", department: "Finance" }],
      });
    });

    const me = await t
      .withIdentity({ email, subject: email, issuer: "test" })
      .query(api.directory.me, {});
    // Outside the grace window with no 2027 profile → signed in but unprovisioned.
    expect(me).not.toBeNull();
    expect(me!.year).toBe(2027);
    expect(me!.profile).toBeNull();
  });
});
