import { ConvexError, v } from "convex/values";
import {
  APPROVED,
  assignmentsOf,
  currentStep,
  DECLINED,
  DIRECTOR,
  directorThresholdOr,
  EARLIEST_REQUEST_YEAR,
  FINANCE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  isMemberOfDepartment,
  PENDING,
  requestCompleted,
  requestDeclined,
  requestFullyApproved,
  STEP_LABELS,
  type ApprovalStatus,
} from "../shared/flow";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { rememberBankAccount } from "./bankAccounts";
import { action, mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import {
  actAsEmails,
  currentStaffYear,
  displayName,
  getApprovers,
  getDepartment,
  getDivision,
  getProfile,
  getYearSettings,
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
export const notify = async (
  ctx: MutationCtx,
  opts: {
    to: string | undefined;
    /**
     * Who triggered this update. We never push someone for their own action —
     * the email below is their acknowledgement — so when `to === actor` only
     * the email is sent.
     */
    actor?: string;
    /** Email subject — a full sentence with the details. */
    subject: string;
    /** Concise push-notification title; falls back to `subject`. */
    pushTitle?: string;
    body: string;
    url?: string;
    /**
     * The request this is about, so the in-app notification can be auto-read
     * when that request is viewed. Defaults to the id parsed from a
     * `/request/<id>` url, so most callers needn't pass it.
     */
    requestId?: Id<"requests">;
  }
) => {
  const { to, actor, subject, pushTitle, body, url, requestId } = opts;
  if (!to) return;
  await ctx.scheduler.runAfter(0, internal.emails.send, {
    to,
    subject,
    body: `${body}\n\nOpen in THE SHED: ${appUrl(url)}`,
  });
  // Don't buzz people for something they just did themselves; the email is
  // their receipt.
  if (actor && to === actor) return;
  const title = pushTitle ?? subject;
  // Lead line only; the email carries the full details. Shared by the push and
  // the in-app notification feed.
  const lead = body.split("\n")[0];
  // Link to the request — explicit id, else parsed from a /request/<id> url —
  // so opening that request later marks this notification read.
  const urlMatch = url?.match(/^\/request\/(.+)$/);
  const linkedRequestId =
    requestId ??
    (urlMatch ? (ctx.db.normalizeId("requests", urlMatch[1]) ?? undefined) : undefined);
  // In-app notification history (mirrors the push), with an unread badge.
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
 * The single person a request currently needs action from: the pending
 * approver, else the requester (awaiting their receipt), else the Finance Head
 * (awaiting payment), else nobody (paid or declined). Carried-over requests
 * fall back to the current year's officeholder. Used to route comment
 * notifications. Exported for tests.
 */
export async function actionOwnerEmail(
  ctx: QueryCtx | MutationCtx,
  request: Doc<"requests">
): Promise<string | undefined> {
  const year = currentStaffYear();
  const approvers = await getApprovers(ctx, request.year, request.department);
  const currentApprovers =
    request.year === year
      ? approvers
      : await getApprovers(ctx, year, request.department);

  if (currentStep(request) !== null) {
    return nextApproverEmail(request, approvers, currentApprovers);
  }
  if (requestDeclined(request) || !requestFullyApproved(request)) return undefined;
  if (!request.receipt) return request.requesterEmail; // awaiting receipt
  if (request.paid === false) {
    const finance = await getApprovers(ctx, request.year, FINANCE);
    const financeNow =
      request.year === year ? finance : await getApprovers(ctx, year, FINANCE);
    return finance.financeHeadEmail ?? financeNow.financeHeadEmail;
  }
  return undefined; // paid / completed
}

/**
 * Emails whoever the request now waits on; when fully approved, tells the
 * requester to submit their receipt and the approver chain that it cleared.
 */
const notifyNextActor = async (
  ctx: MutationCtx,
  request: Doc<"requests">,
  approvers: Approvers,
  fallback?: Approvers,
  actor?: string
) => {
  const step = currentStep(request);
  if (step !== null) {
    const approverEmail = nextApproverEmail(request, approvers, fallback);
    await notify(ctx, {
      to: approverEmail,
      actor,
      subject: `A reimbursement request of $${request.amount} needs your ${STEP_LABELS[step]} approval`,
      pushTitle: "Approval needed",
      body: `The request below is waiting on your approval in THE SHED.\n\n${requestSummary(request)}`,
      url: "/review",
      requestId: request._id, // url is /review, so link the request explicitly
    });
  } else if (requestFullyApproved(request)) {
    await notify(ctx, {
      to: request.requesterEmail,
      actor,
      subject: `Your reimbursement request of $${request.amount} has been approved`,
      pushTitle: "Request approved",
      body: `Your request has been fully approved. Please open THE SHED and submit your receipt/invoice details.\n\n${requestSummary(request)}`,
      url: `/request/${request._id}`,
    });
    // The whole approver chain hears that the request cleared.
    for (const email of involvedApproverEmails(request, approvers, [APPROVED])) {
      await notify(ctx, {
        to: email,
        actor,
        subject: `The $${request.amount} request by ${request.requesterEmail} is fully approved`,
        pushTitle: "Request approved",
        body: `Every step has approved this request; the requester has been asked for their receipt.\n\n${requestSummary(request)}`,
        url: `/request/${request._id}`,
      });
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
    const assignments = assignmentsOf(profile);

    // The request may be submitted for any department. When none is given,
    // default to a department they are Head of Department of, else the first
    // department in their assignments, else (for a pure Head of Division) the
    // first department under a division they head.
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
    // The Director-approval cutoff is configurable per year by Finance; fall
    // back to the historical default when this year hasn't set one.
    const yearSettings = await getYearSettings(ctx, year);
    const needsDirector =
      args.amount >= directorThresholdOr(yearSettings?.directorApprovalThreshold);

    let approvedByHOD: ApprovalStatus = PENDING;
    let approvedByBudgetManager: ApprovalStatus = PENDING;
    let approvedByDirector: ApprovalStatus | undefined = needsDirector
      ? PENDING
      : undefined;
    let approvedByFinanceHead: ApprovalStatus = PENDING;

    // The Finance department has no separate HOD step.
    if (department === FINANCE) approvedByHOD = APPROVED;
    // No HOD step when the submitter is this department's head, the Director,
    // or the head of the division this department belongs to. The division's
    // authoritative `headEmail` covers heading several divisions (it's checked
    // per the submitted department's division), so no assignment-derived check
    // is needed here.
    const divisionDoc = await getDivision(ctx, year, departmentDoc.division);
    if (
      approvers.hodEmail === email ||
      roles.includes(DIRECTOR) ||
      divisionDoc?.headEmail === email
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
      await notify(ctx, {
        to: email,
        actor: email, // the submitter — acknowledge by email, don't push them
        subject: `Your reimbursement request of $${request.amount} has been submitted`,
        pushTitle: "Request submitted",
        body: `Your request has been submitted and sent for approval. You'll be emailed once it's fully approved.\n\n${requestSummary(request)}`,
        url: `/request/${id}`,
      });
      await notifyNextActor(ctx, request, approvers, undefined, email);
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
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
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
    // Browsing a specific past staff year: show exactly that year's requests,
    // with no carry-over merge (that only makes sense for the live year).
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

/**
 * The staff years the caller can browse in the requests view: every year they
 * have a request in (plus the current one) for "Mine", and every year with an
 * org structure for "All" (Finance). Sorted newest-first for the picker.
 */
export const requestYears = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    // The caller's own requests are bounded to one user, so collect() is safe.
    const mineRows = await ctx.db
      .query("requests")
      .withIndex("by_requester", (q) => q.eq("requesterEmail", caller.email))
      .collect();
    // Only offer years that can actually have requests (>= 2021), newest-first.
    const yearsFrom = (years: number[]) =>
      [...new Set([currentStaffYear(), ...years])]
        .filter((y) => y >= EARLIEST_REQUEST_YEAR)
        .sort((a, b) => b - a);
    const mine = yearsFrom(mineRows.map((r) => r.year));
    // Discover which years have an org structure with one indexed probe per
    // candidate year. This stays bounded (a handful of years) instead of
    // collecting the whole divisions table, which grows with every year added.
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
    // The approver-identities the caller can act as in a given year (themselves
    // plus anyone who delegated to them), cached per year.
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
      // Carried-over requests can be actioned by the approvers of the
      // request's own year AND this year's officeholders, so a departed
      // approver never strands a leftover request.
      const requestYear = await approversFor(request.year, request.department);
      const thisYear =
        request.year === year
          ? requestYear
          : await approversFor(year, request.department);
      // A match if the caller IS the approver, or a delegate of them — checked
      // against the request's own year and (for carry-overs) the current year.
      const actAsRequestYear = await actAsIn(request.year);
      const actAsThisYear =
        request.year === year ? actAsRequestYear : await actAsIn(year);
      const matches = (pick: (a: Approvers) => string | undefined) => {
        const reqApprover = pick(requestYear);
        const nowApprover = pick(thisYear);
        return (
          (reqApprover !== undefined && actAsRequestYear.has(reqApprover)) ||
          (nowApprover !== undefined && actAsThisYear.has(nowApprover))
        );
      };

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

/**
 * All requests across the organisation — Finance staff only. Includes the
 * previous year's still-incomplete requests.
 */
export const allRequests = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    if (!isMemberOfDepartment(caller.profile, FINANCE)) {
      throw new ConvexError("Only Finance staff can view all requests.");
    }
    // A specific past year shows just that year; the live year carries over
    // the previous year's still-open requests.
    if (args.year !== undefined && args.year !== caller.year) {
      return await yearRequests(ctx, args.year);
    }
    return await openRequestsAcrossYears(ctx, caller.year);
  },
});

/**
 * Every request in the given staff years, for a Finance CSV export. Finance
 * staff only. Strictly per-year (no carry-over merge) so each selected year's
 * rows stand alone. Reads each year in full with `.collect()` rather than the
 * capped `yearRequests` take(500): an export must not silently truncate, and
 * this is an explicit, on-demand action rather than a live subscription.
 */
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
        .withIndex("by_year", (q) => q.eq("year", year))
        .order("desc")
        .collect();
      rows.push(...yearRows);
    }
    return rows;
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
  // The caller matches a step if they ARE its approver or a delegate of them,
  // checked against the request's year and (for carry-overs) the current year.
  const actAsRequest = await actAsEmails(ctx, request.year, caller.email);
  const actAsCurrent =
    request.year === caller.year
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
    request.year === caller.year
      ? caller.profile
      : await getProfile(ctx, caller.email, request.year);
  // The Director step is role-based; a delegate of the Director may also act.
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
    // Tell the next approver (or the requester, once fully approved).
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
    const declinerName = await displayName(ctx, caller.email, request.year);
    await notify(ctx, {
      to: request.requesterEmail,
      actor: caller.email,
      subject: `Your reimbursement request of $${request.amount} has been declined`,
      pushTitle: "Request declined",
      body: `Your request was declined at the ${STEP_LABELS[args.step]} step by ${declinerName}.\nReason: ${reason}\n\n${requestSummary(request)}`,
      url: `/request/${request._id}`,
    });
    // Approvers who had already approved hear that it was declined downstream.
    for (const email of involvedApproverEmails(request, approvers, [APPROVED])) {
      if (email === caller.email) continue;
      await notify(ctx, {
        to: email,
        actor: caller.email,
        subject: `The $${request.amount} request by ${request.requesterEmail} was declined`,
        pushTitle: "Request declined",
        body: `Declined at the ${STEP_LABELS[args.step]} step by ${declinerName}.\nReason: ${reason}\n\n${requestSummary(request)}`,
        url: `/request/${request._id}`,
      });
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
      await notify(ctx, {
        to: recipient,
        actor: email,
        subject: `The $${request.amount} request by ${request.requesterEmail} has been cancelled`,
        pushTitle: "Request cancelled",
        body: `The requester cancelled this request; no further action is needed.\n\n${requestSummary(request)}`,
      });
    }
    // The request is gone, so its audit events go with it.
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(200);
    for (const event of events) {
      await ctx.db.delete("requestEvents", event._id);
    }
    // ...along with its comment thread, reactions and read markers. Drained in
    // batches so a request with an unusually long thread leaves no orphans.
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

/**
 * The requester can delete a declined request to clear it from their list.
 * Unlike cancel, no notifications are sent (the decline notification already
 * went out; everyone involved already knows).
 */
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
    // Clean up audit events.
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(200);
    for (const event of events) {
      await ctx.db.delete("requestEvents", event._id);
    }
    // Clean up comment thread, reactions, and read markers.
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

/** Resolves a display name for an approver email: profile first, directory fallback. */
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

/** Builds a step→email map from an Approvers record. */
function approverEmailMap(approvers: Approvers): Record<Step, string | undefined> {
  return {
    hod: approvers.hodEmail,
    budgetManager: approvers.budgetManagerEmail,
    director: approvers.directorEmail,
    financeHead: approvers.financeHeadEmail,
  };
}

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
    const email = approverEmailMap(approvers)[args.step] ?? null;
    const name = email ? await resolveApproverName(ctx, email, request.year) : null;
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

/**
 * Names + action timestamps for all approval steps on one request.
 * Loaded once per card so the stepper can show who each approver is
 * and when they acted without separate per-step queries.
 */
export const stepActors = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) return null;
    const request = await ctx.db.get("requests", args.requestId);
    if (!request) return null;
    const approvers = await getApprovers(ctx, request.year, request.department);
    const emailMap = approverEmailMap(approvers);
    const allEvents = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(200);
    const result: Record<
      string,
      { name: string | null; email: string | null; actedAt: number | null }
    > = {};
    for (const step of [
      "hod",
      "budgetManager",
      "director",
      "financeHead",
    ] as const) {
      const email = emailMap[step] ?? null;
      const name = email ? await resolveApproverName(ctx, email, request.year) : null;
      const stepEvent = allEvents
        .filter(
          (e) =>
            e.step === step &&
            (e.action === "approved" ||
              e.action === "declined" ||
              e.action === "auto-approved")
        )
        .sort((a, b) => b._creationTime - a._creationTime)[0];
      result[step] = { name, email, actedAt: stepEvent?._creationTime ?? null };
    }
    return result as Record<
      Step,
      { name: string | null; email: string | null; actedAt: number | null }
    >;
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

/** Fields read off a receipt by the OCR pass; null where unreadable. */
export type ReceiptFields = {
  amount: number | null;
  vendor: string | null;
  date: string | null;
};
const NO_RECEIPT_FIELDS: ReceiptFields = { amount: null, vendor: null, date: null };

/**
 * Upper bound on a blob we'll pull into memory, base64-encode and ship to
 * Gemini. Receipts are small images/PDFs (the client caps uploads at 2MB); this
 * generous ceiling just stops a signed-in caller forcing OCR on a huge blob.
 */
const MAX_RECEIPT_OCR_BYTES = 10 * 1024 * 1024;

const RECEIPT_PROMPT =
  "This image is a receipt or tax invoice. Return ONLY JSON of the form " +
  '{"amount": number|null, "vendor": string|null, "date": string|null} where ' +
  "amount is the grand total actually paid including any GST/tax (a number, no " +
  "currency symbol or thousands separators), vendor is the business name, and " +
  "date is the purchase date as YYYY-MM-DD. Use null for anything you can't read " +
  "confidently — never guess.";

/** Base64-encode bytes without Buffer (works in the V8 + edge runtimes). */
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

/** Validate/normalise the model's JSON into ReceiptFields. */
const parseReceiptFields = (text: unknown): ReceiptFields => {
  if (typeof text !== "string") return NO_RECEIPT_FIELDS;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const amount =
      typeof parsed.amount === "number" && parsed.amount > 0 ? parsed.amount : null;
    const vendor =
      typeof parsed.vendor === "string" && parsed.vendor.trim()
        ? parsed.vendor.trim()
        : null;
    const date =
      typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : null;
    return { amount, vendor, date };
  } catch {
    return NO_RECEIPT_FIELDS;
  }
};

/**
 * Reads amount/vendor/date off an uploaded receipt image via Google Gemini
 * Flash, to pre-fill the receipt form (the user still reviews + confirms).
 * Best-effort: returns all-null when GOOGLE_GEMINI_API_KEY is unset or the call
 * fails, so the feature simply no-ops rather than blocking receipt submission.
 */
export const extractReceipt = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<ReceiptFields> => {
    if (!(await ctx.auth.getUserIdentity())) {
      throw new ConvexError("You must be signed in.");
    }
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) return NO_RECEIPT_FIELDS; // feature off until configured
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) return NO_RECEIPT_FIELDS;
    const mimeType = blob.type || "image/jpeg";
    // Only OCR receipt-shaped blobs, and bound the size before we read it all
    // into memory and base64-expand it. Anything else silently no-ops.
    if (
      !(mimeType.startsWith("image/") || mimeType === "application/pdf") ||
      blob.size > MAX_RECEIPT_OCR_BYTES
    ) {
      return NO_RECEIPT_FIELDS;
    }
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    // Best-effort: any transport, parsing or provider failure falls back to
    // all-null so the feature no-ops rather than blocking receipt submission.
    try {
      const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: RECEIPT_PROMPT },
                  { inline_data: { mime_type: mimeType, data: base64 } },
                ],
              },
            ],
            generationConfig: { responseMimeType: "application/json", temperature: 0 },
          }),
        }
      );
      if (!response.ok) {
        console.error(
          "Gemini OCR error",
          response.status,
          await response.text().catch(() => "")
        );
        return NO_RECEIPT_FIELDS;
      }
      const data = await response.json();
      return parseReceiptFields(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (error) {
      console.error("Gemini OCR failed", error);
      return NO_RECEIPT_FIELDS;
    }
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
    // Strip the UI-only saveAccount flag before storing.
    const storedRecipients = args.recipients.map(({ saveAccount: _s, ...r }) => r);
    const totalAmount = storedRecipients.reduce((sum, r) => sum + r.amount, 0);
    await ctx.db.patch("requests", args.requestId, {
      receipt: { totalAmount, recipients: storedRecipients },
      paid: false,
    });
    // Save bank details unless the user explicitly opted out (saveAccount === false).
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
      `$${totalAmount}, ${args.recipients.length} recipient${args.recipients.length === 1 ? "" : "s"}`
    );
    const approvers = await getApprovers(ctx, request.year, FINANCE);
    const requesterName = await displayName(ctx, request.requesterEmail, request.year);
    await notify(ctx, {
      to: approvers.financeHeadEmail,
      actor: email,
      subject: `A receipt for $${totalAmount} is ready to pay`,
      pushTitle: "Receipt ready to pay",
      body: `${requesterName} submitted their receipt (total $${totalAmount}). Please pay the reimbursement in THE SHED.\n\n${requestSummary(request)}`,
      url: "/review",
      requestId: request._id, // url is /review, so link the request explicitly
    });
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
      isMemberOfDepartment(caller.profile, FINANCE) ||
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
            // Purged files (deleted by the yearly retention cron) keep their
            // record but have no working link.
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
    // The Finance Head of the request's year OR the current one pays it — or a
    // delegate standing in for either.
    const approvers = await getApprovers(ctx, request.year, FINANCE);
    const currentApprovers =
      request.year === caller.year
        ? approvers
        : await getApprovers(ctx, caller.year, FINANCE);
    const actAsRequest = await actAsEmails(ctx, request.year, caller.email);
    const actAsCurrent =
      request.year === caller.year
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
    await logEvent(ctx, args.requestId, caller.email, "paid", undefined, `$${args.paidAmount}`);
    const payerName = await displayName(ctx, caller.email, request.year);
    await notify(ctx, {
      to: request.requesterEmail,
      actor: caller.email,
      subject: `Your reimbursement of $${args.paidAmount} has been paid`,
      pushTitle: "Reimbursement paid",
      body: `The Finance Head (${payerName}) has paid your reimbursement.\nPaid: $${args.paidAmount}${args.comment ? `\nComment: ${args.comment}` : ""}\n\n${requestSummary(request)}`,
      url: `/request/${request._id}`,
    });
    // The Budget Manager should know when the paid amount differs.
    if (args.paidAmount !== request.amount) {
      const yearApprovers = await getApprovers(ctx, request.year, request.department);
      await notify(ctx, {
        to: yearApprovers.budgetManagerEmail,
        actor: caller.email,
        subject: `Paid amount differs from requested amount ($${args.paidAmount} vs $${request.amount})`,
        pushTitle: "Paid amount changed",
        body: `Please update the budget accordingly.\n\n${requestSummary(request)}`,
        url: `/request/${request._id}`,
      });
    }
    return null;
  },
});
