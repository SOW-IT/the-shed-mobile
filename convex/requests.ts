import { ConvexError, v } from "convex/values";
import { formatAmount } from "../shared/money";
import {
  APPROVED,
  assignmentsOf,
  currentStep,
  DECLINED,
  DIRECTOR,
  directorThresholdOr,
  EARLIEST_REQUEST_YEAR,
  eventStaffYear,
  FINANCE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  isMemberOfDepartment,
  PENDING,
  requestCompleted,
  requestDeclined,
  requestFullyApproved,
  staffYearStartMs,
  STEP_LABELS,
  type ApprovalStatus,
} from "../shared/flow";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { rememberBankAccount } from "./bankAccounts";
import {
  internalMutation,
  mutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import {
  actAsEmails,
  currentStaffYear,
  delegatesForYear,
  displayName,
  getApprovers,
  getDepartment,
  getDivision,
  getProfile,
  getYearSettings,
  optionalProfile,
  requireProfile,
  rolesOf,
  withDelegatesForYear,
  type Approvers,
  type CallerContext,
} from "./model";

const requestYear = (r: Pick<Doc<"requests">, "_creationTime">): number =>
  eventStaffYear(r._creationTime);

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

const REQUEST_CLEANUP_BATCH_SIZE = 200;
const LIVE_REQUESTS_PER_YEAR_LIMIT = 1000;

const requestSummary = (r: Doc<"requests">) =>
  `Requester: ${r.requesterEmail}\nDepartment: ${r.department}\nAmount: $${formatAmount(r.amount)}\nDescription: ${r.description}`;

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

export const appUrl = (path?: string) => {
  const base = (
    process.env.SITE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://theshed.sow.org.au"
  ).replace(/\/+$/, "");
  return `${base}${path ?? ""}`;
};

export const notify = async (
  ctx: MutationCtx,
  opts: {
    to: string | undefined;
    actor?: string;
    subject: string;
    pushTitle?: string;
    body: string;
    url?: string;
    requestId?: Id<"requests">;
    email?: boolean;
  }
) => {
  const { to, actor, subject, pushTitle, body, url, requestId, email = true } = opts;
  if (!to) return;
  if (email) {
    await ctx.scheduler.runAfter(0, internal.emails.send, {
      to,
      subject,
      body: `${body}\n\nOpen in THE SHED: ${appUrl(url)}`,
    });
  }
  if (actor && to === actor) return;
  const title = pushTitle ?? subject;
  const lead = body.split("\n")[0];
  const idInUrl = url?.match(/^\/request\/([^/?#]+)/)?.[1];
  const linkedRequestId =
    requestId ??
    (idInUrl ? (ctx.db.normalizeId("requests", idInUrl) ?? undefined) : undefined);
  await ctx.db.insert("notifications", {
    userEmail: to,
    title,
    body: lead,
    url,
    ...(linkedRequestId ? { requestId: linkedRequestId } : {}),
    read: false,
  });
  await ctx.scheduler.runAfter(0, internal.push.send, {
    to,
    title,
    body: lead,
    url,
  });
};

export const requestUrl = (
  to: string,
  request: Pick<Doc<"requests">, "_id" | "requesterEmail">,
  opts?: { thread?: boolean }
): string => {
  const tab = to === request.requesterEmail ? "mine" : "review";
  let url = `/?tab=${tab}`;
  if (opts?.thread) url += `&focus=${request._id}&thread=1`;
  return url;
};

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
    if (status === undefined) continue;
    if (step === "hod" && request.department === FINANCE) continue;
    if (email && statuses.includes(status)) emails.push(email);
  }
  return [...new Set(emails)].filter((e) => e !== request.requesterEmail);
};

export const nextApproverWithYear = (
  request: Doc<"requests">,
  approvers: Approvers,
  fallback?: Approvers
): { email: string; year: number } | undefined => {
  const step = currentStep(request);
  if (step === null) return undefined;
  const selectors: Record<Step, (a: Approvers) => string | undefined> = {
    hod: (a) => a.hodEmail,
    budgetManager: (a) => a.budgetManagerEmail,
    director: (a) => a.directorEmail,
    financeHead: (a) => a.financeHeadEmail,
  };
  const primary = selectors[step](approvers);
  if (primary) return { email: primary, year: requestYear(request) };
  const secondary = fallback ? selectors[step](fallback) : undefined;
  if (secondary) return { email: secondary, year: currentStaffYear() };
  return undefined;
};

export const nextApproverEmail = (
  request: Doc<"requests">,
  approvers: Approvers,
  fallback?: Approvers
): string | undefined => nextApproverWithYear(request, approvers, fallback)?.email;

export async function actionOwnerEmail(
  ctx: QueryCtx | MutationCtx,
  request: Doc<"requests">
): Promise<string | undefined> {
  const year = currentStaffYear();
  const reqYear = requestYear(request);
  const approvers = await getApprovers(ctx, reqYear, request.department);
  const currentApprovers =
    reqYear === year
      ? approvers
      : await getApprovers(ctx, year, request.department);

  if (currentStep(request) !== null) {
    return nextApproverEmail(request, approvers, currentApprovers);
  }
  if (requestDeclined(request) || !requestFullyApproved(request)) return undefined;
  if (!request.receipt) return request.requesterEmail;
  if (request.paid === false) {
    const finance = await getApprovers(ctx, reqYear, FINANCE);
    const financeNow =
      reqYear === year ? finance : await getApprovers(ctx, year, FINANCE);
    return finance.financeHeadEmail ?? financeNow.financeHeadEmail;
  }
  return undefined;
}

const notifyNextActor = async (
  ctx: MutationCtx,
  request: Doc<"requests">,
  approvers: Approvers,
  fallback?: Approvers,
  actor?: string
) => {
  const step = currentStep(request);
  if (step !== null) {
    const next = nextApproverWithYear(request, approvers, fallback);
    const recipients = next
      ? await withDelegatesForYear(ctx, next.year, next.email)
      : [];
    for (const to of recipients) {
      await notify(ctx, {
        to,
        actor,
        subject: `A reimbursement request of $${formatAmount(request.amount)} needs your ${STEP_LABELS[step]} approval`,
        pushTitle: "Approval needed",
        body: `The request below is waiting on your approval in THE SHED.\n\n${requestSummary(request)}`,
        url: requestUrl(to, request),
        requestId: request._id,
      });
    }
  } else if (requestFullyApproved(request)) {
    await notify(ctx, {
      to: request.requesterEmail,
      actor,
      subject: `Your reimbursement request of $${formatAmount(request.amount)} has been approved`,
      pushTitle: "Request approved",
      body: `Your request has been fully approved. Please open THE SHED and submit your receipt/invoice details.\n\n${requestSummary(request)}`,
      url: requestUrl(request.requesterEmail, request),
      requestId: request._id,
    });
    for (const email of involvedApproverEmails(request, approvers, [APPROVED])) {
      await notify(ctx, {
        to: email,
        actor,
        subject: `The $${formatAmount(request.amount)} request by ${request.requesterEmail} is fully approved`,
        pushTitle: "Request approved",
        body: `Every step has approved this request; the requester has been asked for their receipt.\n\n${requestSummary(request)}`,
        url: requestUrl(email, request),
        requestId: request._id,
      });
    }
  }
};

const MAX_REQUEST_AMOUNT = 1_000_000;

export const submit = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    department: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { email, year, profile } = await requireProfile(ctx);
    if (!Number.isFinite(args.amount) || !(args.amount > 0)) {
      throw new ConvexError("Amount must be a positive number.");
    }
    if (args.amount > MAX_REQUEST_AMOUNT) {
      throw new ConvexError(
        `Amounts above $${formatAmount(MAX_REQUEST_AMOUNT)} can't be submitted here. Talk to Finance directly.`
      );
    }
    if (args.description.trim() === "") {
      throw new ConvexError("Please describe what the request is for.");
    }

    const roles = rolesOf(profile);
    const assignments = assignmentsOf(profile);

    let department = args.department?.trim();
    if (!department) {
      department =
        assignments.find((a) => a.role === HEAD_OF_DEPARTMENT && a.department)
          ?.department ?? assignments.find((a) => a.department)?.department;
    }
    if (!department) {
      const headedDivision = assignments.find(
        (a) => a.role === HEAD_OF_DIVISION && a.division
      )?.division;
      if (headedDivision) {
        const yearDepartments = await ctx.db
          .query("departments")
          .withIndex("by_year_and_name", (q) => q.eq("year", year))
          .take(200);
        department = yearDepartments.find(
          (d) => d.division === headedDivision
        )?.name;
      }
    }
    if (!department) {
      throw new ConvexError("Pick a department for this request.");
    }
    const departmentDoc = await getDepartment(ctx, year, department);
    if (!departmentDoc) {
      throw new ConvexError(`Department "${department}" doesn't exist in ${year}.`);
    }

    const approvers = await getApprovers(ctx, year, department);
    const yearSettings = await getYearSettings(ctx, year);
    const needsDirector =
      args.amount >= directorThresholdOr(yearSettings?.directorApprovalThreshold);

    let approvedByHOD: ApprovalStatus = PENDING;
    let approvedByBudgetManager: ApprovalStatus = PENDING;
    let approvedByDirector: ApprovalStatus | undefined = needsDirector
      ? PENDING
      : undefined;
    let approvedByFinanceHead: ApprovalStatus = PENDING;

    if (department === FINANCE) approvedByHOD = APPROVED;
    const divisionDoc = await getDivision(ctx, year, departmentDoc.division);
    if (
      approvers.hodEmail === email ||
      roles.includes(DIRECTOR) ||
      divisionDoc?.headEmail === email
    ) {
      approvedByHOD = APPROVED;
    }
    if (approvers.budgetManagerEmail === email) approvedByBudgetManager = APPROVED;
    if (needsDirector && roles.includes(DIRECTOR)) {
      approvedByDirector = APPROVED;
    }
    if (approvers.financeHeadEmail === email) {
      approvedByHOD = APPROVED;
      approvedByBudgetManager = APPROVED;
      approvedByFinanceHead = APPROVED;
    }

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
        `This request can't be submitted yet. ${year} has no ${missing.join(
          ", no "
        )}. Ask an admin to complete the organisation setup.`
      );
    }

    const id = await ctx.db.insert("requests", {
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
      await notify(ctx, {
        to: email,
        actor: email,
        subject: `Your reimbursement request of $${formatAmount(request.amount)} has been submitted`,
        pushTitle: "Request submitted",
        body: `Your request has been submitted and sent for approval. You'll be emailed once it's fully approved.\n\n${requestSummary(request)}`,
        url: requestUrl(request.requesterEmail, request),
        requestId: request._id,
      });
      await notifyNextActor(ctx, request, approvers, undefined, email);
    }
    return id;
  },
});

const yearRequests = async (ctx: QueryCtx | MutationCtx, year: number) =>
  await ctx.db
    .query("requests")
    .withIndex("by_creation_time", (q) =>
      q
        .gte("_creationTime", staffYearStartMs(year))
        .lt("_creationTime", staffYearStartMs(year + 1))
    )
    .order("desc")
    .take(LIVE_REQUESTS_PER_YEAR_LIMIT);

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

const receiptSummary = (request: Doc<"requests">): Doc<"requests">["receipt"] =>
  request.receipt
    ? { totalAmount: request.receipt.totalAmount, recipients: [] }
    : undefined;

async function canViewReceiptDetails(
  ctx: QueryCtx,
  caller: CallerContext,
  request: Doc<"requests">
): Promise<boolean> {
  if (!request.receipt) return true;
  if (request.requesterEmail === caller.email) return true;
  if (isMemberOfDepartment(caller.profile, FINANCE)) return true;

  const reqYear = requestYear(request);
  const requestYearFinance = await getApprovers(ctx, reqYear, FINANCE);
  const actAsRequest = await actAsEmails(ctx, reqYear, caller.email);
  if (
    requestYearFinance.financeHeadEmail !== undefined &&
    actAsRequest.has(requestYearFinance.financeHeadEmail)
  ) {
    return true;
  }
  if (reqYear === caller.year) return false;

  const currentFinance = await getApprovers(ctx, caller.year, FINANCE);
  const actAsCurrent = await actAsEmails(ctx, caller.year, caller.email);
  return (
    currentFinance.financeHeadEmail !== undefined &&
    actAsCurrent.has(currentFinance.financeHeadEmail)
  );
}

async function requestForCaller(
  ctx: QueryCtx,
  caller: CallerContext,
  request: Doc<"requests">
): Promise<Doc<"requests">> {
  if (await canViewReceiptDetails(ctx, caller, request)) return request;
  return { ...request, receipt: receiptSummary(request) };
}

export const myRequests = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const { email, year } = caller;
    const fetch = (y: number) =>
      ctx.db
        .query("requests")
        .withIndex("by_requester", (q) => q.eq("requesterEmail", email))
        .filter((q) =>
          q.and(
            q.gte(q.field("_creationTime"), staffYearStartMs(y)),
            q.lt(q.field("_creationTime"), staffYearStartMs(y + 1))
          )
        )
        .order("desc")
        .take(200);
    if (args.year !== undefined && args.year !== year) {
      return (await fetch(args.year)).sort((a, b) => b._creationTime - a._creationTime);
    }
    const current = await fetch(year);
    const carriedOver = (await fetch(year - 1)).filter((r) => !requestCompleted(r));
    return [...current, ...carriedOver].sort(
      (a, b) => b._creationTime - a._creationTime
    );
  },
});

export const requestYears = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const mineRows = await ctx.db
      .query("requests")
      .withIndex("by_requester", (q) => q.eq("requesterEmail", caller.email))
      .collect();
    const yearsFrom = (years: number[]) =>
      [...new Set([currentStaffYear(), ...years])]
        .filter((y) => y >= EARLIEST_REQUEST_YEAR)
        .sort((a, b) => b - a);
    const mine = yearsFrom(mineRows.map((r) => requestYear(r)));
    const allYears: number[] = [];
    for (let y = currentStaffYear(); y >= EARLIEST_REQUEST_YEAR; y--) {
      const hasStructure = await ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) => q.eq("year", y))
        .first();
      if (hasStructure) allYears.push(y);
    }
    const all = yearsFrom(allYears);
    return { mine, all };
  },
});

export const toReview = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const { email, year } = caller;
    const open = await openRequestsAcrossYears(ctx, year);
    const approversFor = makeApproverResolver(ctx);
    const rolesByYear = new Map<number, string[]>();
    const callerRolesIn = async (y: number) => {
      if (!rolesByYear.has(y)) {
        const profileForYear = await getProfile(ctx, email, y);
        rolesByYear.set(y, profileForYear ? rolesOf(profileForYear) : []);
      }
      return rolesByYear.get(y)!;
    };
    const actAsByYear = new Map<number, Promise<Set<string>>>();
    const actAsIn = (y: number) => {
      let cached = actAsByYear.get(y);
      if (!cached) {
        cached = actAsEmails(ctx, y, email);
        actAsByYear.set(y, cached);
      }
      return cached;
    };

    const hod: Doc<"requests">[] = [];
    const budgetManager: Doc<"requests">[] = [];
    const director: Doc<"requests">[] = [];
    const financeHead: Doc<"requests">[] = [];
    const readyToPay: Doc<"requests">[] = [];

    for (const request of open) {
      const reqYear = requestYear(request);
      const requestYearApprovers = await approversFor(reqYear, request.department);
      const thisYear =
        reqYear === year
          ? requestYearApprovers
          : await approversFor(year, request.department);
      const actAsRequestYear = await actAsIn(reqYear);
      const actAsThisYear =
        reqYear === year ? actAsRequestYear : await actAsIn(year);
      const matches = (pick: (a: Approvers) => string | undefined) => {
        const reqApprover = pick(requestYearApprovers);
        const nowApprover = pick(thisYear);
        return (
          (reqApprover !== undefined && actAsRequestYear.has(reqApprover)) ||
          (nowApprover !== undefined && actAsThisYear.has(nowApprover))
        );
      };

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
        ((await callerRolesIn(reqYear)).includes(DIRECTOR) ||
          (await callerRolesIn(year)).includes(DIRECTOR) ||
          matches((a) => a.directorEmail))
      ) {
        director.push(request);
      } else if (step === "financeHead" && matches((a) => a.financeHeadEmail)) {
        financeHead.push(request);
      }
    }

    return { hod, budgetManager, director, financeHead, readyToPay };
  },
});

const REVIEWED_LIMIT = 50;

export const reviewed = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const seen = new Set<Id<"requests">>();
    const reviewedIds: Id<"requests">[] = [];
    for await (const event of ctx.db
      .query("requestEvents")
      .withIndex("by_actor", (q) => q.eq("actorEmail", caller.email))
      .order("desc")) {
      if (
        event.action !== "approved" &&
        event.action !== "declined" &&
        event.action !== "auto-approved"
      )
        continue;
      if (seen.has(event.requestId)) continue;
      seen.add(event.requestId);
      reviewedIds.push(event.requestId);
      if (reviewedIds.length >= REVIEWED_LIMIT) break;
    }

    const approversFor = makeApproverResolver(ctx);
    const actAsByYear = new Map<number, Promise<Set<string>>>();
    const actAsIn = (year: number) => {
      let cached = actAsByYear.get(year);
      if (!cached) {
        cached = actAsEmails(ctx, year, caller.email);
        actAsByYear.set(year, cached);
      }
      return cached;
    };
    const receiptWaitingIds: Id<"requests">[] = [];
    for (const request of await openRequestsAcrossYears(ctx, caller.year)) {
      if (receiptWaitingIds.length >= REVIEWED_LIMIT) break;
      if (seen.has(request._id)) continue;
      if (request.requesterEmail === caller.email) continue;
      if (!requestFullyApproved(request) || request.receipt) continue;
      const reqYear = requestYear(request);
      const approvers = await approversFor(reqYear, request.department);
      const actAs = await actAsIn(reqYear);
      const approvedApprovers = involvedApproverEmails(request, approvers, [APPROVED]);
      if (!approvedApprovers.some((email) => actAs.has(email))) continue;
      seen.add(request._id);
      receiptWaitingIds.push(request._id);
    }
    const reviewedAndReceiptWaitingIds = [
      ...reviewedIds.slice(0, Math.max(0, REVIEWED_LIMIT - receiptWaitingIds.length)),
      ...receiptWaitingIds,
    ];

    const docs = await Promise.all(
      reviewedAndReceiptWaitingIds.map((id) => ctx.db.get("requests", id))
    );
    return await Promise.all(
      docs
        .filter((r): r is Doc<"requests"> => r !== null)
        .map((request) => requestForCaller(ctx, caller, request))
    );
  },
});

export const allRequests = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    if (!isMemberOfDepartment(caller.profile, FINANCE)) {
      throw new ConvexError("Only Finance staff can view all requests.");
    }
    if (args.year !== undefined && args.year !== caller.year) {
      return await yearRequests(ctx, args.year);
    }
    return await openRequestsAcrossYears(ctx, caller.year);
  },
});

export const requestsForExport = query({
  args: { years: v.array(v.number()) },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    if (!isMemberOfDepartment(caller.profile, FINANCE)) {
      throw new ConvexError("Only Finance staff can export requests.");
    }
    const years = [...new Set(args.years)]
      .filter((y) => y >= EARLIEST_REQUEST_YEAR && y <= caller.year)
      .sort((a, b) => b - a);
    const rows: Doc<"requests">[] = [];
    for (const year of years) {
      const yearRows = await ctx.db
        .query("requests")
        .withIndex("by_creation_time", (q) =>
          q
            .gte("_creationTime", staffYearStartMs(year))
            .lt("_creationTime", staffYearStartMs(year + 1))
        )
        .order("desc")
        .collect();
      rows.push(...yearRows);
    }
    return rows;
  },
});

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
  const reqYear = request ? requestYear(request) : null;
  if (
    !request ||
    (reqYear !== caller.year && reqYear !== caller.year - 1)
  ) {
    throw new ConvexError("Request not found.");
  }
  if (requestDeclined(request)) {
    throw new ConvexError("This request has been declined and is closed.");
  }
  if (request.requesterEmail === caller.email) {
    throw new ConvexError("You can't review your own request.");
  }
  const approvers = await getApprovers(ctx, reqYear!, request.department);
  const currentApprovers =
    reqYear === caller.year
      ? approvers
      : await getApprovers(ctx, caller.year, request.department);
  const actAsRequest = await actAsEmails(ctx, reqYear!, caller.email);
  const actAsCurrent =
    reqYear === caller.year
      ? actAsRequest
      : await actAsEmails(ctx, caller.year, caller.email);
  const matches = (pick: (a: Approvers) => string | undefined) => {
    const reqApprover = pick(approvers);
    const nowApprover = pick(currentApprovers);
    return (
      (reqApprover !== undefined && actAsRequest.has(reqApprover)) ||
      (nowApprover !== undefined && actAsCurrent.has(nowApprover))
    );
  };
  const requestYearProfile =
    reqYear === caller.year
      ? caller.profile
      : await getProfile(ctx, caller.email, reqYear!);
  const isDirector =
    rolesOf(caller.profile).includes(DIRECTOR) ||
    (requestYearProfile !== null &&
      rolesOf(requestYearProfile).includes(DIRECTOR)) ||
    matches((a) => a.directorEmail);

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
    await notifyNextActor(ctx, updated, approvers, currentApprovers, caller.email);
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
      throw new ConvexError("Please give a reason for declining. The requester will be notified with it.");
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
    const declinerName = await displayName(ctx, caller.email, requestYear(request));
    await notify(ctx, {
      to: request.requesterEmail,
      actor: caller.email,
      subject: `Your reimbursement request of $${formatAmount(request.amount)} has been declined`,
      pushTitle: "Request declined",
      body: `Your request was declined at the ${STEP_LABELS[args.step]} step by ${declinerName}.\nReason: ${reason}\n\n${requestSummary(request)}`,
      url: requestUrl(request.requesterEmail, request),
      requestId: request._id,
    });
    for (const email of involvedApproverEmails(request, approvers, [APPROVED])) {
      if (email === caller.email) continue;
      await notify(ctx, {
        to: email,
        actor: caller.email,
        subject: `The $${formatAmount(request.amount)} request by ${request.requesterEmail} was declined`,
        pushTitle: "Request declined",
        body: `Declined at the ${STEP_LABELS[args.step]} step by ${declinerName}.\nReason: ${reason}\n\n${requestSummary(request)}`,
        url: requestUrl(email, request),
        requestId: request._id,
      });
    }
    return null;
  },
});

export const cleanupRequestAuditAndNudges = internalMutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .take(REQUEST_CLEANUP_BATCH_SIZE);
    for (const event of events) {
      await ctx.db.delete("requestEvents", event._id);
    }

    const nudges = await ctx.db
      .query("requestNudges")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .take(REQUEST_CLEANUP_BATCH_SIZE);
    for (const nudge of nudges) {
      await ctx.db.delete("requestNudges", nudge._id);
    }

    if (
      events.length === REQUEST_CLEANUP_BATCH_SIZE ||
      nudges.length === REQUEST_CLEANUP_BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(0, internal.requests.cleanupRequestAuditAndNudges, {
        requestId,
      });
    }
    return null;
  },
});

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
    const approvers = await getApprovers(ctx, requestYear(request), request.department);
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
      await notify(ctx, {
        to: recipient,
        actor: email,
        subject: `The $${formatAmount(request.amount)} request by ${request.requesterEmail} has been cancelled`,
        pushTitle: "Request cancelled",
        body: `The requester cancelled this request; no further action is needed.\n\n${requestSummary(request)}`,
        url: "/?tab=review",
      });
    }
    await ctx.scheduler.runAfter(0, internal.requests.cleanupRequestAuditAndNudges, {
      requestId: args.requestId,
    });
    for (;;) {
      const comments = await ctx.db
        .query("requestComments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .take(200);
      if (comments.length === 0) break;
      for (const comment of comments) {
        for (;;) {
          const reactions = await ctx.db
            .query("commentReactions")
            .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
            .take(200);
          if (reactions.length === 0) break;
          for (const reaction of reactions) {
            await ctx.db.delete("commentReactions", reaction._id);
          }
        }
        await ctx.db.delete("requestComments", comment._id);
      }
    }
    for (;;) {
      const reads = await ctx.db
        .query("commentReads")
        .withIndex("by_request_and_user", (q) => q.eq("requestId", args.requestId))
        .take(200);
      if (reads.length === 0) break;
      for (const read of reads) {
        await ctx.db.delete("commentReads", read._id);
      }
    }
    await ctx.db.delete("requests", args.requestId);
    return null;
  },
});

export const deleteDeclined = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const { email } = await requireProfile(ctx);
    const request = await ctx.db.get("requests", args.requestId);
    if (!request || request.requesterEmail !== email) {
      throw new ConvexError("You can only delete your own requests.");
    }
    if (!requestDeclined(request)) {
      throw new ConvexError("Only declined requests can be deleted this way.");
    }
    await ctx.scheduler.runAfter(0, internal.requests.cleanupRequestAuditAndNudges, {
      requestId: args.requestId,
    });
    for (;;) {
      const comments = await ctx.db
        .query("requestComments")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .take(200);
      if (comments.length === 0) break;
      for (const comment of comments) {
        for (;;) {
          const reactions = await ctx.db
            .query("commentReactions")
            .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
            .take(200);
          if (reactions.length === 0) break;
          for (const reaction of reactions) {
            await ctx.db.delete("commentReactions", reaction._id);
          }
        }
        await ctx.db.delete("requestComments", comment._id);
      }
    }
    for (;;) {
      const reads = await ctx.db
        .query("commentReads")
        .withIndex("by_request_and_user", (q) => q.eq("requestId", args.requestId))
        .take(200);
      if (reads.length === 0) break;
      for (const read of reads) {
        await ctx.db.delete("commentReads", read._id);
      }
    }
    await ctx.db.delete("requests", args.requestId);
    return null;
  },
});

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_RECEIPT_RECIPIENTS = 20;
const MAX_ATTACHMENTS_PER_RECIPIENT = 10;
const MAX_RECEIPT_ATTACHMENTS = 50;
const MAX_ATTACHMENT_NAME_LENGTH = 200;
const MAX_RECEIPT_FILE_BYTES = 2 * 1024 * 1024;

async function nudgeParticipantEmails(
  ctx: QueryCtx | MutationCtx,
  request: Doc<"requests">
): Promise<Set<string>> {
  const approvers = await getApprovers(ctx, requestYear(request), request.department);
  return new Set([
    request.requesterEmail,
    ...involvedApproverEmails(request, approvers, [APPROVED]),
  ]);
}

export const canNudge = query({
  args: { requestId: v.id("requests") },
  returns: v.union(
    v.object({ onCooldown: v.boolean(), remainingMs: v.number() }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request || requestCompleted(request)) return null;
    if (!(await nudgeParticipantEmails(ctx, request)).has(caller.email)) return null;
    const to = await actionOwnerEmail(ctx, request);
    if (!to || to === caller.email) return null;
    const recent = await ctx.db
      .query("requestNudges")
      .withIndex("by_nudger_and_request", (q) =>
        q.eq("nudgerEmail", caller.email).eq("requestId", args.requestId)
      )
      .order("desc")
      .first();
    const remainingMs = recent
      ? Math.max(0, recent.sentAt + NUDGE_COOLDOWN_MS - Date.now())
      : 0;
    return { onCooldown: remainingMs > 0, remainingMs };
  },
});

export const nudge = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) throw new ConvexError("Request not found.");
    if (requestCompleted(request)) throw new ConvexError("This request is already completed.");

    const recent = await ctx.db
      .query("requestNudges")
      .withIndex("by_nudger_and_request", (q) =>
        q.eq("nudgerEmail", caller.email).eq("requestId", args.requestId)
      )
      .order("desc")
      .first();
    if (recent && Date.now() - recent.sentAt < NUDGE_COOLDOWN_MS) {
      throw new ConvexError("You already nudged this request today. Try again tomorrow.");
    }

    const to = await actionOwnerEmail(ctx, request);
    if (!to) throw new ConvexError("No one to nudge right now.");
    if (to === caller.email) throw new ConvexError("This request is currently waiting on you.");

    if (!(await nudgeParticipantEmails(ctx, request)).has(caller.email)) {
      throw new ConvexError("Only the requester or an approver on this request can nudge it.");
    }

    await ctx.db.insert("requestNudges", {
      requestId: args.requestId,
      nudgerEmail: caller.email,
      sentAt: Date.now(),
    });

    const nudgerName = await displayName(ctx, caller.email, requestYear(request));
    await notify(ctx, {
      to,
      actor: caller.email,
      subject: `Nudge: a $${formatAmount(request.amount)} request is waiting on you`,
      pushTitle: "You've been nudged",
      body: `${nudgerName} is waiting on your action for a $${formatAmount(request.amount)} request.\n\n${requestSummary(request)}`,
      url: requestUrl(to, request),
      requestId: request._id,
    });
    return null;
  },
});

export const get = query({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const requestId = ctx.db.normalizeId("requests", args.requestId);
    if (!requestId) return null;
    const request = await ctx.db.get("requests", requestId);
    return request ? await requestForCaller(ctx, caller, request) : null;
  },
});

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

async function resolveApproverName(
  ctx: QueryCtx,
  email: string,
  year: number
): Promise<string | null> {
  const profile = await getProfile(ctx, email, year);
  if (profile?.name) return profile.name;
  const dirUser = await ctx.db
    .query("directoryUsers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return dirUser?.name ?? null;
}

function approverEmailMap(approvers: Approvers): Record<Step, string | undefined> {
  return {
    hod: approvers.hodEmail,
    budgetManager: approvers.budgetManagerEmail,
    director: approvers.directorEmail,
    financeHead: approvers.financeHeadEmail,
  };
}

export const stepInfo = query({
  args: { requestId: v.id("requests"), step: stepValidator },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;
    const reqYear = requestYear(request);
    const approvers = await getApprovers(ctx, reqYear, request.department);
    const officeholderEmail = approverEmailMap(approvers)[args.step] ?? null;
    const allEvents = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(200);
    const stepEvents = allEvents
      .filter((e) => e.step === args.step)
      .sort((a, b) => b._creationTime - a._creationTime);
    const events = stepEvents.map((e) => ({
      at: e._creationTime,
      action: e.action,
      detail: e.detail ?? null,
      actorEmail: e.actorEmail,
    }));
    const latestAction = stepEvents.find(
      (e) =>
        e.action === "approved" ||
        e.action === "declined" ||
        e.action === "auto-approved"
    );
    const display = await resolveStepDisplay(ctx, {
      reqYear,
      officeholderEmail,
      latestActorEmail: latestAction?.actorEmail ?? null,
      pending: latestAction === undefined,
    });
    return {
      ...display,
      events,
    };
  },
});

export const stepActors = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;
    const reqYear = requestYear(request);
    const approvers = await getApprovers(ctx, reqYear, request.department);
    const emailMap = approverEmailMap(approvers);
    const allEvents = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(200);
    const result: Record<
      string,
      StepActorDisplay & { actedAt: number | null }
    > = {};
    for (const step of [
      "hod",
      "budgetManager",
      "director",
      "financeHead",
    ] as const) {
      const officeholderEmail = emailMap[step] ?? null;
      const stepEvent = allEvents
        .filter(
          (e) =>
            e.step === step &&
            (e.action === "approved" ||
              e.action === "declined" ||
              e.action === "auto-approved")
        )
        .sort((a, b) => b._creationTime - a._creationTime)[0];
      const display = await resolveStepDisplay(ctx, {
        reqYear,
        officeholderEmail,
        latestActorEmail: stepEvent?.actorEmail ?? null,
        pending: stepEvent === undefined,
      });
      result[step] = {
        ...display,
        actedAt: stepEvent?._creationTime ?? null,
      };
    }
    return result as Record<Step, StepActorDisplay & { actedAt: number | null }>;
  },
});

type StepActorDisplay = {
  name: string | null;
  email: string | null;
  isDelegated: boolean;
  officeholderEmail: string | null;
  officeholderName: string | null;
  otherDelegateNames: string[];
};

async function resolveStepDisplay(
  ctx: QueryCtx,
  opts: {
    reqYear: number;
    officeholderEmail: string | null;
    latestActorEmail: string | null;
    pending: boolean;
  }
): Promise<StepActorDisplay> {
  const { reqYear, officeholderEmail, latestActorEmail, pending } = opts;
  const officeholderName = officeholderEmail
    ? await resolveApproverName(ctx, officeholderEmail, reqYear)
    : null;

  if (
    !pending &&
    latestActorEmail &&
    officeholderEmail &&
    latestActorEmail !== officeholderEmail
  ) {
    const name = await resolveApproverName(ctx, latestActorEmail, reqYear);
    return {
      name,
      email: latestActorEmail,
      isDelegated: true,
      officeholderEmail,
      officeholderName,
      otherDelegateNames: [],
    };
  }

  if (pending && officeholderEmail) {
    const delegateEmails = await delegatesForOfficeholderYears(
      ctx,
      reqYear,
      officeholderEmail
    );
    if (delegateEmails.length > 0) {
      const primary = delegateEmails[0]!;
      const name = await resolveApproverName(ctx, primary, reqYear);
      const otherDelegateNames: string[] = [];
      for (const d of delegateEmails.slice(1)) {
        otherDelegateNames.push(
          (await resolveApproverName(ctx, d, reqYear)) ?? d
        );
      }
      return {
        name,
        email: primary,
        isDelegated: true,
        officeholderEmail,
        officeholderName,
        otherDelegateNames,
      };
    }
  }

  return {
    name: officeholderName,
    email: officeholderEmail,
    isDelegated: false,
    officeholderEmail,
    officeholderName,
    otherDelegateNames: [],
  };
}

async function delegatesForOfficeholderYears(
  ctx: QueryCtx,
  reqYear: number,
  officeholderEmail: string
): Promise<string[]> {
  const years = new Set([reqYear, currentStaffYear()]);
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const year of years) {
    for (const d of await delegatesForYear(ctx, year, officeholderEmail)) {
      if (seen.has(d)) continue;
      seen.add(d);
      emails.push(d);
    }
  }
  return emails.sort();
}

export const generateReceiptUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submitReceipt = mutation({
  args: {
    requestId: v.id("requests"),
    recipients: v.array(
      v.object({
        accountName: v.string(),
        bsb: v.string(),
        accountNumber: v.string(),
        amount: v.number(),
        saveAccount: v.optional(v.boolean()),
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
    if (args.recipients.length > MAX_RECEIPT_RECIPIENTS) {
      throw new ConvexError(`Receipts can have at most ${MAX_RECEIPT_RECIPIENTS} recipients.`);
    }
    const receiptUploadReadyAt = request.approvedTime ?? request._creationTime;
    let attachmentCount = 0;
    for (const recipient of args.recipients) {
      if (!recipient.accountName.trim()) {
        throw new ConvexError("Every recipient needs an account name.");
      }
      if (!/^\d+$/.test(recipient.bsb) || !/^\d+$/.test(recipient.accountNumber)) {
        throw new ConvexError("BSB and account number must be digits only.");
      }
      const attachments = recipient.attachments ?? [];
      if (attachments.length > MAX_ATTACHMENTS_PER_RECIPIENT) {
        throw new ConvexError(
          `Each recipient can have at most ${MAX_ATTACHMENTS_PER_RECIPIENT} attachments.`
        );
      }
      attachmentCount += attachments.length;
      for (const attachment of attachments) {
        const name = attachment.name.trim();
        if (!name) throw new ConvexError("Every attachment needs a file name.");
        if (name.length > MAX_ATTACHMENT_NAME_LENGTH) {
          throw new ConvexError(
            `Attachment names must be ${MAX_ATTACHMENT_NAME_LENGTH} characters or fewer.`
          );
        }
        const metadata = await ctx.db.system.get("_storage", attachment.storageId);
        if (!metadata) throw new ConvexError("One or more receipt files were not uploaded.");
        if (metadata.size > MAX_RECEIPT_FILE_BYTES) {
          throw new ConvexError("Receipt files must be 2MB or smaller.");
        }
        if (metadata._creationTime < receiptUploadReadyAt) {
          throw new ConvexError("Receipt files must be uploaded after the request is approved.");
        }
      }
    }
    if (
      args.recipients.some(
        (r) => !Number.isFinite(r.amount) || !(r.amount > 0) || r.amount > MAX_REQUEST_AMOUNT
      )
    ) {
      throw new ConvexError("Every recipient amount must be a positive number.");
    }
    if (attachmentCount > MAX_RECEIPT_ATTACHMENTS) {
      throw new ConvexError(`A receipt can have at most ${MAX_RECEIPT_ATTACHMENTS} attachments.`);
    }
    if (!args.recipients.some((r) => (r.attachments ?? []).length > 0)) {
      throw new ConvexError("Attach at least one receipt file.");
    }
    const storedRecipients = args.recipients.map(({ saveAccount: _s, ...r }) => r);
    const totalAmount = storedRecipients.reduce((sum, r) => sum + r.amount, 0);
    if (totalAmount > MAX_REQUEST_AMOUNT) {
      throw new ConvexError(
        `Receipt totals above $${formatAmount(MAX_REQUEST_AMOUNT)} can't be submitted here. Talk to Finance directly.`
      );
    }
    await ctx.db.patch("requests", args.requestId, {
      receipt: { totalAmount, recipients: storedRecipients },
      paid: false,
    });
    for (const recipient of args.recipients) {
      if (recipient.saveAccount !== false) {
        await rememberBankAccount(ctx, email, recipient);
      }
    }
    await logEvent(
      ctx,
      args.requestId,
      email,
      "receipt-submitted",
      undefined,
      `$${formatAmount(totalAmount)}, ${args.recipients.length} recipient${args.recipients.length === 1 ? "" : "s"}`
    );
    const reqYear = requestYear(request);
    const approvers = await getApprovers(ctx, reqYear, FINANCE);
    const currentYear = currentStaffYear();
    const currentApprovers =
      reqYear === currentYear
        ? approvers
        : await getApprovers(ctx, currentYear, FINANCE);
    const requesterName = await displayName(ctx, request.requesterEmail, reqYear);
    const seen = new Set<string>();
    const headsByYear: Array<[number, string | undefined]> = [
      [reqYear, approvers.financeHeadEmail],
      [currentYear, currentApprovers.financeHeadEmail],
    ];
    for (const [year, head] of headsByYear) {
      for (const to of await withDelegatesForYear(ctx, year, head)) {
        if (seen.has(to)) continue;
        seen.add(to);
        await notify(ctx, {
          to,
          actor: email,
          subject: `A receipt for $${formatAmount(totalAmount)} is ready to pay`,
          pushTitle: "Receipt ready to pay",
          body: `${requesterName} submitted their receipt (total $${formatAmount(totalAmount)}). Please pay the reimbursement in THE SHED.\n\n${requestSummary(request)}`,
          url: requestUrl(to, request),
          requestId: request._id,
        });
      }
    }
    return null;
  },
});

export const receiptAttachments = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;

    if (!(await canViewReceiptDetails(ctx, caller, request))) return null;

    if (!request.receipt) return [];
    return await Promise.all(
      request.receipt.recipients.map(async (recipient) => ({
        accountName: recipient.accountName,
        attachments: await Promise.all(
          (recipient.attachments ?? []).map(async (attachment) => ({
            name: attachment.name,
            deleted: attachment.deleted ?? false,
            url: attachment.deleted
              ? null
              : await ctx.storage.getUrl(attachment.storageId),
          }))
        ),
      }))
    );
  },
});

export const pay = mutation({
  args: {
    requestId: v.id("requests"),
    paidAmount: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    if (
      !Number.isFinite(args.paidAmount) ||
      !(args.paidAmount > 0) ||
      args.paidAmount > MAX_REQUEST_AMOUNT
    ) {
      throw new ConvexError("The paid amount must be a positive number.");
    }
    const request = await ctx.db.get("requests", args.requestId);
    const reqYear = request ? requestYear(request) : null;
    if (
      !request ||
      (reqYear !== caller.year && reqYear !== caller.year - 1)
    ) {
      throw new ConvexError("Request not found.");
    }
    const approvers = await getApprovers(ctx, reqYear!, FINANCE);
    const currentApprovers =
      reqYear === caller.year
        ? approvers
        : await getApprovers(ctx, caller.year, FINANCE);
    const actAsRequest = await actAsEmails(ctx, reqYear!, caller.email);
    const actAsCurrent =
      reqYear === caller.year
        ? actAsRequest
        : await actAsEmails(ctx, caller.year, caller.email);
    const canPay =
      (approvers.financeHeadEmail !== undefined &&
        actAsRequest.has(approvers.financeHeadEmail)) ||
      (currentApprovers.financeHeadEmail !== undefined &&
        actAsCurrent.has(currentApprovers.financeHeadEmail));
    if (!canPay) {
      throw new ConvexError(
        "Only the Finance Head (or their delegate) can pay reimbursements."
      );
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
    await logEvent(ctx, args.requestId, caller.email, "paid", undefined, `$${formatAmount(args.paidAmount)}`);
    const payerName = await displayName(ctx, caller.email, reqYear!);
    await notify(ctx, {
      to: request.requesterEmail,
      actor: caller.email,
      subject: `Your reimbursement of $${formatAmount(args.paidAmount)} has been paid`,
      pushTitle: "Reimbursement paid",
      body: `The Finance Head (${payerName}) has paid your reimbursement.\nPaid: $${formatAmount(args.paidAmount)}${args.comment ? `\nComment: ${args.comment}` : ""}\n\n${requestSummary(request)}`,
      url: requestUrl(request.requesterEmail, request),
      requestId: request._id,
    });
    if (args.paidAmount !== request.amount) {
      const yearApprovers = await getApprovers(ctx, reqYear!, request.department);
      await notify(ctx, {
        to: yearApprovers.budgetManagerEmail,
        actor: caller.email,
        subject: `Paid amount differs from requested amount ($${formatAmount(args.paidAmount)} vs $${formatAmount(request.amount)})`,
        pushTitle: "Paid amount changed",
        body: `Please update the budget accordingly.\n\n${requestSummary(request)}`,
        url: yearApprovers.budgetManagerEmail
          ? requestUrl(yearApprovers.budgetManagerEmail, request)
          : undefined,
        requestId: request._id,
      });
    }
    return null;
  },
});
