import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { isMemberOfDepartment } from "../shared/flow";
import {
  cleanNameList,
  DEFAULT_GRIEVANCE_CATEGORIES,
  DEFAULT_GRIEVANCE_DEPARTMENTS,
  grievanceDetailLines,
  grievanceProblem,
  grievanceRef,
  isOpenGrievance,
  MAX_GRIEVANCE_DEPARTMENTS,
  MAX_GRIEVANCE_OPTION,
  MAX_GRIEVANCE_OPTIONS,
  MAX_GRIEVANCE_TEXT,
  normalizeGrievance,
  OPEN_GRIEVANCE_STATUSES,
} from "../shared/grievances";
import { grievanceFields } from "./grievanceData";
import {
  currentStaffYear,
  displayName,
  optionalEmail,
  optionalProfile,
  requireAdmin,
} from "./model";
import { appUrl, notify } from "./requests";

type Ctx = QueryCtx | MutationCtx;
type Grievance = Doc<"grievances">;

const LIST_LIMIT = 500;
const CARRY_BATCH = 100;
const EVENTS_LIMIT = 200;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_EMAIL = 3;
const MAX_GLOBAL = 30;
const PRUNE_BATCH = 50;

export const grievanceUrl = (g: Pick<Grievance, "_id">) => `/grievances/${g._id}`;

async function readSettings(ctx: Ctx) {
  const row = await ctx.db.query("grievanceSettings").first();
  return {
    departments: row?.departments ?? DEFAULT_GRIEVANCE_DEPARTMENTS,
    categories: row?.categories ?? DEFAULT_GRIEVANCE_CATEGORIES,
  };
}

async function saveSettings(
  ctx: MutationCtx,
  patch: Partial<{ departments: string[]; categories: string[] }>
) {
  const row = await ctx.db.query("grievanceSettings").first();
  if (row) await ctx.db.patch("grievanceSettings", row._id, patch);
  else await ctx.db.insert("grievanceSettings", { ...(await readSettings(ctx)), ...patch });
}

// Called when an admin renames a department. This year's rename swaps the
// name; renaming next year's adds the new name so this year's team keeps working.
export async function renameGrievanceDepartment(
  ctx: MutationCtx,
  year: number,
  oldName: string,
  newName: string
) {
  const { departments } = await readSettings(ctx);
  if (!departments.includes(oldName) || departments.includes(newName)) return;
  await saveSettings(ctx, {
    departments:
      year === currentStaffYear()
        ? departments.map((d) => (d === oldName ? newName : d))
        : [...departments, newName],
  });
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

const inDepartments = (profile: Doc<"staffProfiles">, departments: string[]) =>
  departments.some((d) => isMemberOfDepartment(profile, d));

export async function grievanceTeam(ctx: Ctx, departmentList?: string[]): Promise<string[]> {
  const departments = departmentList ?? (await readSettings(ctx)).departments;
  const emails = new Set<string>();
  for await (const profile of ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", currentStaffYear()))) {
    if (inDepartments(profile, departments)) emails.add(profile.email);
  }
  return [...emails].sort();
}

// Department heads always hold an assignment in their department, so this covers them too.
async function handlerEmail(ctx: Ctx): Promise<string | null> {
  const caller = await optionalProfile(ctx);
  if (!caller) return null;
  const { departments } = await readSettings(ctx);
  return inDepartments(caller.profile, departments) ? caller.email : null;
}

async function requireHandler(ctx: Ctx): Promise<string> {
  const email = await handlerEmail(ctx);
  if (!email) throw new ConvexError("Only the grievance team can do this.");
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

const nameOf = (ctx: Ctx, email: string | undefined, year = currentStaffYear()) =>
  email ? displayName(ctx, email, year) : Promise.resolve(null);

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
    body: `Hi ${g.name},\n\n${opts.body}${link}\n\nBlessings,\nThe SOW team`,
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

// In-app and push only: grievances never go to a team inbox.
async function tellTeam(
  ctx: MutationCtx,
  g: Grievance,
  opts: { actor: string | undefined; title: string; body: string }
) {
  for (const to of await grievanceTeam(ctx)) {
    if (to === g.accountEmail) continue;
    await notify(ctx, {
      to,
      actor: opts.actor,
      subject: opts.title,
      body: opts.body,
      url: grievanceUrl(g),
      grievanceId: g._id,
      email: false,
    });
  }
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
    throw new ConvexError("You've sent a few grievances recently. Please wait an hour.");
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
      "The grievance form is busy right now. Please sign in, or try again later."
    );
  }
  const stale = await ctx.db
    .query("grievanceRateLimit")
    .withIndex("by_time", (q) => q.lte("submittedAt", now - RATE_WINDOW_MS))
    .take(PRUNE_BATCH);
  for (const row of stale) await ctx.db.delete("grievanceRateLimit", row._id);
  await ctx.db.insert("grievanceRateLimit", { fromEmail, signedIn, submittedAt: now });
}

export const settings = query({
  args: {},
  handler: async (ctx) => await readSettings(ctx),
});

const STALE =
  "Someone else changed this while you were editing. Close it and open it again to see their changes.";

export const setDepartments = mutation({
  // `expected` is the list the editor started from, so a stale edit can't undo someone else's.
  args: { departments: v.array(v.string()), expected: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const cleaned = cleanNameList(args.departments, {
      one: "department",
      max: MAX_GRIEVANCE_DEPARTMENTS,
      maxLength: MAX_GRIEVANCE_OPTION,
    });
    if ("problem" in cleaned) throw new ConvexError(cleaned.problem);
    if (!sameList((await readSettings(ctx)).departments, args.expected)) {
      throw new ConvexError(STALE);
    }
    if ((await grievanceTeam(ctx, cleaned.list)).length === 0) {
      throw new ConvexError(
        `Nobody in ${cleaned.list.join(", ")} has a role in ${currentStaffYear()}, so nobody could see or handle grievances.`
      );
    }
    await saveSettings(ctx, { departments: cleaned.list });
    return null;
  },
});

export const setCategories = mutation({
  args: { categories: v.array(v.string()), expected: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireHandler(ctx);
    const cleaned = cleanNameList(args.categories, {
      one: "option",
      max: MAX_GRIEVANCE_OPTIONS,
      maxLength: MAX_GRIEVANCE_OPTION,
    });
    if ("problem" in cleaned) throw new ConvexError(cleaned.problem);
    if (!sameList((await readSettings(ctx)).categories, args.expected)) {
      throw new ConvexError(STALE);
    }
    await saveSettings(ctx, { categories: cleaned.list });
    return null;
  },
});

export const submit = mutation({
  args: grievanceFields,
  handler: async (ctx, args) => {
    const accountEmail = (await optionalEmail(ctx)) ?? undefined;
    const input = normalizeGrievance({ ...args, email: accountEmail ?? args.email });
    const problem = grievanceProblem(input, (await readSettings(ctx)).categories);
    if (problem) throw new ConvexError(problem);
    await checkRateLimit(ctx, input.email, accountEmail !== undefined);

    const id = await ctx.db.insert("grievances", {
      ...input,
      ref: crypto.randomUUID(),
      year: currentStaffYear(),
      submittedAt: Date.now(),
      accountEmail,
      status: "SUBMITTED",
    });
    await logEvent(ctx, id, input.email, "submitted");

    const g = (await ctx.db.get("grievances", id)) as Grievance;
    await tellSubmitter(ctx, g, {
      actor: input.email,
      subject: "We've received your grievance",
      body:
        "Thank you for telling us. Your grievance has gone to SOW's grievance team, and only they can see it. " +
        "We'll email you when someone is looking after it and when it's resolved.\n\n" +
        grievanceDetailLines(g).join("\n\n"),
    });
    await tellTeam(ctx, g, {
      actor: accountEmail,
      title: "New grievance",
      body: `Grievance ${grievanceRef(g.ref)} is waiting for someone to take it on.`,
    });
    return id;
  },
});

export const assign = mutation({
  args: { id: v.id("grievances"), assigneeEmail: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireHandler(ctx);
    const g = await requireOpen(ctx, args.id);
    if (!(await grievanceTeam(ctx)).includes(args.assigneeEmail)) {
      throw new ConvexError("Grievances can only be given to someone on the grievance team.");
    }
    if (g.assigneeEmail === args.assigneeEmail) return null;
    const first = g.status === "SUBMITTED";
    await ctx.db.patch("grievances", g._id, {
      assigneeEmail: args.assigneeEmail,
      ...(first ? { status: "IN_PROGRESS" as const, inProgressAt: Date.now() } : {}),
    });
    const assignee = (await nameOf(ctx, args.assigneeEmail)) as string;
    const taken = args.assigneeEmail === actor;
    await logEvent(ctx, g._id, actor, taken ? "taken" : "assigned", taken ? undefined : assignee);
    if (first) {
      await tellSubmitter(ctx, g, {
        actor,
        subject: "Your grievance is in progress",
        body: `${assignee} from SOW's grievance team is looking after your grievance. They may contact you to talk it through.`,
      });
    }
    const ref = grievanceRef(g.ref);
    await tellTeam(ctx, g, {
      actor,
      title: taken ? `${assignee} took on grievance ${ref}` : `Grievance ${ref} given to ${assignee}`,
      body: taken
        ? `${assignee} is looking after it.`
        : `${(await nameOf(ctx, actor)) as string} gave it to ${assignee}.`,
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
    await tellSubmitter(ctx, g, {
      actor,
      subject: resolved ? "Your grievance has been resolved" : "An update on your grievance",
      body: resolved
        ? `Your grievance has been resolved.\n\nOutcome: ${note}`
        : `Your grievance won't be taken further.\n\nReason: ${note}`,
    });
    const ref = grievanceRef(g.ref);
    await tellTeam(ctx, g, {
      actor,
      title: resolved ? `Grievance ${ref} resolved` : `Grievance ${ref} closed, not proceeding`,
      body: `${(await nameOf(ctx, actor)) as string} closed it.`,
    });
    return null;
  },
});

// 1 October: grievances still open move to the new staff year's list.
export const carryForward = internalMutation({
  args: {},
  handler: async (ctx) => {
    const year = currentStaffYear();
    let moved = 0;
    for (const status of OPEN_GRIEVANCE_STATUSES) {
      // Each moved grievance leaves the range, so keep taking batches until none are left.
      for (;;) {
        const batch = await ctx.db
          .query("grievances")
          .withIndex("by_status_and_year", (q) => q.eq("status", status).lt("year", year))
          .take(CARRY_BATCH);
        if (batch.length === 0) break;
        for (const g of batch) {
          await ctx.db.patch("grievances", g._id, { year });
          await logEvent(ctx, g._id, "system", "carried-over", `${g.year} → ${year}`);
          moved++;
        }
      }
    }
    return { moved };
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
    const rows = await ctx.db
      .query("grievances")
      .withIndex("by_accountEmail", (q) => q.eq("accountEmail", email))
      .order("desc")
      .take(LIST_LIMIT);
    // The reference is for the team only.
    return rows.map(({ ref: _ref, ...rest }) => rest);
  },
});

// Only years grievances have been listed in, newest first, always including this one.
export const years = query({
  args: {},
  handler: async (ctx) => {
    if (!(await handlerEmail(ctx))) return null;
    const years = new Set([currentStaffYear()]);
    let row = await ctx.db.query("grievances").withIndex("by_year").first();
    while (row) {
      years.add(row.year);
      const after = row.year;
      row = await ctx.db
        .query("grievances")
        .withIndex("by_year", (q) => q.gt("year", after))
        .first();
    }
    return [...years].sort((a, b) => b - a);
  },
});

export const submitted = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if (!(await handlerEmail(ctx))) return null;
    const rows = await ctx.db
      .query("grievances")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(LIST_LIMIT);
    // Open ones from earlier years belong to this year even before 1 October's move runs.
    if (args.year === currentStaffYear()) {
      for (const status of OPEN_GRIEVANCE_STATUSES) {
        rows.push(
          ...(await ctx.db
            .query("grievances")
            .withIndex("by_status_and_year", (q) => q.eq("status", status).lt("year", args.year))
            .take(LIST_LIMIT))
        );
      }
    }
    return rows.sort((a, b) => a.submittedAt - b.submittedAt);
  },
});

export const waitingOnMe = query({
  args: {},
  handler: async (ctx) => {
    const email = await handlerEmail(ctx);
    if (!email) return 0;
    const waiting = await ctx.db
      .query("grievances")
      .withIndex("by_status", (q) => q.eq("status", "SUBMITTED"))
      .take(LIST_LIMIT);
    const mine = (
      await ctx.db
        .query("grievances")
        .withIndex("by_status", (q) => q.eq("status", "IN_PROGRESS"))
        .take(LIST_LIMIT)
    ).filter((g) => g.assigneeEmail === email);
    return waiting.length + mine.length;
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
    const { ref, ...rest } = g;
    return {
      grievance: rest,
      // The reference is for the team only.
      ref: isHandler ? ref : null,
      assigneeName: await nameOf(ctx, g.assigneeEmail, g.year),
      closedByName: await nameOf(ctx, g.closedBy, g.year),
      isHandler,
      can: {
        take: isHandler && open && g.assigneeEmail !== email,
        assign: isHandler && open,
        resolve: isHandler && g.status === "IN_PROGRESS",
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
          event.actorEmail === "system"
            ? "THE SHED"
            : event.action === "submitted"
              ? g.name
              : ((await nameOf(ctx, event.actorEmail, g.year)) as string),
        detail: event.detail ?? null,
      }))
    );
  },
});
