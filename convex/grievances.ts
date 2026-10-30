import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { isMemberOfDepartment } from "../shared/flow";
import {
  GRIEVANCE_DEPARTMENTS,
  GRIEVANCES_TEAM_EMAIL,
  grievanceDetailLines,
  grievanceName,
  grievanceProblem,
  isOpenGrievance,
  MAX_GRIEVANCE_TEXT,
  normalizeGrievance,
  OPEN_GRIEVANCE_STATUSES,
} from "../shared/grievances";
import { grievanceFields } from "./grievanceData";
import { currentStaffYear, displayName, optionalEmail, optionalProfile } from "./model";
import { appUrl, notify } from "./requests";

type Ctx = QueryCtx | MutationCtx;
type Grievance = Doc<"grievances">;

const LIST_LIMIT = 300;
const EVENTS_LIMIT = 200;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_EMAIL = 3;
const MAX_GLOBAL = 30;
const PRUNE_BATCH = 50;

export const grievanceUrl = (g: Pick<Grievance, "_id">) => `/grievances/${g._id}`;

// Department heads always hold an assignment in their department, so this covers them too.
const isGrievanceHandler = (profile: Doc<"staffProfiles">) =>
  GRIEVANCE_DEPARTMENTS.some((d) => isMemberOfDepartment(profile, d));

export async function grievanceTeam(ctx: Ctx): Promise<string[]> {
  const year = currentStaffYear();
  const emails = new Set<string>();
  for await (const profile of ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))) {
    if (isGrievanceHandler(profile)) emails.add(profile.email);
  }
  return [...emails].sort();
}

async function handlerEmail(ctx: Ctx): Promise<string | null> {
  const caller = await optionalProfile(ctx);
  if (!caller) return null;
  return isGrievanceHandler(caller.profile) ? caller.email : null;
}

async function requireHandler(ctx: Ctx): Promise<string> {
  const email = await handlerEmail(ctx);
  if (!email) {
    throw new ConvexError("Only the People and Culture and Compliance teams can handle grievances.");
  }
  return email;
}

async function requireOpen(ctx: Ctx, id: Id<"grievances">): Promise<Grievance> {
  const grievance = await ctx.db.get("grievances", id);
  if (!grievance) throw new ConvexError("Grievance not found.");
  if (!isOpenGrievance(grievance.status)) {
    throw new ConvexError("This grievance is already closed.");
  }
  return grievance;
}

const nameOf = (ctx: Ctx, email: string | undefined) =>
  email ? displayName(ctx, email, currentStaffYear()) : Promise.resolve(null);

const logEvent = async (
  ctx: MutationCtx,
  grievanceId: Id<"grievances">,
  actorEmail: string,
  action: string,
  detail?: string
) => {
  await ctx.db.insert("grievanceEvents", { grievanceId, action, actorEmail, detail });
};

async function tellSubmitter(
  ctx: MutationCtx,
  g: Grievance,
  opts: { actor: string; subject: string; body: string }
) {
  const link = g.accountEmail ? `\n\nFollow it in THE SHED: ${appUrl(grievanceUrl(g))}` : "";
  await ctx.scheduler.runAfter(0, internal.emails.send, {
    to: g.email,
    subject: opts.subject,
    body: `Hi ${g.name},\n\n${opts.body}${link}\n\nIf you'd like to add anything, reply to this email and it will reach the team at ${GRIEVANCES_TEAM_EMAIL}.\n\nBlessings,\nThe SOW team`,
    replyTo: GRIEVANCES_TEAM_EMAIL,
  });
  await notify(ctx, {
    to: g.accountEmail,
    actor: opts.actor,
    subject: opts.subject,
    pushTitle: "Grievance update",
    body: opts.subject,
    url: grievanceUrl(g),
    grievanceId: g._id,
    email: false,
  });
}

async function tellTeam(
  ctx: MutationCtx,
  g: Grievance,
  opts: { actor: string | undefined; subject: string; body: string; replyTo?: string }
) {
  const url = grievanceUrl(g);
  for (const to of await grievanceTeam(ctx)) {
    if (to === g.accountEmail) continue;
    await notify(ctx, {
      to,
      actor: opts.actor,
      subject: opts.subject,
      body: opts.subject,
      url,
      grievanceId: g._id,
      email: false,
    });
  }
  await ctx.scheduler.runAfter(0, internal.emails.send, {
    to: GRIEVANCES_TEAM_EMAIL,
    subject: opts.subject,
    body: `${opts.body}\n\nOpen in THE SHED: ${appUrl(url)}`,
    replyTo: opts.replyTo,
  });
}

// Signed-in people are limited per account only; the shared cap applies to
// signed-out sending, so it can't lock out anyone who signs in.
async function checkRateLimit(ctx: MutationCtx, fromEmail: string, signedIn: boolean) {
  const now = Date.now();
  const mine = await ctx.db
    .query("grievanceRateLimit")
    .withIndex("by_email_and_time", (q) =>
      q.eq("fromEmail", fromEmail).gt("submittedAt", now - RATE_WINDOW_MS)
    )
    .take(MAX_PER_EMAIL);
  if (mine.length >= MAX_PER_EMAIL) {
    throw new ConvexError(
      "You've sent a few grievances recently. Please wait an hour, or email grievances@sow.org.au."
    );
  }
  const everyone = signedIn
    ? []
    : await ctx.db
        .query("grievanceRateLimit")
        .withIndex("by_signedIn_and_time", (q) =>
          q.eq("signedIn", false).gt("submittedAt", now - RATE_WINDOW_MS)
        )
        .take(MAX_GLOBAL);
  if (everyone.length >= MAX_GLOBAL) {
    throw new ConvexError(
      "The grievance form is busy right now. Please sign in, try again later, or email grievances@sow.org.au."
    );
  }
  const stale = await ctx.db
    .query("grievanceRateLimit")
    .withIndex("by_time", (q) => q.lte("submittedAt", now - RATE_WINDOW_MS))
    .take(PRUNE_BATCH);
  for (const row of stale) await ctx.db.delete("grievanceRateLimit", row._id);
  await ctx.db.insert("grievanceRateLimit", { fromEmail, signedIn, submittedAt: now });
}

export const submit = mutation({
  args: grievanceFields,
  handler: async (ctx, args) => {
    const accountEmail = (await optionalEmail(ctx)) ?? undefined;
    const input = normalizeGrievance({ ...args, email: accountEmail ?? args.email });
    const problem = grievanceProblem(input);
    if (problem) throw new ConvexError(problem);
    await checkRateLimit(ctx, input.email, accountEmail !== undefined);

    const last = await ctx.db.query("grievances").withIndex("by_number").order("desc").first();
    const number = (last?.number ?? 0) + 1;
    const id = await ctx.db.insert("grievances", {
      ...input,
      number,
      year: currentStaffYear(),
      submittedAt: Date.now(),
      accountEmail,
      status: "SUBMITTED",
    });
    await logEvent(ctx, id, input.email, "submitted");

    const g = (await ctx.db.get("grievances", id)) as Grievance;
    const name = grievanceName(g);
    const details = grievanceDetailLines(g).join("\n\n");
    await tellSubmitter(ctx, g, {
      actor: input.email,
      subject: `We've received your grievance (#${number})`,
      body:
        "Thank you for telling us. Your grievance has gone to SOW's People and Culture and Compliance teams, and only they can see it. " +
        "We'll email you as it moves along: when someone takes it on, when it's in progress, and when it's resolved.\n\n" +
        `Reference: ${name}\n\n${details}`,
    });
    const contact = [`From: ${g.name} (${g.email})`, g.phone ? `Phone: ${g.phone}` : ""]
      .filter(Boolean)
      .join("\n");
    await tellTeam(ctx, g, {
      actor: accountEmail,
      subject: `New ${name}`,
      body: `A new grievance is waiting for someone to take it.\n\n${contact}\n\n${details}`,
      replyTo: g.email,
    });
    return { id, number };
  },
});

export const assign = mutation({
  args: { id: v.id("grievances"), assigneeEmail: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireHandler(ctx);
    const g = await requireOpen(ctx, args.id);
    if (!(await grievanceTeam(ctx)).includes(args.assigneeEmail)) {
      throw new ConvexError("Grievances can only be given to someone in People and Culture or Compliance.");
    }
    if (g.assigneeEmail === args.assigneeEmail) return null;
    const first = g.status === "SUBMITTED";
    await ctx.db.patch("grievances", g._id, {
      assigneeEmail: args.assigneeEmail,
      ...(first
        ? { status: "RECEIVED" as const, receivedAt: Date.now(), receivedBy: args.assigneeEmail }
        : {}),
    });
    const assignee = (await nameOf(ctx, args.assigneeEmail)) as string;
    const taken = args.assigneeEmail === actor;
    await logEvent(ctx, g._id, actor, taken ? "taken" : "assigned", taken ? undefined : assignee);
    const name = grievanceName(g);
    if (first) {
      await tellSubmitter(ctx, g, {
        actor,
        subject: `Your grievance #${g.number} has been received`,
        body: `${assignee} from the People and Culture and Compliance teams is looking after your grievance (${name}).`,
      });
    }
    await tellTeam(ctx, g, {
      actor,
      subject: taken ? `${name} taken by ${assignee}` : `${name} given to ${assignee}`,
      body: taken
        ? `${assignee} is looking after it.`
        : `${(await nameOf(ctx, actor)) as string} gave it to ${assignee}.`,
    });
    return null;
  },
});

export const start = mutation({
  args: { id: v.id("grievances") },
  handler: async (ctx, args) => {
    const actor = await requireHandler(ctx);
    const g = await requireOpen(ctx, args.id);
    if (g.status !== "RECEIVED") {
      throw new ConvexError("Only a received grievance can be marked in progress.");
    }
    await ctx.db.patch("grievances", g._id, { status: "IN_PROGRESS", inProgressAt: Date.now() });
    await logEvent(ctx, g._id, actor, "in-progress");
    const name = grievanceName(g);
    await tellSubmitter(ctx, g, {
      actor,
      subject: `Your grievance #${g.number} is in progress`,
      body: `The team has started working on your grievance (${name}). They may contact you to talk it through.`,
    });
    await tellTeam(ctx, g, {
      actor,
      subject: `${name} is in progress`,
      body: `${(await nameOf(ctx, actor)) as string} marked it in progress.`,
    });
    return null;
  },
});

export const close = mutation({
  args: {
    id: v.id("grievances"),
    outcome: v.union(v.literal("RESOLVED"), v.literal("NOT_PROCEEDING")),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireHandler(ctx);
    const note = args.note.trim();
    if (!note) {
      throw new ConvexError("Please add a note for the person who raised it. They'll be emailed it.");
    }
    if (note.length > MAX_GRIEVANCE_TEXT) {
      throw new ConvexError(`The note can be at most ${MAX_GRIEVANCE_TEXT} characters.`);
    }
    const g = await requireOpen(ctx, args.id);
    if (args.outcome === "RESOLVED" && g.status === "SUBMITTED") {
      throw new ConvexError("Take the grievance on before marking it resolved.");
    }
    await ctx.db.patch("grievances", g._id, {
      status: args.outcome,
      closedAt: Date.now(),
      closedBy: actor,
      closingNote: note,
    });
    const resolved = args.outcome === "RESOLVED";
    await logEvent(ctx, g._id, actor, resolved ? "resolved" : "not-proceeding", note);
    const name = grievanceName(g);
    await tellSubmitter(ctx, g, {
      actor,
      subject: resolved
        ? `Your grievance #${g.number} has been resolved`
        : `An update on your grievance #${g.number}`,
      body: resolved
        ? `Your grievance (${name}) has been resolved.\n\nOutcome: ${note}`
        : `Your grievance (${name}) won't be taken further.\n\nReason: ${note}`,
    });
    await tellTeam(ctx, g, {
      actor,
      subject: resolved ? `${name} resolved` : `${name} closed, not proceeding`,
      body: `${(await nameOf(ctx, actor)) as string} closed it.\n\n${resolved ? "Outcome" : "Reason"}: ${note}`,
    });
    return null;
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    return { email, isHandler: (await handlerEmail(ctx)) !== null };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    return await ctx.db
      .query("grievances")
      .withIndex("by_accountEmail", (q) => q.eq("accountEmail", email))
      .order("desc")
      .take(LIST_LIMIT);
  },
});

export const queue = query({
  args: {},
  handler: async (ctx) => {
    if (!(await handlerEmail(ctx))) return null;
    const rows: Grievance[] = [];
    for (const status of OPEN_GRIEVANCE_STATUSES) {
      rows.push(
        ...(await ctx.db
          .query("grievances")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(LIST_LIMIT))
      );
    }
    return rows.sort((a, b) => a.submittedAt - b.submittedAt);
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    if (!(await handlerEmail(ctx))) return null;
    return await ctx.db.query("grievances").withIndex("by_number").order("desc").take(LIST_LIMIT);
  },
});

export const waitingOnMe = query({
  args: {},
  handler: async (ctx) => {
    const email = await handlerEmail(ctx);
    if (!email) return 0;
    const rows = await ctx.db
      .query("grievances")
      .withIndex("by_status", (q) => q.eq("status", "SUBMITTED"))
      .take(LIST_LIMIT);
    let count = rows.length;
    for (const status of ["RECEIVED", "IN_PROGRESS"] as const) {
      count += (
        await ctx.db
          .query("grievances")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(LIST_LIMIT)
      ).filter((g) => g.assigneeEmail === email).length;
    }
    return count;
  },
});

export const team = query({
  args: {},
  handler: async (ctx) => {
    if (!(await handlerEmail(ctx))) return null;
    return await Promise.all(
      (await grievanceTeam(ctx)).map(async (email) => ({
        email,
        name: (await nameOf(ctx, email)) as string,
      }))
    );
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const id = ctx.db.normalizeId("grievances", args.id);
    const g = id ? await ctx.db.get("grievances", id) : null;
    if (!g) return null;
    const isHandler = (await handlerEmail(ctx)) !== null;
    if (!isHandler && g.accountEmail !== email) return null;
    const open = isOpenGrievance(g.status);
    return {
      grievance: g,
      assigneeName: await nameOf(ctx, g.assigneeEmail),
      receivedByName: await nameOf(ctx, g.receivedBy ?? g.assigneeEmail),
      closedByName: await nameOf(ctx, g.closedBy),
      isHandler,
      can: {
        take: isHandler && open && g.assigneeEmail !== email,
        assign: isHandler && open,
        start: isHandler && g.status === "RECEIVED",
        resolve: isHandler && open && g.status !== "SUBMITTED",
        close: isHandler && open,
      },
    };
  },
});

export const timeline = query({
  args: { id: v.id("grievances") },
  handler: async (ctx, args) => {
    const g = await ctx.db.get("grievances", args.id);
    if (!g || !(await handlerEmail(ctx))) return null;
    const events = await ctx.db
      .query("grievanceEvents")
      .withIndex("by_grievance", (q) => q.eq("grievanceId", args.id))
      .order("desc")
      .take(EVENTS_LIMIT);
    return await Promise.all(
      events.reverse().map(async (event) => ({
        at: event._creationTime,
        action: event.action,
        actorName:
          event.actorEmail === g.email ? g.name : ((await nameOf(ctx, event.actorEmail)) as string),
        detail: event.detail ?? null,
      }))
    );
  },
});
