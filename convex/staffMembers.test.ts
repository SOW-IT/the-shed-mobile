import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  assignedProfileForEmail,
  attachMember,
  knownMemberId,
  latestProfileOfMember,
  leaveStaff,
  linkOrCreateMember,
  moveAttendance,
  profilesOfMember,
  staffMemberForEmail,
  staffProfileOfMember,
} from "./staffMembers";

const modules = import.meta.glob("./**/*.ts");
const NOW = staffYearForDate(new Date());
const ACTOR = "admin@sow.org.au";
const USYD = "University of Sydney";
const LEADER = [{ role: "Student Leader", university: USYD }];

type ProfileFields = Partial<Omit<Doc<"staffProfiles">, "_id" | "_creationTime">>;

function setup() {
  const t = convexTest(schema, modules);
  const member = (name: string, metadata?: Record<string, string>) =>
    t.run((ctx) => ctx.db.insert("attendanceMembers", { name, metadata }));
  const profile = (email: string, year: number, fields: ProfileFields = {}) =>
    t.run((ctx) =>
      ctx.db.insert("staffProfiles", { email, year, assignments: LEADER, ...fields })
    );
  const getProfile = (id: Id<"staffProfiles">) => t.run((ctx) => ctx.db.get(id));
  const getMember = (id: Id<"attendanceMembers">) => t.run((ctx) => ctx.db.get(id));
  const members = () => t.run((ctx) => ctx.db.query("attendanceMembers").collect());
  const logs = () => t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
  const roleField = (values: Record<string, string>) =>
    t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", { key: "Role", type: "select", order: 0, values })
    );
  const campusField = () =>
    t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", {
        key: "Campus",
        type: "select",
        order: 1,
        values: { usyd: USYD },
      })
    );
  return { t, member, profile, getProfile, getMember, members, logs, roleField, campusField };
}

describe("finding a member's staff profiles", () => {
  test("only an assigned profile in that year makes them staff", async () => {
    const s = setup();
    const memberId = await s.member("Lee Aver");
    const unassigned = await s.profile("lee.aver@sow.org.au", NOW, { memberId, assignments: [] });
    const past = await s.profile("lee.aver@sow.org.au", NOW - 1, { memberId });

    expect(await s.t.run((ctx) => staffProfileOfMember(ctx, memberId, NOW))).toBeNull();
    expect((await s.t.run((ctx) => staffProfileOfMember(ctx, memberId, NOW - 1)))?._id).toBe(past);
    const all = await s.t.run((ctx) => profilesOfMember(ctx, memberId));
    expect(all.map((p) => p._id).sort()).toEqual([unassigned, past].sort());
    expect((await s.t.run((ctx) => latestProfileOfMember(ctx, memberId)))?._id).toBe(unassigned);

    const nobody = await s.member("Nobody");
    expect(await s.t.run((ctx) => latestProfileOfMember(ctx, nobody))).toBeNull();
    expect(await s.t.run((ctx) => profilesOfMember(ctx, nobody))).toEqual([]);
  });

  test("assignedProfileForEmail matches either SOW domain and skips unassigned profiles", async () => {
    const s = setup();
    const legacy = await s.profile("lee.aver@sowaustralia.com", NOW);
    await s.profile("una.ssigned@sow.org.au", NOW, { assignments: [] });

    const found = await s.t.run((ctx) => assignedProfileForEmail(ctx, "Lee.Aver@sow.org.au", NOW));
    expect(found?._id).toBe(legacy);
    expect(await s.t.run((ctx) => assignedProfileForEmail(ctx, "una.ssigned@sow.org.au", NOW))).toBeNull();
    expect(await s.t.run((ctx) => assignedProfileForEmail(ctx, undefined, NOW))).toBeNull();
    expect(await s.t.run((ctx) => assignedProfileForEmail(ctx, "lee.aver@sow.org.au", NOW + 1))).toBeNull();
  });
});

describe("linking a profile to its person", () => {
  test("reuses the latest live link, links every unlinked profile, and leaves other live links alone", async () => {
    const s = setup();
    const memberId = await s.member("Lee Aver");
    const other = await s.member("Someone Else");
    const old = await s.profile("lee.aver@sowaustralia.com", NOW - 2, { memberId });
    const stale = await s.profile("lee.aver@sowaustralia.com", NOW - 1);
    const elsewhere = await s.profile("lee.aver@sow.org.au", NOW - 3, { memberId: other });
    const current = await s.profile("lee.aver@sow.org.au", NOW);

    const known = await s.t.run(async (ctx) => knownMemberId(ctx, (await ctx.db.get(current))!));
    expect(known).toBe(memberId);

    const linked = await s.t.run(async (ctx) =>
      linkOrCreateMember(ctx, (await ctx.db.get(current))!, ACTOR)
    );
    expect(linked).toBe(memberId);
    expect((await s.getProfile(current))?.memberId).toBe(memberId);
    expect((await s.getProfile(stale))?.memberId).toBe(memberId);
    expect((await s.getProfile(old))?.memberId).toBe(memberId);
    expect((await s.getProfile(elsewhere))?.memberId).toBe(other);
    expect(await s.members()).toHaveLength(2);
    expect(await s.logs()).toHaveLength(0);
  });

  test("links a person across a changed email through their importId", async () => {
    const s = setup();
    const memberId = await s.member("Jane Doe");
    await s.profile("jane.old@sow.org.au", NOW - 1, { memberId, importId: "person-jane" });
    const renamed = await s.profile("jane.new@sow.org.au", NOW, { importId: "person-jane" });

    const linked = await s.t.run(async (ctx) =>
      linkOrCreateMember(ctx, (await ctx.db.get(renamed))!, ACTOR)
    );
    expect(linked).toBe(memberId);
    expect((await s.getProfile(renamed))?.memberId).toBe(memberId);
    expect(await s.members()).toHaveLength(1);
  });

  test("keeps a profile's own live link", async () => {
    const s = setup();
    const own = await s.member("Own Row");
    const other = await s.member("Other Row");
    await s.profile("lee.aver@sow.org.au", NOW - 1, { memberId: other });
    const current = await s.profile("lee.aver@sow.org.au", NOW, { memberId: own });

    const linked = await s.t.run(async (ctx) =>
      linkOrCreateMember(ctx, (await ctx.db.get(current))!, ACTOR)
    );
    expect(linked).toBe(own);
  });

  test("a dangling memberId is treated as unlinked, and a new row is created with a name", async () => {
    const s = setup();
    const gone = await s.member("Deleted");
    await s.t.run((ctx) => ctx.db.delete(gone));
    const past = await s.profile("jane.doe@sowaustralia.com", NOW - 1, { memberId: gone });
    const current = await s.profile("jane.doe@sow.org.au", NOW, { memberId: gone });

    expect(
      await s.t.run(async (ctx) => knownMemberId(ctx, (await ctx.db.get(current))!))
    ).toBeNull();
    const created = await s.t.run(async (ctx) =>
      linkOrCreateMember(ctx, (await ctx.db.get(current))!, ACTOR)
    );
    expect(created).not.toBe(gone);
    expect((await s.getMember(created))?.name).toBe("Jane Doe");
    expect((await s.getProfile(current))?.memberId).toBe(created);
    expect((await s.getProfile(past))?.memberId).toBe(created);
    const [log] = await s.logs();
    expect(log).toMatchObject({
      actorEmail: ACTOR,
      entityType: "member",
      action: "member.create",
      summary: 'Added staff member "Jane Doe" to the attendance pool',
      memberId: created,
      subjectEmail: "jane.doe@sow.org.au",
    });
  });

  test("a new row takes the profile's own name, capitalised", async () => {
    const s = setup();
    const current = await s.profile("x1@sow.org.au", NOW, { name: "mary quant" });
    const created = await s.t.run(async (ctx) =>
      linkOrCreateMember(ctx, (await ctx.db.get(current))!, ACTOR)
    );
    expect((await s.getMember(created))?.name).toBe("Mary Quant");
  });
});

describe("attachMember", () => {
  test("does nothing for a missing or unassigned profile", async () => {
    const s = setup();
    const unassigned = await s.profile("una.ssigned@sow.org.au", NOW, { assignments: [] });
    const deleted = await s.profile("gone.person@sow.org.au", NOW);
    await s.t.run((ctx) => ctx.db.delete(deleted));

    expect(await s.t.run((ctx) => attachMember(ctx, unassigned, ACTOR))).toBeNull();
    expect(await s.t.run((ctx) => attachMember(ctx, deleted, ACTOR))).toBeNull();
    expect(await s.members()).toHaveLength(0);
  });

  test("creates a member for current-year staff, but only links a known one in other years", async () => {
    const s = setup();
    const next = await s.profile("new.person@sow.org.au", NOW + 1);
    expect(await s.t.run((ctx) => attachMember(ctx, next, ACTOR))).toBeNull();
    expect(await s.members()).toHaveLength(0);

    const current = await s.profile("new.person@sow.org.au", NOW);
    const created = await s.t.run((ctx) => attachMember(ctx, current, ACTOR));
    expect(created).not.toBeNull();
    expect((await s.getProfile(next))?.memberId).toBe(created);

    const past = await s.profile("new.person@sowaustralia.com", NOW - 1);
    expect(await s.t.run((ctx) => attachMember(ctx, past, ACTOR))).toBe(created);
    expect((await s.getProfile(past))?.memberId).toBe(created);
    expect(await s.members()).toHaveLength(1);
  });
});

describe("staffMemberForEmail", () => {
  test("returns the assigned profile and its linked or new member", async () => {
    const s = setup();
    const profileId = await s.profile("lee.aver@sow.org.au", NOW);
    expect(
      await s.t.run((ctx) => staffMemberForEmail(ctx, "nobody@sow.org.au", NOW, ACTOR))
    ).toBeNull();
    const found = await s.t.run((ctx) =>
      staffMemberForEmail(ctx, "lee.aver@sowaustralia.com", NOW, ACTOR)
    );
    expect(found?.profile._id).toBe(profileId);
    expect((await s.getProfile(profileId))?.memberId).toBe(found?.memberId);
    const again = await s.t.run((ctx) =>
      staffMemberForEmail(ctx, "lee.aver@sow.org.au", NOW, ACTOR)
    );
    expect(again?.memberId).toBe(found?.memberId);
  });
});

describe("leaveStaff", () => {
  test("fills an empty Campus (never Role, which is worked out), keeps the member's own name, and logs it", async () => {
    const s = setup();
    await s.roleField({ "1": "Staff", "3": "Member" });
    const campus = await s.campusField();
    const memberId = await s.member("Lee-Ann Aver", { other: "kept" });
    const profileId = await s.profile("lee.aver@sow.org.au", NOW, { name: "Lee-ann aver", memberId });

    const ok = await s.t.run(async (ctx) =>
      leaveStaff(ctx, memberId, (await ctx.db.get(profileId))!, NOW + 1, ACTOR)
    );
    expect(ok).toBe(true);
    const row = await s.getMember(memberId);
    expect(row?.name).toBe("Lee-Ann Aver");
    expect(row?.metadata).toEqual({ other: "kept", [campus]: "usyd" });
    const [log] = await s.logs();
    expect(log).toMatchObject({
      actorEmail: ACTOR,
      entityType: "member",
      action: "member.leftStaff",
      summary: '"Lee-Ann Aver" left staff and is now a member',
      memberId,
      subjectEmail: "lee.aver@sow.org.au",
      detail: [
        `Not staff in ${NOW + 1}`,
        `Campus set to ${USYD}, from their last staff role`,
      ].join("\n"),
    });
  });

  test("keeps a Campus and Role they already have, and their name when the profile has none", async () => {
    const s = setup();
    const role = await s.roleField({ "1": "Staff", "2": "Alumni" });
    const campus = await s.campusField();
    const memberId = await s.member("Kept Name", { [campus]: "other", [role]: "2" });
    const profileId = await s.profile("lee.aver@sow.org.au", NOW, { memberId });

    await s.t.run(async (ctx) =>
      leaveStaff(ctx, memberId, (await ctx.db.get(profileId))!, NOW + 1, ACTOR)
    );
    const row = await s.getMember(memberId);
    expect(row?.name).toBe("Kept Name");
    expect(row?.metadata).toEqual({ [campus]: "other", [role]: "2" });
    expect((await s.logs())[0].detail).toBe(`Not staff in ${NOW + 1}`);
  });

  test("works without Campus or Role fields, and without a campus on the profile", async () => {
    const s = setup();
    await s.campusField();
    const memberId = await s.member("Lee Aver");
    const profileId = await s.profile("lee.aver@sow.org.au", NOW, {
      memberId,
      assignments: [{ role: "Staff", department: "Finance" }],
    });
    await s.t.run(async (ctx) =>
      leaveStaff(ctx, memberId, (await ctx.db.get(profileId))!, NOW + 1, ACTOR)
    );
    expect((await s.getMember(memberId))?.metadata).toEqual({});
  });

  test("returns false for a member row that no longer exists", async () => {
    const s = setup();
    const memberId = await s.member("Gone");
    const profileId = await s.profile("lee.aver@sow.org.au", NOW, { memberId });
    await s.t.run((ctx) => ctx.db.delete(memberId));
    const ok = await s.t.run(async (ctx) =>
      leaveStaff(ctx, memberId, (await ctx.db.get(profileId))!, NOW + 1, ACTOR)
    );
    expect(ok).toBe(false);
    expect(await s.logs()).toHaveLength(0);
  });
});

describe("moveAttendance", () => {
  test("combines sign-ins at the same event, moves the rest, and repoints profiles", async () => {
    const s = setup();
    const from = await s.member("Duplicate");
    const into = await s.member("Keeper");
    const profileId = await s.profile("lee.aver@sow.org.au", NOW, { memberId: from });
    const event = (name: string) =>
      s.t.run((ctx) =>
        ctx.db.insert("events", { name, dateStart: 1, dateEnd: 2, subgroups: [] })
      );
    const e1 = await event("e1");
    const e2 = await event("e2");
    const signIn = (eventId: Id<"events">, memberId: Id<"attendanceMembers">, at: number, notes?: string) =>
      s.t.run((ctx) => ctx.db.insert("attendance", { eventId, memberId, signInTime: at, notes }));
    const kept = await signIn(e1, into, 200, "late");
    await signIn(e1, from, 100, "early");
    const moved = await signIn(e2, from, 300);

    const result = await s.t.run((ctx) => moveAttendance(ctx, from, into));
    expect(result).toEqual({ moved: 1, combined: 1 });

    const rows = await s.t.run((ctx) => ctx.db.query("attendance").collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r._id === kept)).toMatchObject({
      memberId: into,
      signInTime: 100,
      notes: "late\nearly",
    });
    expect(rows.find((r) => r._id === moved)?.memberId).toBe(into);
    expect((await s.getProfile(profileId))?.memberId).toBe(into);
  });

  test("folds two of the moved member's own sign-ins at one event together", async () => {
    const s = setup();
    const from = await s.member("Duplicate");
    const into = await s.member("Keeper");
    const eventId = await s.t.run((ctx) =>
      ctx.db.insert("events", { name: "e", dateStart: 1, dateEnd: 2, subgroups: [] })
    );
    await s.t.run(async (ctx) => {
      await ctx.db.insert("attendance", { eventId, memberId: from, signInTime: 50 });
      await ctx.db.insert("attendance", { eventId, memberId: from, signInTime: 40, notes: "x" });
    });
    expect(await s.t.run((ctx) => moveAttendance(ctx, from, into))).toEqual({
      moved: 1,
      combined: 1,
    });
    const rows = await s.t.run((ctx) => ctx.db.query("attendance").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ memberId: into, signInTime: 40, notes: "x" });
  });
});
