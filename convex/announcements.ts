import { ConvexError, v } from "convex/values";
import {
  announcementEmail,
  announcementPath,
  type Audience,
  audienceSummary,
  cleanDraft,
  EVERYONE,
  cleanEmails,
  emailChoiceOf,
  emailFlags,
  emailRecipients,
  inAudience,
  nameList,
  type NoPushReason,
  PEOPLE_MAX,
  rateLimitError,
  scheduleError,
  sortRoles,
} from "../shared/announcements";
import { acronym, assignmentsOf } from "../shared/flow";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { audienceValidator } from "./announcementData";
import {
  Ctx,
  currentStaffYear,
  displayName,
  isAdminProfile,
  optionalEmail,
  optionalProfile,
  requireAdmin,
} from "./model";
import { appUrl } from "./requests";
import { DAY_MS } from "../shared/datetime";

const MAX_PROFILES = 2000;
const PUSH_BATCH = 100;
const EMAIL_BATCH = 100;
const EMAIL_BATCH_GAP_MS = 1000;

const cleanList = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const cleanAudience = (audience: Audience): Audience => ({
  campuses: cleanList(audience.campuses),
  divisions: cleanList(audience.divisions),
  departments: cleanList(audience.departments),
  roles: cleanList(audience.roles),
});

const peopleValidator = v.optional(v.array(v.string()));

const cleanPeople = (people: string[] | undefined) => {
  if (people === undefined) return undefined;
  const emails = cleanEmails(people);
  if (emails.length > PEOPLE_MAX) {
    throw new ConvexError(`Pick ${PEOPLE_MAX} people or fewer.`);
  }
  return emails;
};

type Recipient = { email: string; name: string | null };

/** A profile's name, else the Google directory's, else the email. */
async function nameOf(ctx: Ctx, recipient: Recipient): Promise<string> {
  if (recipient.name) return recipient.name;
  const user = await ctx.db
    .query("directoryUsers")
    .withIndex("by_email", (q) => q.eq("email", recipient.email))
    .first();
  return user?.name?.trim() || recipient.email;
}

/**
 * This year's leaders an announcement reaches, by email. A list of people,
 * when there is one, takes the place of the groups.
 */
async function recipientsOf(
  ctx: Ctx,
  target: { audience: Audience; people?: string[] },
  year: number
): Promise<Recipient[]> {
  const departments = await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", year))
    .take(200);
  const divisionOf = new Map(departments.map((d) => [d.name, d.division]));
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))
    .take(MAX_PROFILES);
  const chosen = target.people ? new Set(target.people) : null;
  const recipients = new Map<string, Recipient>();
  for (const profile of profiles) {
    const email = profile.email.toLowerCase();
    const reached = chosen
      ? chosen.has(email)
      : inAudience(assignmentsOf(profile), target.audience, (d) => divisionOf.get(d));
    if (!reached) continue;
    const name = profile.name?.trim() || null;
    if (!recipients.get(email)?.name) recipients.set(email, { email, name });
  }
  return [...recipients.values()].sort((a, b) => a.email.localeCompare(b.email));
}

async function audienceEmails(
  ctx: Ctx,
  target: { audience: Audience; people?: string[] },
  year: number
): Promise<string[]> {
  return (await recipientsOf(ctx, target, year)).map((r) => r.email);
}

async function hasApp(ctx: Ctx, email: string): Promise<boolean> {
  const token = await ctx.db
    .query("pushTokens")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  return token !== null;
}

/**
 * Why a push can't reach someone, or null when it can. Having opened the app
 * (an `appInstalls` row) without a registered token means they turned
 * notifications off, or are signed out on their phone.
 */
async function noPushReason(ctx: Ctx, email: string): Promise<NoPushReason | null> {
  if (await hasApp(ctx, email)) return null;
  const install = await ctx.db
    .query("appInstalls")
    .withIndex("by_email_and_platform", (q) => q.eq("email", email))
    .first();
  return install ? "notificationsOff" : "noApp";
}

const assignmentDetail = (profile: Doc<"staffProfiles">) =>
  [
    ...new Set(
      assignmentsOf(profile).map(
        (a) => a.department ?? a.division ?? (a.university ? acronym(a.university) : a.role)
      )
    ),
  ].join(", ");

async function senderActivity(ctx: Ctx, email: string, now: number) {
  const madeToday = (status: "scheduled" | "sent") =>
    ctx.db
      .query("announcements")
      .withIndex("by_sender_and_status", (q) =>
        q.eq("senderEmail", email).eq("status", status).gt("_creationTime", now - DAY_MS)
      )
      .take(100);
  const recent = [...(await madeToday("scheduled")), ...(await madeToday("sent"))];
  const pending = await ctx.db
    .query("announcements")
    .withIndex("by_sender_and_status", (q) =>
      q.eq("senderEmail", email).eq("status", "scheduled")
    )
    .take(100);
  return {
    recent: recent.map((a) => ({
      createdAt: a._creationTime,
      title: a.title,
      message: a.message,
    })),
    pending: pending.length,
  };
}

const yearOf = (announcement: Doc<"announcements">) =>
  announcement.year ?? currentStaffYear();

async function optionalAdmin(ctx: Ctx) {
  const caller = await optionalProfile(ctx);
  if (!caller || !(await isAdminProfile(ctx, caller.profile))) return null;
  return caller;
}

export const options = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalAdmin(ctx);
    if (!caller) return null;
    const year = caller.year;
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .take(MAX_PROFILES);
    return {
      campuses: universities.map((u) => u.name),
      divisions: divisions.map((d) => d.name),
      departments: departments.map((d) => ({ name: d.name, division: d.division })),
      roles: sortRoles(profiles.flatMap((p) => assignmentsOf(p).map((a) => a.role))),
      people: await peopleOptions(ctx, profiles),
    };
  },
});

async function peopleOptions(ctx: Ctx, profiles: Doc<"staffProfiles">[]) {
  const byEmail = new Map<string, Recipient & { detail: string }>();
  for (const profile of profiles) {
    const email = profile.email.toLowerCase();
    const known = byEmail.get(email);
    byEmail.set(email, {
      email,
      name: known?.name || profile.name?.trim() || null,
      detail: [known?.detail, assignmentDetail(profile)].filter(Boolean).join(", "),
    });
  }
  const people = [];
  for (const person of byEmail.values()) {
    people.push({ ...person, name: await nameOf(ctx, person) });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}

export const audienceSize = query({
  args: { audience: audienceValidator, people: peopleValidator },
  handler: async (ctx, args) => {
    const caller = await optionalAdmin(ctx);
    if (!caller) return null;
    const recipients = await recipientsOf(
      ctx,
      { audience: cleanAudience(args.audience), people: cleanPeople(args.people) },
      caller.year
    );
    const withoutApp: { email: string; name: string; reason: NoPushReason }[] = [];
    for (const recipient of recipients) {
      const reason = await noPushReason(ctx, recipient.email);
      if (reason) {
        withoutApp.push({ email: recipient.email, name: await nameOf(ctx, recipient), reason });
      }
    }
    withoutApp.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
    return {
      people: recipients.length,
      withApp: recipients.length - withoutApp.length,
      withoutApp,
    };
  },
});

export const send = mutation({
  args: {
    title: v.string(),
    message: v.string(),
    audience: audienceValidator,
    people: peopleValidator,
    sendEmail: v.boolean(),
    emailWithoutApp: v.optional(v.boolean()),
    sendAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await requireAdmin(ctx);
    const draft = cleanDraft(args);
    if ("error" in draft) throw new ConvexError(draft.error);
    const now = Date.now();
    if (args.sendAt !== undefined) {
      const error = scheduleError(args.sendAt, now);
      if (error) throw new ConvexError(error);
    }
    const people = cleanPeople(args.people);
    if (people?.length === 0) throw new ConvexError("Pick at least one person.");
    const audience = people ? EVERYONE : cleanAudience(args.audience);
    const recipients = await audienceEmails(ctx, { audience, people }, caller.year);
    if (recipients.length === 0) {
      throw new ConvexError("No one matches who you chose.");
    }

    const limited = rateLimitError({
      ...(await senderActivity(ctx, caller.email, now)),
      draft,
      now,
    });
    if (limited) throw new ConvexError(limited);

    const sendAt = args.sendAt ?? now;
    const id = await ctx.db.insert("announcements", {
      senderEmail: caller.email,
      year: caller.year,
      title: draft.title,
      message: draft.message,
      audience,
      ...(people ? { people } : {}),
      ...emailFlags(emailChoiceOf(args)),
      status: "scheduled",
      sendAt,
    });
    const jobId =
      args.sendAt === undefined
        ? await ctx.scheduler.runAfter(0, internal.announcements.deliver, { id })
        : await ctx.scheduler.runAt(sendAt, internal.announcements.deliver, { id });
    await ctx.db.patch("announcements", id, { jobId });
    return { id, people: recipients.length, sendAt };
  },
});

export const cancel = mutation({
  args: { id: v.id("announcements") },
  handler: async (ctx, args) => {
    const caller = await requireAdmin(ctx);
    const announcement = await ctx.db.get("announcements", args.id);
    if (!announcement) throw new ConvexError("Announcement not found.");
    if (announcement.status === "sent") throw new ConvexError("It has already gone out.");
    if (announcement.status === "cancelled") throw new ConvexError("It's already cancelled.");
    if (announcement.jobId) await ctx.scheduler.cancel(announcement.jobId);
    await ctx.db.patch("announcements", args.id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledBy: caller.email,
      jobId: undefined,
    });
    return null;
  },
});

const NO_AUDIENCE_REASON =
  "No one matched who it was for when it was due, so it didn't go out. A division, department, role or campus it named may have been renamed or removed.";
const NO_PEOPLE_REASON =
  "None of the people it named were on this year's staff list when it was due, so it didn't go out.";

const foundNoAudience = (announcement: Doc<"announcements">) =>
  announcement.status === "cancelled" &&
  announcement.cancelledBy === undefined &&
  announcement.recipientCount === 0;

async function row(
  ctx: Ctx,
  announcement: Doc<"announcements">,
  names: Map<string, string>,
  year: number
) {
  const nameOf = async (email: string) => {
    let name = names.get(email);
    if (name === undefined) {
      name = await displayName(ctx, email, year);
      names.set(email, name);
    }
    return name;
  };
  const senderName = await nameOf(announcement.senderEmail);
  const people = announcement.people;
  const audience = people
    ? nameList(await Promise.all(people.slice(0, 3).map(nameOf)), people.length)
    : audienceSummary(announcement.audience);
  return {
    id: announcement._id,
    title: announcement.title,
    message: announcement.message,
    audience,
    chosenPeople: people?.length ?? null,
    sendEmail: announcement.sendEmail,
    emailWithoutApp: announcement.emailWithoutApp ?? false,
    status: announcement.status,
    sendAt: announcement.sendAt,
    sentAt: announcement.sentAt ?? null,
    senderEmail: announcement.senderEmail,
    senderName,
    people: announcement.recipientCount ?? null,
    withApp: announcement.pushCount ?? null,
    emailed: announcement.emailCount ?? null,
    notSentReason: foundNoAudience(announcement)
      ? people
        ? NO_PEOPLE_REASON
        : NO_AUDIENCE_REASON
      : null,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalAdmin(ctx);
    if (!caller) return null;
    const scheduled = await ctx.db
      .query("announcements")
      .withIndex("by_status_and_sendAt", (q) => q.eq("status", "scheduled"))
      .order("asc")
      .take(50);
    const sent = await ctx.db
      .query("announcements")
      .withIndex("by_status_and_sendAt", (q) => q.eq("status", "sent"))
      .order("desc")
      .take(20);
    const cancelled = await ctx.db
      .query("announcements")
      .withIndex("by_status_and_sendAt", (q) => q.eq("status", "cancelled"))
      .order("desc")
      .take(50);
    const names = new Map<string, string>();
    return {
      mine: await senderActivity(ctx, caller.email, Date.now()),
      scheduled: await Promise.all(scheduled.map((a) => row(ctx, a, names, caller.year))),
      sent: await Promise.all(sent.map((a) => row(ctx, a, names, caller.year))),
      notSent: await Promise.all(
        cancelled
          .filter(foundNoAudience)
          .slice(0, 20)
          .map((a) => row(ctx, a, names, caller.year))
      ),
    };
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const id = ctx.db.normalizeId("announcements", args.id);
    if (!id) return null;
    const announcement = await ctx.db.get("announcements", id);
    if (!announcement) return null;
    const admin = await optionalAdmin(ctx);
    if (!admin) {
      const received = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_announcement_and_read", (q) =>
          q.eq("userEmail", email).eq("announcementId", id)
        )
        .first();
      if (!received) return null;
    }
    const year = yearOf(announcement);
    const view = await row(ctx, announcement, new Map(), year);
    return {
      id: view.id,
      title: view.title,
      message: view.message,
      senderName: view.senderName,
      at: view.sentAt ?? view.sendAt,
      details: admin
        ? {
            status: view.status,
            audience: view.audience,
            sendEmail: view.sendEmail,
            emailWithoutApp: view.emailWithoutApp,
            people: view.people,
            withApp: view.withApp,
            emailed: view.emailed,
            notSentReason: view.notSentReason,
            seen: await seenBy(ctx, announcement, year),
          }
        : null,
    };
  },
});

async function seenBy(ctx: Ctx, announcement: Doc<"announcements">, year: number) {
  if (announcement.status !== "sent" || announcement.recipientCount === undefined) return null;
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_announcement_and_read", (q) =>
      q.eq("announcementId", announcement._id).eq("read", false)
    )
    .take(MAX_PROFILES);
  const notSeen = await Promise.all(
    unread.map(async (n) => ({
      email: n.userEmail,
      name: await displayName(ctx, n.userEmail, year),
    }))
  );
  notSeen.sort((a, b) => a.name.localeCompare(b.name));
  return {
    total: announcement.recipientCount,
    count: Math.max(0, announcement.recipientCount - notSeen.length),
    notSeen,
  };
}

export const deliver = internalMutation({
  args: { id: v.id("announcements") },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get("announcements", args.id);
    if (!announcement || announcement.status !== "scheduled") return null;
    const year = yearOf(announcement);
    const recipients = await audienceEmails(ctx, announcement, year);
    if (recipients.length === 0) {
      await ctx.db.patch("announcements", announcement._id, {
        status: "cancelled",
        cancelledAt: Date.now(),
        jobId: undefined,
        recipientCount: 0,
      });
      return null;
    }
    const url = announcementPath(announcement._id);
    const { title, message } = announcement;

    const withApp: string[] = [];
    for (const to of recipients) {
      await ctx.db.insert("notifications", {
        userEmail: to,
        title,
        body: message,
        url,
        announcementId: announcement._id,
        read: false,
      });
      if (await hasApp(ctx, to)) withApp.push(to);
    }
    for (let i = 0; i < withApp.length; i += PUSH_BATCH) {
      await ctx.scheduler.runAfter(0, internal.push.sendMany, {
        to: withApp.slice(i, i + PUSH_BATCH),
        title,
        body: message,
        url,
      });
    }
    const emailTo = emailRecipients(recipients, new Set(withApp), emailChoiceOf(announcement));
    if (emailTo.length > 0) {
      const senderName = await displayName(ctx, announcement.senderEmail, year);
      for (let i = 0; i < emailTo.length; i += EMAIL_BATCH) {
        const messages = [];
        for (const to of emailTo.slice(i, i + EMAIL_BATCH)) {
          const link = appUrl(url);
          messages.push({ to, ...announcementEmail({ title, message, senderName, link }) });
        }
        await ctx.scheduler.runAfter(
          (i / EMAIL_BATCH) * EMAIL_BATCH_GAP_MS,
          internal.emails.sendBatch,
          { messages, replyTo: announcement.senderEmail }
        );
      }
    }
    await ctx.db.patch("announcements", announcement._id, {
      status: "sent",
      sentAt: Date.now(),
      jobId: undefined,
      recipientCount: recipients.length,
      pushCount: withApp.length,
      emailCount: emailTo.length,
    });
    return null;
  },
});
