import { ConvexError, v } from "convex/values";
import {
  APPROVED,
  currentStep,
  DECLINED,
  DIRECTOR,
  DIRECTOR_APPROVAL_THRESHOLD,
  FINANCE,
  HEAD_OF_DIVISION,
  PENDING,
  requestCompleted,
  requestDeclined,
  requestFullyApproved,
  STEP_LABELS,
  type ApprovalStatus,
} from "../shared/flow";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import {
  getApprovers,
  getDepartment,
  getDivision,
  getProfile,
  optionalProfile,
  requireProfile,
  rolesOf,
  type Approvers,
  type CallerContext,
} from "./model";

const STEP_FIELDS = {
  hod: "approvedByHOD",
  budgetManager: "approvedByBudgetManager",
  director: "approvedByDirector",
  financeHead: "approvedByFinanceHead",
} as const;

type Step = keyof typeof STEP_FIELDS;

const stepValidator = v.union(
  v.literal("hod"),
  v.literal("budgetManager"),
  v.literal("director"),
  v.literal("financeHead")
);

const requestSummary = (r: Doc<"requests">) =>
  `Requester: ${r.requesterEmail}\nDepartment: ${r.department}\nAmount: $${r.amount}\nDescription: ${r.description}`;

/** Appends an immutable audit event (timestamp = _creationTime). */
const logEvent = async (
  ctx: MutationCtx,
  requestId: Id<"requests">,
  actorEmail: string,
  action: string,
  step?: Step,
  detail?: string
) => {
  await ctx.db.insert("requestEvents", {
    requestId,
    action,
    step,
    actorEmail,
    detail,
  });
};

/** The hosted app, for links in emails (universal links open the native app). */
export const appUrl = (path?: string) =>
  `${process.env.APP_URL ?? "https://the-shed-web.vercel.app"}${path ?? ""}`;

/**
 * Notifies a person about a request update by email AND push notification.
 * `url` is the in-app route: pushes deep-link to it, emails get it appended
 * as an HTTPS link into the hosted app.
 */
const notify = async (
  ctx: MutationCtx,
  to: string | undefined,
  subject: string,
  body: string,
  url?: string
) => {
  if (!to) return;
  await ctx.scheduler.runAfter(0, internal.emails.send, {
    to,
    subject,
    body: `${body}\n\nOpen in THE SHED: ${appUrl(url)}`,
  });
  // Push body: just the lead line; the email carries the full details.
  await ctx.scheduler.runAfter(0, internal.push.send, {
    to,
    title: subject,
    body: body.split("\n")[0],
    url,
  });
};

/**
 * The approver emails attached to steps of this request whose status is in
 * `statuses` — the "relevant people" for chain-wide notifications. Excludes
 * the requester (their own steps were auto-approved). Exported for tests.
 */
export const involvedApproverEmails = (
  request: Doc<"requests">,
  approvers: Approvers,
  statuses: ApprovalStatus[]
): string[] => {
  const steps: [Step, ApprovalStatus | undefined, string | undefined][] = [
    ["hod", request.approvedByHOD, approvers.hodEmail],
    ["budgetManager", request.approvedByBudgetManager, approvers.budgetManagerEmail],
    ["director", request.approvedByDirector, approvers.directorEmail],
    ["financeHead", request.approvedByFinanceHead, approvers.financeHeadEmail],
  ];
  const emails: string[] = [];
  for (const [step, status, email] of steps) {
    if (status === undefined) continue; // no Director step on this request
    if (step === "hod" && request.department === FINANCE) continue;
    if (email && statuses.includes(status)) emails.push(email);
  }
  return [...new Set(emails)].filter((e) => e !== request.requesterEmail);
};

/**
 * Who to notify for a request's pending step: the approver of the request's
 * own year, falling back to the current year's officeholder when that person
 * is gone (carried-over requests). Exported for tests.
 */
export const nextApproverEmail = (
  request: Doc<"requests">,
  approvers: Approvers,
  fallback?: Approvers
): string | undefined => {
  const step = currentStep(request);
  if (step === null) return undefined;
  const selectors: Record<Step, (a: Approvers) => string | undefined> = {
    hod: (a) => a.hodEmail,
    budgetManager: (a) => a.budgetManagerEmail,
    director: (a) => a.directorEmail,
    financeHead: (a) => a.financeHeadEmail,
  };
  return selectors[step](approvers) ?? (fallback ? selectors[step](fallback) : undefined);
};

/**
 * Emails whoever the request now waits on; when fully approved, tells the
 * requester to submit their receipt and the approver chain that it cleared.
 */
const notifyNextActor = async (
  ctx: MutationCtx,
  request: Doc<"requests">,
  approvers: Approvers,
  fallback?: Approvers
) => {
  const step = currentStep(request);
  if (step !== null) {
    const approverEmail = nextApproverEmail(request, approvers, fallback);
    await notify(
      ctx,
      approverEmail,
      `A reimbursement request of $${request.amount} needs your ${STEP_LABELS[step]} approval`,
      `The request below is waiting on your approval in THE SHED.\n\n${requestSummary(request)}`,
      "/review"
    );
  } else if (requestFullyApproved(request)) {
    await notify(
      ctx,
      request.requesterEmail,
      `Your reimbursement request of $${request.amount} has been approved`,
      `Your request has been fully approved. Please open THE SHED and submit your receipt/invoice details.\n\n${requestSummary(request)}`,
      `/request/${request._id}`
    );
    // The whole approver chain hears that the request cleared.
    for (const email of involvedApproverEmails(request, approvers, [APPROVED])) {
      await notify(
        ctx,
        email,
        `The $${request.amount} request by ${request.requesterEmail} is fully approved`,
        `Every step has approved this request; the requester has been asked for their receipt.\n\n${requestSummary(request)}`,
        `/request/${request._id}`
      );
    }
  }
};

/**
 * Submit a new reimbursement request for the caller's own department.
 * Steps the submitter would review themselves are auto-approved so a request
 * can never deadlock waiting on its own submitter (see REQUESTS_FLOW.md).
 */
export const submit = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    // Requests can be submitted on behalf of any existing department;
    // defaults to the submitter's own (or, for Heads of Division, the first
    // department under their division).
    department: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { email, year, profile } = await requireProfile(ctx);
    if (!(args.amount > 0)) {
      throw new ConvexError("Amount must be a positive number.");
    }
    if (args.description.trim() === "") {
      throw new ConvexError("Please describe what the request is for.");
    }

    const roles = rolesOf(profile);
    const isDivisionHead = roles.includes(HEAD_OF_DIVISION);

    let department = args.department?.trim() || profile.department;
    if (!department && profile.division) {
      const yearDepartments = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", year))
        .take(200);
      department = yearDepartments.find(
        (d) => d.division === profile.division
      )?.name;
    }
    if (!department) {
      throw new ConvexError("Pick a department for this request.");
    }
    const departmentDoc = await getDepartment(ctx, year, department);
    if (!departmentDoc) {
      throw new ConvexError(`Department "${department}" doesn't exist in ${year}.`);
    }

    const approvers = await getApprovers(ctx, year, department);
    const needsDirector = args.amount >= DIRECTOR_APPROVAL_THRESHOLD;

    let approvedByHOD: ApprovalStatus = PENDING;
    let approvedByBudgetManager: ApprovalStatus = PENDING;
    let approvedByDirector: ApprovalStatus | undefined = needsDirector
      ? PENDING
      : undefined;
    let approvedByFinanceHead: ApprovalStatus = PENDING;

    // The Finance department has no separate HOD step.
    if (department === FINANCE) approvedByHOD = APPROVED;
    // No HOD step when the submitter is this department's head, the
    // Director, or the head of the division this department belongs to
    // (named on the division itself, or via their own profile).
    const divisionDoc = await getDivision(ctx, year, departmentDoc.division);
    if (
      approvers.hodEmail === email ||
      roles.includes(DIRECTOR) ||
      divisionDoc?.headEmail === email ||
      (isDivisionHead && departmentDoc.division === profile.division)
    ) {
      approvedByHOD = APPROVED;
    }
    // The Budget Manager never reviews their own request.
    if (approvers.budgetManagerEmail === email) approvedByBudgetManager = APPROVED;
    // Nor does a Director review their own >= $5000 request.
    if (needsDirector && roles.includes(DIRECTOR)) {
      approvedByDirector = APPROVED;
    }
    // The Finance Head's own requests skip HOD, Budget Manager and Finance Head.
    if (approvers.financeHeadEmail === email) {
      approvedByHOD = APPROVED;
      approvedByBudgetManager = APPROVED;
      approvedByFinanceHead = APPROVED;
    }

    // Refuse to create a request that would deadlock: every step that is
    // still pending must have someone able to approve it.
    const missing: string[] = [];
    if (approvedByHOD === PENDING && !approvers.hodEmail) {
      missing.push(`Head for the ${department} department`);
    }
    if (approvedByBudgetManager === PENDING && !approvers.budgetManagerEmail) {
      missing.push("Budget Manager");
    }
    if (approvedByDirector === PENDING && !approvers.directorEmail) {
      missing.push("Director");
    }
    if (approvedByFinanceHead === PENDING && !approvers.financeHeadEmail) {
      missing.push(`Head for the ${FINANCE} department`);
    }
    if (missing.length > 0) {
      throw new ConvexError(
        `This request can't be submitted yet — ${year} has no ${missing.join(
          ", no "
        )}. Ask an admin to complete the organisation setup.`
      );
    }

    const id = await ctx.db.insert("requests", {
      year,
      requesterEmail: email,
      department,
      description: args.description.trim(),
      amount: args.amount,
      approvedByHOD,
      approvedByBudgetManager,
      approvedByDirector,
      approvedByFinanceHead,
    });

    await logEvent(ctx, id, email, "submitted");
    const autoApproved: [Step, ApprovalStatus | undefined][] = [
      ["hod", approvedByHOD],
      ["budgetManager", approvedByBudgetManager],
      ["director", approvedByDirector],
      ["financeHead", approvedByFinanceHead],
    ];
    for (const [step, status] of autoApproved) {
      if (status === APPROVED) {
        await logEvent(ctx, id, email, "auto-approved", step);
      }
    }

    const request = await ctx.db.get("requests", id);
    if (request) {
      await notify(
        ctx,
        email,
        `Your reimbursement request of $${request.amount} has been submitted`,
        `Your request has been submitted and sent for approval. You'll be emailed once it's fully approved.\n\n${requestSummary(request)}`,
        `/request/${id}`
      );
      await notifyNextActor(ctx, request, approvers);
    }
    return id;
  },
});

const yearRequests = async (ctx: QueryCtx | MutationCtx, year: number) =>
  await ctx.db
    .query("requests")
    .withIndex("by_year", (q) => q.eq("year", year))
    .order("desc")
    .take(500);

/**
 * The current year's requests plus the previous year's still-incomplete ones,
 * so in-flight requests survive the September 1 rollover instead of being
 * orphaned. (Also used by the stale-request reminder cron.)
 */
export const openRequestsAcrossYears = async (
  ctx: QueryCtx | MutationCtx,
  year: number
) => {
  const current = await yearRequests(ctx, year);
  const carriedOver = (await yearRequests(ctx, year - 1)).filter(
    (r) => !requestCompleted(r)
  );
  return [...current, ...carriedOver];
};

/** Resolves approvers per (year, department), cached for a single query. */
const makeApproverResolver = (ctx: QueryCtx) => {
  const cache = new Map<string, Promise<Approvers>>();
  return (year: number, department: string): Promise<Approvers> => {
    const key = `${year}:${department}`;
    let cached = cache.get(key);
    if (!cached) {
      cached = getApprovers(ctx, year, department);
      cache.set(key, cached);
    }
    return cached;
  };
};

/**
 * The caller's own requests: everything from the current staff year plus any
 * still-incomplete requests carried over from the previous year.
 */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null; // auth still attaching, or unprovisioned
    const { email, year } = caller;
    const fetch = (y: number) =>
      ctx.db
        .query("requests")
        .withIndex("by_year_and_requester", (q) =>
          q.eq("year", y).eq("requesterEmail", email)
        )
        .order("desc")
        .take(200);
    const current = await fetch(year);
    const carriedOver = (await fetch(year - 1)).filter((r) => !requestCompleted(r));
    return [...current, ...carriedOver].sort(
      (a, b) => b._creationTime - a._creationTime
    );
  },
});

/**
 * Everything the caller can currently act on, grouped by the capacity they
 * act in. Each request is matched against the approvers OF ITS OWN YEAR, so
 * carried-over requests stay actionable by the people who held the role then.
 */
export const toReview = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const { email, year } = caller;
    const open = await openRequestsAcrossYears(ctx, year);
    const approversFor = makeApproverResolver(ctx);
    // The caller's roles in a given year (Director gating is per-year too).
    const rolesByYear = new Map<number, string[]>();
    const callerRolesIn = async (y: number) => {
      if (!rolesByYear.has(y)) {
        const profileForYear = await getProfile(ctx, email, y);
        rolesByYear.set(y, profileForYear ? rolesOf(profileForYear) : []);
      }
      return rolesByYear.get(y)!;
    };

    const hod: Doc<"requests">[] = [];
    const budgetManager: Doc<"requests">[] = [];
    const director: Doc<"requests">[] = [];
    const financeHead: Doc<"requests">[] = [];
    const readyToPay: Doc<"requests">[] = [];

    for (const request of open) {
      // Carried-over requests can be actioned by the approvers of the
      // request's own year AND this year's officeholders, so a departed
      // approver never strands a leftover request.
      const requestYear = await approversFor(request.year, request.department);
      const thisYear =
        request.year === year
          ? requestYear
          : await approversFor(year, request.department);
      const matches = (pick: (a: Approvers) => string | undefined) =>
        pick(requestYear) === email || pick(thisYear) === email;

      // Ready to Pay includes the Finance Head's own requests.
      if (
        request.receipt !== undefined &&
        request.paid === false &&
        matches((a) => a.financeHeadEmail)
      ) {
        readyToPay.push(request);
      }

      if (request.requesterEmail === email || requestCompleted(request)) continue;
      const step = currentStep(request);
      if (step === "hod" && matches((a) => a.hodEmail) && request.department !== FINANCE) {
        hod.push(request);
      } else if (step === "budgetManager" && matches((a) => a.budgetManagerEmail)) {
        budgetManager.push(request);
      } else if (
        step === "director" &&
        ((await callerRolesIn(request.year)).includes(DIRECTOR) ||
          (await callerRolesIn(year)).includes(DIRECTOR))
      ) {
        director.push(request);
      } else if (step === "financeHead" && matches((a) => a.financeHeadEmail)) {
        financeHead.push(request);
      }
    }

    return { hod, budgetManager, director, financeHead, readyToPay };
  },
});

/**
 * All requests across the organisation — Finance staff only. Includes the
 * previous year's still-incomplete requests.
 */
export const allRequests = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    if (caller.profile.department !== FINANCE) {
      throw new ConvexError("Only Finance staff can view all requests.");
    }
    return await openRequestsAcrossYears(ctx, caller.year);
  },
});

/**
 * Validates the caller is the approver for `step` on this request, that all
 * prior steps are approved and this one is pending. Returns the request.
 */
async function authorizeStep(
  ctx: MutationCtx,
  caller: CallerContext,
  requestId: Id<"requests">,
  step: Step
): Promise<{
  request: Doc<"requests">;
  approvers: Approvers;
  currentApprovers: Approvers;
}> {
  const request = await ctx.db.get("requests", requestId);
  // Current-year requests plus incomplete carry-overs from last year.
  if (
    !request ||
    (request.year !== caller.year && request.year !== caller.year - 1)
  ) {
    throw new ConvexError("Request not found.");
  }
  if (requestDeclined(request)) {
    throw new ConvexError("This request has been declined and is closed.");
  }
  if (request.requesterEmail === caller.email) {
    throw new ConvexError("You can't review your own request.");
  }
  // Approvers come from the REQUEST's year; for carried-over requests the
  // current year's officeholders may act too (a departed approver must never
  // strand a leftover request).
  const approvers = await getApprovers(ctx, request.year, request.department);
  const currentApprovers =
    request.year === caller.year
      ? approvers
      : await getApprovers(ctx, caller.year, request.department);
  const matches = (pick: (a: Approvers) => string | undefined) =>
    pick(approvers) === caller.email || pick(currentApprovers) === caller.email;
  const requestYearProfile =
    request.year === caller.year
      ? caller.profile
      : await getProfile(ctx, caller.email, request.year);
  const isDirector =
    rolesOf(caller.profile).includes(DIRECTOR) ||
    (requestYearProfile !== null &&
      rolesOf(requestYearProfile).includes(DIRECTOR));

  const stepChecks: Record<Step, { allowed: boolean; ready: boolean }> = {
    hod: {
      allowed: matches((a) => a.hodEmail) && request.department !== FINANCE,
      ready: request.approvedByHOD === PENDING,
    },
    budgetManager: {
      allowed: matches((a) => a.budgetManagerEmail),
      ready:
        request.approvedByHOD === APPROVED &&
        request.approvedByBudgetManager === PENDING,
    },
    director: {
      allowed: isDirector,
      ready:
        request.approvedByHOD === APPROVED &&
        request.approvedByBudgetManager === APPROVED &&
        request.approvedByDirector === PENDING,
    },
    financeHead: {
      allowed: matches((a) => a.financeHeadEmail),
      ready:
        request.approvedByHOD === APPROVED &&
        request.approvedByBudgetManager === APPROVED &&
        (request.approvedByDirector === undefined ||
          request.approvedByDirector === APPROVED) &&
        request.approvedByFinanceHead === PENDING,
    },
  };

  const check = stepChecks[step];
  if (!check.allowed) {
    throw new ConvexError("You are not the approver for this step.");
  }
  if (!check.ready) {
    throw new ConvexError("This request is not waiting on that step.");
  }
  return { request, approvers, currentApprovers };
}

export const approve = mutation({
  args: { requestId: v.id("requests"), step: stepValidator },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const { request, approvers, currentApprovers } = await authorizeStep(
      ctx,
      caller,
      args.requestId,
      args.step
    );

    const updated = { ...request, [STEP_FIELDS[args.step]]: APPROVED };
    await ctx.db.patch("requests", args.requestId, {
      [STEP_FIELDS[args.step]]: APPROVED,
      ...(requestFullyApproved(updated) ? { approvedTime: Date.now() } : {}),
    });
    await logEvent(ctx, args.requestId, caller.email, "approved", args.step);
    // Tell the next approver (or the requester, once fully approved).
    await notifyNextActor(ctx, updated, approvers, currentApprovers);
    return null;
  },
});

export const decline = mutation({
  args: {
    requestId: v.id("requests"),
    step: stepValidator,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const reason = args.reason.trim();
    if (!reason) {
      throw new ConvexError("Please give a reason for declining — the requester will be notified with it.");
    }
    const { request, approvers } = await authorizeStep(
      ctx,
      caller,
      args.requestId,
      args.step
    );
    await ctx.db.patch("requests", args.requestId, {
      [STEP_FIELDS[args.step]]: DECLINED,
      declineReason: reason,
      declinedTime: Date.now(),
    });
    await logEvent(ctx, args.requestId, caller.email, "declined", args.step, reason);
    await notify(
      ctx,
      request.requesterEmail,
      `Your reimbursement request of $${request.amount} has been declined`,
      `Your request was declined at the ${STEP_LABELS[args.step]} step by ${caller.email}.\nReason: ${reason}\n\n${requestSummary(request)}`,
      `/request/${request._id}`
    );
    // Approvers who had already approved hear that it was declined downstream.
    for (const email of involvedApproverEmails(request, approvers, [APPROVED])) {
      if (email === caller.email) continue;
      await notify(
        ctx,
        email,
        `The $${request.amount} request by ${request.requesterEmail} was declined`,
        `Declined at the ${STEP_LABELS[args.step]} step by ${caller.email}.\nReason: ${reason}\n\n${requestSummary(request)}`,
        `/request/${request._id}`
      );
    }
    return null;
  },
});

/** The requester can cancel while the request is not paid and not declined. */
export const cancel = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const request = await ctx.db.get("requests", args.requestId);
    if (!request || request.requesterEmail !== email) {
      throw new ConvexError("You can only cancel your own requests.");
    }
    if (requestCompleted(request)) {
      throw new ConvexError("Completed requests can't be cancelled.");
    }
    // Per REQUESTS_FLOW.md, everyone involved hears about the cancellation:
    // approvers who already approved, plus whoever it is waiting on now.
    const approvers = await getApprovers(ctx, request.year, request.department);
    const recipients = new Set(
      involvedApproverEmails(request, approvers, [APPROVED])
    );
    const step = currentStep(request);
    if (step !== null) {
      const pendingApprover = {
        hod: approvers.hodEmail,
        budgetManager: approvers.budgetManagerEmail,
        director: approvers.directorEmail,
        financeHead: approvers.financeHeadEmail,
      }[step];
      if (pendingApprover && pendingApprover !== email) {
        recipients.add(pendingApprover);
      }
    }
    for (const recipient of recipients) {
      await notify(
        ctx,
        recipient,
        `The $${request.amount} request by ${request.requesterEmail} has been cancelled`,
        `The requester cancelled this request; no further action is needed.\n\n${requestSummary(request)}`
      );
    }
    // The request is gone, so its audit events go with it.
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(200);
    for (const event of events) {
      await ctx.db.delete("requestEvents", event._id);
    }
    await ctx.db.delete("requests", args.requestId);
    return null;
  },
});

/** A single request, for the detail screen push notifications land on. */
export const get = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) return null;
    return await ctx.db.get("requests", args.requestId);
  },
});

/**
 * The audit trail for a request: who actioned each step, when, and any
 * detail (decline reason, amounts). Visible to any signed-in staff member.
 */
export const auditTrail = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(200);
    return events.map((event) => ({
      at: event._creationTime,
      action: event.action,
      step: event.step ?? null,
      actor: event.actorEmail,
      detail: event.detail ?? null,
    }));
  },
});

/**
 * Info about a single approval step: who owns it, their name, and any
 * audit events recorded for that step (approved / declined / auto-approved).
 */
export const stepInfo = query({
  args: { requestId: v.id("requests"), step: stepValidator },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;
    const approvers = await getApprovers(ctx, request.year, request.department);
    const emailMap: Record<string, string | undefined> = {
      hod: approvers.hodEmail,
      budgetManager: approvers.budgetManagerEmail,
      director: approvers.directorEmail,
      financeHead: approvers.financeHeadEmail,
    };
    const email = emailMap[args.step] ?? null;
    let name: string | null = null;
    if (email) {
      const profile = await getProfile(ctx, email, request.year);
      name = profile?.name ?? null;
      if (!name) {
        const dirUser = await ctx.db
          .query("directoryUsers")
          .withIndex("by_email", (q) => q.eq("email", email))
          .unique();
        name = dirUser?.name ?? null;
      }
    }
    const allEvents = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(200);
    const events = allEvents
      .filter((e) => e.step === args.step)
      .map((e) => ({ at: e._creationTime, action: e.action, detail: e.detail ?? null }));
    return { email, name, events };
  },
});

/** Upload URL for receipt/invoice files (one file per generated URL). */
export const generateReceiptUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * The requester submits receipt details once fully approved: one or more
 * recipients, each with account details, an amount and any number of
 * receipt/invoice file attachments.
 */
export const submitReceipt = mutation({
  args: {
    requestId: v.id("requests"),
    recipients: v.array(
      v.object({
        accountName: v.string(),
        bsb: v.string(),
        accountNumber: v.string(),
        amount: v.number(),
        attachments: v.optional(
          v.array(
            v.object({
              storageId: v.id("_storage"),
              name: v.string(),
            })
          )
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const request = await ctx.db.get("requests", args.requestId);
    if (!request || request.requesterEmail !== email) {
      throw new ConvexError("You can only submit receipts for your own requests.");
    }
    if (!requestFullyApproved(request)) {
      throw new ConvexError("The request must be fully approved first.");
    }
    if (request.receipt !== undefined) {
      throw new ConvexError("A receipt has already been submitted.");
    }
    if (args.recipients.length === 0) {
      throw new ConvexError("Add at least one recipient.");
    }
    for (const recipient of args.recipients) {
      if (!recipient.accountName.trim()) {
        throw new ConvexError("Every recipient needs an account name.");
      }
      if (!/^\d+$/.test(recipient.bsb) || !/^\d+$/.test(recipient.accountNumber)) {
        throw new ConvexError("BSB and account number must be digits only.");
      }
    }
    if (args.recipients.some((r) => !(r.amount > 0))) {
      throw new ConvexError("Every recipient amount must be a positive number.");
    }
    if (!args.recipients.some((r) => (r.attachments ?? []).length > 0)) {
      throw new ConvexError("Attach at least one receipt file.");
    }
    const totalAmount = args.recipients.reduce((sum, r) => sum + r.amount, 0);
    await ctx.db.patch("requests", args.requestId, {
      receipt: { totalAmount, recipients: args.recipients },
      paid: false,
    });
    await logEvent(
      ctx,
      args.requestId,
      email,
      "receipt-submitted",
      undefined,
      `$${totalAmount}, ${args.recipients.length} recipient${args.recipients.length === 1 ? "" : "s"}`
    );
    const approvers = await getApprovers(ctx, request.year, FINANCE);
    await notify(
      ctx,
      approvers.financeHeadEmail,
      `A receipt for $${totalAmount} is ready to pay`,
      `${request.requesterEmail} submitted their receipt (total $${totalAmount}). Please pay the reimbursement in THE SHED.\n\n${requestSummary(request)}`,
      "/review"
    );
    return null;
  },
});

/**
 * Signed URLs for a request's receipt attachments, grouped per recipient.
 * Visible to the requester, Finance staff, and the Finance Head of the
 * request's or current year.
 */
export const receiptAttachments = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;

    const requestYearFinance = await getApprovers(ctx, request.year, FINANCE);
    const currentFinance =
      request.year === caller.year
        ? requestYearFinance
        : await getApprovers(ctx, caller.year, FINANCE);
    // Null (not a throw): this backs an inline section on request cards,
    // and an unauthorised viewer should just not see the files.
    const allowed =
      request.requesterEmail === caller.email ||
      caller.profile.department === FINANCE ||
      requestYearFinance.financeHeadEmail === caller.email ||
      currentFinance.financeHeadEmail === caller.email;
    if (!allowed) return null;

    if (!request.receipt) return [];
    return await Promise.all(
      request.receipt.recipients.map(async (recipient) => ({
        accountName: recipient.accountName,
        attachments: await Promise.all(
          (recipient.attachments ?? []).map(async (attachment) => ({
            name: attachment.name,
            url: await ctx.storage.getUrl(attachment.storageId),
          }))
        ),
      }))
    );
  },
});

/** The Finance Head pays a receipt-submitted reimbursement. */
export const pay = mutation({
  args: {
    requestId: v.id("requests"),
    paidAmount: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    if (!(args.paidAmount > 0)) {
      throw new ConvexError("The paid amount must be a positive number.");
    }
    const request = await ctx.db.get("requests", args.requestId);
    if (
      !request ||
      (request.year !== caller.year && request.year !== caller.year - 1)
    ) {
      throw new ConvexError("Request not found.");
    }
    // The Finance Head of the request's year OR the current one pays it.
    const approvers = await getApprovers(ctx, request.year, FINANCE);
    const currentApprovers =
      request.year === caller.year
        ? approvers
        : await getApprovers(ctx, caller.year, FINANCE);
    if (
      approvers.financeHeadEmail !== caller.email &&
      currentApprovers.financeHeadEmail !== caller.email
    ) {
      throw new ConvexError("Only the Finance Head can pay reimbursements.");
    }
    if (request.receipt === undefined || request.paid !== false) {
      throw new ConvexError("This request is not awaiting payment.");
    }
    await ctx.db.patch("requests", args.requestId, {
      paid: true,
      paidAmount: args.paidAmount,
      payComment: args.comment?.trim() || undefined,
      paidTime: Date.now(),
    });
    await logEvent(ctx, args.requestId, caller.email, "paid", undefined, `$${args.paidAmount}`);
    await notify(
      ctx,
      request.requesterEmail,
      `Your reimbursement of $${args.paidAmount} has been paid`,
      `The Finance Head (${caller.email}) has paid your reimbursement.\nPaid: $${args.paidAmount}${args.comment ? `\nComment: ${args.comment}` : ""}\n\n${requestSummary(request)}`,
      `/request/${request._id}`
    );
    // The Budget Manager should know when the paid amount differs.
    if (args.paidAmount !== request.amount) {
      const yearApprovers = await getApprovers(ctx, request.year, request.department);
      await notify(
        ctx,
        yearApprovers.budgetManagerEmail,
        `Paid amount differs from requested amount ($${args.paidAmount} vs $${request.amount})`,
        `Please update the budget accordingly.\n\n${requestSummary(request)}`,
        `/request/${request._id}`
      );
    }
    return null;
  },
});
