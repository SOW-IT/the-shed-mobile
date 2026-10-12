/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";
const STAFF = "sam.staff@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const signedIn = (t: TestConvex<typeof schema>, userId: string, email: string) =>
  t.withIdentity({ email, subject: `${userId}|session`, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await t.run((ctx) =>
    ctx.db.insert("staffProfiles", { email: STAFF, year: YEAR, assignments: [{ role: "Staff" }] })
  );
  const samId = await t.run((ctx) => ctx.db.insert("users", { email: STAFF, name: "Sam Staff" }));
  return { t, sam: signedIn(t, samId, STAFF), samId };
}

describe("the church list", () => {
  test("staff add churches; the same name can't go in twice", async () => {
    const { t, sam } = await setup();
    expect(await t.query(api.churches.list, {})).toEqual([]);
    await expect(t.mutation(api.churches.add, { name: "Grace" })).rejects.toThrow();

    const grace = await sam.mutation(api.churches.add, {
      name: "  Grace   Church ",
      address: " 1 Church St,  Ryde ",
      serviceTimes: "Sunday 10am",
    });
    await sam.mutation(api.churches.add, { name: "Abba Church", serviceTimes: "  " });
    expect(await sam.query(api.churches.list, {})).toEqual([
      { _id: expect.any(String), name: "Abba Church", address: null, serviceTimes: null },
      { _id: grace, name: "Grace Church", address: "1 Church St, Ryde", serviceTimes: "Sunday 10am" },
    ]);
    await expect(sam.mutation(api.churches.add, { name: "grace church" })).rejects.toThrow(
      "Grace Church is already in the list"
    );
    await expect(sam.mutation(api.churches.add, { name: "   " })).rejects.toThrow("Add the church's name");
  });

  test("anyone on staff can fill in or fix a church's details", async () => {
    const { t, sam } = await setup();
    const abba = await sam.mutation(api.churches.add, { name: "Abba Church" });
    await sam.mutation(api.churches.add, { name: "Grace Church" });
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.churches.update, {
      churchId: abba,
      name: "Abba Church",
      address: "2 Hill Rd, Eastwood",
      serviceTimes: "Sunday 11am",
    });
    const row = await t.run((ctx) => ctx.db.get("churches", abba));
    expect(row).toMatchObject({ address: "2 Hill Rd, Eastwood", serviceTimes: "Sunday 11am", updatedBy: ADMIN });
    await expect(
      admin.mutation(api.churches.update, { churchId: abba, name: "GRACE church" })
    ).rejects.toThrow("already in the list");
    await t.run((ctx) => ctx.db.delete("churches", abba));
    await expect(admin.mutation(api.churches.update, { churchId: abba, name: "Abba" })).rejects.toThrow(
      "isn't in the list any more"
    );
  });

  test("setUp adds the starter churches once and links what people typed", async () => {
    const { t, samId } = await setup();
    const other = await t.run(async (ctx) => {
      await ctx.db.patch("users", samId, { localChurch: "harbour city  church" });
      return await ctx.db.insert("users", { email: "x@gmail.com", localChurch: "Somewhere Else" });
    });
    expect(await t.mutation(internal.churches.setUp, {})).toEqual({ added: 3, linked: 1, next: null });
    expect(await t.mutation(internal.churches.setUp, {})).toEqual({ added: 0, linked: 0, next: null });
    const churches = await t.run((ctx) => ctx.db.query("churches").collect());
    const harbour = churches.find((c) => c.name === "Harbour City Church")!;
    expect(harbour).toMatchObject({ address: "41b College Street, Gladesville NSW 2111", serviceTimes: "Sunday 10:30am" });
    expect(churches.find((c) => c.name === "Living Hope Presbyterian Church")).toMatchObject({
      serviceTimes: "Sunday 10am and 12pm",
    });
    expect(churches.find((c) => c.name === "Sydney Young Nak Church")).toMatchObject({
      address: "7-9 Manson Street, Telopea NSW",
      serviceTimes: "Sunday 1:15pm",
    });
    const [sam, x] = await t.run(async (ctx) => [await ctx.db.get("users", samId), await ctx.db.get("users", other)]);
    expect(sam).toMatchObject({ churchId: harbour._id });
    expect(sam?.localChurch).toBeUndefined();
    expect(x).toMatchObject({ localChurch: "Somewhere Else" });
  });
});

describe("setUp pages through users", () => {
  test("returns where to carry on until every user has been looked at", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 520; i++) {
        await ctx.db.insert("users", { email: `u${i}@gmail.com`, localChurch: i === 519 ? "Harbour City Church" : undefined });
      }
    });
    const first = await t.mutation(internal.churches.setUp, {});
    expect(first).toMatchObject({ linked: 0 });
    expect(first.next).not.toBeNull();
    expect(await t.mutation(internal.churches.setUp, { cursor: first.next })).toMatchObject({ linked: 1, next: null });
  });
});

describe("the Churches page", () => {
  test("each church with the staff and members who go there", async () => {
    const { t, sam } = await setup();
    expect(await t.query(api.churches.directory, {})).toEqual([]);
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.churches.add, { name: "Abba Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    const campus = await t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", {
        key: "Campus",
        type: "select",
        order: 0,
        values: { u: "University of New South Wales", o: "Other" },
      })
    );
    await sam.mutation(api.attendanceMembers.create, { name: "Zed Member", churchId: grace, metadata: { [campus]: "u" } });
    await sam.mutation(api.attendanceMembers.create, { name: "Amy Member", churchId: grace, metadata: { [campus]: "o" } });
    await t.run((ctx) => ctx.db.insert("users", { localChurch: "no email" }));

    const directory = await sam.query(api.churches.directory, {});
    expect(directory.map((d) => [d.church.name, d.staff.length, d.members.length])).toEqual([
      ["Abba Church", 0, 0],
      ["Grace Church", 1, 2],
    ]);
    expect(directory[1].staff).toEqual([{ email: STAFF, name: "Sam Staff" }]);
    expect(directory[1].members.map((m) => [m.name, m.campus])).toEqual([
      ["Amy Member", null],
      ["Zed Member", "University of New South Wales"],
    ]);
  });
});

describe("a member's church", () => {
  test("is set when adding or editing them, and can be cleared", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    const memberId = await sam.mutation(api.attendanceMembers.create, { name: "Mia Member", churchId: grace });
    const get = () => t.run((ctx) => ctx.db.get("attendanceMembers", memberId));
    expect((await get())?.churchId).toBe(grace);
    const save = (churchId?: typeof grace | null) =>
      sam.mutation(api.attendanceMembers.update, { memberId, name: "Mia Member", staffYear: YEAR, ...(churchId === undefined ? {} : { churchId }) });
    await save();
    expect((await get())?.churchId).toBe(grace);
    await save(null);
    expect((await get())?.churchId).toBeUndefined();
    await t.run((ctx) => ctx.db.delete("churches", grace));
    await expect(save(grace)).rejects.toThrow("isn't in the list any more");
    await expect(sam.mutation(api.attendanceMembers.create, { name: "Late Member", churchId: grace })).rejects.toThrow(
      "isn't in the list any more"
    );
  });

  test("a staff person's comes from their Profile", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    const memberId = await asUser(t, ADMIN).mutation(api.attendanceMembers.ensureForStaff, { staffEmail: STAFF });
    const row = () => asUser(t, ADMIN).query(api.attendanceMembers.get, { memberId, staffYear: YEAR });
    expect(await row()).toMatchObject({ isStaffOverlay: true, profileChurch: null });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    expect(await row()).toMatchObject({ profileChurch: "Grace Church" });
    const plain = await sam.mutation(api.attendanceMembers.create, { name: "Plain Person" });
    expect(await asUser(t, ADMIN).query(api.attendanceMembers.get, { memberId: plain, staffYear: YEAR })).toMatchObject({
      isStaffOverlay: false,
      profileChurch: null,
    });
  });
});

describe("your church in your Profile", () => {
  test("pick one from the list, see it with its details, or clear it", async () => {
    const { t, sam, samId } = await setup();
    await t.run((ctx) => ctx.db.patch("users", samId, { localChurch: "Old Typed Church" }));
    let mine = (await sam.query(api.profile.get, {}))!;
    expect(mine).toMatchObject({ church: null, typedChurch: "Old Typed Church", localChurch: "Old Typed Church" });

    const grace = await sam.mutation(api.churches.add, { name: "Grace Church", address: "1 Church St" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    mine = (await sam.query(api.profile.get, {}))!;
    expect(mine).toMatchObject({
      church: { _id: grace, name: "Grace Church", address: "1 Church St", serviceTimes: null },
      typedChurch: null,
      // Older app builds show the church's name.
      localChurch: "Grace Church",
    });
    // Others see it too; signed-out visitors don't.
    expect((await asUser(t, ADMIN).query(api.profile.get, { email: STAFF }))!.church?.name).toBe("Grace Church");
    expect((await t.query(api.profile.get, { email: STAFF }))!.church).toBeNull();

    await sam.mutation(api.profile.setChurch, { churchId: null });
    expect((await sam.query(api.profile.get, {}))!.church).toBeNull();

    await t.run((ctx) => ctx.db.delete("churches", grace));
    await expect(sam.mutation(api.profile.setChurch, { churchId: grace })).rejects.toThrow(
      "isn't in the list any more"
    );
  });

  test("an older app's typed church links to the list when the name matches", async () => {
    const { t, sam, samId } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.updateChurch, { localChurch: " grace church " });
    let row = await t.run((ctx) => ctx.db.get("users", samId));
    expect(row).toMatchObject({ churchId: grace });
    expect(row?.localChurch).toBeUndefined();

    await sam.mutation(api.profile.updateChurch, { localChurch: "Not Listed" });
    row = await t.run((ctx) => ctx.db.get("users", samId));
    expect(row?.churchId).toBeUndefined();
    expect(row?.localChurch).toBe("Not Listed");
  });
});

describe("the reminder", () => {
  test("goes to this year's staff without a church: a notification and a push", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    // Someone on staff who has never signed in, and someone who left staff.
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", { email: "new.one@sow.org.au", year: YEAR, assignments: [{ role: "Staff" }] });
      await ctx.db.insert("staffProfiles", { email: "gone@sow.org.au", year: YEAR - 1, assignments: [{ role: "Staff" }] });
    });

    const dry = await t.mutation(internal.churches.remindToSetChurch, {});
    expect(dry).toEqual({ staff: 3, withoutChurch: 2, reminded: 0 });
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toEqual([]);

    const sent = await t.mutation(internal.churches.remindToSetChurch, { dryRun: false });
    expect(sent).toEqual({ staff: 3, withoutChurch: 2, reminded: 2 });
    const notes = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notes.map((n) => n.userEmail).sort()).toEqual([ADMIN, "new.one@sow.org.au"]);
    expect(notes[0]).toMatchObject({ title: "Set your local church", url: "/profile", read: false });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.map((s) => s.name)).toContain("push:sendMany");
    expect(scheduled.find((s) => s.name === "push:sendMany")!.args[0]).toMatchObject({
      to: expect.arrayContaining([ADMIN, "new.one@sow.org.au"]),
      title: "Set your local church",
      url: "/profile",
    });
  });

  test("nobody to remind: nothing is sent", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    await t.run(async (ctx) => {
      const admin = (await ctx.db.query("staffProfiles").collect()).find((p) => p.email === ADMIN)!;
      await ctx.db.delete("staffProfiles", admin._id);
    });
    expect(await t.mutation(internal.churches.remindToSetChurch, { dryRun: false })).toEqual({
      staff: 1,
      withoutChurch: 0,
      reminded: 0,
    });
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  });
});

