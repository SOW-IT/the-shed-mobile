import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 25, 2, 0));
});

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
      await ben.mutation(api.devotionalGroups.respondInvite, { groupId: gid, accept: true });
      await anna.mutation(api.devotionalGroups.invite, { groupId: gid, email: CARA });
      await cara.mutation(api.devotionalGroups.respondInvite, { groupId: gid, accept: true });
    }

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

    await ben.mutation(api.devotionalGroups.respondInvite, { groupId, accept: true });

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
    expect(annaSummary.groups.map((g) => g.name)).toEqual(["Alpha Group", "Zeta Group"]);
    expect(annaSummary.groups[0].todayDone).toBeNull();
    expect(annaSummary.groups[1].todayDone).toBe(0);
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
