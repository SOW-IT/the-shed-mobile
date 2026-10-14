/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const USYD = "University of Sydney";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.setStaffProfile, {
    email: LEADER,
    year: YEAR,
    roles: ["Student Leader"],
    university: USYD,
  });
  return { t, admin, leader: asUser(t, LEADER) };
}

const linkedMemberOf = (t: TestConvex<typeof schema>, email: string, year = YEAR) =>
  t.run(async (ctx) => {
    const profile = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
      .first();
    return profile!.memberId!;
  });

const listAll = (who: ReturnType<typeof asUser>, extra: { search?: string; year?: number } = {}) =>
  who.query(api.attendanceMembers.list, {
    year: extra.year ?? YEAR,
    search: extra.search,
    paginationOpts: { numItems: 100, cursor: null },
  });

describe("attendanceMembers.list: staff vs member classification", () => {
  test("a linked profile with no assignment this year leaves the person a Member", async () => {
    const { t, leader } = await setup();
    const memberId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("attendanceMembers", {
        name: "Former Staff",
        email: "former@gmail.com",
      });
      await ctx.db.insert("staffProfiles", {
        email: "former@sow.org.au",
        year: YEAR,
        name: "Former Staff",
        assignments: [],
        memberId: id,
      });
      return id;
    });

    const { page } = await listAll(leader);
    const byEmail = new Map(page.map((r) => [r.email, r]));

    expect(byEmail.get(LEADER)?.kind).toBe("staff");
    expect(byEmail.has("former@sow.org.au")).toBe(false);
    const former = page.find((r) => r.memberId === memberId);
    expect(former).toMatchObject({ kind: "member", email: "former@gmail.com", roles: [] });
  });
});

describe("attendanceMembers.list: staff profile ↔ member linking", () => {
  test("the staff row carries the linked member's id and their own email", async () => {
    const { t, leader } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    await t.run((ctx) => ctx.db.patch(memberId, { email: "lee@gmail.com" }));

    const { page } = await listAll(leader);

    const leaderRows = page.filter((r) => r.email === LEADER);
    expect(leaderRows).toHaveLength(1);
    expect(leaderRows[0]).toMatchObject({
      kind: "staff",
      memberId,
      personalEmail: "lee@gmail.com",
    });
    expect(page.filter((r) => r.memberId === memberId)).toHaveLength(1);
    const found = await listAll(leader, { search: "lee@gmail" });
    expect(found.page.map((r) => r.email)).toEqual([LEADER]);
  });

  test("a member row holding a staff email isn't linked by it", async () => {
    const { t, leader } = await setup();
    const linked = await linkedMemberOf(t, LEADER);
    const legacy = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Leader Alias", email: LEADER })
    );

    const { page } = await listAll(leader);

    expect(page.find((r) => r.key === `staff:${LEADER}`)?.memberId).toBe(linked);
    expect(page.find((r) => r.memberId === legacy)?.kind).toBe("member");
  });

  test("ensureForStaff finds the staff person across the two SOW staff domains", async () => {
    const { t, leader } = await setup();
    expect(
      await leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: "leader@sowaustralia.com",
      })
    ).toBe(await linkedMemberOf(t, LEADER));
  });

  test("ensureForStaff ignores case and surrounding whitespace", async () => {
    const { t, leader } = await setup();
    expect(
      await leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: "  Leader@SOW.ORG.AU  ",
      })
    ).toBe(await linkedMemberOf(t, LEADER));
  });

  test("an assigned profile with a user but no member row is still listed as staff", async () => {
    const { t, leader } = await setup();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "pic@sow.org.au" });
      await ctx.db.insert("staffProfiles", {
        email: "pic@sow.org.au",
        year: YEAR,
        name: "Pic Person",
        userId,
        assignments: [{ role: "Student Leader", university: USYD }],
      });
    });
    const { page } = await listAll(leader);
    const row = page.find((r) => r.email === "pic@sow.org.au");
    expect(row?.kind).toBe("staff");
    expect(row?.memberId).toBeUndefined();
    expect(row?.personalEmail).toBeUndefined();
    expect(row?.photo).toBeNull();
  });
});

describe("attendanceMembers.list: filters and sort", () => {
  const metadataField = async (
    admin: ReturnType<typeof asUser>,
    key: string
  ) => {
    await admin.mutation(api.attendanceMetadata.ensureDefaults, {});
    const fields = await admin.query(api.attendanceMetadata.list, {});
    const field = fields.find((f) => f.key === key);
    if (!field) throw new Error(`metadata field ${key} not seeded`);
    return field;
  };

  test("Staff role filter includes staff whose only role is a custom one", async () => {
    const { t, admin, leader } = await setup();
    await admin.mutation(api.admin.upsertRole, {
      year: YEAR,
      name: "Media Coordinator",
    });
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Ministry" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Media",
      division: "Ministry",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "media@sow.org.au",
      year: YEAR,
      roles: ["Media Coordinator"],
      department: "Media",
    });

    const roleField = await metadataField(admin, "Role");
    const staffOptionId = Object.entries(roleField.values ?? {}).find(
      ([, label]) => label === "Staff"
    )![0];

    const { page } = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [roleField._id]: [staffOptionId] },
      paginationOpts: { numItems: 100, cursor: null },
    });
    const emails = page.map((r) => r.email);
    expect(emails).toContain("media@sow.org.au");
    expect(emails).not.toContain(LEADER);
    void t;
  });

  test("Year filter puts unresolvable stored values under Unselected", async () => {
    const { t, admin, leader } = await setup();
    const yearField = await metadataField(admin, "Year");
    await t.run(async (ctx) => {
      await ctx.db.insert("attendanceMembers", {
        name: "Legacy Year",
        metadata: { [yearField._id]: "999" },
      });
      await ctx.db.insert("attendanceMembers", {
        name: "No Year",
        metadata: {},
      });
    });

    const unset = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: ["unset"] },
      paginationOpts: { numItems: 100, cursor: null },
    });
    const names = unset.page.map((r) => r.name);
    expect(names).toContain("Legacy Year");
    expect(names).toContain("No Year");

    const firstYears = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: ["1"] },
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(firstYears.page.map((r) => r.name)).not.toContain("Legacy Year");
  });

  test("sorting by a select field orders by label, not option id", async () => {
    const { t, leader } = await setup();
    const fieldId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("attendanceMetadata", {
        key: "Team",
        type: "select",
        order: 10,
        values: { "1": "Zebra", "2": "Apple" },
      });
      await ctx.db.insert("attendanceMembers", {
        name: "On Zebra",
        metadata: { [id]: "1" },
      });
      await ctx.db.insert("attendanceMembers", {
        name: "On Apple",
        metadata: { [id]: "2" },
      });
      return id;
    });

    const { page } = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: fieldId,
      sortAsc: true,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const apple = page.findIndex((r) => r.name === "On Apple");
    const zebra = page.findIndex((r) => r.name === "On Zebra");
    expect(apple).toBeGreaterThanOrEqual(0);
    expect(zebra).toBeGreaterThanOrEqual(0);
    expect(apple).toBeLessThan(zebra);
  });
});

describe("attendanceMembers.create: name capitalization", () => {
  test("capitalizes the first letter of each word on create", async () => {
    const { leader } = await setup();
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "  jane doe ",
    });
    const row = await leader.query(api.attendanceMembers.get, { memberId });
    expect(row?.name).toBe("Jane Doe");
  });

  test("capitalizes the first letter of each word on edit, keeping other capitals", async () => {
    const { leader } = await setup();
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Jane Doe",
    });
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: " jane mcDonald ",
    });
    const row = await leader.query(api.attendanceMembers.get, { memberId });
    expect(row?.name).toBe("Jane McDonald");
  });
});

const defaultFields = async (who: ReturnType<typeof asUser>) => {
  await who.mutation(api.attendanceMetadata.ensureDefaults, {});
  const fields = await who.query(api.attendanceMetadata.list, {});
  const byKey = (key: string) => fields.find((f) => f.key === key)!;
  const optionFor = (key: string, label: string) =>
    Object.entries(byKey(key).values ?? {}).find(([, value]) => value === label)![0];
  return { campus: byKey("Campus"), role: byKey("Role"), year: byKey("Year"), optionFor };
};

const addChurch = (t: TestConvex<typeof schema>, name: string) =>
  t.run((ctx) =>
    ctx.db.insert("churches", { name, nameKey: name.toLowerCase(), addedBy: ADMIN })
  );

describe("attendanceMembers.get", () => {
  test("a staff person reads with their staff email, locked campus and profile church", async () => {
    const { t, admin, leader } = await setup();
    const f = await defaultFields(admin);
    const memberId = await linkedMemberOf(t, LEADER);
    const church = await addChurch(t, "Hillsong");
    await t.run(async (ctx) => {
      await ctx.db.patch(memberId, {
        email: "lee@gmail.com",
        metadata: { [f.campus._id]: "custom", [f.year._id]: "2024" },
      });
      await ctx.db.insert("users", { email: LEADER, churchId: church });
    });

    const row = await leader.query(api.attendanceMembers.get, { memberId, staffYear: YEAR });

    expect(row).toMatchObject({
      isStaffOverlay: true,
      email: LEADER,
      personalEmail: "lee@gmail.com",
      profileChurch: "Hillsong",
      metadata: {
        [f.campus._id]: f.optionFor("Campus", USYD),
        [f.role._id]: f.optionFor("Role", "Student Leader"),
        [f.year._id]: "2024",
      },
    });
  });

  test("a staff person without a user or church has no profile church", async () => {
    const { t, leader } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    const row = await leader.query(api.attendanceMembers.get, { memberId });
    expect(row).toMatchObject({ isStaffOverlay: true, profileChurch: null });
  });

  test("in a year they weren't staff, the same row is a plain member", async () => {
    const { t, leader } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    await t.run((ctx) => ctx.db.patch(memberId, { email: "lee@gmail.com" }));
    const row = await leader.query(api.attendanceMembers.get, {
      memberId,
      staffYear: YEAR - 5,
    });
    expect(row).toMatchObject({
      isStaffOverlay: false,
      email: "lee@gmail.com",
      profileChurch: null,
    });
  });

  test("a member that no longer exists reads as null", async () => {
    const { t, leader } = await setup();
    const memberId = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Gone" }));
    await t.run((ctx) => ctx.db.delete(memberId));
    expect(await leader.query(api.attendanceMembers.get, { memberId })).toBeNull();
  });
});

describe("attendanceMembers.update", () => {
  test("as staff, it saves their own email and fields but keeps their own Campus and Role", async () => {
    const { t, admin, leader } = await setup();
    const f = await defaultFields(admin);
    const memberId = await linkedMemberOf(t, LEADER);
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", LEADER).eq("year", YEAR))
        .first();
      await ctx.db.patch(profile!._id, { name: "Lee Leader" });
      await ctx.db.patch(memberId, { metadata: { [f.campus._id]: "own-campus" } });
    });

    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "ignored",
      email: "ignored@gmail.com",
      personalEmail: "  Lee@Gmail.com ",
      metadata: {
        [f.campus._id]: f.optionFor("Campus", USYD),
        [f.role._id]: f.optionFor("Role", "Student Leader"),
        [f.year._id]: "2024",
      },
      staffYear: YEAR,
    });

    const row = await t.run((ctx) => ctx.db.get(memberId));
    expect(row).toMatchObject({
      name: "Lee Leader",
      email: "lee@gmail.com",
      metadata: { [f.campus._id]: "own-campus", [f.year._id]: "2024" },
    });
    expect(row?.metadata?.[f.role._id]).toBeUndefined();
    const log = await t.run((ctx) =>
      ctx.db
        .query("attendanceAuditLog")
        .filter((q) => q.eq(q.field("action"), "member.update"))
        .first()
    );
    expect(log).toMatchObject({ memberId, subjectEmail: LEADER });
  });

  test("as staff with no name on their profile, a name has to be typed and an email won't do", async () => {
    const { t, leader } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    const shown = await leader.query(api.attendanceMembers.get, { memberId, staffYear: YEAR });
    expect(shown).toMatchObject({ isStaffOverlay: true, isStaffNow: true, nameLocked: false, name: "" });

    for (const name of ["   ", "leader@sow.org.au"]) {
      await expect(
        leader.mutation(api.attendanceMembers.update, { memberId, name, staffYear: YEAR })
      ).rejects.toThrow("Name is required.");
    }
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: " lee leader ",
      staffYear: YEAR,
    });
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.name).toBe("Lee Leader");
    const again = await leader.query(api.attendanceMembers.get, { memberId, staffYear: YEAR });
    expect(again).toMatchObject({ nameLocked: false, name: "Lee Leader" });
  });

  test("as staff whose profile has a name, the name is locked to it", async () => {
    const { t, leader } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", LEADER).eq("year", YEAR))
        .first();
      await ctx.db.patch(profile!._id, { name: "Lee Leader" });
    });
    const shown = await leader.query(api.attendanceMembers.get, { memberId, staffYear: YEAR });
    expect(shown).toMatchObject({ nameLocked: true, name: "Lee Leader" });
    await leader.mutation(api.attendanceMembers.update, { memberId, name: "", staffYear: YEAR });
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.name).toBe("Lee Leader");
  });

  test("a current staffer edited from a year they weren't staff keeps their Campus and Role", async () => {
    const { t, admin, leader } = await setup();
    const f = await defaultFields(admin);
    const memberId = await linkedMemberOf(t, LEADER);
    await t.run((ctx) =>
      ctx.db.patch(memberId, {
        metadata: { [f.campus._id]: "own-campus", [f.role._id]: "own-role" },
      })
    );
    const shown = await leader.query(api.attendanceMembers.get, { memberId, staffYear: YEAR - 3 });
    expect(shown).toMatchObject({ isStaffOverlay: false, isStaffNow: true, nameLocked: false });

    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "Lee Leader",
      metadata: { [f.year._id]: "2024" },
      staffYear: YEAR - 3,
    });
    const row = await t.run((ctx) => ctx.db.get(memberId));
    expect(row).toMatchObject({
      name: "Lee Leader",
      metadata: { [f.campus._id]: "own-campus", [f.role._id]: "own-role", [f.year._id]: "2024" },
    });
  });

  test("as staff, a blank personal email clears it and a staff address is refused", async () => {
    const { t, leader } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    await t.run((ctx) => ctx.db.patch(memberId, { email: "lee@gmail.com" }));
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId,
        name: "x",
        personalEmail: "someone@sowaustralia.com",
      })
    ).rejects.toThrow(/is a staff email, not a personal one/);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "x",
      personalEmail: "  ",
    });
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.email).toBeUndefined();
  });

  test("editing a current staffer from a year they weren't staff is a plain member edit", async () => {
    const { t, leader } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "lee der",
      email: "Lee@Gmail.com",
      staffYear: YEAR - 5,
    });
    expect(await t.run((ctx) => ctx.db.get(memberId))).toMatchObject({
      name: "Lee Der",
      email: "lee@gmail.com",
    });
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId,
        name: "Lee Der",
        email: LEADER,
        staffYear: YEAR - 5,
      })
    ).rejects.toThrow(/staff email\. Use Merge instead/);
  });

  test("a plain member can't be given an SOW address, even one nobody has", async () => {
    const { t, leader } = await setup();
    const memberId = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Imported", email: "old@sow.org.au" })
    );
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId,
        name: "Imported",
        email: "OLD@sow.org.au",
      })
    ).rejects.toThrow("old@sow.org.au is a staff email, not a personal one");
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId,
        name: "Imported",
        email: "new@sow.org.au",
      })
    ).rejects.toThrow(/new@sow\.org\.au is a staff email/);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "Imported",
      email: " ",
    });
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.email).toBeUndefined();
  });

  test("a plain member's church is set, kept, cleared and checked", async () => {
    const { t, leader } = await setup();
    const church = await addChurch(t, "Hillsong");
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Churchgoer",
      churchId: church,
    });
    const churchOf = async () => (await t.run((ctx) => ctx.db.get(memberId)))?.churchId;
    expect(await churchOf()).toBe(church);
    await leader.mutation(api.attendanceMembers.update, { memberId, name: "Churchgoer" });
    expect(await churchOf()).toBe(church);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "Churchgoer",
      churchId: null,
    });
    expect(await churchOf()).toBeUndefined();
    const gone = await addChurch(t, "Gone Church");
    await t.run((ctx) => ctx.db.delete(gone));
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId,
        name: "Churchgoer",
        churchId: gone,
      })
    ).rejects.toThrow("That church isn't in the list any more.");
    await expect(
      leader.mutation(api.attendanceMembers.create, { name: "Other", churchId: gone })
    ).rejects.toThrow("That church isn't in the list any more.");
  });
});

describe("attendanceMembers.create", () => {
  test("refuses an SOW address that isn't anyone's staff email", async () => {
    const { leader } = await setup();
    await expect(
      leader.mutation(api.attendanceMembers.create, {
        name: "Someone",
        email: " Someone@SOW.org.au ",
      })
    ).rejects.toThrow("someone@sow.org.au is a staff email, not a personal one");
  });
});

describe("attendanceMembers.remove", () => {
  test("won't delete someone who is on staff this year", async () => {
    const { t, admin } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    await expect(admin.mutation(api.attendanceMembers.remove, { memberId })).rejects.toThrow(
      /on staff this year/
    );
    expect(await t.run((ctx) => ctx.db.get(memberId))).not.toBeNull();
  });

  test("unlinks every staff profile that pointed at the deleted row", async () => {
    const { t, admin } = await setup();
    const memberId = await linkedMemberOf(t, LEADER);
    const pastProfile = await t.run(async (ctx) => {
      const current = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", LEADER).eq("year", YEAR))
        .first();
      await ctx.db.patch(current!._id, { assignments: [] });
      return await ctx.db.insert("staffProfiles", {
        email: LEADER,
        year: YEAR - 1,
        assignments: [{ role: "Student Leader", university: USYD }],
        memberId,
      });
    });

    expect(await admin.mutation(api.attendanceMembers.remove, { memberId })).toBe(true);

    const profiles = await t.run((ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", LEADER))
        .collect()
    );
    expect(profiles.map((p) => p._id)).toContain(pastProfile);
    expect(profiles.every((p) => p.memberId === undefined)).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(memberId))).toBeNull();
  });

  test("the audit names events once each and caps the list", async () => {
    const { t, admin } = await setup();
    const { memberId, single } = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Regular" });
      const eventId = await ctx.db.insert("events", {
        name: "Weekly",
        dateStart: 1_000,
        dateEnd: 2_000,
        subgroups: [],
      });
      for (let i = 0; i < 102; i++) {
        await ctx.db.insert("attendance", { eventId, memberId, signInTime: 1_000 + i });
      }
      const single = await ctx.db.insert("attendanceMembers", { name: "Once" });
      const gone = await ctx.db.insert("events", {
        name: "Gone",
        dateStart: 1_000,
        dateEnd: 2_000,
        subgroups: [],
      });
      await ctx.db.insert("attendance", { eventId: gone, memberId: single, signInTime: 1_500 });
      await ctx.db.delete(gone);
      return { memberId, single };
    });

    await admin.mutation(api.attendanceMembers.remove, { memberId });
    await admin.mutation(api.attendanceMembers.remove, { memberId: single });

    const logs = await t.run((ctx) =>
      ctx.db
        .query("attendanceAuditLog")
        .filter((q) => q.eq(q.field("action"), "member.delete"))
        .collect()
    );
    const detailOf = (id: string) => logs.find((l) => l.memberId === id)!.detail!;
    expect(detailOf(memberId)).toMatch(/^Removed 102 attendance records:\nWeekly · /);
    expect(detailOf(memberId).split("\n")).toHaveLength(102);
    expect(detailOf(memberId)).toMatch(/\nand 2 more$/);
    expect(detailOf(single)).toMatch(/^Removed 1 attendance record:\nDeleted event · /);
    expect(await t.run((ctx) => ctx.db.query("attendance").collect())).toEqual([]);
  });
});
