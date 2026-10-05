/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { DEFAULT_HOME_BLOCKS, type HomeBlock } from "../shared/homeContent";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const MARKETER = "rachel@sow.org.au";
const FINANCE = "bella@sow.org.au";
const ALUMNI = "alice@sow.org.au";
const ENGAGEMENT_HEAD = "erin@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, { year: YEAR, name: "Marketing", division: "Engagement" });
  await admin.mutation(api.admin.upsertDepartment, { year: YEAR, name: "Finance", division: "Governance" });
  await admin.mutation(api.admin.setStaffProfile, { year: YEAR, email: MARKETER, roles: ["Staff"], department: "Marketing" });
  await admin.mutation(api.admin.setStaffProfile, { year: YEAR, email: FINANCE, roles: ["Staff"], department: "Finance" });
  await admin.mutation(api.admin.upsertDepartment, { year: YEAR, name: "Alumni", division: "Engagement" });
  await admin.mutation(api.admin.setStaffProfile, { year: YEAR, email: ALUMNI, roles: ["Staff"], department: "Alumni" });
  await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Engagement", headEmail: ENGAGEMENT_HEAD });
  await t.run(async (ctx) => {
    const profile = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", MARKETER).eq("year", YEAR))
      .unique();
    await ctx.db.patch("staffProfiles", profile!._id, { name: "Rachel" });
  });
  return t;
}

const blocks: HomeBlock[] = [
  { type: "heading", text: "  Hello  " },
  { type: "card", title: "Give", body: "Please give.", buttons: [{ label: "Donate", url: "donorbox.org/sow", style: "tonal" }] },
];

describe("homeContent", () => {
  test("everyone sees the built-in content until a tab is edited", async () => {
    const t = await setup();
    const view = await t.query(api.homeContent.view, {});
    expect(view.canEdit).toBe(false);
    expect(view.tabs.map((tab) => tab.label)).toEqual(["Home", "Resources", "Connect", "Partner"]);
    expect(view.tabs[0].blocks).toEqual(DEFAULT_HOME_BLOCKS.home);
    expect(view.tabs.every((tab) => tab.edited === null)).toBe(true);
  });

  test("admins, Marketing staff and the Engagement head can edit; other staff can't", async () => {
    const t = await setup();
    expect((await asUser(t, ADMIN).query(api.homeContent.view, {})).canEdit).toBe(true);
    expect((await asUser(t, MARKETER).query(api.homeContent.view, {})).canEdit).toBe(true);
    expect((await asUser(t, ENGAGEMENT_HEAD).query(api.homeContent.view, {})).canEdit).toBe(true);
    expect((await asUser(t, ALUMNI).query(api.homeContent.view, {})).canEdit).toBe(false);
    expect((await asUser(t, FINANCE).query(api.homeContent.view, {})).canEdit).toBe(false);
    await asUser(t, ENGAGEMENT_HEAD).mutation(api.homeContent.save, { tab: "home", blocks, baseRevision: 0 });
    await expect(
      asUser(t, ALUMNI).mutation(api.homeContent.reset, { tab: "home", baseRevision: 0 })
    ).rejects.toThrow(/head of Engagement/);
    await expect(
      asUser(t, FINANCE).mutation(api.homeContent.save, { tab: "home", blocks, baseRevision: 0 })
    ).rejects.toThrow(/Only admins, Marketing staff and the head of Engagement/);
    await expect(
      t.mutation(api.homeContent.reset, { tab: "home", baseRevision: 0 })
    ).rejects.toThrow(/Only admins, Marketing staff and the head of Engagement/);
  });

  test("a save cleans the blocks, shows to everyone and records who saved", async () => {
    const t = await setup();
    await asUser(t, MARKETER).mutation(api.homeContent.save, { tab: "partner", blocks, baseRevision: 0 });

    const publicView = await t.query(api.homeContent.view, {});
    const partner = publicView.tabs.find((tab) => tab.key === "partner")!;
    expect(partner.blocks).toEqual([
      { type: "heading", text: "Hello" },
      { type: "card", title: "Give", body: "Please give.", buttons: [{ label: "Donate", url: "https://donorbox.org/sow", style: "tonal" }] },
    ]);
    expect(partner.edited).toBeNull();
    expect(publicView.tabs.find((tab) => tab.key === "home")!.blocks).toEqual(DEFAULT_HOME_BLOCKS.home);

    const editorView = await asUser(t, ADMIN).query(api.homeContent.view, {});
    const edited = editorView.tabs.find((tab) => tab.key === "partner")!;
    expect(edited.edited?.by).toBe("Rachel");
    expect(edited.revision).toBe(1);

    // A second save based on the latest copy replaces the row in place.
    await asUser(t, ADMIN).mutation(api.homeContent.save, {
      tab: "partner",
      blocks: [{ type: "text", text: "Hi" }],
      baseRevision: edited.revision,
    });
    const rows = await t.run((ctx) => ctx.db.query("homeTabs").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "partner", revision: 2, updatedBy: ADMIN, blocks: [{ type: "text", text: "Hi" }] });
  });

  test("a save from a stale copy is refused", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.homeContent.save, { tab: "home", blocks, baseRevision: 0 });
    await expect(
      asUser(t, MARKETER).mutation(api.homeContent.save, { tab: "home", blocks, baseRevision: 0 })
    ).rejects.toThrow(/Someone else saved this tab/);
  });

  test("bad content and unknown tabs are refused with a readable message", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(
      admin.mutation(api.homeContent.save, { tab: "nope", blocks, baseRevision: 0 })
    ).rejects.toThrow(/Unknown Home tab/);
    await expect(
      admin.mutation(api.homeContent.save, {
        tab: "resources",
        blocks: [{ type: "links", links: [{ name: "Bad", url: "javascript:alert(1)" }] }],
        baseRevision: 0,
      })
    ).rejects.toThrow(/needs a web address/);
    await expect(
      admin.mutation(api.homeContent.reset, { tab: "nope", baseRevision: 0 })
    ).rejects.toThrow(/Unknown Home tab/);
  });

  test("reset puts a tab back to the built-in content and keeps counting revisions", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Resetting a tab nobody has edited is a no-op.
    await admin.mutation(api.homeContent.reset, { tab: "connect", baseRevision: 0 });
    expect(await t.run((ctx) => ctx.db.query("homeTabs").collect())).toHaveLength(0);

    await admin.mutation(api.homeContent.save, { tab: "connect", blocks, baseRevision: 0 });
    // A restore from a copy opened before that save is refused.
    await expect(
      asUser(t, MARKETER).mutation(api.homeContent.reset, { tab: "connect", baseRevision: 0 })
    ).rejects.toThrow(/Someone else saved this tab/);
    await admin.mutation(api.homeContent.reset, { tab: "connect", baseRevision: 1 });
    const view = await admin.query(api.homeContent.view, {});
    const connect = view.tabs.find((tab) => tab.key === "connect")!;
    expect(connect.blocks).toEqual(DEFAULT_HOME_BLOCKS.connect);
    expect(connect.edited).toBeNull();
    expect(connect.revision).toBe(2);

    // A copy opened before the restore (or before the first save) is out of date.
    for (const baseRevision of [0, 1]) {
      await expect(
        asUser(t, MARKETER).mutation(api.homeContent.save, { tab: "connect", blocks, baseRevision })
      ).rejects.toThrow(/Someone else saved this tab/);
    }
    await admin.mutation(api.homeContent.save, { tab: "connect", blocks, baseRevision: 2 });
  });
});
