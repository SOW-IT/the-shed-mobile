import { paginationOptsValidator } from "convex/server";
import type { Teams } from "../shared/teams";
import { teamsFor } from "./teamJobs";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query } from "./_generated/server";
import { isMemberOfDepartment } from "../shared/flow";
import {
  personaHeads,
  personaInDepartment,
  seesThrough,
  waitsThrough,
  type Lens,
  type Persona,
} from "../shared/actingAs";
import { lensFor } from "./actingAs";
import {
  changedDesignAnswers,
  designAnswersProblem,
  designRequestFiling,
  designRequestName,
  formatDesignAnswer,
  isOpenDesignStatus,
  MARKETING_TEAM_EMAIL,
  MAX_ANSWER_LENGTH,
  normalizeDesignAnswers,
  sydneyToday,
  type DesignAnswers,
  type DesignRequestStatus,
} from "../shared/designRequests";
import { designAnswersValidator } from "./designRequestData";
import { DESIGN_REQUEST_FIELDS } from "./designRequestForm";
import {
  actAsEmails,
  type CallerContext,
  Ctx,
  currentStaffYear,
  displayName,
  getDepartment,
  memoAsync,
  optionalProfile,
  requireProfile,
  resolveName,
  withDelegatesForYear,
} from "./model";
import { appUrl, notify } from "./requests";

type DesignRequest = Doc<"designRequests">;

const LIST_LIMIT = 300;
const EVENTS_LIMIT = 200;

const designTeam = async (ctx: Ctx, year: number) => (await teamsFor(ctx, year)).design;

const marketingHeadEmail = async (ctx: Ctx, year: number) =>
  (await getDepartment(ctx, year, await designTeam(ctx, year)))?.headEmail;

async function actsAsMarketingHead(
  ctx: Ctx,
  caller: CallerContext,
  year: number
): Promise<boolean> {
  for (const y of new Set([year, caller.year])) {
    const head = await marketingHeadEmail(ctx, y);
    if (head && (await actAsEmails(ctx, y, caller.email)).has(head)) return true;
  }
  return false;
}

const isMarketingStaff = async (ctx: Ctx, caller: CallerContext) =>
  isMemberOfDepartment(caller.profile, await designTeam(ctx, caller.profile.year));

export interface DesignRequestAccess {
  canView: boolean;
  canComment: boolean;
  canDecide: boolean;
  canComplete: boolean;
  isRequester: boolean;
}

export async function accessTo(
  ctx: Ctx,
  caller: CallerContext,
  request: DesignRequest
): Promise<DesignRequestAccess> {
  const isRequester = request.requesterEmail === caller.email;
  const isHead = await actsAsMarketingHead(ctx, caller, request.year);
  const isTeam = isHead || (await isMarketingStaff(ctx, caller));
  // Only the requester and the Marketing team see a design request; being an
  // admin adds nothing.
  const canComment = isRequester || isTeam;
  return {
    canView: canComment,
    canComment,
    canDecide: isHead && !isRequester,
    canComplete: isTeam,
    isRequester,
  };
}

async function requireRequest(ctx: Ctx, id: Id<"designRequests">) {
  const request = await ctx.db.get("designRequests", id);
  if (!request) throw new ConvexError("Design request not found.");
  return request;
}

export const designRequestUrl = (
  request: Pick<DesignRequest, "_id">,
  opts?: { thread?: boolean }
) => `/design-requests/${request._id}${opts?.thread ? "?thread=1" : ""}`;

export async function requestSummary(ctx: Ctx, request: DesignRequest) {
  const requester = await displayName(ctx, request.requesterEmail, request.year);
  const answers = DESIGN_REQUEST_FIELDS.filter((field) => field.inSummary).flatMap(
    (field) => {
      const answer = formatDesignAnswer(field, request.answers);
      return answer === null ? [] : [`${field.shortLabel}: ${answer}`];
    }
  );
  return [
    designRequestName(request),
    `Requester: ${requester} (${request.requesterEmail})`,
    ...answers,
  ].join("\n");
}

export async function headRecipients(ctx: Ctx, year: number): Promise<string[]> {
  for (const y of [year, currentStaffYear()]) {
    const head = await marketingHeadEmail(ctx, y);
    if (head) return await withDelegatesForYear(ctx, y, head);
  }
  return [];
}

export async function marketingTeam(ctx: Ctx): Promise<string[]> {
  const year = currentStaffYear();
  const team = await designTeam(ctx, year);
  const emails = new Set<string>();
  for await (const profile of ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))) {
    if (isMemberOfDepartment(profile, team)) emails.add(profile.email);
  }
  const head = await marketingHeadEmail(ctx, year);
  if (head) emails.add(head);
  return [...emails];
}

export async function tellTeam(
  ctx: MutationCtx,
  request: DesignRequest,
  opts: {
    actor: string;
    subject: string;
    pushTitle: string;
    body: string;
    skip?: string[];
    thread?: boolean;
  }
) {
  const url = designRequestUrl(request, { thread: opts.thread });
  const skip = new Set([opts.actor, request.requesterEmail, ...(opts.skip ?? [])]);
  for (const to of await marketingTeam(ctx)) {
    if (skip.has(to)) continue;
    await notify(ctx, {
      to,
      actor: opts.actor,
      subject: opts.subject,
      pushTitle: opts.pushTitle,
      body: opts.body,
      url,
      designRequestId: request._id,
      email: false,
    });
  }
  await ctx.scheduler.runAfter(0, internal.emails.send, {
    to: MARKETING_TEAM_EMAIL,
    subject: opts.subject,
    body: `${opts.body}\n\nOpen in THE SHED: ${appUrl(url)}`,
  });
}

export async function tellRequester(
  ctx: MutationCtx,
  request: DesignRequest,
  opts: { actor: string; subject: string; pushTitle: string; body: string; thread?: boolean }
) {
  await notify(ctx, {
    to: request.requesterEmail,
    actor: opts.actor,
    subject: opts.subject,
    pushTitle: opts.pushTitle,
    body: opts.body,
    url: designRequestUrl(request, { thread: opts.thread }),
    designRequestId: request._id,
  });
}

async function tellHeads(
  ctx: MutationCtx,
  request: DesignRequest,
  opts: { actor: string; subject: string; pushTitle: string; body: string }
): Promise<string[]> {
  const heads = await headRecipients(ctx, request.year);
  for (const to of heads) {
    await notify(ctx, {
      to,
      actor: opts.actor,
      subject: opts.subject,
      pushTitle: opts.pushTitle,
      body: opts.body,
      url: designRequestUrl(request),
      designRequestId: request._id,
    });
  }
  return heads;
}

const logEvent = async (
  ctx: MutationCtx,
  designRequestId: Id<"designRequests">,
  actorEmail: string,
  action: string,
  detail?: string
) => {
  await ctx.db.insert("designRequestEvents", {
    designRequestId,
    action,
    actorEmail,
    detail,
  });
};

const OPEN_STATUSES: DesignRequestStatus[] = ["PENDING", "APPROVED"];

async function yearWithOpen(
  year: number,
  byYear: (year: number) => Promise<DesignRequest[]>,
  byStatus: (status: DesignRequestStatus) => Promise<DesignRequest[]>
): Promise<DesignRequest[]> {
  const rows = new Map((await byYear(year)).map((r) => [r._id, r]));
  for (const status of OPEN_STATUSES) {
    for (const r of await byStatus(status)) rows.set(r._id, r);
  }
  return [...rows.values()].sort((a, b) => b.submittedAt - a.submittedAt);
}

async function withRequesterNames(ctx: Ctx, rows: DesignRequest[]) {
  const nameOf = memoAsync((email: string, year: number) => resolveName(ctx, email, year));
  return await Promise.all(
    rows.map(async (r) => {
      return { ...r, requesterName: await nameOf(r.requesterEmail, r.year) };
    })
  );
}

// Only the Marketing team sees every design request.
async function canSeeQueue(ctx: Ctx, caller: CallerContext) {
  return (await isMarketingStaff(ctx, caller)) || (await actsAsMarketingHead(ctx, caller, caller.year));
}

const onMarketingTeam = (teams: Teams) => (persona: Persona) =>
  personaInDepartment(persona, teams.design, teams);

const seesQueue = async (ctx: Ctx, caller: CallerContext, lens: Lens) =>
  seesThrough(
    lens,
    () => canSeeQueue(ctx, caller),
    onMarketingTeam(await teamsFor(ctx, caller.year))
  );

export async function viewableAccess(
  ctx: Ctx,
  caller: CallerContext,
  request: DesignRequest
): Promise<DesignRequestAccess | null> {
  const access = await accessTo(ctx, caller, request);
  if (access.canView) return access;
  const lens = await lensFor(ctx, caller);
  const teams = await teamsFor(ctx, caller.year);
  return (await seesThrough(lens, () => false, onMarketingTeam(teams))) ? access : null;
}

async function viewerRoles(ctx: Ctx, caller: CallerContext, lens: Lens) {
  const teams = await teamsFor(ctx, caller.year);
  const isHead = await waitsThrough(
    lens,
    () => actsAsMarketingHead(ctx, caller, caller.year),
    (persona) => personaHeads(persona, teams.design)
  );
  const isStaff = await waitsThrough(
    lens,
    () => isMarketingStaff(ctx, caller),
    onMarketingTeam(teams)
  );
  return { isHead, isStaff };
}

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const lens = await lensFor(ctx, caller);
    const { isHead, isStaff } = await viewerRoles(ctx, caller, lens);
    return {
      year: caller.year,
      hasMarketingHead: (await marketingHeadEmail(ctx, caller.year)) !== undefined,
      isMarketingHead: isHead,
      isMarketingStaff: isStaff,
      canSeeQueue: await seesQueue(ctx, caller, lens),
    };
  },
});

export async function designWaitingOnMe(
  ctx: Ctx,
  caller: CallerContext,
  lens: Lens
): Promise<{ toApprove: number; toFinish: number }> {
  const { isHead, isStaff } = await viewerRoles(ctx, caller, lens);
  if (!isHead && !isStaff) return { toApprove: 0, toFinish: 0 };
  const countOf = async (status: DesignRequestStatus) =>
    (
      await ctx.db
        .query("designRequests")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(LIST_LIMIT)
    ).filter((r) => r.requesterEmail !== caller.email).length;
  return {
    toApprove: isHead ? await countOf("PENDING") : 0,
    toFinish: await countOf("APPROVED"),
  };
}

export const waitingOnMe = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return 0;
    const { toApprove, toFinish } = await designWaitingOnMe(
      ctx,
      caller,
      await lensFor(ctx, caller)
    );
    return toApprove + toFinish;
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const rows = await yearWithOpen(
      caller.year,
      (year) =>
        ctx.db
          .query("designRequests")
          .withIndex("by_requester_and_year", (q) =>
            q.eq("requesterEmail", caller.email).eq("year", year)
          )
          .take(LIST_LIMIT),
      (status) =>
        ctx.db
          .query("designRequests")
          .withIndex("by_requester_and_status", (q) =>
            q.eq("requesterEmail", caller.email).eq("status", status)
          )
          .take(LIST_LIMIT)
    );
    return await withRequesterNames(ctx, rows);
  },
});

export const designWaitingSince = (request: DesignRequest): number =>
  request.status === "APPROVED" ? (request.decidedAt ?? request.submittedAt) : request.submittedAt;

const queueViewer = async (ctx: Ctx) => {
  const caller = await optionalProfile(ctx);
  return caller && (await seesQueue(ctx, caller, await lensFor(ctx, caller))) ? caller : null;
};

export const queue = query({
  args: {},
  handler: async (ctx) => {
    const caller = await queueViewer(ctx);
    if (!caller) return null;
    const rows: DesignRequest[] = [];
    for (const status of OPEN_STATUSES) {
      rows.push(
        ...(await ctx.db
          .query("designRequests")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(LIST_LIMIT))
      );
    }
    const named = await withRequesterNames(ctx, rows);
    return named
      .map((r) => ({ ...r, waitingSince: designWaitingSince(r) }))
      .sort((a, b) => a.waitingSince - b.waitingSince);
  },
});

export const archive = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    const caller = await queueViewer(ctx);
    if (!caller) return null;
    const rows = await ctx.db
      .query("designRequests")
      .withIndex("by_year_and_number", (q) => q.eq("year", args.year))
      .order("desc")
      .take(LIST_LIMIT);
    return await withRequesterNames(ctx, rows);
  },
});

export const earlierMine = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const result = await ctx.db
      .query("designRequests")
      .withIndex("by_requester_and_year", (q) =>
        q.eq("requesterEmail", caller.email).lt("year", caller.year)
      )
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: await withRequesterNames(ctx, result.page) };
  },
});

export const earlierArchive = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const caller = await queueViewer(ctx);
    if (!caller) return null;
    const result = await ctx.db
      .query("designRequests")
      .withIndex("by_year_and_number", (q) => q.lt("year", caller.year))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: await withRequesterNames(ctx, result.page) };
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const id = ctx.db.normalizeId("designRequests", args.id);
    const request = id ? await ctx.db.get("designRequests", id) : null;
    if (!request) return null;
    const access = await viewableAccess(ctx, caller, request);
    if (!access) return null;
    const open = isOpenDesignStatus(request.status);
    const nameOf = (email: string | undefined) =>
      email ? displayName(ctx, email, request.year) : Promise.resolve(null);
    return {
      request,
      requesterName: await nameOf(request.requesterEmail),
      decidedByName: await nameOf(request.decidedBy),
      completedByName: await nameOf(request.completedBy),
      can: {
        approve: access.canDecide && request.status === "PENDING",
        complete: access.canComplete && request.status === "APPROVED",
        edit: access.isRequester && open,
        cancel: access.isRequester && open,
        comment: access.canComment,
      },
    };
  },
});

export const timeline = query({
  args: { id: v.id("designRequests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get("designRequests", args.id);
    if (!request || !(await viewableAccess(ctx, caller, request))) return null;
    const events = await ctx.db
      .query("designRequestEvents")
      .withIndex("by_designRequest", (q) => q.eq("designRequestId", args.id))
      .order("desc")
      .take(EVENTS_LIMIT);
    return await Promise.all(
      events.map(async (event) => ({
        at: event._creationTime,
        action: event.action,
        actorName: await displayName(ctx, event.actorEmail, request.year),
        detail: event.detail ?? null,
      }))
    );
  },
});

function checkedAnswers(raw: DesignAnswers, previous?: DesignAnswers) {
  const answers = normalizeDesignAnswers(DESIGN_REQUEST_FIELDS, raw);
  const problem = designAnswersProblem(
    DESIGN_REQUEST_FIELDS,
    answers,
    sydneyToday(),
    previous
  );
  if (problem) throw new ConvexError(problem);
  return { answers, ...designRequestFiling(DESIGN_REQUEST_FIELDS, answers) };
}

export const submit = mutation({
  args: { answers: designAnswersValidator },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const filed = checkedAnswers(args.answers);
    const { email, year } = caller;
    const team = await designTeam(ctx, year);
    const head = await marketingHeadEmail(ctx, year);
    if (!head) {
      throw new ConvexError(
        `Design requests can't be submitted yet: ${year} has no Head for the ${team} department. Ask an admin to set one.`
      );
    }
    const autoApprove = head === email;
    const last = await ctx.db
      .query("designRequests")
      .withIndex("by_year_and_number", (q) => q.eq("year", year))
      .order("desc")
      .first();
    const now = Date.now();
    const id = await ctx.db.insert("designRequests", {
      year,
      number: (last?.number ?? 0) + 1,
      requesterEmail: email,
      submittedAt: now,
      ...filed,
      status: autoApprove ? "APPROVED" : "PENDING",
      ...(autoApprove ? { decidedAt: now, decidedBy: email } : {}),
    });
    await logEvent(ctx, id, email, "submitted");
    if (autoApprove) await logEvent(ctx, id, email, "auto-approved");

    const request = (await ctx.db.get("designRequests", id)) as DesignRequest;
    const name = designRequestName(request);
    const summary = await requestSummary(ctx, request);
    await tellRequester(ctx, request, {
      actor: email,
      subject: `${name} has been submitted`,
      pushTitle: "Design request submitted",
      body: autoApprove
        ? `It's approved, as you're the ${team} Head, and the ${team} team has been told.\n\n${summary}`
        : `It's been sent to the ${team} Head for approval. You'll be told when it moves on.\n\n${summary}`,
    });
    const heads = autoApprove
      ? []
      : await tellHeads(ctx, request, {
          actor: email,
          subject: `${name} needs your approval`,
          pushTitle: "Approval needed",
          body: `A new design request is waiting on your approval in THE SHED.\n\n${summary}`,
        });
    await tellTeam(ctx, request, {
      actor: email,
      subject: `New ${name.replace(/^Design/, "design")}`,
      pushTitle: "New design request",
      body: `${autoApprove ? `Approved by the ${team} Head.` : `Waiting on the ${team} Head's approval.`}\n\n${summary}`,
      skip: heads,
    });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("designRequests"), answers: designAnswersValidator },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const request = await requireRequest(ctx, args.id);
    if (request.requesterEmail !== email) {
      throw new ConvexError("You can only edit your own design requests.");
    }
    if (!isOpenDesignStatus(request.status)) {
      throw new ConvexError("This design request is closed, so it can't be edited.");
    }
    const filed = checkedAnswers(args.answers, request.answers);
    const changed = changedDesignAnswers(
      DESIGN_REQUEST_FIELDS,
      request.answers,
      filed.answers
    );
    if (changed.length === 0) return null;

    await ctx.db.patch("designRequests", request._id, {
      ...filed,
      editedAt: Date.now(),
    });
    await logEvent(ctx, request._id, email, "edited", changed.join(", "));

    const updated = (await ctx.db.get("designRequests", request._id)) as DesignRequest;
    const name = designRequestName(updated);
    const summary = await requestSummary(ctx, updated);
    const body = `The requester changed: ${changed.join(", ")}.\n\n${summary}`;
    const heads =
      updated.status === "PENDING"
        ? await tellHeads(ctx, updated, {
            actor: email,
            subject: `${name} was edited`,
            pushTitle: "Design request edited",
            body: `It's still waiting on your approval. ${body}`,
          })
        : [];
    await tellTeam(ctx, updated, {
      actor: email,
      subject: `${name} was edited`,
      pushTitle: "Design request edited",
      body,
      skip: heads,
    });
    return null;
  },
});

async function authorizeDecision(
  ctx: MutationCtx,
  caller: CallerContext,
  id: Id<"designRequests">
) {
  const request = await requireRequest(ctx, id);
  const access = await accessTo(ctx, caller, request);
  if (!access.canDecide) {
    throw new ConvexError(
      access.isRequester
        ? "You can't approve or decline your own design request."
        : `Only the ${await designTeam(ctx, request.year)} Head can approve or decline design requests.`
    );
  }
  if (request.status !== "PENDING") {
    throw new ConvexError("This design request isn't waiting for approval.");
  }
  return request;
}

export const approve = mutation({
  args: { id: v.id("designRequests") },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const request = await authorizeDecision(ctx, caller, args.id);
    await ctx.db.patch("designRequests", request._id, {
      status: "APPROVED",
      decidedAt: Date.now(),
      decidedBy: caller.email,
    });
    await logEvent(ctx, request._id, caller.email, "approved");
    const name = designRequestName(request);
    const summary = await requestSummary(ctx, request);
    const approver = await displayName(ctx, caller.email, request.year);
    await tellRequester(ctx, request, {
      actor: caller.email,
      subject: `${name} has been approved`,
      pushTitle: "Design request approved",
      body: `${approver} approved it, and the ${await designTeam(ctx, request.year)} team has been told.\n\n${summary}`,
    });
    await tellTeam(ctx, request, {
      actor: caller.email,
      subject: `${name} has been approved`,
      pushTitle: "Design request approved",
      body: `Approved by ${approver}; it's ready to work on.\n\n${summary}`,
    });
    return null;
  },
});

export const decline = mutation({
  args: { id: v.id("designRequests"), reason: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const reason = args.reason.trim();
    if (!reason) {
      throw new ConvexError(
        "Please give a reason for declining. The requester will be told it."
      );
    }
    if (reason.length > MAX_ANSWER_LENGTH) {
      throw new ConvexError(`The reason can be at most ${MAX_ANSWER_LENGTH} characters.`);
    }
    const request = await authorizeDecision(ctx, caller, args.id);
    await ctx.db.patch("designRequests", request._id, {
      status: "DECLINED",
      decidedAt: Date.now(),
      decidedBy: caller.email,
      declineReason: reason,
    });
    await logEvent(ctx, request._id, caller.email, "declined", reason);
    const name = designRequestName(request);
    const summary = await requestSummary(ctx, request);
    const decliner = await displayName(ctx, caller.email, request.year);
    await tellRequester(ctx, request, {
      actor: caller.email,
      subject: `${name} has been declined`,
      pushTitle: "Design request declined",
      body: `${decliner} declined it.\nReason: ${reason}\n\n${summary}`,
    });
    await tellTeam(ctx, request, {
      actor: caller.email,
      subject: `${name} was declined`,
      pushTitle: "Design request declined",
      body: `Declined by ${decliner}.\nReason: ${reason}\n\n${summary}`,
    });
    return null;
  },
});

export const complete = mutation({
  args: { id: v.id("designRequests"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const request = await requireRequest(ctx, args.id);
    if (!(await accessTo(ctx, caller, request)).canComplete) {
      throw new ConvexError(
        `Only the ${await designTeam(ctx, request.year)} team can mark design requests complete.`
      );
    }
    if (request.status !== "APPROVED") {
      throw new ConvexError("Only an approved design request can be marked complete.");
    }
    const note = args.note?.trim() || undefined;
    if (note && note.length > MAX_ANSWER_LENGTH) {
      throw new ConvexError(`The note can be at most ${MAX_ANSWER_LENGTH} characters.`);
    }
    await ctx.db.patch("designRequests", request._id, {
      status: "COMPLETED",
      completedAt: Date.now(),
      completedBy: caller.email,
      completionNote: note,
    });
    await logEvent(ctx, request._id, caller.email, "completed", note);
    const name = designRequestName(request);
    const summary = await requestSummary(ctx, request);
    const completer = await displayName(ctx, caller.email, request.year);
    const noteLine = note ? `\nNote: ${note}` : "";
    await tellRequester(ctx, request, {
      actor: caller.email,
      subject: `${name} is complete`,
      pushTitle: "Design request complete",
      body: `${completer} marked it complete.${noteLine}\n\n${summary}`,
    });
    await tellTeam(ctx, request, {
      actor: caller.email,
      subject: `${name} is complete`,
      pushTitle: "Design request complete",
      body: `Marked complete by ${completer}.${noteLine}\n\n${summary}`,
    });
    return null;
  },
});

export const cancel = mutation({
  args: { id: v.id("designRequests") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const request = await requireRequest(ctx, args.id);
    if (request.requesterEmail !== email) {
      throw new ConvexError("You can only cancel your own design requests.");
    }
    if (!isOpenDesignStatus(request.status)) {
      throw new ConvexError("This design request is already closed.");
    }
    await ctx.db.patch("designRequests", request._id, {
      status: "CANCELLED",
      cancelledAt: Date.now(),
    });
    await logEvent(ctx, request._id, email, "cancelled");
    const name = designRequestName(request);
    const summary = await requestSummary(ctx, request);
    const body = `The requester cancelled it; no further work is needed.\n\n${summary}`;
    const heads =
      request.status === "PENDING"
        ? await tellHeads(ctx, request, {
            actor: email,
            subject: `${name} was cancelled`,
            pushTitle: "Design request cancelled",
            body,
          })
        : [];
    await tellTeam(ctx, request, {
      actor: email,
      subject: `${name} was cancelled`,
      pushTitle: "Design request cancelled",
      body,
      skip: heads,
    });
    return null;
  },
});
