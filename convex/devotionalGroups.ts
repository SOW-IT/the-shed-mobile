import { ConvexError, v } from "convex/values";
import { parseDayKey, shiftDay } from "../shared/calendar";
import {
  effectiveSharingLevel,
  firstNameOf,
  highestSharingLevel,
  isDateInRange,
  isDevotionalDone,
  sydneyDateTime,
  validateGroupInput,
  type DevotionalSharingLevel,
} from "../shared/devotionalGroups";
import { monthBounds, validateDevotionalMonth } from "../shared/devotionals";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { devotionalSharingLevelValidator } from "./devotionalGroupData";
import { currentStaffYear, memoAsync, requireEmail, resolveName, type Ctx } from "./model";
import { photoFor } from "./photo";
import { appUrl } from "./requests";

const MEMBER_LIMIT = 200;
const GROUP_LIMIT = 100;
const INVITABLE_SCAN_LIMIT = 1000;
const INVITABLE_RESULT_LIMIT = 60;
const REMINDER_GROUP_BATCH = 4;

const userByEmail = (ctx: Ctx, email: string) =>
  ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();

const personName = async (ctx: Ctx, email: string, user?: Doc<"users"> | null): Promise<string> => {
  const resolved = await resolveName(ctx, email, currentStaffYear());
  if (resolved) return resolved;
  const row = user === undefined ? await userByEmail(ctx, email) : user;
  return row?.name?.trim() || email.split("@")[0];
};

const personSummary = async (ctx: Ctx, email: string) => {
  const user = await userByEmail(ctx, email);
  const [name, photo] = await Promise.all([
    personName(ctx, email, user),
    photoFor(ctx, user, email),
  ]);
  return { email, name, photo };
};

const personalLevelOf = async (
  ctx: Ctx,
  email: string
): Promise<DevotionalSharingLevel | null> => {
  const setting = await ctx.db
    .query("devotionalSharingSettings")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return setting?.level ?? null;
};

const membershipOf = (ctx: Ctx, groupId: Id<"devotionalGroups">, email: string) =>
  ctx.db
    .query("devotionalGroupMembers")
    .withIndex("by_groupId_and_email", (q) => q.eq("groupId", groupId).eq("email", email))
    .unique();

const membersOf = (ctx: Ctx, groupId: Id<"devotionalGroups">) =>
  ctx.db
    .query("devotionalGroupMembers")
    .withIndex("by_groupId_and_status", (q) => q.eq("groupId", groupId).eq("status", "member"))
    .take(MEMBER_LIMIT);

const invitesOf = (ctx: Ctx, groupId: Id<"devotionalGroups">) =>
  ctx.db
    .query("devotionalGroupMembers")
    .withIndex("by_groupId_and_status", (q) => q.eq("groupId", groupId).eq("status", "invited"))
    .take(MEMBER_LIMIT);

const sharesFrom = (group: Doc<"devotionalGroups">, member: Doc<"devotionalGroupMembers">): string =>
  member.email !== group.ownerEmail && member.joinedOn && member.joinedOn > group.startDate
    ? member.joinedOn
    : group.startDate;

const membersOnDay = (
  group: Doc<"devotionalGroups">,
  members: Doc<"devotionalGroupMembers">[],
  day: string
) => members.filter((member) => sharesFrom(group, member) <= day);

export const markGroupNotificationsRead = async (
  ctx: MutationCtx,
  email: string,
  groupId: Id<"devotionalGroups">
) => {
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_user_and_devotionalGroup_and_read", (q) =>
      q.eq("userEmail", email).eq("devotionalGroupId", groupId).eq("read", false)
    )
    .take(50);
  for (const row of unread) {
    await ctx.db.patch("notifications", row._id, { read: true });
  }
};

export const mySummary = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const today = parseDayKey(args.today);
    const [memberRows, inviteRows, personalSharingLevel] = await Promise.all([
      ctx.db
        .query("devotionalGroupMembers")
        .withIndex("by_email_and_status", (q) => q.eq("email", email).eq("status", "member"))
        .take(GROUP_LIMIT),
      ctx.db
        .query("devotionalGroupMembers")
        .withIndex("by_email_and_status", (q) => q.eq("email", email).eq("status", "invited"))
        .take(GROUP_LIMIT),
      personalLevelOf(ctx, email),
    ]);

    const cachedName = memoAsync((target: string) => personName(ctx, target));
    const cachedDoneToday = memoAsync(async (target: string): Promise<boolean> => {
      if (!today) return false;
      const row = await ctx.db
        .query("devotionals")
        .withIndex("by_email_and_date", (q) => q.eq("email", target).eq("date", today))
        .unique();
      return isDevotionalDone(row);
    });

    const groups = [];
    for (const membership of memberRows) {
      const group = await ctx.db.get("devotionalGroups", membership.groupId);
      if (!group) continue;
      let todayDone: number | null = null;
      let todayTotal: number | null = null;
      if (today && isDateInRange(today, group.startDate, group.endDate)) {
        const groupMembers = membersOnDay(group, await membersOf(ctx, group._id), today);
        const statuses = await Promise.all(groupMembers.map((m) => cachedDoneToday(m.email)));
        todayDone = statuses.filter(Boolean).length;
        todayTotal = groupMembers.length;
      }
      groups.push({
        id: group._id,
        name: group.name,
        startDate: group.startDate,
        endDate: group.endDate,
        sharingLevel: group.sharingLevel,
        ownerEmail: group.ownerEmail,
        ownerName: await cachedName(group.ownerEmail),
        isOwner: group.ownerEmail === email,
        memberCount: group.memberCount,
        todayDone,
        todayTotal,
      });
    }
    groups.sort((a, b) => a.name.localeCompare(b.name));

    const invites = [];
    for (const invite of inviteRows) {
      const group = await ctx.db.get("devotionalGroups", invite.groupId);
      if (!group) continue;
      invites.push({
        groupId: group._id,
        groupName: group.name,
        ownerName: await cachedName(group.ownerEmail),
        invitedAt: invite.invitedAt,
      });
    }
    invites.sort((a, b) => b.invitedAt - a.invitedAt);

    const defaultGroupLevel = highestSharingLevel(groups.map((g) => g.sharingLevel));
    return {
      groups,
      invites,
      personalSharingLevel,
      defaultGroupLevel,
    };
  },
});

export const mySharingContext = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const dayKey = args.date ? parseDayKey(args.date) : null;
    const [memberRows, personalLevel] = await Promise.all([
      ctx.db
        .query("devotionalGroupMembers")
        .withIndex("by_email_and_status", (q) => q.eq("email", email).eq("status", "member"))
        .take(GROUP_LIMIT),
      personalLevelOf(ctx, email),
    ]);

    const allLevels: DevotionalSharingLevel[] = [];
    const dateLevels: DevotionalSharingLevel[] = [];
    for (const row of memberRows) {
      const group = await ctx.db.get("devotionalGroups", row.groupId);
      if (!group) continue;
      allLevels.push(group.sharingLevel);
      if (dayKey && isDateInRange(dayKey, group.startDate, group.endDate)) {
        dateLevels.push(group.sharingLevel);
      }
    }
    const defaultGroupLevel =
      highestSharingLevel(dateLevels.length > 0 ? dateLevels : allLevels);
    return {
      personalLevel,
      groupCount: allLevels.length,
      activeGroupCount: dateLevels.length,
      defaultGroupLevel,
    };
  },
});

export const getGroup = query({
  args: { groupId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const groupId = ctx.db.normalizeId("devotionalGroups", args.groupId);
    if (!groupId) return null;
    const group = await ctx.db.get("devotionalGroups", groupId);
    if (!group) return null;
    const membership = await membershipOf(ctx, group._id, email);
    if (!membership) return null;

    const ownerName = await personName(ctx, group.ownerEmail);
    if (membership.status === "invited") {
      return {
        kind: "invited" as const,
        id: group._id,
        name: group.name,
        ownerName,
      };
    }

    const isOwner = group.ownerEmail === email;
    const today = parseDayKey(args.today);
    const [memberRows, inviteRows, personalSharingLevel] = await Promise.all([
      membersOf(ctx, group._id),
      isOwner ? invitesOf(ctx, group._id) : Promise.resolve([]),
      personalLevelOf(ctx, email),
    ]);

    const members = await Promise.all(
      memberRows.map(async (row) => {
        const person = await personSummary(ctx, row.email);
        return {
          ...person,
          isOwner: row.email === group.ownerEmail,
          isMe: row.email === email,
        };
      })
    );
    members.sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const pendingInvites = await Promise.all(
      inviteRows.map(async (row) => {
        const person = await personSummary(ctx, row.email);
        return {
          ...person,
          invitedAt: row.invitedAt,
        };
      })
    );
    pendingInvites.sort((a, b) => b.invitedAt - a.invitedAt);

    let todayDone: number | null = null;
    let todayTotal: number | null = null;
    let meDoneToday = false;
    if (today && isDateInRange(today, group.startDate, group.endDate)) {
      const sharingToday = new Set(membersOnDay(group, memberRows, today).map((row) => row.email));
      const doneFlags = await Promise.all(
        memberRows.map(async (row) => {
          const entry = await ctx.db
            .query("devotionals")
            .withIndex("by_email_and_date", (q) => q.eq("email", row.email).eq("date", today))
            .unique();
          const done = isDevotionalDone(entry);
          if (row.email === email) meDoneToday = done;
          return done && sharingToday.has(row.email);
        })
      );
      todayDone = doneFlags.filter(Boolean).length;
      todayTotal = sharingToday.size;
    }

    return {
      kind: "member" as const,
      id: group._id,
      name: group.name,
      startDate: group.startDate,
      endDate: group.endDate,
      sharingLevel: group.sharingLevel,
      ownerEmail: group.ownerEmail,
      ownerName,
      isOwner,
      memberCount: memberRows.length,
      personalSharingLevel,
      effectiveMyLevel: effectiveSharingLevel(group.sharingLevel, personalSharingLevel),
      todayDone,
      todayTotal,
      meDoneToday,
      members,
      pendingInvites,
    };
  },
});

export const monthProgress = query({
  args: {
    groupId: v.id("devotionalGroups"),
    year: v.number(),
    month: v.number(),
  },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    if (!validateDevotionalMonth(args.year, args.month)) {
      throw new ConvexError("Invalid month.");
    }
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group) return null;
    const membership = await membershipOf(ctx, group._id, email);
    if (!membership || membership.status !== "member") return null;

    const memberRows = await membersOf(ctx, group._id);
    const { from, to } = monthBounds(args.year, args.month);
    const rangeFrom = from > group.startDate ? from : group.startDate;
    const rangeTo = to < group.endDate ? to : group.endDate;
    const doneCounts: Record<string, number> = {};
    const dayTotals: Record<string, number> = {};

    if (rangeFrom <= rangeTo) {
      for (const member of memberRows) {
        const joined = sharesFrom(group, member);
        const memberFrom = joined > rangeFrom ? joined : rangeFrom;
        if (memberFrom > rangeTo) continue;
        for (let day = memberFrom; day <= rangeTo; day = shiftDay(day, 1)) {
          dayTotals[day] = (dayTotals[day] ?? 0) + 1;
        }
        const entries = await ctx.db
          .query("devotionals")
          .withIndex("by_email_and_date", (q) =>
            q.eq("email", member.email).gte("date", memberFrom).lte("date", rangeTo)
          )
          .take(31);
        for (const entry of entries) {
          if (isDevotionalDone(entry)) {
            doneCounts[entry.date] = (doneCounts[entry.date] ?? 0) + 1;
          }
        }
      }
    }

    return {
      year: args.year,
      month: args.month,
      totalMembers: memberRows.length,
      doneCounts,
      dayTotals,
    };
  },
});

export const dayDetail = query({
  args: {
    groupId: v.id("devotionalGroups"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const dayKey = parseDayKey(args.date);
    if (!dayKey) return null;
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group) return null;
    const membership = await membershipOf(ctx, group._id, email);
    if (!membership || membership.status !== "member") return null;
    if (!isDateInRange(dayKey, group.startDate, group.endDate)) return null;

    const memberRows = membersOnDay(group, await membersOf(ctx, group._id), dayKey);
    const entries = await Promise.all(
      memberRows.map(async (row) => {
        const [person, devotional, personalLevel] = await Promise.all([
          personSummary(ctx, row.email),
          ctx.db
            .query("devotionals")
            .withIndex("by_email_and_date", (q) => q.eq("email", row.email).eq("date", dayKey))
            .unique(),
          personalLevelOf(ctx, row.email),
        ]);
        const done = isDevotionalDone(devotional);
        const level = effectiveSharingLevel(group.sharingLevel, personalLevel);
        const showPassage = done && (level === "passage" || level === "everything");
        const showEverything = done && level === "everything";
        return {
          email: person.email,
          name: person.name,
          photo: person.photo,
          isOwner: row.email === group.ownerEmail,
          isMe: row.email === email,
          done,
          effectiveLevel: level,
          passage: showPassage && devotional ? devotional.passage : null,
          notes: showEverything && devotional ? devotional.notes : null,
          prayer: showEverything && devotional ? devotional.prayerPoints : null,
        };
      })
    );

    entries.sort((a, b) => {
      if (a.done !== b.done) return a.done ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      date: dayKey,
      doneCount: entries.filter((e) => e.done).length,
      totalMembers: entries.length,
      members: entries,
    };
  },
});

export const searchInvitableUsers = query({
  args: {
    groupId: v.id("devotionalGroups"),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group || group.ownerEmail !== email) {
      throw new ConvexError("Only the group owner can invite members.");
    }

    const [memberRows, inviteRows, users] = await Promise.all([
      membersOf(ctx, group._id),
      invitesOf(ctx, group._id),
      ctx.db.query("users").take(INVITABLE_SCAN_LIMIT),
    ]);

    const statusByEmail = new Map<string, "member" | "invited">();
    for (const m of memberRows) statusByEmail.set(m.email, "member");
    for (const i of inviteRows) statusByEmail.set(i.email, "invited");

    const byEmail = new Map<string, Doc<"users">>();
    for (const user of users) {
      const normalized = user.email?.trim().toLowerCase();
      if (!normalized || normalized === email) continue;
      if (!byEmail.has(normalized)) byEmail.set(normalized, user);
    }

    const queryText = (args.search ?? "").trim().toLowerCase();
    const matched = [...byEmail.entries()]
      .map(([candidateEmail, user]) => ({
        email: candidateEmail,
        accountName: user.name?.trim() || candidateEmail.split("@")[0],
        user,
      }))
      .filter(
        (c) => !queryText || c.accountName.toLowerCase().includes(queryText) || c.email.includes(queryText)
      )
      .sort((a, b) => a.accountName.localeCompare(b.accountName))
      .slice(0, INVITABLE_RESULT_LIMIT);

    const people = await Promise.all(
      matched.map(async (c) => {
        const [name, photo] = await Promise.all([
          personName(ctx, c.email, c.user),
          photoFor(ctx, c.user, c.email),
        ]);
        return {
          email: c.email,
          name,
          photo,
          status: statusByEmail.get(c.email) ?? ("none" as const),
        };
      })
    );
    return people.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    sharingLevel: devotionalSharingLevelValidator,
  },
  returns: v.object({ groupId: v.id("devotionalGroups") }),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const checked = validateGroupInput(args);
    if (!checked.ok) throw new ConvexError(checked.error);
    const now = Date.now();
    const groupId = await ctx.db.insert("devotionalGroups", {
      ...checked.normalized,
      ownerEmail: email,
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("devotionalGroupMembers", {
      groupId,
      email,
      status: "member",
      invitedAt: now,
      joinedAt: now,
    });
    return { groupId };
  },
});

export const update = mutation({
  args: {
    groupId: v.id("devotionalGroups"),
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    sharingLevel: devotionalSharingLevelValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group) throw new ConvexError("Group not found.");
    if (group.ownerEmail !== email) {
      throw new ConvexError("Only the group owner can edit this group.");
    }
    const checked = validateGroupInput(args);
    if (!checked.ok) throw new ConvexError(checked.error);
    await ctx.db.patch("devotionalGroups", group._id, {
      ...checked.normalized,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const removeGroup = mutation({
  args: { groupId: v.id("devotionalGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group) throw new ConvexError("Group not found.");
    if (group.ownerEmail !== email) {
      throw new ConvexError("Only the group owner can delete this group.");
    }
    for (;;) {
      const batch = await ctx.db
        .query("devotionalGroupMembers")
        .withIndex("by_groupId_and_status", (q) => q.eq("groupId", group._id))
        .take(200);
      if (batch.length === 0) break;
      for (const row of batch) {
        if (row.status === "invited") await markGroupNotificationsRead(ctx, row.email, group._id);
        await ctx.db.delete("devotionalGroupMembers", row._id);
      }
    }
    await ctx.db.delete("devotionalGroups", group._id);
    return null;
  },
});

export const invite = mutation({
  args: {
    groupId: v.id("devotionalGroups"),
    email: v.string(),
  },
  returns: v.object({ alreadyInvited: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerEmail = await requireEmail(ctx);
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group) throw new ConvexError("Group not found.");
    if (group.ownerEmail !== ownerEmail) {
      throw new ConvexError("Only the group owner can invite members.");
    }
    const targetEmail = args.email.trim().toLowerCase();
    if (!targetEmail || targetEmail === ownerEmail) {
      throw new ConvexError("Choose someone else to invite.");
    }
    const account = await userByEmail(ctx, targetEmail);
    if (!account) {
      throw new ConvexError("That person doesn't have an account in THE SHED.");
    }
    const existing = await membershipOf(ctx, group._id, targetEmail);
    if (existing?.status === "member") {
      throw new ConvexError("They are already in this group.");
    }
    if (existing?.status === "invited") {
      return { alreadyInvited: true };
    }
    const [memberRows, inviteRows] = await Promise.all([membersOf(ctx, group._id), invitesOf(ctx, group._id)]);
    if (memberRows.length + inviteRows.length >= MEMBER_LIMIT) {
      throw new ConvexError(`A group can have at most ${MEMBER_LIMIT} people.`);
    }

    const now = Date.now();
    await ctx.db.insert("devotionalGroupMembers", {
      groupId: group._id,
      email: targetEmail,
      status: "invited",
      invitedBy: ownerEmail,
      invitedAt: now,
    });

    const ownerFirst = firstNameOf(await personName(ctx, ownerEmail));
    const message = `${ownerFirst} invited you to ${group.name}`;
    const url = `/devotionals/groups/${group._id}`;
    await ctx.db.insert("notifications", {
      userEmail: targetEmail,
      title: message,
      body: "Tap to accept or decline.",
      url,
      devotionalGroupId: group._id,
      read: false,
    });
    await ctx.scheduler.runAfter(0, internal.push.send, {
      to: targetEmail,
      title: message,
      body: "Tap to accept or decline.",
      url,
    });
    await ctx.scheduler.runAfter(0, internal.emails.send, {
      to: targetEmail,
      subject: message,
      body: `${message}.\n\nOpen in THE SHED: ${appUrl(url)}`,
    });
    return { alreadyInvited: false };
  },
});

export const respondInvite = mutation({
  args: {
    groupId: v.id("devotionalGroups"),
    accept: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group) throw new ConvexError("Group not found.");
    const membership = await membershipOf(ctx, group._id, email);
    if (!membership || membership.status !== "invited") {
      throw new ConvexError("Invite not found.");
    }
    if (args.accept) {
      const now = Date.now();
      await ctx.db.patch("devotionalGroupMembers", membership._id, {
        status: "member",
        joinedAt: now,
        joinedOn: sydneyDateTime(now).date,
      });
      await ctx.db.patch("devotionalGroups", group._id, {
        memberCount: group.memberCount + 1,
      });
    } else {
      await ctx.db.delete("devotionalGroupMembers", membership._id);
    }
    await markGroupNotificationsRead(ctx, email, group._id);
    return null;
  },
});

export const removeMember = mutation({
  args: {
    groupId: v.id("devotionalGroups"),
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerEmail = await requireEmail(ctx);
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group) throw new ConvexError("Group not found.");
    if (group.ownerEmail !== ownerEmail) {
      throw new ConvexError("Only the group owner can remove members.");
    }
    const targetEmail = args.email.trim().toLowerCase();
    if (targetEmail === ownerEmail) {
      throw new ConvexError("You can't remove yourself. Delete the group instead.");
    }
    const membership = await membershipOf(ctx, group._id, targetEmail);
    if (!membership) throw new ConvexError("Member not found.");
    await ctx.db.delete("devotionalGroupMembers", membership._id);
    if (membership.status === "invited") {
      await markGroupNotificationsRead(ctx, targetEmail, group._id);
    } else {
      await ctx.db.patch("devotionalGroups", group._id, {
        memberCount: Math.max(1, group.memberCount - 1),
      });
    }
    return null;
  },
});

export const leave = mutation({
  args: { groupId: v.id("devotionalGroups") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const group = await ctx.db.get("devotionalGroups", args.groupId);
    if (!group) throw new ConvexError("Group not found.");
    if (group.ownerEmail === email) {
      throw new ConvexError("You own this group. Delete it instead of leaving.");
    }
    const membership = await membershipOf(ctx, group._id, email);
    if (!membership || membership.status !== "member") {
      throw new ConvexError("You aren't in this group.");
    }
    await ctx.db.delete("devotionalGroupMembers", membership._id);
    await ctx.db.patch("devotionalGroups", group._id, {
      memberCount: Math.max(1, group.memberCount - 1),
    });
    return null;
  },
});

export const setPersonalSharingLevel = mutation({
  args: { level: devotionalSharingLevelValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await requireEmail(ctx);
    const existing = await ctx.db
      .query("devotionalSharingSettings")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch("devotionalSharingSettings", existing._id, {
        level: args.level,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("devotionalSharingSettings", {
        email,
        level: args.level,
        updatedAt: now,
      });
    }
    return null;
  },
});

const sendReminderBatch = async (
  ctx: MutationCtx,
  today: string,
  cursor: string | null
): Promise<number> => {
  const now = Date.now();
  const page = await ctx.db
    .query("devotionalGroups")
    .withIndex("by_endDate", (q) => q.gte("endDate", today))
    .paginate({ numItems: REMINDER_GROUP_BATCH, cursor });
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.devotionalGroups.sendRemindersFrom, {
      date: today,
      cursor: page.continueCursor,
    });
  }
  const activeGroups = page.page.filter((g) => g.startDate <= today);

  const groupsByEmail = new Map<string, Doc<"devotionalGroups">[]>();
  for (const group of activeGroups) {
    const members = await membersOf(ctx, group._id);
    for (const member of members) {
      const list = groupsByEmail.get(member.email);
      if (list) list.push(group);
      else groupsByEmail.set(member.email, [group]);
    }
  }

  let notified = 0;
  for (const [email, groups] of groupsByEmail.entries()) {
    const user = await userByEmail(ctx, email);
    if (user?.devotionalReminders === false) continue;

    const alreadySent = await ctx.db
      .query("devotionalReminderLogs")
      .withIndex("by_email_and_date", (q) => q.eq("email", email).eq("date", today))
      .unique();
    if (alreadySent) continue;

    const entry = await ctx.db
      .query("devotionals")
      .withIndex("by_email_and_date", (q) => q.eq("email", email).eq("date", today))
      .unique();
    if (isDevotionalDone(entry)) continue;

    await ctx.db.insert("devotionalReminderLogs", {
      email,
      date: today,
      sentAt: now,
    });

    const title = "Devotional reminder";
    const body =
      groups.length === 1
        ? `You haven't done today's devotional for ${groups[0].name} yet.`
        : "You haven't done today's devotional yet.";
    const url = `/devotionals/${today}`;
    await ctx.db.insert("notifications", {
      userEmail: email,
      title,
      body,
      url,
      ...(groups.length === 1 ? { devotionalGroupId: groups[0]._id } : {}),
      read: false,
    });
    await ctx.scheduler.runAfter(0, internal.push.send, {
      to: email,
      title,
      body,
      url,
    });
    notified++;
  }

  return notified;
};

export const sendDailyReminders = internalMutation({
  args: {},
  returns: v.object({ skipped: v.boolean(), notified: v.number() }),
  handler: async (ctx) => {
    const { date: today, hour } = sydneyDateTime(Date.now());
    if (hour !== 20) return { skipped: true, notified: 0 };
    return { skipped: false, notified: await sendReminderBatch(ctx, today, null) };
  },
});

export const sendRemindersFrom = internalMutation({
  args: { date: v.string(), cursor: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => await sendReminderBatch(ctx, args.date, args.cursor),
});
