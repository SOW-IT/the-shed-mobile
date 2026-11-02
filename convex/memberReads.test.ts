import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const sources = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./_generated/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const YEAR = staffYearForDate(new Date());
const HOUR = 3_600_000;
const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const STAFF = "staff@sow.org.au";
const NO_SHADOW = "noshadow@sow.org.au";
const USYD = "University of Sydney";
const UNSW = "University of New South Wales";

type T = TestConvex<typeof schema>;
type Category = Doc<"weeklyCategoryPeople">["category"];

const asUser = (t: T, email: string) => t.withIdentity({ email, subject: email, issuer: "test" });

afterEach(() => {
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: UNSW });
  await admin.mutation(api.attendanceMetadata.ensureDefaults, {});
  const campus = await t.run(async (ctx) => {
    const field = (await ctx.db.query("attendanceMetadata").collect()).find((f) => f.key === "Campus")!;
    const option = (label: string) =>
      Object.entries(field.values ?? {}).find(([, value]) => value === label)?.[0] ?? label;
    return { fieldId: field._id as string, usyd: option(USYD), unsw: option(UNSW) };
  });
  const member = (name: string, place?: "usyd" | "unsw") =>
    t.run((ctx) =>
      ctx.db.insert("attendanceMembers", {
        name,
        ...(place ? { metadata: { [campus.fieldId]: campus[place] } } : {}),
      })
    );
  const staff = (
    email: string,
    fields: { name?: string; role?: string; university?: string; memberId?: Id<"attendanceMembers"> } = {}
  ) =>
    t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email,
        year: YEAR,
        name: fields.name,
        assignments: [
          { role: fields.role ?? "Staff", ...(fields.university ? { university: fields.university } : {}) },
        ],
        ...(fields.memberId ? { memberId: fields.memberId } : {}),
      })
    );
  const event = (subgroups = [USYD]) =>
    t.run((ctx) =>
      ctx.db.insert("events", {
        name: "Tonight",
        dateStart: Date.now() + HOUR,
        dateEnd: Date.now() + 3 * HOUR,
        subgroups,
      })
    );
  const order = (eventId: Id<"events">, ranked: [Id<"attendanceMembers">, number][]) =>
    t.run((ctx) =>
      ctx.db.insert("rollCallOrders", {
        eventId,
        inputKey: "test",
        builtAt: Date.now(),
        memberIds: ranked.map(([id]) => id),
        scores: ranked.map(([, score]) => score),
      })
    );
  const categories = (subgroup: string, people: [string, Category][]) =>
    t.run((ctx) =>
      ctx.db.insert("weeklyCategories", {
        subgroup,
        termKey: "2026-S2",
        people: people.map(([key, category]) => ({ key, category })),
      })
    );
  return { t, admin, campus, member, staff, event, order, categories };
}

const keysOf = (rows: { key: string }[]) => rows.map((r) => r.key);

describe("who writes attendanceMembers", () => {
  test("only memberCount.ts inserts or deletes member rows by table name", () => {
    const writers = Object.entries(sources)
      .filter(([, code]) => /\.(insert|delete)\(\s*"attendanceMembers"/.test(code))
      .map(([path]) => path);
    expect(writers).toEqual(["./memberCount.ts"]);
  });
});

describe("the stored member count", () => {
  test("stays put until a recount stores it, then follows creates, deletes and merges", async () => {
    const { t, admin, member } = await setup();
    const ann = await member("Ann Lee");
    await admin.mutation(api.attendanceMembers.create, { name: "Before Count" });
    expect(await t.run((ctx) => ctx.db.query("attendanceMemberCount").collect())).toEqual([]);

    const total = await t.run(async (ctx) => (await ctx.db.query("attendanceMembers").collect()).length);
    expect(await t.mutation(internal.memberCount.recount, {})).toEqual({ count: total, was: null });

    const zed = await admin.mutation(api.attendanceMembers.create, { name: "Zed Ho" });
    await admin.mutation(api.attendanceMembers.ensureForStaff, { staffEmail: ADMIN });
    const stored = async () => (await t.run((ctx) => ctx.db.query("attendanceMemberCount").first()))!.count;
    const afterCreates = await stored();
    expect(afterCreates).toBe(total + 2);

    await admin.mutation(api.attendanceMembers.remove, { memberId: zed });
    expect(await stored()).toBe(afterCreates - 1);
    const dup = await admin.mutation(api.attendanceMembers.create, { name: "Ann Lee" });
    expect(await stored()).toBe(afterCreates);
    await admin.mutation(api.attendanceMembers.merge, {
      removeId: dup,
      keep: { memberId: ann },
      resolutions: {},
    });
    expect(await stored()).toBe(afterCreates - 1);
    await member("Written Around The Count");
    expect(await t.mutation(internal.memberCount.recount, {})).toEqual({
      count: afterCreates,
      was: afterCreates - 1,
    });
  });

  test("the nightly recount skips while nightly jobs are paused", async () => {
    const { t } = await setup();
    vi.stubEnv("NIGHTLY_JOBS_PAUSED", "true");
    expect(await t.mutation(internal.memberCount.recount, { nightly: true })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("attendanceMemberCount").collect())).toEqual([]);
  });
});

const indexArgs = (subgroup: string) => ({
  subgroup,
  computedAt: 1,
  periods: [{ key: "2026-S2", label: "S2" }],
  currentKey: "2026-S2" as string | null,
  weeklies: [],
  settingsVersion: 1,
  viewVersion: 1,
  auditSeen: 0,
  eventsSeen: 0,
  nextCompareAt: 0,
});

const peopleRows = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.query("weeklyCategoryPeople").collect())
      .map((row) => `${row.subgroup}|${row.key}|${row.category}`)
      .sort()
  );

describe("Insights categories, one row per person", () => {
  test("the first save copies every campus, later saves change only their own campus", async () => {
    const { t, categories } = await setup();
    await categories(UNSW, [["member:b", "visitor"]]);
    await t.mutation(internal.weeklyInsights.saveIndex, {
      ...indexArgs(USYD),
      categories: [
        { key: "member:a", category: "regular" },
        { key: "staff:x@sow.org.au", category: "staff" },
        { key: "member:a", category: "regular" },
      ],
    });
    expect(await peopleRows(t)).toEqual([
      `${UNSW}|member:b|visitor`,
      `${USYD}|member:a|regular`,
    ]);
    const kept = await t.run(
      async (ctx) => (await ctx.db.query("weeklyCategoryPeople").collect()).find((r) => r.key === "member:b")!._id
    );

    await t.mutation(internal.weeklyInsights.saveIndex, {
      ...indexArgs(USYD),
      categories: [
        { key: "member:a", category: "newcomer" },
        { key: "member:c", category: "irregular" },
      ],
    });
    expect(await peopleRows(t)).toEqual([
      `${UNSW}|member:b|visitor`,
      `${USYD}|member:a|newcomer`,
      `${USYD}|member:c|irregular`,
    ]);
    expect(await t.run((ctx) => ctx.db.get(kept))).not.toBeNull();

    await t.mutation(internal.weeklyInsights.saveIndex, { ...indexArgs(USYD), currentKey: null, periods: [] });
    expect(await peopleRows(t)).toEqual([`${UNSW}|member:b|visitor`]);
  });

  test("the backfill copies the campus documents and drops campuses that have none", async () => {
    const { t, categories } = await setup();
    await categories(USYD, [["member:a", "regular"]]);
    await t.run((ctx) =>
      ctx.db.insert("weeklyCategoryPeople", { subgroup: "Gone Campus", key: "member:z", category: "regular" })
    );
    expect(await t.mutation(internal.categoryPeople.backfill, {})).toEqual({ campuses: 1 });
    expect(await peopleRows(t)).toEqual([`${USYD}|member:a|regular`]);
  });
});

async function rosterWorld() {
  const world = await setup();
  const { t, member, staff, event, order, categories } = world;
  const leaderShadow = await member("Leader Person", "usyd");
  await staff(LEADER, { role: "Student Leader", university: USYD, memberId: leaderShadow });
  const staffShadow = await member("Staff Person");
  await staff(STAFF, { name: "Sam Staff", memberId: staffShadow });
  await staff(NO_SHADOW, { name: "Nora Shadowless", role: "Student Leader", university: USYD });
  const ann = await member("Ann Lee", "usyd");
  await t.run(async (ctx) => {
    const usydNote = await ctx.db.insert("attendanceMetadata", {
      key: "Usyd Note",
      type: "input",
      order: 50,
      subgroup: USYD,
    });
    const unswNote = await ctx.db.insert("attendanceMetadata", {
      key: "Unsw Note",
      type: "input",
      order: 51,
      subgroup: UNSW,
    });
    const row = (await ctx.db.get(ann))!;
    await ctx.db.patch(ann, { metadata: { ...row.metadata, [usydNote]: "front row", [unswNote]: "hidden here" } });
  });
  const ben = await member("Ben Ng", "unsw");
  const cat = await member("Cat Wu");
  const dan = await member("Dan Ho", "usyd");
  await member("Eve Yu", "usyd");
  const ghost = await member("Ghost");
  await t.run((ctx) => ctx.db.delete(ghost));
  const eventId = await event();
  await order(eventId, [
    [dan, 9],
    [leaderShadow, 8],
    [ann, 4],
    [ben, 3.5],
    [ghost, 3],
    [cat, 2],
  ]);
  await categories(USYD, [
    [`member:${ann}`, "regular"],
    [`member:${dan}`, "newcomer"],
  ]);
  await categories(UNSW, [[`member:${ben}`, "visitor"]]);
  return { ...world, eventId, ids: { leaderShadow, staffShadow, ann, ben, cat, dan } };
}

describe("the roll call lists the people most likely to come", () => {
  test("the top N are the first N of the full list, with Insights roles either way", async () => {
    const { t, admin, eventId } = await rosterWorld();
    const full = await admin.query(api.attendance.roster, { year: YEAR, eventId });
    for (const limit of [1, 2, 3, 4, 5]) {
      expect(await admin.query(api.attendance.roster, { year: YEAR, eventId, limit })).toEqual(full.slice(0, limit));
    }
    expect(full.find((r) => r.name === "Ann Lee")?.subtitle).toBe("Regular · front row");
    await t.mutation(internal.categoryPeople.backfill, {});
    for (const limit of [3, 5]) {
      expect(await admin.query(api.attendance.roster, { year: YEAR, eventId, limit })).toEqual(full.slice(0, limit));
    }
  });

  test("fills up with this year's staff, campus first, when too few are ranked", async () => {
    const { admin, eventId } = await rosterWorld();
    const rows = await admin.query(api.attendance.roster, { year: YEAR, eventId, limit: 50 });
    const names = rows.map((r) => r.name);
    expect(names.slice(0, 5)).toEqual(["Dan Ho", "Leader Person", "Ann Lee", "Ben Ng", "Cat Wu"]);
    expect(names.slice(5, 6)).toEqual(["Nora Shadowless"]);
    expect(names).toContain("Sam Staff");
    expect(names).not.toContain("Eve Yu");
    expect(names.filter((n) => n === "Leader Person")).toHaveLength(1);
    const nora = rows.find((r) => r.name === "Nora Shadowless")!;
    expect(nora.kind).toBe("staff");
    expect(nora.memberId).toBeUndefined();
  });

  test("staff nobody ranked still pass a last place that scores no more than the campus bonus", async () => {
    const { admin, member, staff, event, order } = await setup();
    const ann = await member("Ann Lee");
    const ben = await member("Ben Ng");
    await staff(NO_SHADOW, { name: "Nora Shadowless", role: "Student Leader", university: USYD });
    const eventId = await event();
    await order(eventId, [
      [ann, 0.5],
      [ben, 0.2],
    ]);
    const full = await admin.query(api.attendance.roster, { year: YEAR, eventId });
    const top = await admin.query(api.attendance.roster, { year: YEAR, eventId, limit: 2 });
    expect(top.map((r) => r.name)).toEqual(["Nora Shadowless", "Ann Lee"]);
    expect(top).toEqual(full.slice(0, 2));
  });

  test("the limit is clamped, and without an event or a limit the whole list comes back", async () => {
    const { admin, eventId } = await rosterWorld();
    expect(await admin.query(api.attendance.roster, { year: YEAR, eventId, limit: 0 })).toHaveLength(1);
    const full = await admin.query(api.attendance.roster, { year: YEAR, eventId });
    expect(await admin.query(api.attendance.roster, { year: YEAR, eventId, limit: 10_000 })).toEqual(
      full.filter((r) => r.name !== "Eve Yu")
    );
    const everyone = await admin.query(api.attendance.roster, { year: YEAR, limit: 2 });
    expect(everyone.length).toBeGreaterThan(2);
  });

  test("someone on staff under both SOW domains is listed once", async () => {
    const { t, admin, member, staff, event, order } = await setup();
    const first = await member("Dee Dup");
    const second = await member("Dee Dup");
    await staff("dee@sow.org.au", { name: "Dee Dup", memberId: first });
    await staff("dee@sowaustralia.com", { name: "Dee Dup", memberId: second });
    const eventId = await event();
    await order(eventId, [
      [first, 5],
      [second, 4],
    ]);
    const rows = await admin.query(api.attendance.roster, { year: YEAR, eventId, limit: 50 });
    expect(rows.filter((r) => r.name === "Dee Dup")).toHaveLength(1);
    expect(await t.query(api.attendance.roster, { year: YEAR, eventId, limit: 5 })).toEqual([]);
  });
});

describe("roll call search", () => {
  test("finds staff by name, email, role or campus and members by name, closest matches first", async () => {
    const { t, admin, eventId, member } = await rosterWorld();
    await member("Bob Lee");
    const search = (text: string) => admin.query(api.attendance.searchRoster, { eventId, search: text });

    expect(keysOf(await search("leader@"))).toEqual([`staff:${LEADER}`]);
    expect((await search("student leader")).map((r) => r.email).sort()).toEqual([LEADER, NO_SHADOW]);
    expect((await search("sam staff"))[0]).toMatchObject({ kind: "staff", email: STAFF, name: "Sam Staff" });

    const people = await search("Leader Person");
    expect(people.filter((r) => r.email === LEADER)).toHaveLength(1);
    expect(people[0]).toMatchObject({ kind: "staff", email: LEADER });

    const ann = await search("Ann Lee");
    expect(ann[0]).toMatchObject({ kind: "member", name: "Ann Lee" });
    expect(ann[0].subtitle).toMatch(/^Regular/);

    expect(await search("   ")).toEqual([]);
    expect(await t.query(api.attendance.searchRoster, { eventId, search: "ann" })).toEqual([]);
    await t.run((ctx) => ctx.db.delete(eventId));
    expect(await search("ann")).toEqual([]);
  });

  test("a staff profile without its own name is matched by its member's name, and staff are capped", async () => {
    const { admin, member, staff, event } = await setup();
    const shadow = await member("Quinn Shadowed");
    await staff("quinn@sow.org.au", { name: "quinn@sow.org.au", memberId: shadow });
    for (let i = 0; i < 27; i++) await staff(`cap${i}@sow.org.au`, { name: `Cap ${i}` });
    const eventId = await event();
    expect(
      await admin.query(api.attendance.searchRoster, { eventId, search: "quinn shad" })
    ).toEqual([expect.objectContaining({ kind: "staff", name: "Quinn Shadowed", memberId: shadow })]);
    expect(await admin.query(api.attendance.searchRoster, { eventId, search: "cap" })).toHaveLength(25);
  });

  test("staff matching by name or email are kept over those matching only a role, whatever the order", async () => {
    const { admin, staff, event } = await setup();
    for (let i = 0; i < 26; i++) await staff(`pat${i}@sow.org.au`, { name: `Pat ${i}`, role: "Student Leader", university: USYD });
    await staff("zed@sow.org.au", { name: "Zed Leaderson" });
    const eventId = await event();
    const found = await admin.query(api.attendance.searchRoster, { eventId, search: "leader" });
    expect(found).toHaveLength(25);
    expect(found[0]).toMatchObject({ kind: "staff", name: "Zed Leaderson" });
  });

  test("self check-in looks up every unmatched name in one call", async () => {
    const { t, admin, eventId, member } = await rosterWorld();
    await member("Bob Lee");
    const lookUp = (names: string[]) => admin.query(api.attendance.searchRosterNames, { eventId, names });

    const found = await lookUp(["Ann Lee", " Bob ", "Ann Lee", "", "Sam Staff", "Sam"]);
    expect(found.map((r) => r.name)).toEqual(expect.arrayContaining(["Ann Lee", "Bob Lee", "Sam Staff"]));
    expect(new Set(keysOf(found)).size).toBe(found.length);
    expect(found.filter((r) => r.name === "Sam Staff")).toHaveLength(1);

    const nobody = Array.from({ length: 20 }, (_, i) => `Nobody${i}`);
    expect(await lookUp([...nobody, "Ann Lee"])).toEqual([]);
    expect(await lookUp(["  "])).toEqual([]);
    expect(await t.query(api.attendance.searchRosterNames, { eventId, names: ["Ann"] })).toEqual([]);
  });
});

async function membersWorld() {
  const world = await setup();
  const { member, staff, categories } = world;
  const shadow = await member("Leader Person", "usyd");
  await staff(LEADER, { role: "Student Leader", university: USYD, memberId: shadow });
  await staff(STAFF, { name: "Ann Lee" });
  await staff(NO_SHADOW, { name: "Zara Zed" });
  await member("Ann Lee", "usyd");
  await member("Ann Lee");
  await member("Bob Lee", "unsw");
  await member("Cat Wu");
  const mia = await member("Mia Ho", "usyd");
  await categories(USYD, [[`member:${mia}`, "regular"]]);
  await categories(UNSW, [[`member:${mia}`, "visitor"]]);
  return world;
}

const pageAll = async (
  who: ReturnType<typeof asUser>,
  args: { sortAsc?: boolean; numItems: number }
) => {
  const rows: { key: string }[] = [];
  let cursor: string | null = null;
  let total = 0;
  for (let guard = 0; guard < 50; guard++) {
    const page: { page: { key: string }[]; isDone: boolean; continueCursor: string; total: number } =
      await who.query(api.attendanceMembers.list, {
        year: YEAR,
        sortAsc: args.sortAsc,
        paginationOpts: { numItems: args.numItems, cursor },
      });
    rows.push(...page.page);
    total = page.total;
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return { rows, total };
};

describe("the Members tab reads one page at a time", () => {
  test("pages by name both ways, matching the full read row for row", async () => {
    const { t, admin } = await membersWorld();
    const everyone = { ...(await pageAll(admin, { numItems: 200 })) };
    const backwards = await pageAll(admin, { numItems: 200, sortAsc: false });

    await t.mutation(internal.memberCount.recount, {});
    for (const numItems of [1, 2, 3, 50]) {
      expect(await pageAll(admin, { numItems })).toEqual(everyone);
      expect(await pageAll(admin, { numItems, sortAsc: false })).toEqual(backwards);
    }
    expect(everyone.rows.find((r) => (r as { name?: string }).name === "Mia Ho")).toMatchObject({ role: "Regular" });
    await t.mutation(internal.categoryPeople.backfill, {});
    expect(await pageAll(admin, { numItems: 2 })).toEqual(everyone);
  });

  test("names whose index order differs from A to Z move, but are never dropped or repeated", async () => {
    const { t, admin, member } = await membersWorld();
    await member("Mackay Wu");
    await member("MacKenzie Ho");
    await member("\u00c9lise Tan");
    const everyone = await pageAll(admin, { numItems: 200 });
    await t.mutation(internal.memberCount.recount, {});
    for (const numItems of [1, 3]) {
      for (const sortAsc of [true, false]) {
        const paged = await pageAll(admin, { numItems, sortAsc });
        expect(paged.total).toBe(everyone.total);
        expect(keysOf(paged.rows).sort()).toEqual(keysOf(everyone.rows).sort());
      }
    }
  });

  test("old offset cursors and broken name cursors fall back to reading everything", async () => {
    const { t, admin } = await membersWorld();
    await t.mutation(internal.memberCount.recount, {});
    const list = (cursor: string | null, numItems = 2) =>
      admin.query(api.attendanceMembers.list, { year: YEAR, paginationOpts: { numItems, cursor } });
    const first = await list(null, 200);
    expect(keysOf((await list("2")).page)).toEqual(keysOf(first.page.slice(2, 4)));
    for (const broken of [
      "name:{",
      'name:{"staff":-1,"name":null,"at":null}',
      'name:{"staff":1.5,"name":null,"at":null}',
      'name:{"staff":0,"name":"Ann Lee","at":null}',
      'name:{"staff":0,"name":5,"at":5}',
    ]) {
      expect(keysOf((await list(broken)).page)).toEqual(keysOf(first.page.slice(0, 2)));
    }
    expect(keysOf((await list('name:{"staff":0,"name":null,"at":null}')).page)).toEqual(
      keysOf(first.page.slice(0, 2))
    );
  });

  test("searches, filters and other sorts still read everyone, with photos only on the page", async () => {
    const { t, admin } = await membersWorld();
    await t.mutation(internal.memberCount.recount, {});
    const found = await admin.query(api.attendanceMembers.list, {
      year: YEAR,
      search: "lee",
      filters: { anything: "all" },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(found.page.map((r) => r.name).sort()).toEqual(["Ann Lee", "Ann Lee", "Ann Lee", "Bob Lee"]);
    expect(found.page.find((r) => r.kind === "staff")).toHaveProperty("photo");
    expect(found.page.find((r) => r.kind === "member")).not.toHaveProperty("photo");
    const sorted = await admin.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: "missing-field",
      paginationOpts: { numItems: 50, cursor: "not-a-number" },
    });
    const everyone = await admin.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(sorted.total).toBe(everyone.total);
    expect(sorted.page).toHaveLength(everyone.total);
  });
});
