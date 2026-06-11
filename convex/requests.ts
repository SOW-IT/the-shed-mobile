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
  getProfile,
  requireProfile,
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

/** Notifies a person about a request update by email AND push notification. */
const notify = async (
  ctx: MutationCtx,
  to: string | undefined,
  subject: string,
  body: string
) => {
  if (!to) return;
  await ctx.scheduler.runAfter(0, internal.emails.send, { to, subject, body });
  // Push body: just the lead line; the email carries the full details.
  await ctx.scheduler.runAfter(0, internal.push.send, {
    to,
    title: subject,
    body: body.split("\n")[0],
  });
};

/**
 * Emails whoever the request now waits on; when fully approved, tells the
 * requester to submit their receipt.
 */
const notifyNextActor = async (
  ctx: MutationCtx,
  request: Doc<"requests">,
  approvers: Approvers
) => {
  const step = currentStep(request);
  if (step !== null) {
    const approverEmail = {
      hod: approvers.hodEmail,
      budgetManager: approvers.budgetManagerEmail,
      director: approvers.directorEmail,
      financeHead: approvers.financeHeadEmail,
    }[step];
    await notify(
      ctx,
      approverEmail,
      `A reimbursement request of $${request.amount} needs your ${STEP_LABELS[step]} approval`,
      `The request below is waiting on your approval in THE SHED.\n\n${requestSummary(request)}`
    );
  } else if (requestFullyApproved(request)) {
    await notify(
      ctx,
      request.requesterEmail,
      `Your reimbursement request of $${request.amount} has been approved`,
      `Your request has been fully approved. Please open THE SHED and submit your receipt/invoice details.\n\n${requestSummary(request)}`
    );
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
  },
  handler: async (ctx, args) => {
    const { email, year, profile } = await requireProfile(ctx);
    if (!(args.amount > 0)) {
      throw new ConvexError("Amount must be a positive number.");
    }
    if (args.description.trim() === "") {
      throw new ConvexError("Please describe what the request is for.");
    }

    // Heads of Division belong to a division, not a department: their
    // requests are filed under the division and have no HOD above them.
    const isDivisionHead = profile.role === HEAD_OF_DIVISION;
    const department = profile.department ?? profile.division;
    if (!department) {
      throw new ConvexError("Your profile has no department or division.");
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
    // HODs, Heads of Division and the Director have no HOD above them.
    if (approvers.hodEmail === email || profile.role === DIRECTOR || isDivisionHead) {
      approvedByHOD = APPROVED;
    }
    // The Budget Manager never reviews their own request.
    if (approvers.budgetManagerEmail === email) approvedByBudgetManager = APPROVED;
    // Nor does the Director review their own >= $5000 request.
    if (needsDirector && approvers.directorEmail === email) {
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

    const request = await ctx.db.get("requests", id);
    if (request) {
      await notify(
        ctx,
        email,
        `Your reimbursement request of $${request.amount} has been submitted`,
        `Your request has been submitted and sent for approval. You'll be emailed once it's fully approved.\n\n${requestSummary(request)}`
      );
      await notifyNextActor(ctx, request, approvers);
    }
    return id;
  },
});

const yearRequests = async (ctx: QueryCtx, year: number) =>
  await ctx.db
    .query("requests")
    .withIndex("by_year", (q) => q.eq("year", year))
    .order("desc")
    .take(500);

/**
 * The current year's requests plus the previous year's still-incomplete ones,
 * so in-flight requests survive the September 1 rollover instead of being
 * orphaned.
 */
const openRequestsAcrossYears = async (ctx: QueryCtx, year: number) => {
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
    const { email, year } = await requireProfile(ctx);
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
    const caller = await requireProfile(ctx);
    const { email, year } = caller;
    const open = await openRequestsAcrossYears(ctx, year);
    const approversFor = makeApproverResolver(ctx);
    // The caller's role in a given year (Director gating is per-year too).
    const roleIn = new Map<number, string | undefined>();
    const callerRoleIn = async (y: number) => {
      if (!roleIn.has(y)) {
        roleIn.set(y, (await getProfile(ctx, email, y))?.role);
      }
      return roleIn.get(y);
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
        ((await callerRoleIn(request.year)) === DIRECTOR ||
          (await callerRoleIn(year)) === DIRECTOR)
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
    const { year, profile } = await requireProfile(ctx);
    if (profile.department !== FINANCE) {
      throw new ConvexError("Only Finance staff can view all requests.");
    }
    return await openRequestsAcrossYears(ctx, year);
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
): Promise<{ request: Doc<"requests">; approvers: Approvers }> {
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
  const isDirector =
    caller.profile.role === DIRECTOR ||
    (request.year !== caller.year &&
      (await getProfile(ctx, caller.email, request.year))?.role === DIRECTOR);

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
  return { request, approvers };
}

export const approve = mutation({
  args: { requestId: v.id("requests"), step: stepValidator },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const { request, approvers } = await authorizeStep(
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
    // Tell the next approver (or the requester, once fully approved).
    await notifyNextActor(ctx, updated, approvers);
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
    const { request } = await authorizeStep(ctx, caller, args.requestId, args.step);
    await ctx.db.patch("requests", args.requestId, {
      [STEP_FIELDS[args.step]]: DECLINED,
      declineReason: reason,
      declinedTime: Date.now(),
    });
    await notify(
      ctx,
      request.requesterEmail,
      `Your reimbursement request of $${request.amount} has been declined`,
      `Your request was declined at the ${STEP_LABELS[args.step]} step by ${caller.email}.\nReason: ${reason}\n\n${requestSummary(request)}`
    );
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
    await ctx.db.delete("requests", args.requestId);
    return null;
  },
});

/** The requester submits receipt details once fully approved. */
export const submitReceipt = mutation({
  args: {
    requestId: v.id("requests"),
    recipients: v.array(
      v.object({
        accountName: v.string(),
        bsb: v.string(),
        accountNumber: v.string(),
        amount: v.number(),
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
    if (args.recipients.some((r) => !(r.amount > 0))) {
      throw new ConvexError("Every recipient amount must be a positive number.");
    }
    const totalAmount = args.recipients.reduce((sum, r) => sum + r.amount, 0);
    await ctx.db.patch("requests", args.requestId, {
      receipt: { totalAmount, recipients: args.recipients },
      paid: false,
    });
    const approvers = await getApprovers(ctx, request.year, FINANCE);
    await notify(
      ctx,
      approvers.financeHeadEmail,
      `A receipt for $${totalAmount} is ready to pay`,
      `${request.requesterEmail} submitted their receipt (total $${totalAmount}). Please pay the reimbursement in THE SHED.\n\n${requestSummary(request)}`
    );
    return null;
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
    await notify(
      ctx,
      request.requesterEmail,
      `Your reimbursement of $${args.paidAmount} has been paid`,
      `The Finance Head (${caller.email}) has paid your reimbursement.\nPaid: $${args.paidAmount}${args.comment ? `\nComment: ${args.comment}` : ""}\n\n${requestSummary(request)}`
    );
    // The Budget Manager should know when the paid amount differs.
    if (args.paidAmount !== request.amount) {
      const yearApprovers = await getApprovers(ctx, request.year, request.department);
      await notify(
        ctx,
        yearApprovers.budgetManagerEmail,
        `Paid amount differs from requested amount ($${args.paidAmount} vs $${request.amount})`,
        `Please update the budget accordingly.\n\n${requestSummary(request)}`
      );
    }
    return null;
  },
});
