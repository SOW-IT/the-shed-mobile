import { ConvexError, v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { departmentsOf } from "../shared/flow";
import {
  answerForRole,
  answersProblem,
  changedAnswers,
  MAX_ANSWER_LENGTH,
  normalizeAnswers,
  sydneyToday,
  type FormAnswers,
} from "../shared/forms";
import {
  EARLIEST_EVENT_REQUEST_YEAR,
  eventDirectorThresholdOr,
  eventRequestName,
  isSubFormDone,
  isSubFormEditable,
  SUB_FORM_KINDS,
  type EventRequestStatus,
  type SubFormKind,
} from "../shared/eventRequests";
import { designAnswersValidator } from "./designRequestData";
import { EVENT_FIELDS } from "./eventRequestForm";
import {
  accessTo,
  actsAs,
  approverTitle,
  canCommentOn,
  emailInbox,
  eventSummary,
  eventUrl,
  logEvent,
  optionalEventStaff,
  recipientsFor,
  requireEvent,
  requireEventStaff,
  seesAll,
  stepApprover,
  subFormsOf,
  tell,
  viewerScope,
  type EventRequest,
  type SubForm,
} from "./eventRequestAccess";
import { displayName, getDepartment, getYearSettings, resolveName, type CallerContext } from "./model";

type Ctx = QueryCtx | MutationCtx;

const LIST_LIMIT = 300;
const EVENTS_LIMIT = 300;

// ── Lists ───────────────────────────────────────────────────────────────────

type FormSummary = Pick<SubForm, "status" | "step">;

/** Each event with its requester's name and where its three forms are up to. */
async function withRows(ctx: Ctx, events: EventRequest[]) {
  const names = new Map<string, Promise<string | null>>();
  const rows = await Promise.all(
    events.map(async (event) => {
      const key = `${event.requesterEmail} ${event.year}`;
      let name = names.get(key);
      if (!name) {
        name = resolveName(ctx, event.requesterEmail, event.year);
        names.set(key, name);
      }
      const forms = await subFormsOf(ctx, event._id);
      const summary = Object.fromEntries(
        SUB_FORM_KINDS.map((k) => [k, { status: forms[k].status, step: forms[k].step }])
      ) as Record<SubFormKind, FormSummary>;
      return { ...event, requesterName: await name, forms: summary };
    })
  );
  return rows.sort((a, b) => (a.startsAt < b.startsAt ? 1 : a.startsAt > b.startsAt ? -1 : 0));
}

const dedupe = (events: EventRequest[]) => [...new Map(events.map((e) => [e._id, e])).values()];

/** Pending forms the caller reviews, and which of them are waiting on the caller. */
async function reviewForms(ctx: Ctx, caller: CallerContext) {
  const scope = await viewerScope(ctx, caller);
  const pending: SubForm[] = [];
  for (const kind of SUB_FORM_KINDS) {
    if (!scope.teams[kind] && !(kind === "finance" && scope.director)) continue;
    pending.push(
      ...(await ctx.db
        .query("eventSubForms")
        .withIndex("by_kind_and_status", (q) => q.eq("kind", kind).eq("status", "PENDING"))
        .take(LIST_LIMIT))
    );
  }
  const forms: { form: SubForm; event: EventRequest; mine: boolean }[] = [];
  for (const form of pending) {
    const event = await ctx.db.get("eventRequests", form.eventRequestId);
    if (!event || event.status !== "IN_PROGRESS") continue;
    const approver = await stepApprover(ctx, event, form.kind, form.step);
    const mine = form.submittedBy !== caller.email && (await actsAs(ctx, caller, approver));
    // A team member sees their team's forms; the Director only the ones at their step.
    const scopeHere = await viewerScope(ctx, caller, event);
    const relevant =
      mine ||
      (form.kind === "finance" && form.step === "director"
        ? scopeHere.director || scopeHere.teams.finance
        : scopeHere.teams[form.kind]);
    if (relevant) forms.push({ form, event, mine });
  }
  return forms;
}

/** What the signed-in person can do with event requests. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller) return null;
    const scope = await viewerScope(ctx, caller);
    return {
      year: caller.year,
      departments: departmentsOf(caller.profile),
      reviews: SUB_FORM_KINDS.some((k) => scope.teams[k]) || scope.director,
      seesAll: seesAll(scope),
    };
  },
});

/** How many forms are waiting on the caller's approval; drives the side menu badge. */
export const waitingOnMe = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller) return 0;
    return (await reviewForms(ctx, caller)).filter((f) => f.mine).length;
  },
});

/**
 * The caller's events and their department's, from `year`; for this staff
 * year, plus any still in progress from earlier years.
 */
export const mine = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller) return null;
    const year = args.year ?? caller.year;
    const events: EventRequest[] = [
      ...(await ctx.db
        .query("eventRequests")
        .withIndex("by_requester_and_year", (q) =>
          q.eq("requesterEmail", caller.email).eq("year", year)
        )
        .take(LIST_LIMIT)),
    ];
    for (const department of departmentsOf(caller.profile)) {
      events.push(
        ...(await ctx.db
          .query("eventRequests")
          .withIndex("by_department_and_year", (q) =>
            q.eq("department", department).eq("year", year)
          )
          .take(LIST_LIMIT))
      );
    }
    if (year === caller.year) {
      events.push(
        ...(await ctx.db
          .query("eventRequests")
          .withIndex("by_requester_and_status", (q) =>
            q.eq("requesterEmail", caller.email).eq("status", "IN_PROGRESS")
          )
          .take(LIST_LIMIT))
      );
      for (const department of departmentsOf(caller.profile)) {
        events.push(
          ...(await ctx.db
            .query("eventRequests")
            .withIndex("by_department_and_status", (q) =>
              q.eq("department", department).eq("status", "IN_PROGRESS")
            )
            .take(LIST_LIMIT))
        );
      }
    }
    return await withRows(ctx, dedupe(events));
  },
});

/** Forms waiting for approval that the caller reviews, marking the ones waiting on them. */
export const review = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller) return null;
    const forms = await reviewForms(ctx, caller);
    const rows = await withRows(ctx, dedupe(forms.map((f) => f.event)));
    return rows.map((row) => ({
      ...row,
      waitingOnMe: forms
        .filter((f) => f.mine && f.event._id === row._id)
        .map((f) => f.form.kind),
    }));
  },
});

/** Every event from one staff year (and, for this year, any still in progress). */
export const all = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller || !seesAll(await viewerScope(ctx, caller))) return null;
    const events = await ctx.db
      .query("eventRequests")
      .withIndex("by_year_and_number", (q) => q.eq("year", args.year))
      .order("desc")
      .take(LIST_LIMIT);
    if (args.year === caller.year) {
      events.push(
        ...(await ctx.db
          .query("eventRequests")
          .withIndex("by_status", (q) => q.eq("status", "IN_PROGRESS"))
          .take(LIST_LIMIT))
      );
    }
    return await withRows(ctx, dedupe(events));
  },
});

/** The staff years the year pickers offer: ones with events, and this one. */
export const years = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller) return null;
    const everyone = seesAll(await viewerScope(ctx, caller));
    const mine = [caller.year];
    const all = [caller.year];
    for (let y = caller.year - 1; y >= EARLIEST_EVENT_REQUEST_YEAR; y--) {
      let own = await ctx.db
        .query("eventRequests")
        .withIndex("by_requester_and_year", (q) =>
          q.eq("requesterEmail", caller.email).eq("year", y)
        )
        .first();
      for (const department of departmentsOf(caller.profile)) {
        own ??= await ctx.db
          .query("eventRequests")
          .withIndex("by_department_and_year", (q) =>
            q.eq("department", department).eq("year", y)
          )
          .first();
      }
      if (own) mine.push(y);
      const any = everyone
        ? await ctx.db
            .query("eventRequests")
            .withIndex("by_year_and_number", (q) => q.eq("year", y))
            .first()
        : null;
      if (any) all.push(y);
    }
    return { mine, all };
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller) return null;
    const id = ctx.db.normalizeId("eventRequests", args.id);
    const event = id ? await ctx.db.get("eventRequests", id) : null;
    if (!event) return null;
    const access = await accessTo(ctx, caller, event);
    if (!access.canView) return null;
    const forms = await subFormsOf(ctx, event._id);
    const nameOf = (email: string | undefined) =>
      email ? displayName(ctx, email, event.year) : Promise.resolve(null);
    const open = event.status !== "CANCELLED";
    const formViews = {} as Record<
      SubFormKind,
      SubForm & {
        submittedByName: string | null;
        decidedByName: string | null;
        directorApprovedByName: string | null;
        approverTitle: string;
        approverName: string | null;
        can: { fill: boolean; decide: boolean; reopen: boolean; comment: boolean };
      }
    >;
    for (const kind of SUB_FORM_KINDS) {
      const form = forms[kind];
      const approver = await stepApprover(ctx, event, kind, form.step);
      formViews[kind] = {
        ...form,
        submittedByName: await nameOf(form.submittedBy),
        decidedByName: await nameOf(form.decidedBy),
        directorApprovedByName: await nameOf(form.directorApprovedBy),
        approverTitle: approverTitle(kind, form.step),
        approverName: await nameOf(approver?.email),
        can: {
          fill:
            access.requesterSide &&
            event.status === "IN_PROGRESS" &&
            isSubFormEditable(form.status),
          decide:
            event.status === "IN_PROGRESS" &&
            form.status === "PENDING" &&
            form.submittedBy !== caller.email &&
            (await actsAs(ctx, caller, approver)),
          reopen: access.requesterSide && open && isSubFormDone(form.status),
          comment: canCommentOn(access, kind),
        },
      };
    }
    const settings = await getYearSettings(ctx, caller.year);
    return {
      event,
      requesterName: await nameOf(event.requesterEmail),
      cancelledByName: await nameOf(event.cancelledBy),
      forms: formViews,
      directorThreshold: eventDirectorThresholdOr(settings?.eventDirectorApprovalThreshold),
      can: {
        edit: access.requesterSide && event.status === "IN_PROGRESS",
        cancel: access.requesterSide && open,
      },
    };
  },
});

export const timeline = query({
  args: { id: v.id("eventRequests") },
  handler: async (ctx, args) => {
    const caller = await optionalEventStaff(ctx);
    if (!caller) return null;
    const event = await ctx.db.get("eventRequests", args.id);
    if (!event || !(await accessTo(ctx, caller, event)).canView) return null;
    const events = await ctx.db
      .query("eventRequestEvents")
      .withIndex("by_eventRequest", (q) => q.eq("eventRequestId", args.id))
      .take(EVENTS_LIMIT);
    return await Promise.all(
      events.map(async (row) => ({
        at: row._creationTime,
        action: row.action,
        form: row.form ?? null,
        actorName: await displayName(ctx, row.actorEmail, event.year),
        detail: row.detail ?? null,
      }))
    );
  },
});

// ── Changes ─────────────────────────────────────────────────────────────────

/** The event's answers checked against the form, with what it's filed under; throws with what to fix. */
async function checkedEvent(
  ctx: Ctx,
  caller: CallerContext,
  raw: FormAnswers,
  previous?: FormAnswers
) {
  const answers = normalizeAnswers(EVENT_FIELDS, raw);
  const problem = answersProblem(EVENT_FIELDS, answers, sydneyToday(), previous);
  if (problem) throw new ConvexError(problem);
  const department = answerForRole(EVENT_FIELDS, answers, "department");
  const own = departmentsOf(caller.profile);
  const allowed =
    department === previous?.department ||
    (own.length > 0
      ? own.includes(department)
      : (await getDepartment(ctx, caller.year, department)) !== null);
  if (!allowed) {
    throw new ConvexError("The lead department has to be one you're in.");
  }
  return {
    answers,
    department,
    name: answerForRole(EVENT_FIELDS, answers, "title"),
    startsAt: answerForRole(EVENT_FIELDS, answers, "start"),
    endsAt: answerForRole(EVENT_FIELDS, answers, "end"),
    location: answerForRole(EVENT_FIELDS, answers, "location"),
  };
}

export const create = mutation({
  args: { answers: designAnswersValidator },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const filed = await checkedEvent(ctx, caller, args.answers);
    const last = await ctx.db
      .query("eventRequests")
      .withIndex("by_year_and_number", (q) => q.eq("year", caller.year))
      .order("desc")
      .first();
    const id = await ctx.db.insert("eventRequests", {
      year: caller.year,
      number: (last?.number ?? 0) + 1,
      requesterEmail: caller.email,
      submittedAt: Date.now(),
      ...filed,
      status: "IN_PROGRESS",
    });
    for (const kind of SUB_FORM_KINDS) {
      await ctx.db.insert("eventSubForms", {
        eventRequestId: id,
        kind,
        status: "DRAFT",
        ...(kind === "marketing" ? { answers: {} } : {}),
        ...(kind === "risk" ? { risk: { noRisks: false, risks: [] } } : {}),
        ...(kind === "finance" ? { finance: { income: [], expenses: [] } } : {}),
      });
    }
    await logEvent(ctx, id, caller.email, "created");
    return id;
  },
});

/** Tells the reviewers of forms already sent to them that the event changed. */
async function tellReviewersOfChange(
  ctx: MutationCtx,
  event: EventRequest,
  actor: string,
  what: { subject: string; pushTitle: string; body: string },
  include: (form: SubForm) => boolean
) {
  const forms = await subFormsOf(ctx, event._id);
  for (const kind of SUB_FORM_KINDS) {
    const form = forms[kind];
    if (!include(form)) continue;
    const message = { actor, ...what, url: eventUrl(event, { form: kind }) };
    const approver = await stepApprover(ctx, event, kind, form.step);
    await tell(ctx, event, await recipientsFor(ctx, approver), message, { email: false });
    await emailInbox(ctx, kind, message);
  }
}

export const update = mutation({
  args: { id: v.id("eventRequests"), answers: designAnswersValidator },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const event = await requireEvent(ctx, args.id);
    if (!(await accessTo(ctx, caller, event)).requesterSide) {
      throw new ConvexError("Only the requester and their department can edit this event.");
    }
    if (event.status !== "IN_PROGRESS") {
      throw new ConvexError(
        event.status === "APPROVED"
          ? "This event is approved. Reopen one of its forms to make changes."
          : "This event is cancelled, so it can't be edited."
      );
    }
    const filed = await checkedEvent(ctx, caller, args.answers, event.answers);
    const changed = changedAnswers(EVENT_FIELDS, event.answers, filed.answers);
    if (changed.length === 0) return null;
    await ctx.db.patch("eventRequests", event._id, { ...filed, editedAt: Date.now() });
    await logEvent(ctx, event._id, caller.email, "edited", { detail: changed.join(", ") });
    const updated = await requireEvent(ctx, event._id);
    const summary = await eventSummary(ctx, updated);
    await tellReviewersOfChange(
      ctx,
      updated,
      caller.email,
      {
        subject: `${eventRequestName(updated)} was edited`,
        pushTitle: "Event edited",
        body: `The requester changed: ${changed.join(", ")}.\n\n${summary}`,
      },
      (form) => form.status === "PENDING" || form.status === "APPROVED"
    );
    return null;
  },
});

export const cancel = mutation({
  args: { id: v.id("eventRequests"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const caller = await requireEventStaff(ctx);
    const event = await requireEvent(ctx, args.id);
    if (!(await accessTo(ctx, caller, event)).requesterSide) {
      throw new ConvexError("Only the requester and their department can cancel this event.");
    }
    if (event.status === "CANCELLED") {
      throw new ConvexError("This event is already cancelled.");
    }
    const note = args.note?.trim() || undefined;
    if (note && note.length > MAX_ANSWER_LENGTH) {
      throw new ConvexError(`The note can be at most ${MAX_ANSWER_LENGTH} characters.`);
    }
    await ctx.db.patch("eventRequests", event._id, {
      status: "CANCELLED" satisfies EventRequestStatus,
      cancelledAt: Date.now(),
      cancelledBy: caller.email,
      cancelNote: note,
    });
    await logEvent(ctx, event._id, caller.email, "cancelled", { detail: note });
    const summary = await eventSummary(ctx, event);
    const noteLine = note ? `\nNote: ${note}` : "";
    await tellReviewersOfChange(
      ctx,
      event,
      caller.email,
      {
        subject: `${eventRequestName(event)} was cancelled`,
        pushTitle: "Event cancelled",
        body: `The event isn't going ahead; nothing more is needed.${noteLine}\n\n${summary}`,
      },
      (form) => form.status !== "DRAFT"
    );
    return null;
  },
});
