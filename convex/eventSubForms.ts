import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { MARKETING } from "../shared/designRequests";
import {
  answersProblem,
  MAX_ANSWER_LENGTH,
  normalizeAnswers,
  sydneyToday,
  type FormAnswers,
} from "../shared/forms";
import {
  eventDirectorThresholdOr,
  financeDraftProblem,
  financeNeedsDirector,
  financeNotRequired,
  financeProblem,
  isSubFormDone,
  isSubFormEditable,
  normalizeFinance,
  normalizeRisk,
  riskDraftProblem,
  riskProblem,
  SUB_FORM_TEAMS,
  type FinanceData,
  type FinanceStep,
  type RiskData,
  type SubFormKind,
} from "../shared/eventRequests";
import { designAnswersValidator } from "./designRequestData";
import {
  financeDataValidator,
  riskDataValidator,
  subFormKindValidator,
} from "./eventRequestData";
import { MARKETING_FIELDS } from "./eventRequestForm";
import {
  accessTo,
  actsAs,
  approverTitle,
  emailInbox,
  eventSummary,
  eventUrl,
  formName,
  headOf,
  logEvent,
  recipientsFor,
  requireEvent,
  requireEventStaff,
  settleEvent,
  stepApprover,
  subFormsOf,
  teamOf,
  tell,
  type EventRequest,
  type Message,
} from "./eventRequestAccess";
import { displayName, getYearSettings, type CallerContext } from "./model";

// ── Filling in ──────────────────────────────────────────────────────────────

/** The event and form, if the caller's side can change the form now; throws why not. */
async function authorizeFill(
  ctx: MutationCtx,
  caller: CallerContext,
  id: EventRequest["_id"],
  kind: SubFormKind
) {
  const event = await requireEvent(ctx, id);
  if (!(await accessTo(ctx, caller, event)).requesterSide) {
    throw new ConvexError("Only the requester and their department can fill in this event's forms.");
  }
  if (event.status !== "IN_PROGRESS") {
    throw new ConvexError(
      event.status === "APPROVED"
        ? "This event is approved. Reopen the form to change it."
        : "This event is cancelled, so its forms can't be changed."
    );
  }
  const form = (await subFormsOf(ctx, event._id))[kind];
  if (!isSubFormEditable(form.status)) {
    throw new ConvexError(
      form.status === "PENDING"
        ? `This form is waiting for approval. Ask ${approverTitle(kind, form.step)} to request changes if something needs fixing.`
        : "This form is done. Reopen it to make changes."
    );
  }
  return { event, form };
}

const asDraft = (fields: typeof MARKETING_FIELDS) => fields.map((f) => ({ ...f, required: false }));

export const saveMarketing = mutation({
  args: { id: v.id("eventRequests"), answers: designAnswersValidator, submit: v.boolean() },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const { event, form } = await authorizeFill(ctx, caller, args.id, "marketing");
    const answers: FormAnswers = normalizeAnswers(MARKETING_FIELDS, args.answers);
    const problem = answersProblem(
      args.submit ? MARKETING_FIELDS : asDraft(MARKETING_FIELDS),
      answers,
      sydneyToday(),
      form.answers
    );
    if (problem) throw new ConvexError(problem);
    await ctx.db.patch("eventSubForms", form._id, { answers, updatedAt: Date.now() });
    if (args.submit) await submitForm(ctx, caller, event, "marketing");
    return null;
  },
});

export const saveRisk = mutation({
  args: { id: v.id("eventRequests"), risk: riskDataValidator, submit: v.boolean() },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const { event, form } = await authorizeFill(ctx, caller, args.id, "risk");
    const risk: RiskData = normalizeRisk(args.risk);
    const problem = args.submit ? riskProblem(risk) : riskDraftProblem(risk);
    if (problem) throw new ConvexError(problem);
    await ctx.db.patch("eventSubForms", form._id, { risk, updatedAt: Date.now() });
    if (args.submit) await submitForm(ctx, caller, event, "risk");
    return null;
  },
});

export const saveFinance = mutation({
  args: { id: v.id("eventRequests"), finance: financeDataValidator, submit: v.boolean() },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const { event, form } = await authorizeFill(ctx, caller, args.id, "finance");
    const finance: FinanceData = normalizeFinance(args.finance);
    const problem = args.submit ? financeProblem(finance) : financeDraftProblem(finance);
    if (problem) throw new ConvexError(problem);
    await ctx.db.patch("eventSubForms", form._id, { finance, updatedAt: Date.now() });
    if (args.submit) await submitForm(ctx, caller, event, "finance");
    return null;
  },
});

// ── Moving a form through approval ──────────────────────────────────────────

const CLEARED = {
  step: undefined,
  decidedAt: undefined,
  decidedBy: undefined,
  directorApprovedAt: undefined,
  directorApprovedBy: undefined,
  changesReason: undefined,
};

const message = async (
  ctx: MutationCtx,
  event: EventRequest,
  kind: SubFormKind,
  actor: string,
  subject: string,
  pushTitle: string,
  lead: string
): Promise<Message> => ({
  actor,
  subject,
  pushTitle,
  body: `${lead}\n\n${await eventSummary(ctx, event)}`,
  url: eventUrl(event, { form: kind }),
});

/** The Marketing team hears about Marketing forms in-app; the inbox gets the email. */
async function tellMarketingTeam(
  ctx: MutationCtx,
  event: EventRequest,
  note: Message,
  skip: readonly string[]
) {
  const team = (await teamOf(ctx, MARKETING)).filter((e) => !skip.includes(e));
  await tell(ctx, event, team, note, { email: false });
}

/** Sends a form to whoever approves its current step. */
async function askApprover(
  ctx: MutationCtx,
  event: EventRequest,
  kind: SubFormKind,
  step: FinanceStep | undefined,
  actor: string,
  lead: string
) {
  const approvers = await recipientsFor(ctx, await stepApprover(ctx, event, kind, step));
  const note = await message(
    ctx,
    event,
    kind,
    actor,
    `${formName(kind)} for ${event.name} needs your approval`,
    "Approval needed",
    lead
  );
  await tell(ctx, event, approvers, note);
  await emailInbox(ctx, kind, note);
  if (kind === "marketing") await tellMarketingTeam(ctx, event, note, [...approvers, actor]);
}

/**
 * Approves a form's current step: the Director's passes it on to the Finance
 * Head; any other finishes it. A step whose approver submitted the form is
 * approved straight away (`auto`).
 */
async function approveStep(
  ctx: MutationCtx,
  actor: string,
  event: EventRequest,
  kind: SubFormKind,
  auto: boolean
) {
  const form = (await subFormsOf(ctx, event._id))[kind];
  const now = Date.now();
  const actorName = await displayName(ctx, actor, event.year);
  if (kind === "finance" && form.step === "director") {
    await ctx.db.patch("eventSubForms", form._id, {
      step: "financeHead",
      directorApprovedAt: now,
      directorApprovedBy: actor,
    });
    await logEvent(ctx, event._id, actor, auto ? "auto-approved" : "director-approved", {
      form: kind,
    });
    const next = await stepApprover(ctx, event, kind, "financeHead");
    if (next && next.email === form.submittedBy) {
      await approveStep(ctx, next.email, event, kind, true);
    } else {
      await askApprover(
        ctx,
        event,
        kind,
        "financeHead",
        actor,
        `${actorName} approved it as Director; it now needs the Finance Head's approval.`
      );
    }
    return;
  }
  await ctx.db.patch("eventSubForms", form._id, {
    status: "APPROVED",
    step: undefined,
    decidedAt: now,
    decidedBy: actor,
  });
  await logEvent(ctx, event._id, actor, auto ? "auto-approved" : "approved", { form: kind });
  const note = await message(
    ctx,
    event,
    kind,
    actor,
    `${formName(kind)} for ${event.name} is approved`,
    "Form approved",
    auto
      ? `It was approved automatically, as ${actorName} is ${approverTitle(kind, form.step)}.`
      : `${actorName} approved it.`
  );
  await tell(ctx, event, [event.requesterEmail, form.submittedBy], note);
  await emailInbox(ctx, kind, note);
  if (kind === "marketing") {
    await tellMarketingTeam(ctx, event, note, [actor, event.requesterEmail]);
  }
  await settleEvent(ctx, event._id, actor);
}

async function submitForm(
  ctx: MutationCtx,
  caller: CallerContext,
  event: EventRequest,
  kind: SubFormKind
) {
  const form = (await subFormsOf(ctx, event._id))[kind];
  const now = Date.now();
  const submitterName = await displayName(ctx, caller.email, event.year);
  const notRequired =
    (kind === "risk" && !!form.risk?.noRisks) ||
    (kind === "finance" && financeNotRequired(form.finance ?? { income: [], expenses: [] }));

  if (notRequired) {
    await ctx.db.patch("eventSubForms", form._id, {
      ...CLEARED,
      status: "NOT_REQUIRED",
      submittedAt: now,
      submittedBy: caller.email,
    });
    await logEvent(ctx, event._id, caller.email, "not-required", { form: kind });
    const note = await message(
      ctx,
      event,
      kind,
      caller.email,
      `${formName(kind)} for ${event.name}: not required`,
      `${formName(kind)} not required`,
      kind === "risk"
        ? `${submitterName} said this event has no notable risks, so it doesn't need Compliance's approval. Have a look, and comment on the form if you disagree.`
        : `It has no income or expenses, so it doesn't need Finance's approval. Have a look, and comment on the form if you disagree.`
    );
    await tell(ctx, event, await recipientsFor(ctx, await headOf(ctx, event, SUB_FORM_TEAMS[kind])), note, {
      email: false,
    });
    await emailInbox(ctx, kind, note);
    await settleEvent(ctx, event._id, caller.email);
    return;
  }

  let step: FinanceStep | undefined;
  if (kind === "finance") {
    const settings = await getYearSettings(ctx, event.year);
    const threshold = eventDirectorThresholdOr(settings?.eventDirectorApprovalThreshold);
    step = financeNeedsDirector(form.finance!, threshold) ? "director" : "financeHead";
  }
  const approver = await stepApprover(ctx, event, kind, step);
  // A big budget goes on to the Finance Head after the Director, so both are needed.
  const lastApprover =
    kind === "finance" ? await stepApprover(ctx, event, kind, "financeHead") : approver;
  if (!approver || !lastApprover) {
    throw new ConvexError(
      !approver && step === "director"
        ? `This budget needs the Director's approval, but no Director is set for ${event.year}. Ask an admin to set one.`
        : `There's no Head of ${SUB_FORM_TEAMS[kind]} for ${event.year} to approve this form. Ask an admin to set one.`
    );
  }
  await ctx.db.patch("eventSubForms", form._id, {
    ...CLEARED,
    status: "PENDING",
    step,
    submittedAt: now,
    submittedBy: caller.email,
  });
  await logEvent(ctx, event._id, caller.email, "submitted", { form: kind });
  if (approver.email === caller.email) {
    await approveStep(ctx, caller.email, event, kind, true);
    return;
  }
  await askApprover(
    ctx,
    event,
    kind,
    step,
    caller.email,
    `${submitterName} sent the ${formName(kind)} for approval.`
  );
}

/** The event and form, if the caller approves the form's current step; throws why not. */
async function authorizeDecision(
  ctx: MutationCtx,
  caller: CallerContext,
  id: EventRequest["_id"],
  kind: SubFormKind
) {
  const event = await requireEvent(ctx, id);
  const form = (await subFormsOf(ctx, event._id))[kind];
  if (event.status !== "IN_PROGRESS" || form.status !== "PENDING") {
    throw new ConvexError("This form isn't waiting for approval.");
  }
  if (!(await actsAs(ctx, caller, await stepApprover(ctx, event, kind, form.step)))) {
    throw new ConvexError(`Only ${approverTitle(kind, form.step)} can approve this form now.`);
  }
  if (form.submittedBy === caller.email) {
    throw new ConvexError("You can't approve a form you submitted.");
  }
  return { event, form };
}

export const approve = mutation({
  args: { id: v.id("eventRequests"), form: subFormKindValidator },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const { event } = await authorizeDecision(ctx, caller, args.id, args.form);
    await approveStep(ctx, caller.email, event, args.form, false);
    return null;
  },
});

export const requestChanges = mutation({
  args: { id: v.id("eventRequests"), form: subFormKindValidator, reason: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const reason = args.reason.trim();
    if (!reason) {
      throw new ConvexError("Say what needs to change. The requester will be told it.");
    }
    if (reason.length > MAX_ANSWER_LENGTH) {
      throw new ConvexError(`The reason can be at most ${MAX_ANSWER_LENGTH} characters.`);
    }
    const { event, form } = await authorizeDecision(ctx, caller, args.id, args.form);
    await ctx.db.patch("eventSubForms", form._id, {
      ...CLEARED,
      status: "CHANGES_REQUESTED",
      decidedAt: Date.now(),
      decidedBy: caller.email,
      changesReason: reason,
    });
    await logEvent(ctx, event._id, caller.email, "changes-requested", {
      form: args.form,
      detail: reason,
    });
    const name = await displayName(ctx, caller.email, event.year);
    const note = await message(
      ctx,
      event,
      args.form,
      caller.email,
      `Changes requested on the ${formName(args.form)} for ${event.name}`,
      "Changes requested",
      `${name} asked for changes:\n${reason}\n\nUpdate the form and submit it again.`
    );
    await tell(ctx, event, [event.requesterEmail, form.submittedBy], note);
    await emailInbox(ctx, args.form, note);
    return null;
  },
});

export const reopen = mutation({
  args: { id: v.id("eventRequests"), form: subFormKindValidator },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const event = await requireEvent(ctx, args.id);
    if (!(await accessTo(ctx, caller, event)).requesterSide) {
      throw new ConvexError("Only the requester and their department can reopen this event's forms.");
    }
    if (event.status === "CANCELLED") {
      throw new ConvexError("This event is cancelled, so its forms can't be reopened.");
    }
    const form = (await subFormsOf(ctx, event._id))[args.form];
    if (!isSubFormDone(form.status)) {
      throw new ConvexError("Only an approved form can be reopened.");
    }
    await ctx.db.patch("eventSubForms", form._id, { ...CLEARED, status: "DRAFT" });
    await logEvent(ctx, event._id, caller.email, "reopened", { form: args.form });
    const note = await message(
      ctx,
      event,
      args.form,
      caller.email,
      `${formName(args.form)} for ${event.name} was reopened`,
      "Form reopened",
      "The requester's side reopened it to make changes; it'll come back for approval."
    );
    const head = await headOf(ctx, event, SUB_FORM_TEAMS[args.form]);
    await tell(ctx, event, await recipientsFor(ctx, head), note, { email: false });
    await emailInbox(ctx, args.form, note);
    await settleEvent(ctx, event._id, caller.email);
    return null;
  },
});
