/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";
const DIRECTOR = "director@sow.org.au";
const PAT = "pat@sow.org.au";
const SAM = "sam@sow.org.au";
const LEADER = "leader@sow.org.au";
const GONE = "gone@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  for (const profile of [
    { email: DIRECTOR, roles: ["Director"] },
    { email: PAT, roles: ["Staff"], department: "People and Culture" },
    { email: SAM, roles: ["Staff"], department: "Marketing" },
    { email: LEADER, roles: ["Student Leader"], university: "Macquarie University" },
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...profile });
  }
  await t.run(async (ctx) => {
    for (const [email, name] of [
      [ADMIN, "Ada Admin"],
      [DIRECTOR, "Dee Director"],
      [PAT, "Pat Park"],
    ]) {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, { name });
    }
  });
  return { t, admin };
}

describe("admins.list", () => {
  test("shows the fixed admins, the chosen ones and who can be chosen, to admins only", async () => {
    const { t, admin } = await setup();
    await t.mutation(internal.admins.add, { email: " Pat@SOW.org.au ", addedBy: ADMIN });
    await t.mutation(internal.admins.add, { email: PAT, addedBy: ADMIN });
    await t.mutation(internal.admins.add, { email: GONE, addedBy: ADMIN });
    await t.mutation(internal.admins.add, { email: ADMIN, addedBy: ADMIN });

    const list = (await admin.query(api.admins.list, {}))!;
    expect(list.fixed).toEqual([
      { email: ADMIN, name: "Ada Admin", reason: "Data and IT" },
      { email: DIRECTOR, name: "Dee Director", reason: "Director" },
    ]);
    expect(list.chosen).toEqual([
      { email: GONE, name: GONE, onStaff: false },
      { email: PAT, name: "Pat Park", onStaff: true },
    ]);
    expect(list.staff.map((s) => s.email)).toEqual([PAT, SAM]);

    expect(await asUser(t, SAM).query(api.admins.list, {})).toBeNull();
    expect(await t.query(api.admins.list, {})).toBeNull();
    expect(await asUser(t, PAT).query(api.admins.list, {})).not.toBeNull();
  });
});

describe("admins.set", () => {
  test("adds and removes chosen admins, who then get and lose admin", async () => {
    const { t, admin } = await setup();
    expect((await asUser(t, PAT).query(api.directory.me, {}))?.isAdmin).toBe(false);

    await admin.mutation(api.admins.set, { emails: [PAT, SAM], expected: [] });
    expect((await asUser(t, PAT).query(api.directory.me, {}))?.isAdmin).toBe(true);
    const rows = await t.run((ctx) => ctx.db.query("admins").take(10));
    expect(rows.map((r) => [r.email, r.addedBy])).toEqual([
      [PAT, ADMIN],
      [SAM, ADMIN],
    ]);

    await asUser(t, PAT).mutation(api.admins.set, { emails: [PAT], expected: [SAM, PAT] });
    expect((await asUser(t, SAM).query(api.directory.me, {}))?.isAdmin).toBe(false);
    expect((await admin.query(api.admins.list, {}))!.chosen.map((c) => c.email)).toEqual([PAT]);
  });

  test("keeps someone already chosen who has since left staff", async () => {
    const { t, admin } = await setup();
    await t.mutation(internal.admins.add, { email: GONE, addedBy: ADMIN });
    await admin.mutation(api.admins.set, { emails: [GONE, PAT], expected: [GONE] });
    expect((await admin.query(api.admins.list, {}))!.chosen.map((c) => c.email)).toEqual([GONE, PAT]);
  });

  test("refuses non-admins, stale lists, people without a role, campus leaders and too many", async () => {
    const { t, admin } = await setup();
    await expect(
      asUser(t, SAM).mutation(api.admins.set, { emails: [SAM], expected: [] })
    ).rejects.toThrow(/Only admins/);

    await t.mutation(internal.admins.add, { email: PAT, addedBy: ADMIN });
    await expect(admin.mutation(api.admins.set, { emails: [SAM], expected: [] })).rejects.toThrow(
      /Someone else changed/
    );
    await expect(
      admin.mutation(api.admins.set, { emails: [PAT, GONE], expected: [PAT] })
    ).rejects.toThrow(`${GONE} has no role in ${YEAR}`);
    await expect(
      admin.mutation(api.admins.set, { emails: [PAT, LEADER], expected: [PAT] })
    ).rejects.toThrow(/campus leader/);
    const many = Array.from({ length: 51 }, (_, i) => `p${i}@sow.org.au`);
    await expect(admin.mutation(api.admins.set, { emails: many, expected: [PAT] })).rejects.toThrow(
      /at most 50/
    );
    expect((await admin.query(api.admins.list, {}))!.chosen.map((c) => c.email)).toEqual([PAT]);
  });
});
