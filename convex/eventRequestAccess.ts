import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { assignmentsOf, isMemberOfDepartment, roleNeedsUniversity } from "../shared/flow";
import { formatDateTimeRange } from "../shared/forms";
import {
  EVENTS,
  eventRequestName,
  eventStatusFor,
  SUB_FORM_INBOXES,
  SUB_FORM_KINDS,
  SUB_FORM_LABELS,
  SUB_FORM_TEAMS,
  type FinanceStep,
  type SubFormKind,
} from "../shared/eventRequests";
import {
  actAsEmails,
  currentStaffYear,
  displayName,
  getApprovers,
  getDepartment,
  isAdminProfile,
  optionalProfile,
  requireProfile,
  withDelegatesForYear,
  type CallerContext,
} from "./model";
import { appUrl, notify } from "./requests";

type Ctx = QueryCtx | MutationCtx;
export type EventRequest = Doc<"eventRequests">;
export type SubForm = Doc<"eventSubForms">;
export type SubForms = Record<SubFormKind, SubForm>;

export const isCampusLeader = (caller: CallerContext) =>
  assignmentsOf(caller.profile).some((a) => roleNeedsUniversity(a.role));

export async function optionalEventStaff(ctx: Ctx): Promise<CallerContext | null> {
  const caller = await optionalProfile(ctx);
  return caller && !isCampusLeader(caller) ? caller : null;
}

export async function requireEventStaff(ctx: Ctx): Promise<CallerContext> {
  const caller = await requireProfile(ctx);
  if (isCampusLeader(caller)) {
    throw new ConvexError("Event requests are for SOW staff, not campus leaders.");
  }
  return caller;
}

export type Approver = { email: string; year: number };

const approverYears = (event: Pick<EventRequest, "year">) => [
  ...new Set([currentStaffYear(), event.year]),
];

export async function headOf(
  ctx: Ctx,
  event: Pick<EventRequest, "year">,
  department: string
): Promise<Approver | null> {
  for (const year of approverYears(event)) {
    const email = (await getDepartment(ctx, year, department))?.headEmail;
    if (email) return { email, year };
  }
  return null;
}

export async function directorOf(
  ctx: Ctx,
  event: Pick<EventRequest, "year">
): Promise<Approver | null> {
  for (const year of approverYears(event)) {
    const email = (await getApprovers(ctx, year, "")).directorEmail;
    if (email) return { email, year };
  }
  return null;
}

export const stepApprover = (
  ctx: Ctx,
  event: Pick<EventRequest, "year">,
  kind: SubFormKind,
  step: FinanceStep | undefined
): Promise<Approver | null> =>
  kind === "finance" && step === "director"
    ? directorOf(ctx, event)
    : headOf(ctx, event, SUB_FORM_TEAMS[kind]);

export const recipientsFor = async (ctx: Ctx, approver: Approver | null) =>
  approver ? await withDelegatesForYear(ctx, approver.year, approver.email) : [];

export async function actsAs(
  ctx: Ctx,
  caller: CallerContext,
  approver: Approver | null
): Promise<boolean> {
  if (!approver) return false;
  return (await actAsEmails(ctx, approver.year, caller.email)).has(approver.email);
}

export const formName = (kind: SubFormKind) => `${SUB_FORM_LABELS[kind]} form`;

export const approverTitle = (kind: SubFormKind, step: FinanceStep | undefined) =>
  kind === "finance" && step === "director" ? "the Director" : `the ${SUB_FORM_TEAMS[kind]} Head`;

export interface ViewerScope {
  teams: Record<SubFormKind, boolean>;
  director: boolean;
  events: boolean;
  admin: boolean;
}

export async function viewerScope(
  ctx: Ctx,
  caller: CallerContext,
  event: Pick<EventRequest, "year"> = { year: caller.year }
): Promise<ViewerScope> {
  const teams = {} as Record<SubFormKind, boolean>;
  for (const kind of SUB_FORM_KINDS) {
    const department = SUB_FORM_TEAMS[kind];
    teams[kind] =
      isMemberOfDepartment(caller.profile, department) ||
      (await actsAs(ctx, caller, await headOf(ctx, event, department)));
  }
  return {
    teams,
    director: await actsAs(ctx, caller, await directorOf(ctx, event)),
    events: isMemberOfDepartment(caller.profile, EVENTS),
    admin: await isAdminProfile(ctx, caller.profile),
  };
}

export const seesAll = (scope: ViewerScope) =>
  scope.admin || scope.events || scope.director || SUB_FORM_KINDS.some((k) => scope.teams[k]);

export interface EventAccess extends ViewerScope {
  requesterSide: boolean;
  canView: boolean;
}

export async function accessTo(
  ctx: Ctx,
  caller: CallerContext,
  event: EventRequest
): Promise<EventAccess> {
  const scope = await viewerScope(ctx, caller, event);
  const requesterSide =
    event.requesterEmail === caller.email ||
    isMemberOfDepartment(caller.profile, event.department) ||
    (await actsAs(ctx, caller, await headOf(ctx, event, event.department)));
  return { ...scope, requesterSide, canView: requesterSide || seesAll(scope) };
}

export const canCommentOn = (access: EventAccess, kind: SubFormKind) =>
  access.requesterSide || access.teams[kind] || (kind === "finance" && access.director);

export async function requireEvent(ctx: Ctx, id: Id<"eventRequests">) {
  const event = await ctx.db.get("eventRequests", id);
  if (!event) throw new ConvexError("Event request not found.");
  return event;
}

export const pendingSince = (form: Pick<SubForm, "submittedAt" | "directorApprovedAt">): number =>
  Math.max(form.submittedAt ?? 0, form.directorApprovedAt ?? 0);

export async function subFormsOf(ctx: Ctx, id: Id<"eventRequests">): Promise<SubForms> {
  const rows = await ctx.db
    .query("eventSubForms")
    .withIndex("by_eventRequest_and_kind", (q) => q.eq("eventRequestId", id))
    .take(SUB_FORM_KINDS.length);
  const forms = Object.fromEntries(rows.map((row) => [row.kind, row]));
  for (const kind of SUB_FORM_KINDS) {
    if (!forms[kind]) throw new ConvexError("This event request is missing a form.");
  }
  return forms as SubForms;
}

export const logEvent = async (
  ctx: MutationCtx,
  eventRequestId: Id<"eventRequests">,
  actorEmail: string,
  action: string,
  opts: { form?: SubFormKind; detail?: string } = {}
) => {
  await ctx.db.insert("eventRequestEvents", {
    eventRequestId,
    action,
    actorEmail,
    ...opts,
  });
};

export const eventUrl = (
  event: Pick<EventRequest, "_id">,
  opts: { form?: SubFormKind; thread?: boolean } = {}
) =>
  `/event-requests/${event._id}${opts.form ? `/${opts.form}` : ""}${opts.thread ? "?thread=1" : ""}`;

export async function eventSummary(ctx: Ctx, event: EventRequest) {
  const requester = await displayName(ctx, event.requesterEmail, event.year);
  return [
    event.name,
    `When: ${formatDateTimeRange(event.startsAt, event.endsAt)}`,
    `Where: ${event.location}`,
    `Requester: ${requester} (${event.department})`,
  ].join("\n");
}

export type Message = {
  actor: string;
  subject: string;
  pushTitle: string;
  body: string;
  url: string;
};

export async function tell(
  ctx: MutationCtx,
  event: EventRequest,
  to: readonly (string | undefined)[],
  message: Message,
  opts: { email?: boolean } = {}
) {
  for (const email of new Set(to.filter((e): e is string => !!e))) {
    await notify(ctx, {
      to: email,
      actor: message.actor,
      subject: message.subject,
      pushTitle: message.pushTitle,
      body: message.body,
      url: message.url,
      eventRequestId: event._id,
      email: opts.email ?? true,
    });
  }
}

export async function emailInbox(
  ctx: MutationCtx,
  kind: SubFormKind,
  message: Pick<Message, "subject" | "body" | "url">
) {
  await ctx.scheduler.runAfter(0, internal.emails.send, {
    to: SUB_FORM_INBOXES[kind],
    subject: message.subject,
    body: `${message.body}\n\nOpen in THE SHED: ${appUrl(message.url)}`,
  });
}

export async function teamOf(ctx: Ctx, department: string): Promise<string[]> {
  const year = currentStaffYear();
  const emails = new Set<string>();
  for await (const profile of ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))) {
    if (isMemberOfDepartment(profile, department)) emails.add(profile.email);
  }
  const head = (await getDepartment(ctx, year, department))?.headEmail;
  if (head) emails.add(head);
  return [...emails];
}

export async function settleEvent(ctx: MutationCtx, eventId: Id<"eventRequests">, actor: string) {
  const event = await requireEvent(ctx, eventId);
  if (event.status === "CANCELLED") return;
  const forms = await subFormsOf(ctx, event._id);
  const status = eventStatusFor(SUB_FORM_KINDS.map((k) => forms[k].status));
  if (status === event.status) return;
  if (status === "IN_PROGRESS") {
    await ctx.db.patch("eventRequests", event._id, { status, approvedAt: undefined });
    return;
  }
  await ctx.db.patch("eventRequests", event._id, { status, approvedAt: Date.now() });
  await logEvent(ctx, event._id, actor, "event-approved");
  const summary = await eventSummary(ctx, event);
  const message = {
    actor,
    subject: `${eventRequestName(event)} is approved`,
    pushTitle: "Event approved",
    body: `Marketing, Risk and Finance have all signed off, so the event can go ahead.\n\n${summary}`,
    url: eventUrl(event),
  };
  const head = await headOf(ctx, event, event.department);
  await tell(ctx, event, [event.requesterEmail, ...(await recipientsFor(ctx, head))], message);
  for (const kind of SUB_FORM_KINDS) await emailInbox(ctx, kind, message);
}
