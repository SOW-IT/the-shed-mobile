/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("migrations.dropStaffEmail", () => {
  test("moves staffEmail into email and clears the column", async () => {
    const t = convexTest(schema, modules);
    const { linked, personalLinked, plain } = await t.run(async (ctx) => ({
      // email already equals staffEmail — clearing staffEmail is enough.
      linked: await ctx.db.insert("attendanceMembers", {
        name: "Staff A",
        email: "a@sow.org.au",
        staffEmail: "a@sow.org.au",
      }),
      // personal email + a staff link — email must be overwritten with the link.
      personalLinked: await ctx.db.insert("attendanceMembers", {
        name: "Staff B",
        email: "personal@gmail.com",
        staffEmail: "b@sow.org.au",
      }),
      // no staffEmail — left untouched.
      plain: await ctx.db.insert("attendanceMembers", {
        name: "Member C",
        email: "c@example.com",
      }),
    }));

    const dry = await t.mutation(internal.migrations.dropStaffEmail, {
      dryRun: true,
    });
    expect(dry).toEqual({ scanned: 3, migrated: 0, remaining: 2 });

    const res = await t.mutation(internal.migrations.dropStaffEmail, {});
    expect(res).toEqual({ scanned: 3, migrated: 2, remaining: 0 });

    const rows = await t.run(async (ctx) => ({
      linked: await ctx.db.get(linked),
      personalLinked: await ctx.db.get(personalLinked),
      plain: await ctx.db.get(plain),
    }));
    expect(rows.linked?.email).toBe("a@sow.org.au");
    expect(rows.linked?.staffEmail).toBeUndefined();
    // Personal email replaced by the staff link.
    expect(rows.personalLinked?.email).toBe("b@sow.org.au");
    expect(rows.personalLinked?.staffEmail).toBeUndefined();
    // Plain member unchanged.
    expect(rows.plain?.email).toBe("c@example.com");
    expect(rows.plain?.staffEmail).toBeUndefined();

    // Idempotent: a second run has nothing left to do.
    expect(await t.mutation(internal.migrations.dropStaffEmail, {})).toEqual({
      scanned: 3,
      migrated: 0,
      remaining: 0,
    });
  });
});
