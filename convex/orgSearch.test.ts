import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ORG_SEARCH_LIMIT } from "./orgSearch";
import { ADMIN, UNSW, YEAR, asUser, seeded, type T } from "../test/convexFixture";

const DANIEL = "daniel.kim@sow.org.au";
const DANA = "dana.lee@sow.org.au";
const KIMBERLY = "kimberly.ong@sow.org.au";

async function setup() {
  const t = await seeded();
  const admin = asUser(t, ADMIN);
  await t.mutation(internal.history.setPastAssignments, {
    year: YEAR - 2,
    email: DANIEL,
    name: "Daniel Kim",
    assignments: [{ role: "Student Leader", university: UNSW }],
  });
  await t.mutation(internal.history.setPastAssignments, {
    year: YEAR - 1,
    email: DANIEL,
    name: "Daniel Kim",
    assignments: [{ role: "Staff", department: "Finance" }],
  });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Media",
    division: "Engagement",
    headEmail: DANIEL,
  });
  await t.mutation(internal.history.setPastAssignments, {
    year: YEAR - 1,
    email: DANA,
    name: "Dana Lee",
    assignments: [{ role: "Staff", department: "Finance" }],
  });
  await t.mutation(internal.history.setPastAssignments, {
    year: YEAR - 1,
    email: KIMBERLY,
    name: "Kimberly Ong",
    assignments: [{ role: "President", university: UNSW }],
  });
  return t;
}

const search = (t: T, query: string, as?: string) =>
  (as ? asUser(t, as) : t).query(api.orgSearch.searchAllYears, { query });

const found = async (t: T, query: string, as?: string) =>
  (await search(t, query, as)).results.map((r) => `${r.year} ${r.email}`);

describe("searchAllYears", () => {
  test("lists every year a person appears, newest first, with that year's role and team", async () => {
    const t = await setup();
    await t.run((ctx) => ctx.db.insert("users", { email: DANIEL, name: "Daniel Kim" }));
    const { results, more } = await search(t, "Daniel Kim");
    expect(more).toBe(false);
    expect(results.map((r) => [r.year, r.name, r.roles])).toEqual([
      [YEAR, "Daniel Kim", ["HOD → Media"]],
      [YEAR - 1, "Daniel Kim", ["Staff → Finance"]],
      [YEAR - 2, "Daniel Kim", ["Student Leader → UNSW"]],
    ]);
  });

  test("every word has to match, and the last one can be the start of a word", async () => {
    const t = await setup();
    expect(await found(t, "kim")).toEqual([`${YEAR} ${DANIEL}`, `${YEAR - 1} ${DANIEL}`, `${YEAR - 1} ${KIMBERLY}`, `${YEAR - 2} ${DANIEL}`]);
    expect(await found(t, "daniel fin")).toEqual([`${YEAR - 1} ${DANIEL}`]);
  });

  test("a common word doesn't crowd out a rarer one", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 120; i++) {
        await ctx.db.insert("staffProfiles", {
          email: `kira${i}@sow.org.au`,
          year: YEAR - 1,
          name: `Kira Number${i}`,
          assignments: [{ role: "Staff", department: "Events" }],
          searchText: `Kira Number${i} kira${i}@sow.org.au Staff Events`,
        });
      }
    });
    expect(await found(t, "dan ki")).toEqual([`${YEAR} ${DANIEL}`, `${YEAR - 1} ${DANIEL}`, `${YEAR - 2} ${DANIEL}`]);
    expect(await found(t, "--")).toEqual([]);
  });

  test("finds people by team, campus acronym and role", async () => {
    const t = await setup();
    expect(await found(t, "finance")).toEqual([`${YEAR - 1} ${DANA}`, `${YEAR - 1} ${DANIEL}`]);
    expect(await found(t, "unsw")).toEqual([`${YEAR - 1} ${KIMBERLY}`, `${YEAR - 2} ${DANIEL}`]);
    expect(await found(t, "president")).toEqual([`${YEAR - 1} ${KIMBERLY}`]);
  });

  test("a one-letter search and a search nobody matches return nothing", async () => {
    const t = await setup();
    expect(await search(t, " d ")).toEqual({ results: [], more: false });
    expect(await search(t, "zebra")).toEqual({ results: [], more: false });
  });

  test("uses the year's own role titles and the Google name", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("roles", { year: YEAR - 1, name: "Team Member", standsFor: "Staff" });
      await ctx.db.insert("users", { email: DANA, name: "Dana L." });
    });
    const [dana] = (await search(t, "dana")).results;
    expect(dana).toMatchObject({ name: "Dana L.", roles: ["Team Member → Finance"] });
  });

  test("the next staff year shows only to admins, like the chart", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: DANA,
        year: YEAR + 1,
        name: "Dana Lee",
        assignments: [{ role: "Staff", department: "Finance" }],
        searchText: "Dana Lee dana.lee@sow.org.au Staff Finance",
      })
    );
    expect(await found(t, "dana")).toEqual([`${YEAR - 1} ${DANA}`]);
    expect(await found(t, "dana", ADMIN)).toEqual([`${YEAR + 1} ${DANA}`, `${YEAR - 1} ${DANA}`]);
  });

  test("skips profiles with no role", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "nora@sow.org.au",
        year: YEAR - 3,
        name: "Nora Pak",
        assignments: [],
        searchText: "Nora Pak nora@sow.org.au",
      })
    );
    expect(await found(t, "nora")).toEqual([]);
  });

  test(`stops at ${ORG_SEARCH_LIMIT} results and says there are more`, async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < ORG_SEARCH_LIMIT + 5; i++) {
        await ctx.db.insert("staffProfiles", {
          email: `helper${i}@sow.org.au`,
          year: YEAR - 1,
          assignments: [{ role: "Staff", department: "Events" }],
          searchText: `helper${i}@sow.org.au Staff Events`,
        });
      }
    });
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "newest@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Events" }],
        searchText: "newest@sow.org.au Staff Events",
      })
    );
    const { results, more } = await search(t, "events");
    expect(results).toHaveLength(ORG_SEARCH_LIMIT);
    expect(results[0].email).toBe("newest@sow.org.au");
    expect(more).toBe(true);
  });

  test("says more may match when every word is too common to search in full", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const add = (name: string, department: string) =>
        ctx.db.insert("staffProfiles", {
          email: `${name.toLowerCase().replace(" ", ".")}@sow.org.au`,
          year: YEAR - 1,
          name,
          assignments: [{ role: "Staff", department }],
          searchText: `${name} Staff ${department}`,
        });
      for (let i = 0; i < 3; i++) await add(`Kira Filer${i}`, "Archive");
      for (let i = 0; i < 110; i++) await add(`Kira Planner${i}`, "Events");
      for (let i = 0; i < 110; i++) await add(`Zed Filer${i}`, "Archive");
    });
    const { results, more } = await search(t, "kira archive");
    expect(results.map((r) => r.name)).toEqual(["Kira Filer0", "Kira Filer1", "Kira Filer2"]);
    expect(more).toBe(true);
  });
});

describe("keeping searchText current", () => {
  test("a department rename and a year copy are searchable straight away", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Media",
      newName: "Technology",
      division: "Engagement",
      headEmail: DANIEL,
    });
    expect(await found(t, "technology")).toEqual([`${YEAR} ${DANIEL}`]);
    await t.mutation(internal.admin.copyYear, { from: YEAR, to: YEAR + 1 });
    expect(await found(t, "technology", ADMIN)).toEqual([`${YEAR + 1} ${DANIEL}`, `${YEAR} ${DANIEL}`]);
  });

  test("a department's division is searchable, and moving the department updates it", async () => {
    vi.useFakeTimers();
    const t = await setup();
    expect(await found(t, "engagement")).toEqual([`${YEAR} ${DANIEL}`]);
    await asUser(t, ADMIN).mutation(api.admin.upsertDivision, { year: YEAR, name: "Outreach" });
    await asUser(t, ADMIN).mutation(api.admin.updateDepartment, {
      year: YEAR,
      oldName: "Media",
      newName: "Media",
      division: "Outreach",
      headEmail: DANIEL,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await found(t, "engagement")).toEqual([]);
    expect(await found(t, "outreach")).toEqual([`${YEAR} ${DANIEL}`]);
    vi.useRealTimers();
  });

  test("a year's role title becomes searchable once it is set", async () => {
    vi.useFakeTimers();
    const t = await setup();
    expect(await found(t, "team member")).toEqual([]);
    await t.mutation(internal.history.setRoleTitle, { year: YEAR - 1, title: "Team Member", standsFor: "Staff" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await found(t, "team member")).toEqual([`${YEAR - 1} ${DANA}`, `${YEAR - 1} ${DANIEL}`]);
    vi.useRealTimers();
  });

  test("the Google and directory names are searchable after a refresh", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: DANA, name: "Danielle Lee" });
      await ctx.db.insert("directoryUsers", { email: KIMBERLY, name: "Kimmy Ong" });
    });
    expect(await found(t, "danielle")).toEqual([]);
    expect(await t.mutation(internal.orgSearch.refreshYearSearchText, { year: YEAR - 1 })).toEqual({ updated: 2 });
    expect(await found(t, "danielle")).toEqual([`${YEAR - 1} ${DANA}`]);
    expect(await found(t, "kimmy")).toEqual([`${YEAR - 1} ${KIMBERLY}`]);
  });

  test("the backfill fills in profiles saved before search, in batches", async () => {
    vi.useFakeTimers();
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 210; i++) {
        await ctx.db.insert("staffProfiles", {
          email: `old${i}@sow.org.au`,
          year: YEAR - 5,
          name: `Old Timer ${i}`,
          assignments: [{ role: "Staff", department: "Archive" }],
        });
      }
    });
    expect(await found(t, "archive")).toEqual([]);
    await t.mutation(internal.orgSearch.backfillSearchText, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await search(t, "old7@sow.org.au")).results.map((r) => r.email)).toEqual(["old7@sow.org.au"]);
    expect(await t.mutation(internal.orgSearch.backfillSearchText, {})).toEqual({ updated: 0 });
    vi.useRealTimers();
  });
});
