import { ConvexError, v } from "convex/values";
import {
  announcementEmail,
  announcementPath,
  type Audience,
  audienceSummary,
  cleanDraft,
  inAudience,
  rateLimitError,
  scheduleError,
  sortRoles,
} from "../shared/announcements";
import { assignmentsOf } from "../shared/flow";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import { audienceValidator } from "./announcementData";
import { emailLinkFor } from "./appInstalls";
import {
  currentStaffYear,
  displayName,
  isAdminProfile,
  optionalEmail,
  optionalProfile,
  requireAdmin,
} from "./model";
import { appUrl } from "./requests";

type Ctx = QueryCtx | MutationCtx;

/** More staff profiles than a year has ever had; the most one announcement reaches. */
const MAX_PROFILES = 2000;
/** People per push request (Expo's batch size) and per email request (Resend's). */
const PUSH_BATCH = 100;
const EMAIL_BATCH = 100;
/** Gap between email batches, to stay under Resend's requests per second. */
const EMAIL_BATCH_GAP_MS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const cleanList = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const cleanAudience = (audience: Audience): Audience => ({
  campuses: cleanList(audience.campuses),
  divisions: cleanList(audience.divisions),
  departments: cleanList(audience.departments),
  roles: cleanList(audience.roles),
});

/** Everyone in `year` the audience reaches, by email, A–Z. */
async function audienceEmails(ctx: Ctx, audience: Audience, year: number): Promise<string[]> {
  const departments = await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", year))
    .take(200);
  const divisionOf = new Map(departments.map((d) => [d.name, d.division]));
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))
    .take(MAX_PROFILES);
  const emails = new Set<string>();
  for (const profile of profiles) {
    if (inAudience(assignmentsOf(profile), audience, (d) => divisionOf.get(d))) {
      emails.add(profile.email.toLowerCase());
    }
  }
  return [...emails].sort();
}

async function hasApp(ctx: Ctx, email: string): Promise<boolean> {
  const token = await ctx.db
    .query("pushTokens")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  return token !== null;
}

/**
 * What the rate limits look at for one sender: what they sent or scheduled in
 * the last day that wasn't cancelled (a cancelled one reached no one), and how
 * many are still waiting to go out.
 */
async function senderActivity(ctx: Ctx, email: string, now: number) {
  const recent = await ctx.db
    .query("announcements")
    .withIndex("by_sender", (q) =>
      q.eq("senderEmail", email).gt("_creationTime", now - DAY_MS)
    )
    .take(100);
  const pending = await ctx.db
    .query("announcements")
    .withIndex("by_sender_and_status", (q) =>
      q.eq("senderEmail", email).eq("status", "scheduled")
    )
    .take(100);
  return {
    recent: recent
      .filter((a) => a.status !== "cancelled")
      .map((a) => ({ createdAt: a._creationTime, title: a.title, message: a.message })),
    pending: pending.length,
  };
}

/** The caller when they're an admin (which takes in the HR division), else null. */
async function optionalAdmin(ctx: Ctx) {
  const caller = await optionalProfile(ctx);
  if (!caller || !(await isAdminProfile(ctx, caller.profile))) return null;
  return caller;
}

/** What the audience picker offers: this year's campuses, divisions, departments and roles. */
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
    };
  },
});

/** How many people the audience reaches right now, and how many of them have the app. */
export const audienceSize = query({
  args: { audience: audienceValidator },
  handler: async (ctx, args) => {
    const caller = await optionalAdmin(ctx);
    if (!caller) return null;
    const emails = await audienceEmails(ctx, cleanAudience(args.audience), caller.year);
    let withApp = 0;
    for (const email of emails) {
      if (await hasApp(ctx, email)) withApp++;
    }
    return { people: emails.length, withApp };
  },
});

/**
 * Sends an announcement now, or schedules it for `sendAt`. Admins only, and
 * rate-limited (shared/announcements.ts) so a slip of the finger or a stuck
 * button can't flood everyone's phones.
 */
export const send = mutation({
  args: {
    title: v.string(),
    message: v.string(),
    audience: audienceValidator,
    sendEmail: v.boolean(),
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
    const audience = cleanAudience(args.audience);
    const recipients = await audienceEmails(ctx, audience, caller.year);
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
      title: draft.title,
      message: draft.message,
      audience,
      sendEmail: args.sendEmail,
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

/** Stops a scheduled announcement before it goes out. Any admin can. */
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

async function row(
  ctx: Ctx,
  announcement: Doc<"announcements">,
  names: Map<string, string>,
  year: number
) {
  let senderName = names.get(announcement.senderEmail);
  if (senderName === undefined) {
    senderName = await displayName(ctx, announcement.senderEmail, year);
    names.set(announcement.senderEmail, senderName);
  }
  return {
    id: announcement._id,
    title: announcement.title,
    message: announcement.message,
    audience: audienceSummary(announcement.audience),
    sendEmail: announcement.sendEmail,
    status: announcement.status,
    sendAt: announcement.sendAt,
    sentAt: announcement.sentAt ?? null,
    senderEmail: announcement.senderEmail,
    senderName,
    people: announcement.recipientCount ?? null,
    withApp: announcement.pushCount ?? null,
    emailed: announcement.emailCount ?? null,
  };
}

/**
 * For admins: what's waiting to go out (soonest first), what went out lately,
 * and the caller's own recent sends, so the page can say a send would be
 * refused (shared/announcements.ts) before trying it.
 */
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
    const names = new Map<string, string>();
    return {
      mine: await senderActivity(ctx, caller.email, Date.now()),
      scheduled: await Promise.all(scheduled.map((a) => row(ctx, a, names, caller.year))),
      sent: await Promise.all(sent.map((a) => row(ctx, a, names, caller.year))),
    };
  },
});

/**
 * One announcement, for the page a notification opens. Its recipients see the
 * message; admins also see who it went to and how far it reached.
 */
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
    const year = currentStaffYear();
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
            people: view.people,
            withApp: view.withApp,
            emailed: view.emailed,
          }
        : null,
    };
  },
});

/**
 * Sends a scheduled announcement: a notification in each recipient's bell, a
 * push to everyone with the app and, if asked for, an email. The audience is
 * worked out now, so someone added to a department before a scheduled send
 * gets it. Does nothing if it was cancelled (or already sent).
 */
export const deliver = internalMutation({
  args: { id: v.id("announcements") },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get("announcements", args.id);
    if (!announcement || announcement.status !== "scheduled") return null;
    const year = currentStaffYear();
    const recipients = await audienceEmails(ctx, announcement.audience, year);
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
    if (announcement.sendEmail) {
      const senderName = await displayName(ctx, announcement.senderEmail, year);
      for (let i = 0; i < recipients.length; i += EMAIL_BATCH) {
        const messages = [];
        for (const to of recipients.slice(i, i + EMAIL_BATCH)) {
          const link = appUrl(await emailLinkFor(ctx, to, url));
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
      emailCount: announcement.sendEmail ? recipients.length : 0,
    });
    return null;
  },
});
