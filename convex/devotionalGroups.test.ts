import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { completionTier } from "../shared/devotionalGroups";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { asUser, newConvex } from "../test/convexFixture";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const CARA = "cara@sow.org.au";
const DAN = "dan@sow.org.au";

const seedUsers = async (t: ReturnType<typeof newConvex>) => {
  return await t.run(async (ctx) => ({
    annaId: await ctx.db.insert("users", { email: ANNA, name: "Anna Smith" }),
    benId: await ctx.db.insert("users", { email: BEN, name: "Ben Jones" }),
    caraId: await ctx.db.insert("users", { email: CARA, name: "Cara Lee" }),
    danId: await ctx.db.insert("users", { email: DAN, name: "Dan Park" }),
  }));
};

const NOW = Date.UTC(2026, 10, 25, 2, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

const NOV_1 = Date.UTC(2026, 10, 1, 2, 0);

const acceptAt = async (
  user: ReturnType<typeof asUser>,
  groupId: Id<"devotionalGroups">,
  at: number
) => {
  vi.setSystemTime(at);
  await user.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });
};

const dayTotalsFrom = (from: string, to: string, count: number) => {
  const totals: Record<string, number> = {};
  for (let day = Number(from.slice(8)); day <= Number(to.slice(8)); day++) {
    totals[`${from.slice(0, 8)}${String(day).padStart(2, "0")}`] = count;
  }
  return totals;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("devotional groups", () => {
  test("requires authentication on all public functions", async () => {
    const t = newConvex();
    const { annaId } = await seedUsers(t);
    const anna = asUser(t, ANNA);
    const { groupId } = await anna.mutation(api.devotionalGroups.create, {
      name: "Morning Devos",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "passage",
    });
    expect(annaId).toBeTruthy();

    await expect(t.query(api.devotionalGroups.mySummary, { today: "2026-11-25" })).rejects.toThrow(/signed in/);
    await expect(t.query(api.devotionalGroups.mySharingContext, {})).rejects.toThrow(/signed in/);
    await expect(t.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" })).rejects.toThrow(/signed in/);
    await expect(t.query(api.devotionalGroups.monthProgress, { groupId, year: 2026, month: 11 })).rejects.toThrow(/signed in/);
    await expect(t.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-25" })).rejects.toThrow(/signed in/);
    await expect(t.query(api.devotionalGroups.searchInvitableUsers, { groupId })).rejects.toThrow(/signed in/);
    await expect(
      t.mutation(api.devotionalGroups.create, {
        name: "Test",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "count",
      })
    ).rejects.toThrow(/signed in/);
  });

  test("enforces privacy for non-members, pending invitees, removal and deletion", async () => {
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);

    const { groupId } = await anna.mutation(api.devotionalGroups.create, {
      name: "Romans Study",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "everything",
    });

    await anna.mutation(api.devotionals.save, {
      date: "2026-11-25",
      passage: "Romans 8:1-11",
      notes: "No condemnation.",
      prayerPoints: "Walk by the Spirit.",
      base: null,
    });

    expect(await ben.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" })).toBeNull();
    expect(await ben.query(api.devotionalGroups.monthProgress, { groupId, year: 2026, month: 11 })).toBeNull();
    expect(await ben.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-25" })).toBeNull();

    const inv = await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
    expect(inv).toEqual({ alreadyInvited: false });
    const dup = await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
    expect(dup).toEqual({ alreadyInvited: true });

    const invitedView = await ben.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" });
    expect(invitedView).toEqual({
      kind: "invited",
      id: groupId,
      name: "Romans Study",
      ownerName: "Anna Smith",
    });
    expect(await ben.query(api.devotionalGroups.monthProgress, { groupId, year: 2026, month: 11 })).toBeNull();
    expect(await ben.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-25" })).toBeNull();

    const benSummary = await ben.query(api.devotionalGroups.mySummary, { today: "2026-11-25" });
    expect(benSummary.groups).toEqual([]);
    expect(benSummary.invites).toHaveLength(1);
    expect(benSummary.invites[0]).toMatchObject({
      groupId,
      groupName: "Romans Study",
      ownerName: "Anna Smith",
    });

    const notifications = await t.run((ctx) =>
      ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userEmail", BEN)).collect()
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("Anna invited you to Romans Study");
    expect(notifications[0].url).toBe(`/devotionals/groups/${groupId}`);

    const ownerViewBeforeAccept = await anna.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" });
    expect(ownerViewBeforeAccept?.kind === "member" && ownerViewBeforeAccept.pendingInvites.map((p) => p.email)).toEqual([BEN]);

    await ben.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });

    const benGroup = await ben.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" });
    expect(benGroup?.kind).toBe("member");
    if (benGroup?.kind !== "member") throw new Error("expected member");
    expect(benGroup.memberCount).toBe(2);
    expect(benGroup.pendingInvites).toEqual([]);

    await anna.mutation(api.devotionalGroups.invite, { groupId, email: CARA });
    const benSeesNoPending = await ben.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" });
    expect(benSeesNoPending?.kind === "member" && benSeesNoPending.pendingInvites).toEqual([]);

    await expect(
      ben.mutation(api.devotionalGroups.update, {
        groupId,
        name: "Hacked",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "count",
      })
    ).rejects.toThrow(/owner/);
    await expect(ben.mutation(api.devotionalGroups.invite, { groupId, email: DAN })).rejects.toThrow(/owner/);
    await expect(ben.mutation(api.devotionalGroups.removeMember, { groupId, email: ANNA })).rejects.toThrow(/owner/);
    await expect(ben.mutation(api.devotionalGroups.removeGroup, { groupId })).rejects.toThrow(/owner/);
    await expect(ben.query(api.devotionalGroups.searchInvitableUsers, { groupId })).rejects.toThrow(/owner/);

    await anna.mutation(api.devotionalGroups.removeMember, { groupId, email: BEN });
    expect(await ben.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" })).toBeNull();
    expect(await ben.query(api.devotionalGroups.monthProgress, { groupId, year: 2026, month: 11 })).toBeNull();
    expect(await ben.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-25" })).toBeNull();

    await cara.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });
    expect((await cara.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" }))?.kind).toBe("member");

    await anna.mutation(api.devotionalGroups.removeGroup, { groupId });
    expect(await cara.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" })).toBeNull();
    expect(await anna.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" })).toBeNull();
  });

  test("enforces effective sharing level (lower of group and person) and done rule", async () => {
    vi.setSystemTime(NOV_1);
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);

    const { groupId: everythingGroup } = await anna.mutation(api.devotionalGroups.create, {
      name: "Open Group",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "everything",
    });
    const { groupId: passageGroup } = await anna.mutation(api.devotionalGroups.create, {
      name: "Passage Group",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "passage",
    });
    const { groupId: countGroup } = await anna.mutation(api.devotionalGroups.create, {
      name: "Count Group",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "count",
    });

    for (const gid of [everythingGroup, passageGroup, countGroup]) {
      await anna.mutation(api.devotionalGroups.invite, { groupId: gid, email: BEN });
      await acceptAt(ben, gid, NOV_1);
      await anna.mutation(api.devotionalGroups.invite, { groupId: gid, email: CARA });
      await acceptAt(cara, gid, NOV_1);
    }
    vi.setSystemTime(NOW);

    await anna.mutation(api.devotionals.save, {
      date: "2026-11-20",
      passage: "Psalm 23",
      notes: "Anna secret notes",
      prayerPoints: "Anna private prayer",
      base: null,
    });
    await ben.mutation(api.devotionals.save, {
      date: "2026-11-20",
      passage: "John 15:1-5",
      notes: "Ben notes",
      prayerPoints: "Ben prayer",
      base: null,
    });
    await cara.mutation(api.devotionals.save, {
      date: "2026-11-20",
      passage: "",
      notes: "Cara wrote notes without passage",
      prayerPoints: "Cara prayer without passage",
      base: null,
    });

    await ben.mutation(api.devotionalGroups.setPersonalSharingLevel, { level: "passage" });

    const openDetail = await anna.query(api.devotionalGroups.dayDetail, {
      groupId: everythingGroup,
      date: "2026-11-20",
    });
    expect(openDetail).not.toBeNull();
    expect(openDetail!.doneCount).toBe(2);
    expect(openDetail!.totalMembers).toBe(3);

    const annaRow = openDetail!.members.find((m) => m.email === ANNA)!;
    expect(annaRow).toMatchObject({
      done: true,
      effectiveLevel: "everything",
      passage: "Psalm 23",
      notes: "Anna secret notes",
      prayer: "Anna private prayer",
    });

    const benRow = openDetail!.members.find((m) => m.email === BEN)!;
    expect(benRow).toMatchObject({
      done: true,
      effectiveLevel: "passage",
      passage: "John 15:1-5",
      notes: null,
      prayer: null,
    });

    const caraRow = openDetail!.members.find((m) => m.email === CARA)!;
    expect(caraRow).toMatchObject({
      done: false,
      passage: null,
      notes: null,
      prayer: null,
    });

    await anna.mutation(api.devotionalGroups.setPersonalSharingLevel, { level: "everything" });
    await ben.mutation(api.devotionalGroups.setPersonalSharingLevel, { level: "count" });

    const passageDetail = await cara.query(api.devotionalGroups.dayDetail, {
      groupId: passageGroup,
      date: "2026-11-20",
    });
    expect(passageDetail!.members.find((m) => m.email === ANNA)).toMatchObject({
      done: true,
      effectiveLevel: "passage",
      passage: "Psalm 23",
      notes: null,
      prayer: null,
    });
    expect(passageDetail!.members.find((m) => m.email === BEN)).toMatchObject({
      done: true,
      effectiveLevel: "count",
      passage: null,
      notes: null,
      prayer: null,
    });

    const countDetail = await cara.query(api.devotionalGroups.dayDetail, {
      groupId: countGroup,
      date: "2026-11-20",
    });
    expect(countDetail!.members.find((m) => m.email === ANNA)).toMatchObject({
      done: true,
      effectiveLevel: "count",
      passage: null,
      notes: null,
      prayer: null,
    });

    const openDetailAfterBenLowered = await anna.query(api.devotionalGroups.dayDetail, {
      groupId: everythingGroup,
      date: "2026-11-20",
    });
    expect(openDetailAfterBenLowered!.members.find((m) => m.email === BEN)).toMatchObject({
      done: true,
      effectiveLevel: "count",
      passage: null,
      notes: null,
      prayer: null,
    });
  });

  test("handles decline, leave, owner cannot leave, owner edits, and date range limits", async () => {
    vi.setSystemTime(NOV_1);
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);

    const { groupId } = await anna.mutation(api.devotionalGroups.create, {
      name: "Future Plan",
      startDate: "2026-11-10",
      endDate: "2026-12-15",
      sharingLevel: "count",
    });

    await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: CARA });

    const invitable = await anna.query(api.devotionalGroups.searchInvitableUsers, {
      groupId,
      search: "ben",
    });
    expect(invitable).toHaveLength(1);
    expect(invitable[0]).toMatchObject({ email: BEN, name: "Ben Jones", status: "invited" });

    await cara.mutation(api.devotionalGroups.respondInvite, { groupId, accept: false });
    expect(await cara.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" })).toBeNull();

    await acceptAt(ben, groupId, NOV_1);
    vi.setSystemTime(NOW);

    await anna.mutation(api.devotionals.save, {
      date: "2026-11-05",
      passage: "Genesis 1",
      notes: "Before range",
      prayerPoints: "",
      base: null,
    });
    await anna.mutation(api.devotionals.save, {
      date: "2026-11-15",
      passage: "Psalm 1",
      notes: "Inside range",
      prayerPoints: "",
      base: null,
    });
    await ben.mutation(api.devotionals.save, {
      date: "2026-11-15",
      passage: "Psalm 2",
      notes: "Ben inside",
      prayerPoints: "",
      base: null,
    });

    expect(
      await ben.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-05" })
    ).toBeNull();
    expect(
      await ben.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-12-20" })
    ).toBeNull();

    const novProgress = await ben.query(api.devotionalGroups.monthProgress, {
      groupId,
      year: 2026,
      month: 11,
    });
    expect(novProgress).toEqual({
      year: 2026,
      month: 11,
      totalMembers: 2,
      doneCounts: { "2026-11-15": 2 },
      dayTotals: dayTotalsFrom("2026-11-10", "2026-11-30", 2),
    });

    const octProgress = await ben.query(api.devotionalGroups.monthProgress, {
      groupId,
      year: 2026,
      month: 10,
    });
    expect(octProgress).toEqual({
      year: 2026,
      month: 10,
      totalMembers: 2,
      doneCounts: {},
      dayTotals: {},
    });

    await anna.mutation(api.devotionalGroups.update, {
      groupId,
      name: "Renamed Plan",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      sharingLevel: "passage",
    });
    const updated = await anna.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" });
    expect(updated?.kind === "member" && {
      name: updated.name,
      startDate: updated.startDate,
      endDate: updated.endDate,
      sharingLevel: updated.sharingLevel,
    }).toEqual({
      name: "Renamed Plan",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      sharingLevel: "passage",
    });

    await expect(anna.mutation(api.devotionalGroups.leave, { groupId })).rejects.toThrow(/Delete it instead/);

    await ben.mutation(api.devotionalGroups.leave, { groupId });
    expect(await ben.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" })).toBeNull();
    const afterLeave = await anna.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" });
    expect(afterLeave?.kind === "member" && afterLeave.memberCount).toBe(1);
  });

  test("8pm Sydney cron handles AEDT, respects preferences, and sends at most one per day", async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 25, 2, 0));
    const t = newConvex();
    const { caraId } = await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);
    const dan = asUser(t, DAN);

    await t.run(async (ctx) => {
      await ctx.db.patch("users", caraId, { devotionalReminders: false });
    });

    const { groupId: group1 } = await anna.mutation(api.devotionalGroups.create, {
      name: "Summer Group 1",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "count",
    });
    const { groupId: group2 } = await anna.mutation(api.devotionalGroups.create, {
      name: "Summer Group 2",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "passage",
    });
    const { groupId: futureGroup } = await dan.mutation(api.devotionalGroups.create, {
      name: "December Plan",
      startDate: "2026-12-01",
      endDate: "2026-12-31",
      sharingLevel: "count",
    });
    expect(futureGroup).toBeTruthy();

    for (const gid of [group1, group2]) {
      await anna.mutation(api.devotionalGroups.invite, { groupId: gid, email: BEN });
      await ben.mutation(api.devotionalGroups.respondInvite, { groupId: gid, accept: true });
      await anna.mutation(api.devotionalGroups.invite, { groupId: gid, email: CARA });
      await cara.mutation(api.devotionalGroups.respondInvite, { groupId: gid, accept: true });
    }
    await anna.mutation(api.devotionalGroups.invite, { groupId: group1, email: DAN });

    await anna.mutation(api.devotionals.save, {
      date: "2026-11-25",
      passage: "Psalm 23",
      notes: "",
      prayerPoints: "",
      base: null,
    });
    await ben.mutation(api.devotionals.save, {
      date: "2026-11-25",
      passage: "",
      notes: "Not done because no passage",
      prayerPoints: "",
      base: null,
    });

    vi.setSystemTime(Date.UTC(2026, 10, 25, 8, 1));
    expect(await t.mutation(internal.devotionalGroups.sendDailyReminders, {})).toEqual({
      skipped: true,
      notified: 0,
    });

    vi.setSystemTime(Date.UTC(2026, 10, 25, 9, 1));
    const aedtRun = await t.mutation(internal.devotionalGroups.sendDailyReminders, {});
    expect(aedtRun).toEqual({ skipped: false, notified: 1 });

    const repeatRun = await t.mutation(internal.devotionalGroups.sendDailyReminders, {});
    expect(repeatRun).toEqual({ skipped: false, notified: 0 });

    vi.setSystemTime(Date.UTC(2026, 10, 25, 10, 1));
    expect(await t.mutation(internal.devotionalGroups.sendDailyReminders, {})).toEqual({
      skipped: true,
      notified: 0,
    });

    const allLogs = await t.run((ctx) => ctx.db.query("devotionalReminderLogs").collect());
    expect(allLogs.map((l) => `${l.email}:${l.date}`)).toEqual([`${BEN}:2026-11-25`]);
  });

  test("8pm Sydney cron handles AEST winter offset", async () => {
    vi.setSystemTime(Date.UTC(2026, 6, 15, 2, 0));
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);

    await anna.mutation(api.devotionalGroups.create, {
      name: "Winter Group",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      sharingLevel: "count",
    });

    vi.setSystemTime(Date.UTC(2026, 6, 15, 9, 1));
    expect(await t.mutation(internal.devotionalGroups.sendDailyReminders, {})).toEqual({
      skipped: true,
      notified: 0,
    });

    vi.setSystemTime(Date.UTC(2026, 6, 15, 10, 1));
    expect(await t.mutation(internal.devotionalGroups.sendDailyReminders, {})).toEqual({
      skipped: false,
      notified: 1,
    });

    const logs = await t.run((ctx) => ctx.db.query("devotionalReminderLogs").collect());
    expect(logs.map((l) => `${l.email}:${l.date}`)).toEqual([`${ANNA}:2026-07-15`]);
  });

  test("cleans up devotional groups data on account wipe", async () => {
    const t = newConvex();
    const { annaId, benId } = await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);

    const { groupId: annaGroup } = await anna.mutation(api.devotionalGroups.create, {
      name: "Anna Group",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "count",
    });
    await anna.mutation(api.devotionalGroups.invite, { groupId: annaGroup, email: BEN });
    await ben.mutation(api.devotionalGroups.respondInvite, { groupId: annaGroup, accept: true });

    const { groupId: benGroup } = await ben.mutation(api.devotionalGroups.create, {
      name: "Ben Group",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "count",
    });
    await ben.mutation(api.devotionalGroups.invite, { groupId: benGroup, email: ANNA });
    await anna.mutation(api.devotionalGroups.respondInvite, { groupId: benGroup, accept: true });

    await anna.mutation(api.devotionalGroups.setPersonalSharingLevel, { level: "passage" });
    await t.run(async (ctx) => {
      await ctx.db.insert("devotionalReminderLogs", {
        email: ANNA,
        date: "2026-11-25",
        sentAt: Date.now(),
      });
    });

    await t.mutation(internal.account.wipe, { userId: annaId });

    expect(await t.run((ctx) => ctx.db.get("devotionalGroups", annaGroup))).toBeNull();
    const benGroupAfter = await t.run((ctx) => ctx.db.get("devotionalGroups", benGroup));
    expect(benGroupAfter?.memberCount).toBe(1);
    expect(
      await t.run((ctx) =>
        ctx.db.query("devotionalSharingSettings").withIndex("by_email", (q) => q.eq("email", ANNA)).unique()
      )
    ).toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db.query("devotionalReminderLogs").withIndex("by_email_and_date", (q) => q.eq("email", ANNA)).collect()
      )
    ).toEqual([]);
    expect(benId).toBeTruthy();
  });

  test("covers summary, sharing context, sorting, validation errors, and notification read", async () => {
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);

    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: ANNA,
        year: 2027,
        name: "Anna Staff",
      });
    });

    await expect(
      anna.mutation(api.devotionalGroups.create, {
        name: "   ",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "count",
      })
    ).rejects.toThrow(/name/);

    const { groupId: g1 } = await anna.mutation(api.devotionalGroups.create, {
      name: "Zeta Group",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "passage",
    });
    const { groupId: g2 } = await anna.mutation(api.devotionalGroups.create, {
      name: "Alpha Group",
      startDate: "2026-12-01",
      endDate: "2026-12-31",
      sharingLevel: "everything",
    });

    await anna.mutation(api.devotionalGroups.invite, { groupId: g1, email: BEN });
    await anna.mutation(api.devotionalGroups.invite, { groupId: g1, email: CARA });
    await anna.mutation(api.devotionalGroups.invite, { groupId: g2, email: BEN });

    const benInvites = await ben.query(api.devotionalGroups.mySummary, { today: "2026-11-25" });
    expect(benInvites.invites).toHaveLength(2);

    const ownerView = await anna.query(api.devotionalGroups.getGroup, { groupId: g1, today: "2026-11-25" });
    expect(ownerView?.kind === "member" && ownerView.pendingInvites).toHaveLength(2);

    await ben.mutation(api.devotionalGroups.respondInvite, { groupId: g1, accept: true });
    await cara.mutation(api.devotionalGroups.respondInvite, { groupId: g1, accept: true });

    const withMembers = await anna.query(api.devotionalGroups.getGroup, { groupId: g1, today: "2026-11-25" });
    expect(withMembers?.kind === "member" && withMembers.members.map((m) => m.email)).toEqual([
      ANNA,
      BEN,
      CARA,
    ]);

    const annaSummary = await anna.query(api.devotionalGroups.mySummary, { today: "2026-11-25" });
    expect(annaSummary.groups.map((g) => g.name)).toEqual(["Zeta Group", "Alpha Group"]);
    expect(annaSummary.groups[0].todayDone).toBe(0);
    expect(annaSummary.groups[1].todayDone).toBeNull();
    expect(annaSummary.defaultGroupLevel).toBe("everything");

    const invalidDateSummary = await anna.query(api.devotionalGroups.mySummary, { today: "bad" });
    expect(invalidDateSummary.groups[1].todayDone).toBeNull();

    expect(await anna.query(api.devotionalGroups.mySharingContext, {})).toEqual({
      personalLevel: null,
      groupCount: 2,
      activeGroupCount: 0,
      defaultGroupLevel: "everything",
    });
    expect(await anna.query(api.devotionalGroups.mySharingContext, { date: "2026-11-25" })).toEqual({
      personalLevel: null,
      groupCount: 2,
      activeGroupCount: 1,
      defaultGroupLevel: "passage",
    });

    const allInvitable = await anna.query(api.devotionalGroups.searchInvitableUsers, { groupId: g1 });
    expect(allInvitable.map((u) => u.email)).toEqual([BEN, CARA, DAN]);

    await expect(
      anna.query(api.devotionalGroups.monthProgress, { groupId: g1, year: 2026, month: 13 })
    ).rejects.toThrow(/Invalid month/);
    expect(await anna.query(api.devotionalGroups.dayDetail, { groupId: g1, date: "bad-date" })).toBeNull();

    await expect(
      anna.mutation(api.devotionalGroups.update, {
        groupId: g1,
        name: "",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "count",
      })
    ).rejects.toThrow(/name/);

    await expect(anna.mutation(api.devotionalGroups.invite, { groupId: g1, email: ANNA })).rejects.toThrow(/someone else/);
    await expect(anna.mutation(api.devotionalGroups.invite, { groupId: g1, email: "ghost@sow.org.au" })).rejects.toThrow(/account/);
    await expect(anna.mutation(api.devotionalGroups.invite, { groupId: g1, email: BEN })).rejects.toThrow(/already/);
    await expect(ben.mutation(api.devotionalGroups.respondInvite, { groupId: g1, accept: true })).rejects.toThrow(/Invite not found/);
    await expect(anna.mutation(api.devotionalGroups.removeMember, { groupId: g1, email: ANNA })).rejects.toThrow(/Delete the group/);
    await expect(anna.mutation(api.devotionalGroups.removeMember, { groupId: g1, email: DAN })).rejects.toThrow(/Member not found/);
    await expect(asUser(t, DAN).mutation(api.devotionalGroups.leave, { groupId: g1 })).rejects.toThrow(/aren't in this group/);

    await t.mutation(api.notifications.markReadForDevotionalGroup, { groupId: g2 });
    await ben.mutation(api.notifications.markReadForDevotionalGroup, { groupId: g2 });
    const unreadG2 = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user_and_devotionalGroup_and_read", (q) =>
          q.eq("userEmail", BEN).eq("devotionalGroupId", g2).eq("read", false)
        )
        .collect()
    );
    expect(unreadG2).toEqual([]);

    await anna.mutation(api.devotionalGroups.removeGroup, { groupId: g2 });
    expect(await anna.query(api.devotionalGroups.monthProgress, { groupId: g2, year: 2026, month: 12 })).toBeNull();
    expect(await anna.query(api.devotionalGroups.dayDetail, { groupId: g2, date: "2026-12-05" })).toBeNull();
    await expect(
      anna.mutation(api.devotionalGroups.update, {
        groupId: g2,
        name: "Gone",
        startDate: "2026-12-01",
        endDate: "2026-12-31",
        sharingLevel: "count",
      })
    ).rejects.toThrow(/Group not found/);
    await expect(anna.mutation(api.devotionalGroups.removeGroup, { groupId: g2 })).rejects.toThrow(/Group not found/);
    await expect(anna.mutation(api.devotionalGroups.invite, { groupId: g2, email: BEN })).rejects.toThrow(/Group not found/);
    await expect(ben.mutation(api.devotionalGroups.respondInvite, { groupId: g2, accept: true })).rejects.toThrow(/Group not found/);
    await expect(anna.mutation(api.devotionalGroups.removeMember, { groupId: g2, email: BEN })).rejects.toThrow(/Group not found/);
    await expect(ben.mutation(api.devotionalGroups.leave, { groupId: g2 })).rejects.toThrow(/Group not found/);
  });
});

describe("devotional group review checks", () => {
  const LEVELS = ["count", "passage", "everything"] as const;

  test("notes and prayer reach another member only when both levels are Everything", async () => {
    for (const groupLevel of LEVELS) {
      for (const personalLevel of [null, ...LEVELS]) {
        const t = newConvex();
        await seedUsers(t);
        const anna = asUser(t, ANNA);
        const ben = asUser(t, BEN);
        const { groupId } = await anna.mutation(api.devotionalGroups.create, {
          name: "Matrix",
          startDate: "2026-11-01",
          endDate: "2026-11-30",
          sharingLevel: groupLevel,
        });
        await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
        await ben.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });
        if (personalLevel) {
          await anna.mutation(api.devotionalGroups.setPersonalSharingLevel, { level: personalLevel });
        }
        await anna.mutation(api.devotionals.save, {
          date: "2026-11-25",
          passage: "Psalm 23",
          notes: "matrix-notes",
          prayerPoints: "matrix-prayer",
          base: null,
        });

        const effective = personalLevel && LEVELS.indexOf(personalLevel) < LEVELS.indexOf(groupLevel)
          ? personalLevel
          : groupLevel;
        const day = await ben.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-25" });
        const annaRow = day?.members.find((m) => m.email === ANNA);
        expect(annaRow).toMatchObject({
          done: true,
          effectiveLevel: effective,
          passage: effective === "count" ? null : "Psalm 23",
          notes: effective === "everything" ? "matrix-notes" : null,
          prayer: effective === "everything" ? "matrix-prayer" : null,
        });

        const others = JSON.stringify([
          await ben.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" }),
          await ben.query(api.devotionalGroups.mySummary, { today: "2026-11-25" }),
          await ben.query(api.devotionalGroups.monthProgress, { groupId, year: 2026, month: 11 }),
        ]);
        expect(others).not.toMatch(/matrix-notes|matrix-prayer|Psalm 23/);
      }
    }
  });

  test("a broken or foreign group link shows nothing instead of failing", async () => {
    const t = newConvex();
    const { annaId } = await seedUsers(t);
    const anna = asUser(t, ANNA);
    expect(await anna.query(api.devotionalGroups.getGroup, { groupId: "not-an-id", today: "2026-11-25" })).toBeNull();
    expect(await anna.query(api.devotionalGroups.getGroup, { groupId: annaId, today: "2026-11-25" })).toBeNull();
  });

  test("cancelling an invite or deleting the group clears the invitee's unread invite", async () => {
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const unread = (email: string) =>
      t.run(async (ctx) =>
        (await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userEmail", email)).collect()).filter(
          (n) => !n.read
        ).length
      );
    const { groupId } = await anna.mutation(api.devotionalGroups.create, {
      name: "Cancelled",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "count",
    });
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: CARA });
    expect(await unread(BEN)).toBe(1);
    await anna.mutation(api.devotionalGroups.removeMember, { groupId, email: BEN });
    expect(await unread(BEN)).toBe(0);
    expect(await unread(CARA)).toBe(1);
    await anna.mutation(api.devotionalGroups.removeGroup, { groupId });
    expect(await unread(CARA)).toBe(0);
  });

  test("invite search matches account names and emails and shows the directory name", async () => {
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "noname@sow.org.au" });
      await ctx.db.insert("directoryUsers", { email: BEN, name: "Benjamin Jones" });
    });
    const { groupId } = await anna.mutation(api.devotionalGroups.create, {
      name: "Search",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "count",
    });
    const all = await anna.query(api.devotionalGroups.searchInvitableUsers, { groupId });
    expect(all.map((p) => p.email)).not.toContain(ANNA);
    expect(all.find((p) => p.email === BEN)?.name).toBe("Benjamin Jones");
    expect((await anna.query(api.devotionalGroups.searchInvitableUsers, { groupId, search: "LEE" })).map((p) => p.email)).toEqual([CARA]);
    expect((await anna.query(api.devotionalGroups.searchInvitableUsers, { groupId, search: "noname" })).map((p) => p.name)).toEqual(["noname"]);
  });

  test("the 8pm reminder lands once on both daylight saving changeover days", async () => {
    const cases = [
      { day: Date.UTC(2026, 3, 5), date: "2026-04-05", sendsAt: 10 },
      { day: Date.UTC(2026, 9, 4), date: "2026-10-04", sendsAt: 9 },
    ];
    for (const { day, date, sendsAt } of cases) {
      vi.setSystemTime(day + 2 * 3_600_000);
      const t = newConvex();
      await seedUsers(t);
      await asUser(t, ANNA).mutation(api.devotionalGroups.create, {
        name: "Changeover",
        startDate: date,
        endDate: date,
        sharingLevel: "count",
      });
      const results = [];
      for (const hour of [9, 10]) {
        vi.setSystemTime(day + hour * 3_600_000 + 60_000);
        results.push(await t.mutation(internal.devotionalGroups.sendDailyReminders, {}));
      }
      expect(results).toEqual(
        [9, 10].map((hour) => (hour === sendsAt ? { skipped: false, notified: 1 } : { skipped: true, notified: 0 }))
      );
      const logs = await t.run((ctx) => ctx.db.query("devotionalReminderLogs").collect());
      expect(logs.map((l) => `${l.email}:${l.date}`)).toEqual([`${ANNA}:${date}`]);
    }
  });
});

test("a group stops taking invites at 200 people, so no member drops out of its lists", async () => {
  const t = newConvex();
  await seedUsers(t);
  const anna = asUser(t, ANNA);
  const { groupId } = await anna.mutation(api.devotionalGroups.create, {
    name: "Full",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    sharingLevel: "count",
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 199; i++) {
      await ctx.db.insert("devotionalGroupMembers", {
        groupId,
        email: `person${i}@sow.org.au`,
        status: i % 2 ? "member" : "invited",
        invitedAt: i,
      });
    }
  });
  await expect(anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN })).rejects.toThrow(/at most 200/);
});

test("deleting the owner's account clears their pending invitees' unread invites", async () => {
  const t = newConvex();
  const { annaId } = await seedUsers(t);
  const anna = asUser(t, ANNA);
  const { groupId } = await anna.mutation(api.devotionalGroups.create, {
    name: "Owner leaves",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    sharingLevel: "count",
  });
  await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
  await t.mutation(internal.account.wipe, { userId: annaId });
  const benUnread = await t.run(async (ctx) =>
    (await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userEmail", BEN)).collect()).filter(
      (n) => !n.read
    )
  );
  expect(benUnread).toEqual([]);
});

test("the 8pm reminder pages through groups in batches and still sends once per person", async () => {
  vi.setSystemTime(Date.UTC(2026, 10, 25, 2, 0));
  const t = newConvex();
  await seedUsers(t);
  const anna = asUser(t, ANNA);
  const ben = asUser(t, BEN);
  const cara = asUser(t, CARA);
  for (let i = 0; i < 6; i++) {
    const { groupId } = await anna.mutation(api.devotionalGroups.create, {
      name: `Batch ${i}`,
      startDate: "2026-11-01",
      endDate: `2026-12-0${i + 1}`,
      sharingLevel: "count",
    });
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
    await ben.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });
    if (i === 5) {
      await anna.mutation(api.devotionalGroups.invite, { groupId, email: CARA });
      await cara.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });
    }
  }
  await anna.mutation(api.devotionals.save, {
    date: "2026-11-25",
    passage: "Psalm 1",
    notes: "",
    prayerPoints: "",
    base: null,
  });

  vi.setSystemTime(Date.UTC(2026, 10, 25, 9, 1));
  expect(await t.mutation(internal.devotionalGroups.sendDailyReminders, {})).toEqual({ skipped: false, notified: 1 });

  const continuation = await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).find((job) =>
      job.name.includes("sendRemindersFrom")
    )
  );
  const args = continuation?.args[0] as { date: string; cursor: string };
  expect(args.date).toBe("2026-11-25");

  vi.setSystemTime(Date.UTC(2026, 10, 25, 9, 2));
  expect(await t.mutation(internal.devotionalGroups.sendRemindersFrom, args)).toBe(1);

  const logs = await t.run((ctx) => ctx.db.query("devotionalReminderLogs").collect());
  expect(logs.map((l) => l.email).sort()).toEqual([BEN, CARA]);
});

describe("late joiners share from the day they join", () => {
  const save = (user: ReturnType<typeof asUser>, date: string, verse: number) =>
    user.mutation(api.devotionals.save, {
      date,
      passage: `Psalm ${Number(date.slice(8))}:${verse}`,
      notes: "Notes",
      prayerPoints: "Prayer",
      base: null,
    });

  const setUp = async () => {
    vi.setSystemTime(NOV_1);
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const cara = asUser(t, CARA);
    const { groupId } = await anna.mutation(api.devotionalGroups.create, {
      name: "November Devos",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "everything",
    });
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
    await acceptAt(ben, groupId, NOV_1);
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: CARA });
    await acceptAt(cara, groupId, Date.UTC(2026, 10, 19, 14, 30));
    vi.setSystemTime(NOW);
    for (const date of ["2026-11-10", "2026-11-22"]) {
      await save(anna, date, 1);
      await save(ben, date, 2);
      await save(cara, date, 3);
    }
    const caraMembership = () =>
      t.run(async (ctx) =>
        ctx.db
          .query("devotionalGroupMembers")
          .withIndex("by_groupId_and_email", (q) => q.eq("groupId", groupId).eq("email", CARA))
          .unique()
      );
    return { t, anna, ben, cara, groupId, caraMembership };
  };

  test("accepting stores the join day in Sydney's calendar", async () => {
    const { caraMembership } = await setUp();
    expect((await caraMembership())?.joinedOn).toBe("2026-11-20");
  });

  test("a late joiner's earlier days are hidden in every group query", async () => {
    const { anna, cara, groupId } = await setUp();

    for (const viewer of [anna, cara]) {
      const before = await viewer.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-10" });
      expect(before!.members.map((m) => m.email).sort()).toEqual([ANNA, BEN]);
      expect(before).toMatchObject({ doneCount: 2, totalMembers: 2 });

      const after = await viewer.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-22" });
      expect(after).toMatchObject({ doneCount: 3, totalMembers: 3 });
      expect(after!.members.find((m) => m.email === CARA)).toMatchObject({
        done: true,
        passage: "Psalm 22:3",
      });
    }

    const groupOnEarlierDay = await anna.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-10" });
    expect(groupOnEarlierDay).toMatchObject({ todayDone: 2, todayTotal: 2, memberCount: 3 });
    const caraOnEarlierDay = await cara.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-10" });
    expect(caraOnEarlierDay).toMatchObject({ todayDone: 2, todayTotal: 2, meDoneToday: true });

    const summary = await anna.query(api.devotionalGroups.mySummary, { today: "2026-11-10" });
    expect(summary.groups[0]).toMatchObject({ todayDone: 2, todayTotal: 2, memberCount: 3 });
    const summaryToday = await anna.query(api.devotionalGroups.mySummary, { today: "2026-11-22" });
    expect(summaryToday.groups[0]).toMatchObject({ todayDone: 3, todayTotal: 3 });

    const caraHistory = await cara.query(api.devotionals.byMonth, { year: 2026, month: 11 });
    expect(caraHistory.map((row) => row.date)).toEqual(["2026-11-10", "2026-11-22"]);
  });

  test("each day counts only the members who had joined, so a full early day stays green", async () => {
    const { anna, groupId } = await setUp();
    const progress = await anna.query(api.devotionalGroups.monthProgress, { groupId, year: 2026, month: 11 });
    expect(progress!.doneCounts).toEqual({ "2026-11-10": 2, "2026-11-22": 3 });
    expect(progress!.dayTotals).toEqual({
      ...dayTotalsFrom("2026-11-01", "2026-11-19", 2),
      ...dayTotalsFrom("2026-11-20", "2026-11-30", 3),
    });
    expect(completionTier(progress!.doneCounts["2026-11-10"], progress!.dayTotals["2026-11-10"], false)).toBe("full");
    expect(completionTier(progress!.doneCounts["2026-11-22"], progress!.dayTotals["2026-11-22"], false)).toBe("full");
  });

  test("a membership from before join days were stored shares from the group start", async () => {
    const { t, anna, groupId, caraMembership } = await setUp();
    const row = await caraMembership();
    await t.run(async (ctx) => {
      await ctx.db.patch("devotionalGroupMembers", row!._id, { joinedOn: undefined });
    });
    const detail = await anna.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-10" });
    expect(detail).toMatchObject({ doneCount: 3, totalMembers: 3 });
    const progress = await anna.query(api.devotionalGroups.monthProgress, { groupId, year: 2026, month: 11 });
    expect(progress!.dayTotals).toEqual(dayTotalsFrom("2026-11-01", "2026-11-30", 3));
    expect(progress!.doneCounts["2026-11-10"]).toBe(3);
  });

  test("the owner counts from the group start even with a later join day", async () => {
    const { t, ben, groupId } = await setUp();
    await t.run(async (ctx) => {
      const owner = await ctx.db
        .query("devotionalGroupMembers")
        .withIndex("by_groupId_and_email", (q) => q.eq("groupId", groupId).eq("email", ANNA))
        .unique();
      await ctx.db.patch("devotionalGroupMembers", owner!._id, { joinedOn: "2026-11-25" });
    });
    const detail = await ben.query(api.devotionalGroups.dayDetail, { groupId, date: "2026-11-10" });
    expect(detail!.members.find((m) => m.email === ANNA)).toMatchObject({
      done: true,
      passage: "Psalm 10:1",
    });
    const progress = await ben.query(api.devotionalGroups.monthProgress, { groupId, year: 2026, month: 11 });
    expect(progress!.dayTotals["2026-11-01"]).toBe(2);
  });
});

describe("deleting a group", () => {
  const setUp = async () => {
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const { groupId } = await anna.mutation(api.devotionalGroups.create, {
      name: "To delete",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      sharingLevel: "everything",
    });
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
    await ben.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: CARA });
    for (const [user, date] of [
      [anna, "2026-11-24"],
      [ben, "2026-11-24"],
      [ben, "2026-11-25"],
    ] as const) {
      await user.mutation(api.devotionals.save, { date, passage: "John 3", notes: "Mine", prayerPoints: "", base: null });
    }
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", {
        userEmail: BEN,
        title: "Devotional reminder",
        body: "You haven't done today's devotional for To delete yet.",
        url: "/devotionals/2026-11-24",
        devotionalGroupId: groupId,
        read: true,
      });
    });
    const groupRows = () =>
      t.run(async (ctx) => ({
        group: await ctx.db.get("devotionalGroups", groupId),
        members: await ctx.db
          .query("devotionalGroupMembers")
          .withIndex("by_groupId_and_status", (q) => q.eq("groupId", groupId))
          .collect(),
        notifications: await ctx.db
          .query("notifications")
          .withIndex("by_devotionalGroup", (q) => q.eq("devotionalGroupId", groupId))
          .collect(),
        devotionals: (await ctx.db.query("devotionals").collect()).map((row) => `${row.email} ${row.date}`).sort(),
      }));
    return { t, anna, ben, groupId, groupRows };
  };

  test("removes the group, every membership and invite, and its notifications, but no one's devotionals", async () => {
    const { t, anna, ben, groupId, groupRows } = await setUp();
    const before = await groupRows();
    expect(before.members).toHaveLength(3);
    expect(before.notifications.length).toBeGreaterThanOrEqual(3);

    await anna.mutation(api.devotionalGroups.removeGroup, { groupId });

    const after = await groupRows();
    expect(after.group).toBeNull();
    expect(after.members).toEqual([]);
    expect(after.notifications).toEqual([]);
    expect(after.devotionals).toEqual(before.devotionals);
    expect(after.devotionals).toEqual([`${ANNA} 2026-11-24`, `${BEN} 2026-11-24`, `${BEN} 2026-11-25`]);
    expect((await ben.query(api.devotionalGroups.mySummary, { today: "2026-11-25" })).groups).toEqual([]);
    expect(await ben.query(api.devotionalGroups.getGroup, { groupId, today: "2026-11-25" })).toBeNull();
    expect((await asUser(t, CARA).query(api.devotionalGroups.mySummary, { today: "2026-11-25" })).invites).toEqual([]);
  });

  test("only the owner can delete; members and invitees are refused and nothing changes", async () => {
    const { t, ben, groupId, groupRows } = await setUp();
    const before = await groupRows();
    await expect(ben.mutation(api.devotionalGroups.removeGroup, { groupId })).rejects.toThrow(/Only the group owner/);
    await expect(asUser(t, CARA).mutation(api.devotionalGroups.removeGroup, { groupId })).rejects.toThrow(/Only the group owner/);
    await expect(asUser(t, DAN).mutation(api.devotionalGroups.removeGroup, { groupId })).rejects.toThrow(/Only the group owner/);
    await expect(t.mutation(api.devotionalGroups.removeGroup, { groupId })).rejects.toThrow(/signed in/);
    expect(await groupRows()).toEqual(before);
  });

  test("a group with more notifications than one batch finishes clearing them in the background", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, anna, groupId, groupRows } = await setUp();
    await t.run(async (ctx) => {
      for (let i = 0; i < 450; i++) {
        await ctx.db.insert("notifications", {
          userEmail: BEN,
          title: "Devotional reminder",
          body: "Old reminder",
          devotionalGroupId: groupId,
          read: true,
        });
      }
    });
    await anna.mutation(api.devotionalGroups.removeGroup, { groupId });
    expect((await groupRows()).notifications.length).toBeGreaterThan(0);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await groupRows()).notifications).toEqual([]);
  });
});

describe("past groups", () => {
  const groupFor = async (user: ReturnType<typeof asUser>, name: string, startDate: string, endDate: string) =>
    (await user.mutation(api.devotionalGroups.create, { name, startDate, endDate, sharingLevel: "count" })).groupId;

  test("current and upcoming groups come first; ended ones page newest first, ten at a time", async () => {
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    for (let i = 1; i <= 12; i++) {
      const month = String(i <= 9 ? i : 10).padStart(2, "0");
      await groupFor(anna, `Past ${String(i).padStart(2, "0")}`, `2026-${month}-01`, `2026-${month}-${String(10 + i).padStart(2, "0")}`);
    }
    await groupFor(anna, "Upcoming", "2027-01-01", "2027-01-31");
    await groupFor(anna, "Now", "2026-11-20", "2026-12-20");
    await groupFor(anna, "Ends today", "2026-11-01", "2026-11-25");
    const benPast = await groupFor(ben, "Ben's past", "2026-01-01", "2026-01-31");

    const summary = await anna.query(api.devotionalGroups.mySummary, { today: "2026-11-25" });
    expect(summary.groups.map((g) => g.name)).toEqual(["Ends today", "Now", "Upcoming"]);

    const first = await anna.query(api.devotionalGroups.pastGroups, {
      today: "2026-11-25",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(first.page.map((g) => g.name)).toEqual([
      "Past 12",
      "Past 11",
      "Past 10",
      "Past 09",
      "Past 08",
      "Past 07",
      "Past 06",
      "Past 05",
      "Past 04",
      "Past 03",
    ]);
    expect(first.page[0]).toMatchObject({ isOwner: true, memberCount: 1, endDate: "2026-10-22" });
    expect(first.isDone).toBe(false);
    const second = await anna.query(api.devotionalGroups.pastGroups, {
      today: "2026-11-25",
      paginationOpts: { numItems: 10, cursor: first.continueCursor },
    });
    expect(second.page.map((g) => g.name)).toEqual(["Past 02", "Past 01"]);
    expect(second.isDone).toBe(true);

    const benView = await ben.query(api.devotionalGroups.pastGroups, {
      today: "2026-11-25",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(benView.page.map((g) => g.id)).toEqual([benPast]);

    expect(
      await anna.query(api.devotionalGroups.pastGroups, { today: "bad", paginationOpts: { numItems: 10, cursor: null } })
    ).toEqual({ page: [], isDone: true, continueCursor: "" });
    await expect(
      t.query(api.devotionalGroups.pastGroups, { today: "2026-11-25", paginationOpts: { numItems: 10, cursor: null } })
    ).rejects.toThrow(/signed in/);
  });

  test("a joined member sees the group move to past, and editing the end date moves it back", async () => {
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);
    const groupId = await groupFor(anna, "October", "2026-10-01", "2026-10-31");
    await anna.mutation(api.devotionalGroups.invite, { groupId, email: BEN });
    await ben.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });
    const pastFor = async (user: ReturnType<typeof asUser>) =>
      (
        await user.query(api.devotionalGroups.pastGroups, {
          today: "2026-11-25",
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page.map((g) => g.name);

    expect(await pastFor(ben)).toEqual(["October"]);
    expect((await ben.query(api.devotionalGroups.mySummary, { today: "2026-11-25" })).groups).toEqual([]);

    await anna.mutation(api.devotionalGroups.update, {
      groupId,
      name: "October to December",
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      sharingLevel: "count",
    });
    expect(await pastFor(ben)).toEqual([]);
    expect(await pastFor(anna)).toEqual([]);
    expect((await ben.query(api.devotionalGroups.mySummary, { today: "2026-11-25" })).groups.map((g) => g.name)).toEqual([
      "October to December",
    ]);
  });

  test("memberships from before end dates were stored still land in the right list", async () => {
    const t = newConvex();
    await seedUsers(t);
    const anna = asUser(t, ANNA);
    const ended = await groupFor(anna, "Ended", "2026-09-01", "2026-09-30");
    const running = await groupFor(anna, "Running", "2026-11-01", "2026-12-31");
    const gone = await groupFor(anna, "Gone", "2026-08-01", "2026-08-31");
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("devotionalGroupMembers")
        .withIndex("by_email_and_status_and_groupEndDate", (q) => q.eq("email", ANNA))
        .collect();
      for (const row of rows) await ctx.db.patch("devotionalGroupMembers", row._id, { groupEndDate: undefined });
      await ctx.db.delete("devotionalGroups", gone);
    });

    const summary = await anna.query(api.devotionalGroups.mySummary, { today: "2026-11-25" });
    expect(summary.groups.map((g) => g.id)).toEqual([running]);
    const past = await anna.query(api.devotionalGroups.pastGroups, {
      today: "2026-11-25",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(past.page.map((g) => g.id)).toEqual([ended]);
  });
});
