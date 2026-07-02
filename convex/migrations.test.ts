/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("migrations.dropStaffEmail", () => {
  test("moves staffEmail into email and clears the column", async () => {
    const t = convexTest(schema, modules);
    const { linked, personalLinked, plain, messyEmail, malformed } =
      await t.run(async (ctx) => ({
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
        // no staffEmail, already normalised — left untouched.
        plain: await ctx.db.insert("attendanceMembers", {
          name: "Member C",
          email: "c@example.com",
        }),
        // no staffEmail but a non-normalised email — lowercased/trimmed in place.
        messyEmail: await ctx.db.insert("attendanceMembers", {
          name: "Member D",
          email: "  Messy@Example.COM  ",
        }),
        // staffEmail present but not an email — must be left untouched.
        malformed: await ctx.db.insert("attendanceMembers", {
          name: "Member E",
          email: "e@example.com",
          staffEmail: "not-an-email",
        }),
      }));

    const dry = await t.mutation(internal.migrations.dropStaffEmail, {
      dryRun: true,
    });
    // linked + personalLinked would migrate, messyEmail would normalise;
    // malformed is reported as invalid, plain is already clean.
    expect(dry).toEqual({
      scanned: 5,
      migrated: 0,
      normalized: 0,
      invalid: 1,
      collisions: 0,
      remaining: 3,
    });

    const res = await t.mutation(internal.migrations.dropStaffEmail, {});
    expect(res).toEqual({
      scanned: 5,
      migrated: 2,
      normalized: 1,
      invalid: 1,
      collisions: 0,
      remaining: 0,
    });

    const rows = await t.run(async (ctx) => ({
      linked: await ctx.db.get(linked),
      personalLinked: await ctx.db.get(personalLinked),
      plain: await ctx.db.get(plain),
      messyEmail: await ctx.db.get(messyEmail),
      malformed: await ctx.db.get(malformed),
    }));
    expect(rows.linked?.email).toBe("a@sow.org.au");
    expect(rows.linked?.staffEmail).toBeUndefined();
    // Personal email replaced by the staff link.
    expect(rows.personalLinked?.email).toBe("b@sow.org.au");
    expect(rows.personalLinked?.staffEmail).toBeUndefined();
    // Plain member unchanged.
    expect(rows.plain?.email).toBe("c@example.com");
    expect(rows.plain?.staffEmail).toBeUndefined();
    // Non-normalised email lowercased/trimmed in place.
    expect(rows.messyEmail?.email).toBe("messy@example.com");
    expect(rows.messyEmail?.staffEmail).toBeUndefined();
    // Malformed staff link preserved for manual review — nothing lost.
    expect(rows.malformed?.email).toBe("e@example.com");
    expect(rows.malformed?.staffEmail).toBe("not-an-email");

    // Idempotent: a second run only re-reports the untouched invalid row.
    expect(await t.mutation(internal.migrations.dropStaffEmail, {})).toEqual({
      scanned: 5,
      migrated: 0,
      normalized: 0,
      invalid: 1,
      collisions: 0,
      remaining: 0,
    });
  });

  test("leaves a row untouched when a rewrite would collide with an existing email", async () => {
    const t = convexTest(schema, modules);
    const { canonical, linked, lower, upper } = await t.run(async (ctx) => ({
      // A plain member already sitting on the canonical staff email.
      canonical: await ctx.db.insert("attendanceMembers", {
        name: "Canonical",
        email: "dup@sow.org.au",
      }),
      // staffEmail path: normalises to dup@sow.org.au — moving it would create a
      // second row sharing that address.
      linked: await ctx.db.insert("attendanceMembers", {
        name: "Legacy",
        email: "personal@gmail.com",
        staffEmail: "dup@sow.org.au",
      }),
      // normalise path: an already-normalised row, plus one whose only diff is
      // case — lowercasing the latter would collide with the former.
      lower: await ctx.db.insert("attendanceMembers", {
        name: "Lower",
        email: "case@example.com",
      }),
      upper: await ctx.db.insert("attendanceMembers", {
        name: "Upper",
        email: "CASE@example.com",
      }),
    }));

    const res = await t.mutation(internal.migrations.dropStaffEmail, {});
    expect(res).toEqual({
      scanned: 4,
      migrated: 0,
      normalized: 0,
      invalid: 0,
      collisions: 2,
      remaining: 0,
    });

    const rows = await t.run(async (ctx) => ({
      canonical: await ctx.db.get(canonical),
      linked: await ctx.db.get(linked),
      lower: await ctx.db.get(lower),
      upper: await ctx.db.get(upper),
    }));
    // Both collisions left for manual merge — no silent duplicates.
    expect(rows.canonical?.email).toBe("dup@sow.org.au");
    expect(rows.linked?.email).toBe("personal@gmail.com");
    expect(rows.linked?.staffEmail).toBe("dup@sow.org.au");
    expect(rows.lower?.email).toBe("case@example.com");
    expect(rows.upper?.email).toBe("CASE@example.com");
  });
});
