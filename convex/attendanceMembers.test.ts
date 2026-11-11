import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  type T,
  type Caller,
  YEAR,
  ADMIN,
  LEADER,
  STAFF,
  OUTSIDER,
  USYD,
  asUser,
  pinClock,
  seeded,
  campusSetup,
  createEvent,
} from "../test/convexFixture";

async function setup() {
  const t = await seeded();
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

const linkedMemberOf = (t: T, email: string, year = YEAR) =>
  t.run(async (ctx) => {
    const profile = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
      .first();
    return profile!.memberId!;
  });

const listAll = (who: Caller, extra: { search?: string; year?: number } = {}) =>
  who.query(api.attendanceMembers.list, {
    year: extra.year ?? YEAR,
    search: extra.search,
    paginationOpts: { numItems: 100, cursor: null },
  });

async function campusWithDefaults() {
  const t = await campusSetup();
  await asUser(t, LEADER).mutation(api.attendanceMetadata.ensureDefaults, {});
  return t;
}

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

  test("a member row holding a staff email, or an SOW email nobody has, isn't linked by it", async () => {
    const { t, leader } = await setup();
    const linked = await linkedMemberOf(t, LEADER);
    const legacy = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Leader Alias", email: LEADER })
    );

    const ghost = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Ghost", email: "ghost@sow.org.au" })
    );

    const { page } = await listAll(leader);

    expect(page.find((r) => r.key === `staff:${LEADER}`)?.memberId).toBe(linked);
    expect(page.find((r) => r.memberId === legacy)?.kind).toBe("member");
    expect(page.find((r) => r.memberId === ghost)).toMatchObject({ kind: "member", name: "Ghost" });
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
    admin: Caller,
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

const defaultFields = async (who: Caller) => {
  await who.mutation(api.attendanceMetadata.ensureDefaults, {});
  const fields = await who.query(api.attendanceMetadata.list, {});
  const byKey = (key: string) => fields.find((f) => f.key === key)!;
  const optionFor = (key: string, label: string) =>
    Object.entries(byKey(key).values ?? {}).find(([, value]) => value === label)![0];
  return { campus: byKey("Campus"), role: byKey("Role"), year: byKey("Year"), optionFor };
};

const addChurch = (t: T, name: string) =>
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
    const { page } = await listAll(leader, { search: "lee" });
    expect(page.find((r) => r.email === LEADER)?.name).toBe("Lee Leader");
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

describe("Role is worked out", () => {
  const roleSetup = async () => {
    const s = await setup();
    const { roleId, campusId } = await s.t.run(async (ctx) => ({
      campusId: await ctx.db.insert("attendanceMetadata", {
        key: "Campus",
        type: "select",
        order: 0,
        values: { c1: USYD },
      }),
      roleId: await ctx.db.insert("attendanceMetadata", {
        key: "Role",
        type: "select",
        order: 1,
        values: { r1: "Member", r2: "Alumni", r3: "Newcomer" },
      }),
    }));
    const member = (name: string, metadata: Record<string, string>) =>
      s.t.run((ctx) => ctx.db.insert("attendanceMembers", { name, metadata }));
    return { ...s, roleId, campusId, member };
  };

  test("from last night's Insights, a hand-set Alumni first, else Member", async () => {
    const { t, leader, roleId, campusId, member } = await roleSetup();
    const regular = await member("Rey Gular", { [campusId]: "c1", [roleId]: "r3" });
    const alumni = await member("Al Umni", { [campusId]: "c1", [roleId]: "r2" });
    const quiet = await member("Quinn Iet", { [roleId]: "r1" });
    await t.run((ctx) =>
      ctx.db.insert("weeklyCategories", {
        subgroup: USYD,
        termKey: "2026-T2",
        people: [
          { key: `member:${regular}`, category: "regular" },
          { key: `member:${alumni}`, category: "staff" },
        ],
      })
    );

    const { page } = await listAll(leader);
    const row = (id: string) => page.find((r) => r.memberId === id)!;
    expect(row(regular)).toMatchObject({ role: "Regular", subtitle: "Regular" });
    expect(row(alumni)).toMatchObject({ role: "Alumni", subtitle: "Alumni" });
    expect(row(quiet)).toMatchObject({ role: "Member", subtitle: "Member" });
    expect(page.find((r) => r.email === LEADER)?.role).toBe("Student Leader");

    const filtered = (label: string) =>
      leader.query(api.attendanceMembers.list, {
        year: YEAR,
        filters: { [roleId]: label },
        paginationOpts: { numItems: 100, cursor: null },
      });
    expect((await filtered("Regular")).page.map((r) => r.name)).toEqual(["Rey Gular"]);
    expect((await filtered("Newcomer")).page).toEqual([]);
    expect((await filtered("Member")).page.map((r) => r.name)).toEqual(["Quinn Iet"]);

    const sorted = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: roleId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(sorted.page.filter((r) => r.kind === "member").map((r) => r.role)).toEqual([
      "Alumni",
      "Member",
      "Regular",
    ]);

    const got = await leader.query(api.attendanceMembers.get, { memberId: alumni });
    expect(got?.role).toEqual({
      role: "Alumni",
      source: "marked",
      marked: "Alumni",
      automatic: { role: "Member", source: "none" },
    });
    expect(got?.roleRuleSettings).toMatchObject({ regularShare: 0.5, visitorMinWeeklies: 2 });
    const staff = await leader.query(api.attendanceMembers.get, {
      memberId: await linkedMemberOf(t, LEADER),
    });
    expect(staff?.role).toMatchObject({ role: "Student Leader", source: "staff", marked: null });
  });

  test("only Visitor or Alumni are saved by hand, and an old Role stays until it's changed", async () => {
    const { t, leader, roleId, member } = await roleSetup();
    const id = await member("Old Role", { [roleId]: "r3" });
    const stored = async () => (await t.run((ctx) => ctx.db.get(id)))?.metadata ?? {};

    await leader.mutation(api.attendanceMembers.update, {
      memberId: id,
      name: "Old Role Renamed",
      metadata: { [roleId]: "r3" },
    });
    expect(await stored()).toEqual({ [roleId]: "r3" });

    await leader.mutation(api.attendanceMembers.update, {
      memberId: id,
      name: "Old Role Renamed",
      metadata: { [roleId]: "Visitor" },
    });
    expect(await stored()).toEqual({ [roleId]: "Visitor" });

    await leader.mutation(api.attendanceMembers.update, {
      memberId: id,
      name: "Old Role Renamed",
      metadata: { [roleId]: "Alumni" },
    });
    expect(await stored()).toEqual({ [roleId]: "r2" });

    await leader.mutation(api.attendanceMembers.update, {
      memberId: id,
      name: "Old Role Renamed",
      metadata: { [roleId]: "Newcomer" },
    });
    expect(await stored()).toEqual({});

    const created = await leader.mutation(api.attendanceMembers.create, {
      name: "Typed Leader",
      metadata: { [roleId]: "Student Leader" },
    });
    expect((await t.run((ctx) => ctx.db.get(created)))?.metadata).toEqual({});
  });
});

describe("attendance members on a campus", () => {
  pinClock();

  test("optionIdForLabel fallback: campus not in field values returns the label", async () => {
    const t = await campusWithDefaults();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "Late Uni" });
    await admin.mutation(api.admin.setStaffProfile, {
      email: OUTSIDER,
      year: YEAR,
      roles: ["Student Leader"],
      university: "Late Uni",
    });
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(page.page.some((r) => r.email === OUTSIDER)).toBe(true);
  });

  test("staffLockedMetadata clears campus for staff with no campus assignment", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const campusField = fields.find((f) => f.key === "Campus")!;
    const usydId = Object.entries(campusField.values ?? {}).find(
      ([, label]) => label === USYD
    )![0];
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: STAFF,
    });
    await t.run((ctx) =>
      ctx.db.patch(shadowId, { metadata: { [campusField._id]: usydId } })
    );
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const row = page.page.find((r) => r.email === STAFF);
    expect(row?.memberId).toBe(shadowId);
    expect(row?.metadata[campusField._id]).toBeUndefined();
  });

  test("list combines staff profiles with attendance-only members", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Guest Member",
      email: "guest@example.com",
    });
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(page.page.some((r) => r.key === `member:${memberId}`)).toBe(true);
    expect(page.page.some((r) => r.key === `staff:${LEADER}`)).toBe(true);
    expect(
      await t.query(api.attendanceMembers.list, {
        year: YEAR,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).toEqual({ page: [], isDone: true, continueCursor: "", total: 0 });
  });

  test("dedupes an attendance-only member who later becomes staff, per year", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Future Leader",
      email: "future@gmail.com",
    });
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: OUTSIDER,
        year: YEAR,
        name: "Future Leader",
        assignments: [{ role: "Student Leader", university: USYD }],
        memberId,
      })
    );

    const thisYear = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const staffRow = thisYear.page.find((r) => r.key === `staff:${OUTSIDER}`);
    expect(staffRow?.memberId).toBe(memberId);
    expect(staffRow?.personalEmail).toBe("future@gmail.com");
    expect(thisYear.page.some((r) => r.key === `member:${memberId}`)).toBe(false);

    const merged = await leader.query(api.attendanceMembers.get, {
      memberId,
      staffYear: YEAR,
    });
    expect(merged?.isStaffOverlay).toBe(true);
    expect(merged?.email).toBe(OUTSIDER);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "Edited Name",
      email: "ignored@example.com",
      personalEmail: "edited@example.com",
      metadata: { [yearField._id]: String(YEAR - 2) },
      staffYear: YEAR,
    });
    const updated = await leader.query(api.attendanceMembers.get, {
      memberId,
      staffYear: YEAR,
    });
    if (!updated) throw new Error("Expected merged attendance member");
    expect(updated.isStaffOverlay).toBe(true);
    expect(updated.email).toBe(OUTSIDER);
    expect(updated.personalEmail).toBe("edited@example.com");
    expect(updated.name).toBe("Future Leader");
    expect(updated.metadata?.[yearField._id]).toBe(String(YEAR - 2));

    const pastYear = await leader.query(api.attendanceMembers.list, {
      year: YEAR - 5,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(pastYear.page.find((r) => r.key === `member:${memberId}`)?.email).toBe(
      "edited@example.com"
    );
    expect(pastYear.page.some((r) => r.key === `staff:${OUTSIDER}`)).toBe(false);
  });

  test("ensureForStaff reuses the member linked from last year's profile instead of duplicating", async () => {
    const t = await campusSetup();
    const leader = asUser(t, LEADER);
    const { memberId, profileId } = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Returning Staff" });
      await ctx.db.insert("staffProfiles", {
        email: "returning@sowaustralia.com",
        year: YEAR - 1,
        assignments: [{ role: "Staff", department: "Missions" }],
        memberId,
      });
      const profileId = await ctx.db.insert("staffProfiles", {
        email: "returning@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Missions" }],
      });
      return { memberId, profileId };
    });
    const before = await t.run((ctx) => ctx.db.query("attendanceMembers").collect());
    const ensured = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: "returning@sow.org.au",
    });
    expect(ensured).toBe(memberId);
    expect(await t.run((ctx) => ctx.db.query("attendanceMembers").collect())).toHaveLength(
      before.length
    );
    expect((await t.run((ctx) => ctx.db.get(profileId)))?.memberId).toBe(memberId);
  });

  test("ensureForStaff reuses a member linked from a profile with the same import id", async () => {
    const t = await campusSetup();
    const leader = asUser(t, LEADER);
    const memberId = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Renamed Staff" });
      await ctx.db.insert("staffProfiles", {
        email: "maiden.name@sow.org.au",
        year: YEAR - 1,
        importId: "import-7",
        assignments: [{ role: "Staff", department: "Missions" }],
        memberId,
      });
      await ctx.db.insert("staffProfiles", {
        email: "married.name@sow.org.au",
        year: YEAR,
        importId: "import-7",
        assignments: [{ role: "Staff", department: "Missions" }],
      });
      return memberId;
    });
    expect(
      await leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: "married.name@sow.org.au",
      })
    ).toBe(memberId);
  });

  test("next year's staff still holding their staff email can have it cleared this year", async () => {
    const t = await campusSetup();
    const leader = asUser(t, LEADER);
    const NEXT = "next.leader@sow.org.au";
    const memberId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: NEXT,
        year: YEAR + 1,
        name: "Next Leader",
        assignments: [{ role: "Student Leader", university: USYD }],
      });
      return await ctx.db.insert("attendanceMembers", { name: "Next Leader", email: NEXT });
    });
    const shown = await leader.query(api.attendanceMembers.get, { memberId, staffYear: YEAR });
    expect(shown?.isStaffOverlay).toBe(false);
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId,
        name: "Next Leader",
        email: NEXT,
        staffYear: YEAR,
      })
    ).rejects.toThrow(/staff email/);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "Next Leader",
      staffYear: YEAR,
    });
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.email).toBeUndefined();
  });

  test("ensureForStaff won't adopt an unlinked member without a staff profile", async () => {
    const t = await campusSetup();
    const leader = asUser(t, LEADER);
    const memberId = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Outside Person", email: OUTSIDER })
    );
    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: OUTSIDER,
      })
    ).rejects.toThrow(/not found/i);
    const row = await t.run((ctx) => ctx.db.get(memberId));
    expect(row?.email).toBe(OUTSIDER);
  });

  test("roster subtitle omits campus (shown by the chip) but keeps other metadata", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
    const fields = await leader.query(api.attendanceMetadata.list, {});
    const campusField = fields.find((f) => f.key === "Campus")!;
    const genderField = fields.find((f) => f.key === "Gender")!;
    const usydId = Object.entries(campusField.values ?? {}).find(
      ([, label]) => label === USYD
    )?.[0]!;
    const maleId = Object.entries(genderField.values ?? {}).find(
      ([, label]) => label === "Male"
    )?.[0]!;
    await leader.mutation(api.attendanceMembers.create, {
      name: "Campus Guest",
      metadata: { [campusField._id]: usydId, [genderField._id]: maleId },
    });
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    const row = roster.find((r) => r.name === "Campus Guest")!;
    expect(row.university).toBe(USYD);
    expect(row.subtitle ?? "").not.toContain(USYD);
    expect(row.subtitle).toContain("Male");
  });

  test("search, filter, sort, and paginate", async () => {
    const t = await campusSetup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "president@sow.org.au",
      year: YEAR,
      roles: ["President"],
      university: USYD,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "outsource@sow.org.au",
      year: YEAR,
      roles: ["Outsource"],
      department: "Missions",
    });
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    const year3Id = Object.entries(yearField.values ?? {}).find(
      ([, label]) => label === "3"
    )?.[0]!;

    await leader.mutation(api.attendanceMembers.create, {
      name: "Zara Alpha",
      metadata: { [yearField._id]: String(YEAR - 2) },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Beta Guest",
      metadata: { [yearField._id]: String(YEAR - 1) },
    });

    const searched = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      search: "zara",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(searched.page.every((r) => r.name.toLowerCase().includes("zara"))).toBe(
      true
    );

    const genderField = fields.find((f) => f.key === "Gender")!;
    const genderMaleId = Object.entries(genderField.values ?? {}).find(
      ([, label]) => label === "Male"
    )?.[0]!;
    const genderFemaleId = Object.entries(genderField.values ?? {}).find(
      ([, label]) => label === "Female"
    )?.[0]!;

    await leader.mutation(api.attendanceMembers.create, {
      name: "Meta Guest",
      metadata: { [genderField._id]: genderMaleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Multi Filter Guest",
      metadata: { [genderField._id]: genderFemaleId },
    });
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    expect(roster.some((r) => r.name === "Meta Guest" && r.subtitle?.includes("Male"))).toBe(
      true
    );

    const filtered = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: year3Id },
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(filtered.page.some((r) => r.name === "Zara Alpha")).toBe(true);
    expect(filtered.page.some((r) => r.name === "Beta Guest")).toBe(false);

    const byGender = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [genderField._id]: genderMaleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byGender.page.some((r) => r.name === "Meta Guest")).toBe(true);

    const byMultipleGenders = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [genderField._id]: [genderMaleId, genderFemaleId] },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byMultipleGenders.page.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Meta Guest", "Multi Filter Guest"])
    );

    const byMetaSort = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: genderField._id,
      sortAsc: true,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byMetaSort.page.length).toBeGreaterThan(0);

    const campusField = fields.find((f) => f.key === "Campus")!;
    const roleField = fields.find((f) => f.key === "Role")!;
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          id: campusField._id,
          key: "Campus",
          type: "select",
          order: campusField.order,
          values: { ...campusField.values, "99": "Other" },
          lockedValues: campusField.lockedValues,
        },
        {
          id: roleField._id,
          key: "Role",
          type: "select",
          order: roleField.order,
          values: {
            ...roleField.values,
            "97": "Alumni",
            "98": "Newcomer",
          },
          lockedValues: roleField.lockedValues,
        },
      ],
      deleteIds: [],
    });
    const otherId = "99";
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    const refreshedFields = await leader.query(api.attendanceMetadata.list, { });
    const refreshedCampus = refreshedFields.find((f) => f.key === "Campus")!;
    const refreshedRole = refreshedFields.find((f) => f.key === "Role")!;
    const usydId = Object.entries(refreshedCampus.values ?? {}).find(
      ([, label]) => label === USYD
    )?.[0]!;
    const leaderRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Student Leader"
    )?.[0]!;
    await leader.mutation(api.attendanceMembers.update, {
      memberId: shadowId,
      name: "ignored",
      metadata: { [refreshedCampus._id]: otherId, [roleField._id]: "Member" },
    });
    const listed = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const staffRow = listed.page.find((r) => r.email === LEADER);
    expect(staffRow?.university).toBe(USYD);
    expect(staffRow?.metadata[refreshedCampus._id]).toBe(usydId);
    expect(staffRow?.metadata[refreshedRole._id]).toBe(leaderRoleId);

    const staffRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Staff"
    )?.[0]!;
    const studentLeaderRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Student Leader"
    )?.[0]!;
    const memberRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Member"
    )?.[0]!;
    const newcomerRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Newcomer"
    )?.[0]!;
    const alumniRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Alumni"
    )?.[0]!;
    await leader.mutation(api.attendanceMembers.create, {
      name: "Member Role Guest",
      metadata: { [refreshedRole._id]: memberRoleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Newcomer Role Guest",
      metadata: { [refreshedRole._id]: newcomerRoleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Alumni Role Guest",
      metadata: { [refreshedRole._id]: alumniRoleId },
    });
    const byStaffRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: staffRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byStaffRole.page.some((r) => r.email === STAFF)).toBe(true);
    expect(byStaffRole.page.some((r) => r.email === "outsource@sow.org.au")).toBe(
      true
    );
    expect(byStaffRole.page.some((r) => r.email === LEADER)).toBe(false);
    expect(byStaffRole.page.some((r) => r.email === "president@sow.org.au")).toBe(
      false
    );
    expect(byStaffRole.page.some((r) => r.name === "Member Role Guest")).toBe(false);
    expect(byStaffRole.page.some((r) => r.name === "Newcomer Role Guest")).toBe(
      false
    );
    expect(byStaffRole.page.some((r) => r.name === "Alumni Role Guest")).toBe(false);

    const byStudentLeaderRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: studentLeaderRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byStudentLeaderRole.page.some((r) => r.email === LEADER)).toBe(true);
    expect(
      byStudentLeaderRole.page.some((r) => r.email === "president@sow.org.au")
    ).toBe(true);
    expect(byStudentLeaderRole.page.some((r) => r.email === STAFF)).toBe(false);

    const byNewcomerRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: newcomerRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byNewcomerRole.page.map((r) => r.name)).not.toContain("Newcomer Role Guest");
    expect(byNewcomerRole.page.some((r) => r.email === STAFF)).toBe(false);
    const byMemberRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: "Member" },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byMemberRole.page.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Member Role Guest", "Newcomer Role Guest"])
    );
    expect(byMemberRole.page.some((r) => r.kind === "staff")).toBe(false);
    const byAlumniRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: "Alumni" },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byAlumniRole.page.map((r) => r.name)).toEqual(["Alumni Role Guest"]);
    expect(byAlumniRole.page[0].subtitle).toBe("Alumni");

    const unset = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: "unset" },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(unset.page.every((r) => !r.metadata[yearField._id])).toBe(true);

    const byYearSort = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: yearField._id,
      sortAsc: false,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byYearSort.page.length).toBeGreaterThan(0);

    const sorted = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: "name",
      sortAsc: true,
      paginationOpts: { numItems: 20, cursor: null },
    });
    const guestNames = sorted.page
      .filter((r) => r.kind === "member")
      .map((r) => r.name);
    expect(guestNames.indexOf("Beta Guest")).toBeLessThan(
      guestNames.indexOf("Zara Alpha")
    );

    const page1 = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(page1.isDone).toBe(false);
    const page2 = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page.length).toBeGreaterThan(0);
  });

  test("ensureForStaff, update, get, and remove", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;

    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    expect(
      await leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: LEADER,
      })
    ).toBe(shadowId);

    await leader.mutation(api.attendanceMembers.update, {
      memberId: shadowId,
      name: "ignored",
      metadata: { [yearField._id]: String(YEAR) },
    });
    const shadow = await leader.query(api.attendanceMembers.get, {
      memberId: shadowId,
    });
    expect(shadow?.metadata?.[yearField._id]).toBe(String(YEAR));

    const guestId = await leader.mutation(api.attendanceMembers.create, {
      name: "Guest",
    });
    await leader.mutation(api.attendanceMembers.update, {
      memberId: guestId,
      name: "Guest Renamed",
      email: "guest@test.org",
    });
    expect(await t.query(api.attendanceMembers.get, { memberId: guestId })).toBeNull();

    const eventId = await createEvent(leader);
    await leader.mutation(api.attendance.signIn, { eventId, memberId: guestId });
    await asUser(t, ADMIN).mutation(api.attendanceMembers.remove, { memberId: guestId });
    expect(await leader.query(api.attendanceMembers.get, { memberId: guestId })).toBeNull();
    expect(await leader.query(api.attendance.listByEvent, { eventId })).toEqual([]);

    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: "   ",
      })
    ).rejects.toThrow(/email is required/i);
    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: OUTSIDER,
      })
    ).rejects.toThrow(/not found/i);
    await expect(
      leader.mutation(api.attendanceMembers.create, { name: "  " })
    ).rejects.toThrow(/Name is required/i);
    const guest2 = await leader.mutation(api.attendanceMembers.create, {
      name: "Guest Two",
    });
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId: guest2,
        name: " ",
      })
    ).rejects.toThrow(/Name is required/i);
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId: guestId,
        name: "Ghost",
      })
    ).rejects.toThrow(/Member not found/i);
  });
});

describe("attendanceMembers.byName", () => {
  pinClock();

  test("matches case-insensitively, trims, and is staff-only", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const campus = fields.find((f) => f.key === "Campus")!;
    const usydId = Object.entries(campus.values ?? {}).find(
      ([, label]) => label === USYD
    )![0];

    await leader.mutation(api.attendanceMembers.create, {
      name: "Jane Doe",
      email: "jane@example.com",
      metadata: { [campus._id]: usydId },
    });
    await leader.mutation(api.attendanceMembers.create, { name: "Jane Doe" });
    await leader.mutation(api.attendanceMembers.create, { name: "Someone Else" });

    expect(await t.query(api.attendanceMembers.byName, { name: "Jane Doe" })).toEqual(
      []
    );
    expect(await leader.query(api.attendanceMembers.byName, { name: "  " })).toEqual(
      []
    );

    const matches = await leader.query(api.attendanceMembers.byName, {
      name: "  jane DOE ",
    });
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.name).sort()).toEqual(["Jane Doe", "Jane Doe"]);
    const withCampus = matches.find((m) => m.email === "jane@example.com")!;
    expect(withCampus.metadata[campus._id]).toBe(usydId);

    expect(
      await leader.query(api.attendanceMembers.byName, { name: "nobody" })
    ).toEqual([]);
  });

  test("a different-case lookup returns only whole-name matches, not names that merely share words", async () => {
    const t = await campusSetup();
    const leader = asUser(t, LEADER);
    await t.run(async (ctx) => {
      for (const name of ["Jane Doe", "jane doe", "Jane Doering", "Janet Doe", "Doe Jane"]) {
        await ctx.db.insert("attendanceMembers", { name });
      }
    });
    const matches = await leader.query(api.attendanceMembers.byName, { name: "JANE DOE" });
    expect(matches.map((m) => m.name).sort()).toEqual(["Jane Doe", "jane doe"]);
  });
});
