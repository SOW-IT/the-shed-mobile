import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("linkTypedChurches", () => {
  test("adds each typed church once, links everyone, dry run first, and a rerun changes nothing", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const listed = await ctx.db.insert("churches", { name: "Harbour City Church", nameKey: "harbour city church", addedBy: "x" });
      const picked = await ctx.db.insert("churches", { name: "Grace Church", nameKey: "grace church", addedBy: "x" });
      return {
        listed,
        picked,
        ana: await ctx.db.insert("users", { email: "ana@sow.org.au", localChurch: "  New Life   Christian Church " }),
        ben: await ctx.db.insert("users", { email: "ben@sow.org.au", localChurch: "new life christian church" }),
        cat: await ctx.db.insert("users", { localChurch: "harbour city church" }),
        dan: await ctx.db.insert("users", { email: "dan@sow.org.au", localChurch: "Old Text", churchId: picked }),
        eve: await ctx.db.insert("users", { email: "eve@sow.org.au", localChurch: "   " }),
        fay: await ctx.db.insert("users", { email: "fay@sow.org.au" }),
      };
    });

    const dry = await t.mutation(internal.fieldCleanup.linkTypedChurches, {});
    expect(dry.dryRun).toBe(true);
    expect(dry.results.map((r) => [r.email, r.typed, r.church, r.action])).toEqual([
      ["ana@sow.org.au", "New Life Christian Church", "New Life Christian Church", "added and linked"],
      ["ben@sow.org.au", "new life christian church", "new life christian church", "linked"],
      [null, "harbour city church", "Harbour City Church", "linked"],
      ["dan@sow.org.au", "Old Text", "Grace Church", "already had a church"],
      ["eve@sow.org.au", "", null, "cleared blank"],
    ]);
    expect(await t.run((ctx) => ctx.db.query("churches").collect())).toHaveLength(2);

    const real = await t.mutation(internal.fieldCleanup.linkTypedChurches, { dryRun: false });
    expect(real.results.map((r) => r.action)).toEqual(dry.results.map((r) => r.action));
    const after = await t.run(async (ctx) => ({
      churches: await ctx.db.query("churches").collect(),
      users: await Promise.all([ids.ana, ids.ben, ids.cat, ids.dan, ids.eve, ids.fay].map((id) => ctx.db.get(id))),
    }));
    const added = after.churches.find((c) => c.nameKey === "new life christian church")!;
    expect(added).toMatchObject({ name: "New Life Christian Church", addedBy: "system:typed-church" });
    expect(after.churches).toHaveLength(3);
    const [ana, ben, cat, dan, eve, fay] = after.users.map((u) => u!);
    expect([ana.churchId, ben.churchId, cat.churchId, dan.churchId]).toEqual([added._id, added._id, ids.listed, ids.picked]);
    expect([ana, ben, cat, dan, eve, fay].every((u) => u.localChurch === undefined)).toBe(true);
    expect(eve.churchId).toBeUndefined();

    expect((await t.mutation(internal.fieldCleanup.linkTypedChurches, { dryRun: false })).results).toEqual([]);
  });

  test("someone whose picked church was since removed is relinked from what they typed", async () => {
    const t = convexTest(schema, modules);
    const gus = await t.run(async (ctx) => {
      const gone = await ctx.db.insert("churches", { name: "Gone", nameKey: "gone", addedBy: "x" });
      await ctx.db.delete(gone);
      return await ctx.db.insert("users", { email: "gus@sow.org.au", localChurch: "Gone Church", churchId: gone });
    });
    const real = await t.mutation(internal.fieldCleanup.linkTypedChurches, { dryRun: false });
    expect(real.results[0]).toMatchObject({ church: "Gone Church", action: "added and linked" });
    const after = await t.run(async (ctx) => ({
      user: await ctx.db.get(gus),
      church: await ctx.db.query("churches").first(),
    }));
    expect(after.user).toMatchObject({ churchId: after.church!._id });
    expect(after.user!.localChurch).toBeUndefined();
  });
});

describe("clearImportIds", () => {
  test("pages through a table, counting and then clearing only rows with an import id", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i < 503; i++) {
        await ctx.db.insert("attendanceMembers", { name: `M${i}`, ...(i % 2 ? { sourceImportId: `m${i}` } : {}) });
      }
      await ctx.db.insert("events", { name: "E", dateStart: 1, dateEnd: 2, subgroups: ["SOW"], sourceImportId: "e1" });
      await ctx.db.insert("events", { name: "F", dateStart: 1, dateEnd: 2, subgroups: ["SOW"] });
    });

    const first = await t.mutation(internal.fieldCleanup.clearImportIds, { table: "attendanceMembers" });
    expect(first).toMatchObject({ dryRun: true, found: 250 });
    expect(first.next).not.toBeNull();
    const second = await t.mutation(internal.fieldCleanup.clearImportIds, { table: "attendanceMembers", cursor: first.next });
    expect(second).toEqual({ dryRun: true, found: 1, next: null });

    let cursor: string | null = null;
    let cleared = 0;
    do {
      const page: { found: number; next: string | null } = await t.mutation(internal.fieldCleanup.clearImportIds, {
        table: "attendanceMembers",
        cursor,
        dryRun: false,
      });
      cleared += page.found;
      cursor = page.next;
    } while (cursor);
    expect(cleared).toBe(251);
    expect(await t.mutation(internal.fieldCleanup.clearImportIds, { table: "events", dryRun: false })).toEqual({
      dryRun: false,
      found: 1,
      next: null,
    });

    const left = await t.run(async (ctx) => [
      ...(await ctx.db.query("attendanceMembers").collect()),
      ...(await ctx.db.query("events").collect()),
    ]);
    expect(left.filter((row) => row.sourceImportId !== undefined)).toEqual([]);
  });
});
